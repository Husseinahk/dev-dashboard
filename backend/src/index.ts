import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { exec, spawn } from 'child_process';
import { EventEmitter } from 'events';
import os from 'os';
import net from 'net';
import path from 'path';
import fs from 'fs';

import { ProcessManager } from './core/ProcessManager';
import { ConfigManager } from './core/ConfigManager';
import { WorkspaceScanner, DiscoveredAction } from './core/WorkspaceScanner';
import { UserProjectsLoader, UserProject, UserActionGroup, UserAction } from './core/UserProjectsLoader';
import { NodeResolver } from './core/NodeResolver';
import { TerminalSocket } from './core/TerminalSocket';
import { ProjectDetector } from './core/ProjectDetector';
import { GitOps } from './core/GitOps';
import { GitHubIntegration, AzureDevOpsIntegration } from './core/Integrations';
import { ExternalProcessScanner } from './core/ExternalProcessScanner';
import { getSystemSnapshot, getProcessStats } from './core/SystemInfo';

// ====== Setup ======
const app = express();
const PORT = parseInt(process.env.PORT || '3030', 10);
const server = createServer(app);
const bus = new EventEmitter();
bus.setMaxListeners(100);

const ROOT = path.resolve(__dirname, '..', '..'); // dev-dashboard root
const projectsJsonPath = path.join(ROOT, 'projects.json');

const configManager = new ConfigManager();
const userProjects = new UserProjectsLoader(projectsJsonPath);
const nodeResolver = new NodeResolver(configManager.config.globalSettings?.nvmHome);
const processManager = new ProcessManager(bus, nodeResolver);
const scanner = new WorkspaceScanner(configManager.getPaths());
const detector = new ProjectDetector();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ====== Helper: build merged projects (auto + user) ======
function buildProjects() {
  scanner.setRoots(configManager.getPaths());
  const user = userProjects.load();
  const mode = (configManager.config.globalSettings as any)?.workspaceMode || 'manual';
  // 'manual' = only explicitly-added user projects (default — no surprises)
  // 'scan'   = only auto-discovered
  // 'both'   = both, user wins on conflict
  const auto = mode === 'manual' ? [] : scanner.scan();
  let merged = mode === 'manual'
    ? (user.projects || []).map(WorkspaceScanner.fromUser)
    : WorkspaceScanner.merge(auto, user.projects || []);

  // Inject default groups (Git, IDE) from globalSettings if user defines them in projects.json
  const defaultGroups = user.globalSettings?.defaultGroups || [];
  if (defaultGroups.length) {
    merged = merged.map(p => {
      // Don't add default groups if action ids would clash
      const existingIds = new Set(p.actions.map(a => a.id));
      const extra: DiscoveredAction[] = [];
      for (const g of defaultGroups) {
        for (const a of g.actions) {
          if (!existingIds.has(a.id)) {
            extra.push({
              id: a.id, label: a.label, command: a.command, type: a.type,
              cwd: a.cwd, category: g.name, source: 'user',
            });
          }
        }
      }
      return { ...p, actions: [...p.actions, ...extra] };
    });
  }

  // Apply pinned + per-project local config overrides
  for (const p of merged) {
    const local = configManager.config.projectConfigs?.[p.id];
    if (local?.name) p.name = local.name;
    if (local?.group) p.group = local.group;
    if (local?.notes) p.notes = local.notes;
    if (local?.quickLinks) p.quickLinks = [...(p.quickLinks || []), ...local.quickLinks];
    if (local?.customActions) {
      const existingIds = new Set(p.actions.map(a => a.id));
      for (const a of local.customActions) {
        if (existingIds.has(a.id)) continue;
        p.actions.push({
          id: a.id, label: a.label, command: a.command, type: a.type as any,
          cwd: a.cwd, category: a.category || 'Custom', source: 'user',
        });
      }
    }
    const pins = configManager.config.pinnedActions[p.id] || [];
    for (const a of p.actions) (a as any).pinned = pins.includes(a.id);
  }
  return merged;
}

// ====== Workspaces ======
app.get('/api/workspaces', (_req, res) => {
  const hidden = new Set(configManager.config.hiddenProjects || []);
  res.json({ workspaces: buildProjects().filter(p => !hidden.has(p.id)) });
});

/** Returns ALL discovered projects (incl. hidden) so the Settings UI can manage visibility. */
app.get('/api/workspaces/all', (_req, res) => {
  const hidden = new Set(configManager.config.hiddenProjects || []);
  const all = buildProjects().map(p => ({
    id: p.id,
    name: p.name,
    path: p.path,
    type: p.type,
    source: (p as any).source,
    actionCount: p.actions.length,
    hidden: hidden.has(p.id),
  }));
  res.json({ projects: all });
});

app.post('/api/workspaces/hide', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  configManager.hideProject(id);
  res.json({ success: true, hiddenProjects: configManager.config.hiddenProjects });
});

app.post('/api/workspaces/show', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  configManager.showProject(id);
  res.json({ success: true, hiddenProjects: configManager.config.hiddenProjects });
});

app.post('/api/workspaces/hidden', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  configManager.setHiddenProjects(ids);
  res.json({ success: true, hiddenProjects: configManager.config.hiddenProjects });
});

/** Re-scan trigger — alias used by frontend api.rescan(). */
app.post('/api/workspaces/rescan', (_req, res) => {
  scanner.setRoots(configManager.getPaths());
  res.json({ success: true, count: buildProjects().length });
});

// ====== Native folder picker (Windows) ======
/**
 * Pops up the native Windows folder picker via a one-shot PowerShell script
 * and returns the selected absolute path. Returns { path: null } if the user
 * cancels. Only works on Windows; on other platforms the frontend falls back
 * to a text input.
 */
app.post('/api/system/pick-folder', (req, res) => {
  if (process.platform !== 'win32') {
    return res.status(501).json({ error: 'Native picker only supported on Windows' });
  }
  const { initialDir, title } = (req.body || {}) as { initialDir?: string; title?: string };

  // Modern Vista-style IFileOpenDialog (FOS_PICKFOLDERS) — the same picker
  // Explorer/Edge/VS Code use. Driven via WPF Microsoft.Win32.OpenFileDialog
  // would need .NET Core 3+; instead we use the WindowsAPICodePack-equivalent
  // by P/Invoking the COM IFileOpenDialog interface directly.
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class NativeFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] internal class FileOpenDialogRCW { }
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IFileDialog {
    [PreserveSig] uint Show(IntPtr parent);
    void SetFileTypes(); void SetFileTypeIndex(); void GetFileTypeIndex();
    void Advise(); void Unadvise();
    void SetOptions(uint fos); void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName(); void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel(); void SetFileNameLabel();
    void GetResult(out IShellItem ppsi);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IShellItem {
    void BindToHandler(); void GetParent();
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  internal static extern int SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr bc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem item);

  public static string Pick(string title, string initialDir, IntPtr owner) {
    var dlg = (IFileDialog)(new FileOpenDialogRCW());
    dlg.SetOptions(0x20 | 0x8 | 0x2000 | 0x40000000); // PICKFOLDERS | NOCHANGEDIR | FORCEFILESYSTEM | DONTADDTORECENT
    if (!string.IsNullOrEmpty(title)) dlg.SetTitle(title);
    if (!string.IsNullOrEmpty(initialDir)) {
      IShellItem si;
      if (SHCreateItemFromParsingName(initialDir, IntPtr.Zero, typeof(IShellItem).GUID, out si) == 0) dlg.SetFolder(si);
    }
    if (dlg.Show(owner) != 0) return null;
    IShellItem result; dlg.GetResult(out result);
    string name; result.GetDisplayName(0x80058000u, out name); // SIGDN_FILESYSPATH
    return name;
  }
}

public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string name);
  [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hAfter, int x, int y, int cx, int cy, uint flags);
}
"@
[Win32]::AllowSetForegroundWindow(-1) | Out-Null

# A 1x1 offscreen TopMost owner so the picker has a foreground-eligible parent.
$owner = New-Object System.Windows.Forms.Form
$owner.FormBorderStyle = 'None'
$owner.StartPosition = 'Manual'
$owner.Location = New-Object System.Drawing.Point(-32000, -32000)
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Show()

# THE TRICK: Simulate an Alt keypress. This releases Windows' foreground lock
# on the calling process and lets SetForegroundWindow actually work.
[Win32]::keybd_event(0x12, 0, 0, [IntPtr]::Zero)         # Alt down
[Win32]::keybd_event(0x12, 0, 0x2, [IntPtr]::Zero)       # Alt up
[Win32]::SetForegroundWindow($owner.Handle) | Out-Null
$owner.Activate()

# Background poller: once the IFileDialog window appears (class "#32770"),
# yank it to the foreground. Runs in parallel with the blocking Show() call.
$poller = [System.ComponentModel.BackgroundWorker]::new()
$poller.add_DoWork({
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 75
    $h = [Win32]::FindWindow("#32770", ${JSON.stringify(title || 'Select a folder')})
    if ($h -ne [IntPtr]::Zero) {
      [Win32]::keybd_event(0x12, 0, 0, [IntPtr]::Zero)
      [Win32]::keybd_event(0x12, 0, 0x2, [IntPtr]::Zero)
      [Win32]::ShowWindow($h, 9) | Out-Null         # SW_RESTORE
      [Win32]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0003) | Out-Null  # HWND_TOPMOST | NOMOVE | NOSIZE
      [Win32]::SetForegroundWindow($h) | Out-Null
      [Win32]::BringWindowToTop($h) | Out-Null
      [Win32]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x0003) | Out-Null  # HWND_NOTOPMOST
      break
    }
  }
})
$poller.RunWorkerAsync()

$picked = [NativeFolderPicker]::Pick(${JSON.stringify(title || 'Select a folder')}, ${JSON.stringify(initialDir && fs.existsSync(initialDir) ? initialDir : '')}, $owner.Handle)
$owner.Close()
if ($picked) { [Console]::Out.WriteLine($picked) }
`.trim();

  const ps = spawn(
    process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : 'powershell.exe',
    ['-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    { windowsHide: true, detached: false },
  );

  let stdout = '';
  let stderr = '';
  ps.stdout.on('data', d => { stdout += d.toString(); });
  ps.stderr.on('data', d => { stderr += d.toString(); });
  ps.on('error', err => res.status(500).json({ error: err.message }));
  ps.on('close', code => {
    if (code !== 0 && stderr) console.error('[pick-folder] ps stderr:', stderr);
    const picked = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || '';
    res.json({ path: picked || null });
  });
});

// ====== Projects: detect / add / clone / remove ======

/** Inspect a folder and return what was detected, without importing anything. */
app.post('/api/projects/detect', (req, res) => {
  const { path: folderPath } = req.body || {};
  if (!folderPath) return res.status(400).json({ error: 'path required' });
  try {
    const result = detector.detect(folderPath);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Add (or update) a project. Body shape:
 *   { id, name, path, group?, nodeVersion?, description?, notes?,
 *     groups: [{ name, actions: [...] }],
 *     quickLinks: [...] }
 *
 * The frontend assembles this from the detection result + user choices
 * (which control groups to enable, which actions to keep).
 */
app.post('/api/projects/add', (req, res) => {
  const project = req.body as UserProject;
  if (!project || !project.id || !project.path) {
    return res.status(400).json({ error: 'id and path required' });
  }
  if (!fs.existsSync(project.path)) {
    return res.status(400).json({ error: `Path does not exist: ${project.path}` });
  }
  userProjects.upsertProject(project);
  res.json({ success: true });
});

/** Remove a user-added project. */
app.delete('/api/projects/:id', (req, res) => {
  userProjects.removeProject(req.params.id);
  // Also clear pinned actions / project-level config / hidden flag
  delete configManager.config.projectConfigs?.[req.params.id];
  delete configManager.config.pinnedActions?.[req.params.id];
  configManager.config.hiddenProjects = (configManager.config.hiddenProjects || []).filter(x => x !== req.params.id);
  configManager.save();
  res.json({ success: true });
});

/**
 * Clone a Git repo into <targetParent>/<repoName>, then return the resolved
 * path so the frontend can run /api/projects/detect on it.
 *
 * Body: { gitUrl, targetParent, name? }
 *   - targetParent: existing folder where the repo will be cloned
 *   - name: override the resulting folder name (defaults to repo name from URL)
 *
 * Long output is streamed to a process tab so the user can watch it live.
 */
app.post('/api/projects/clone', (req, res) => {
  const { gitUrl, targetParent, name } = req.body || {};
  if (!gitUrl) return res.status(400).json({ error: 'gitUrl required' });
  if (!targetParent) return res.status(400).json({ error: 'targetParent required' });
  if (!fs.existsSync(targetParent)) {
    return res.status(400).json({ error: `targetParent does not exist: ${targetParent}` });
  }

  // Derive folder name from URL when not provided
  const urlName = (gitUrl.split('/').pop() || 'repo').replace(/\.git$/, '');
  const folderName = (name && name.trim()) || urlName;
  const targetPath = path.join(targetParent, folderName);

  if (fs.existsSync(targetPath)) {
    return res.status(409).json({ error: `Target already exists: ${targetPath}`, targetPath });
  }

  // If the URL is dev.azure.com or github.com and we have a PAT stored, inject
  // it so the clone works without a credential helper prompt.
  let urlForClone = gitUrl as string;
  const az = configManager.config.integrations?.azureDevOps;
  const gh = configManager.config.integrations?.github;
  try {
    const u = new URL(urlForClone);
    if (u.hostname.endsWith('dev.azure.com') && az?.pat) {
      u.username = ''; u.password = az.pat; urlForClone = u.toString();
    } else if (u.hostname === 'github.com' && gh?.pat) {
      u.username = gh.user || 'x-access-token'; u.password = gh.pat; urlForClone = u.toString();
    }
  } catch {}

  // Run git clone via the ProcessManager so logs stream to a tab the UI watches
  const tabId = `clone::${folderName}-${Date.now()}`;
  processManager.startProcess({
    id: tabId,
    name: `Clone ${folderName}`,
    command: `git clone --progress "${urlForClone}" "${folderName}"`,
    cwd: targetParent,
    isLongRunning: false,
  });

  res.json({ success: true, tabId, targetPath });
});

app.get('/api/workspaces/:id', (req, res) => {
  const p = buildProjects().find(p => p.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

// ====== Git ======
app.get('/api/git/:id', (req, res) => {
  const p = buildProjects().find(p => p.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (!fs.existsSync(path.join(p.path, '.git'))) {
    return res.json({ isGitRepo: false, branch: '', dirty: 0, ahead: 0, behind: 0 });
  }
  exec('git status --porcelain=v1 --branch', { cwd: p.path, windowsHide: true }, (err, stdout) => {
    if (err) return res.json({ isGitRepo: true, branch: 'unknown', dirty: 0, ahead: 0, behind: 0 });
    const lines = stdout.split(/\r?\n/);
    const head = lines[0] || '';
    let branch = 'unknown', ahead = 0, behind = 0;
    const hm = head.match(/^## ([^.]+?)(?:\.\.\.([^\s]+))?(?: \[(.*)\])?/);
    if (hm) {
      branch = hm[1].trim();
      const meta = hm[3] || '';
      const am = meta.match(/ahead (\d+)/);
      const bm = meta.match(/behind (\d+)/);
      if (am) ahead = parseInt(am[1], 10);
      if (bm) behind = parseInt(bm[1], 10);
    }
    const dirty = lines.slice(1).filter(l => l.trim()).length;
    res.json({ isGitRepo: true, branch, dirty, ahead, behind });
  });
});

// ====== Git: full ops on a project ======
function projectPath(id: string): string | null {
  const p = buildProjects().find(p => p.id === id);
  return p?.path || null;
}

app.get('/api/git/:id/status', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { res.json(await GitOps.status(cwd)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/git/:id/log', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { res.json({ log: await GitOps.log(cwd, parseInt(req.query.n as string) || 30) }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/git/:id/branches', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { res.json(await GitOps.branches(cwd)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/git/:id/diff', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { res.json({ diff: await GitOps.diff(cwd, req.query.file as string | undefined, req.query.staged === '1') }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/git/:id/file-versions', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  const file = req.query.file as string;
  if (!file) return res.status(400).json({ error: 'file required' });
  try { res.json(await GitOps.fileVersions(cwd, file)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/stage-all', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.stage(cwd, '.'); res.json({ success: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/unstage-all', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.unstage(cwd, '.'); res.json({ success: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/init', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.init(cwd); res.json({ success: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/checkout', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.checkout(cwd, req.body.branch, !!req.body.create); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/pull', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { res.json(await GitOps.pull(cwd)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/fetch', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { res.json(await GitOps.fetch(cwd)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/push', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { res.json(await GitOps.push(cwd, { setUpstream: !!req.body.setUpstream })); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/commit', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  if (!req.body.message) return res.status(400).json({ error: 'message required' });
  try { res.json(await GitOps.commit(cwd, req.body.message, req.body.addAll !== false)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/stage', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.stage(cwd, req.body.file); res.json({ success: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/unstage', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.unstage(cwd, req.body.file); res.json({ success: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/discard', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.discard(cwd, req.body.file); res.json({ success: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/git/:id/set-remote', async (req, res) => {
  const cwd = projectPath(req.params.id);
  if (!cwd) return res.status(404).json({ error: 'project not found' });
  try { await GitOps.setRemote(cwd, req.body.url, req.body.name || 'origin'); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ====== Integrations: GitHub + Azure DevOps ======

function ghClient(): GitHubIntegration | null {
  const pat = configManager.config.integrations?.github?.pat;
  return pat ? new GitHubIntegration(pat) : null;
}

function azClient(): AzureDevOpsIntegration | null {
  const az = configManager.config.integrations?.azureDevOps;
  if (!az?.pat || !az?.organization) return null;
  return new AzureDevOpsIntegration(az.pat, az.organization, az.project);
}

app.get('/api/integrations', (_req, res) => {
  const i = configManager.config.integrations || {};
  res.json({
    github: { connected: !!i.github?.pat, user: i.github?.user },
    azureDevOps: {
      connected: !!i.azureDevOps?.pat && !!i.azureDevOps?.organization,
      organization: i.azureDevOps?.organization,
      project: i.azureDevOps?.project,
    },
  });
});

app.post('/api/integrations/github', async (req, res) => {
  const { pat } = req.body || {};
  if (!pat) return res.status(400).json({ error: 'pat required' });
  try {
    const me = await new GitHubIntegration(pat).whoAmI();
    configManager.config.integrations = configManager.config.integrations || {};
    configManager.config.integrations.github = { pat, user: me.login };
    configManager.save();
    res.json({ success: true, user: me });
  } catch (e: any) { res.status(401).json({ error: e.message }); }
});

app.delete('/api/integrations/github', (_req, res) => {
  if (configManager.config.integrations) configManager.config.integrations.github = undefined;
  configManager.save();
  res.json({ success: true });
});

/** Accept "https://dev.azure.com/sdundc/" or "sdundc" or "sdundc/proj" — extract just the org. */
function normalizeAzureOrg(input: string): { organization: string; project?: string } {
  let s = (input || '').trim();
  s = s.replace(/^https?:\/\//i, '').replace(/^dev\.azure\.com\//i, '').replace(/^[^/]*\.visualstudio\.com\/?/i, '');
  s = s.replace(/\/+$/g, '').replace(/^\/+/g, '');
  const parts = s.split('/').filter(Boolean);
  return { organization: parts[0] || '', project: parts[1] };
}

app.post('/api/integrations/azure', async (req, res) => {
  const { pat } = req.body || {};
  let { organization, project } = req.body || {};
  if (!pat || !organization) return res.status(400).json({ error: 'pat and organization required' });
  // Sanitize: strip protocol/host/trailing-slash so users can paste full URLs
  const norm = normalizeAzureOrg(organization);
  organization = norm.organization;
  if (!project && norm.project) project = norm.project;
  if (!organization) return res.status(400).json({ error: 'Could not extract organization name from input' });
  try {
    const me = await new AzureDevOpsIntegration(pat, organization, project).whoAmI();
    configManager.config.integrations = configManager.config.integrations || {};
    configManager.config.integrations.azureDevOps = { pat, organization, project };
    configManager.save();
    res.json({ success: true, user: me, organization, project });
  } catch (e: any) { res.status(401).json({ error: e.message }); }
});

app.delete('/api/integrations/azure', (_req, res) => {
  if (configManager.config.integrations) configManager.config.integrations.azureDevOps = undefined;
  configManager.save();
  res.json({ success: true });
});

app.get('/api/integrations/repos', async (_req, res) => {
  const out: any[] = [];
  const errors: Record<string, string> = {};
  const gh = ghClient();
  if (gh) { try { out.push(...await gh.listRepos()); } catch (e: any) { errors.github = e.message; } }
  const az = azClient();
  if (az) { try { out.push(...await az.listRepos()); } catch (e: any) { errors.azureDevOps = e.message; } }
  res.json({ repos: out, errors });
});

// ====== Processes ======
app.get('/api/processes', (_req, res) => {
  res.json({ processes: processManager.getProcesses() });
});

app.get('/api/tabs', (_req, res) => {
  res.json({ tabs: processManager.getAllTabs() });
});

app.get('/api/tabs/:id/logs', (req, res) => {
  res.json({ logs: processManager.getHistoricalLogs(req.params.id) });
});

app.delete('/api/tabs/:id', (req, res) => {
  processManager.clearLogs(req.params.id);
  res.json({ success: true });
});

/**
 * Universal action runner. Body: { projectId, actionId, vars? (for prompts) }
 * Resolves the action from buildProjects(), interpolates vars, and starts the process.
 * Handles: long-running, one-shot, open, prompt, chain.
 */
app.post('/api/actions/run', async (req, res) => {
  const { projectId, actionId, vars } = req.body as { projectId: string; actionId: string; vars?: Record<string, string> };
  const project = buildProjects().find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const action = project.actions.find(a => a.id === actionId);
  if (!action) return res.status(404).json({ error: 'action not found' });

  const procId = `${projectId}::${actionId}`;
  const cwdResolved = action.cwd
    ? (path.isAbsolute(action.cwd) ? action.cwd : path.join(project.path, action.cwd))
    : project.path;

  // Handle chain
  if (action.type === 'chain' && action.chain && action.chain.length) {
    const steps = [];
    for (const stepId of action.chain) {
      const sub = project.actions.find(a => a.id === stepId);
      if (!sub) continue;
      const subCwd = sub.cwd ? (path.isAbsolute(sub.cwd) ? sub.cwd : path.join(project.path, sub.cwd)) : project.path;
      steps.push({
        id: `${projectId}::${sub.id}`,
        projectId, actionId: sub.id,
        name: `${project.name} • ${sub.label}`,
        command: ProcessManager.interpolateCommand(sub.command, vars || {}),
        cwd: subCwd,
        port: sub.port,
        nodeVersion: project.nodeVersion,
        isLongRunning: sub.type === 'long-running',
      });
    }
    processManager.runChain(procId, steps).catch(() => {});
    return res.json({ success: true, type: 'chain' });
  }

  // Open: spawn ephemerally and exit
  if (action.type === 'open') {
    try {
      const cmd = ProcessManager.interpolateCommand(action.command, vars || {});
      exec(cmd, { cwd: cwdResolved, windowsHide: true }, () => {});
      return res.json({ success: true, type: 'open' });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Long-running / one-shot / prompt
  const command = ProcessManager.interpolateCommand(action.command, vars || {});
  const info = processManager.startProcess({
    id: procId,
    projectId, actionId,
    name: `${project.name} • ${action.label}`,
    command,
    cwd: cwdResolved,
    port: action.port,
    nodeVersion: project.nodeVersion,
    isLongRunning: action.type === 'long-running',
  });
  res.json({ success: true, process: info });
});

/** Run a free-form command in a project's context. */
app.post('/api/actions/run-custom', (req, res) => {
  const { projectId, command, cwd, label } = req.body as { projectId: string; command: string; cwd?: string; label?: string };
  const project = buildProjects().find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const id = `${projectId}::custom-${Date.now()}`;
  const cwdResolved = cwd ? (path.isAbsolute(cwd) ? cwd : path.join(project.path, cwd)) : project.path;
  const info = processManager.startProcess({
    id, projectId, actionId: 'custom',
    name: `${project.name} • ${label || command.slice(0, 30)}`,
    command, cwd: cwdResolved,
    nodeVersion: project.nodeVersion,
    isLongRunning: false,
  });
  res.json({ success: true, process: info });
});

app.post('/api/processes/stop', (req, res) => {
  res.json({ success: processManager.stopProcess(req.body.id) });
});

app.post('/api/processes/restart', async (req, res) => {
  const info = await processManager.restartProcess(req.body.id);
  res.json({ success: !!info, process: info });
});

/**
 * External-process discovery: anything dev-related listening on a known port
 * that DevControl did NOT spawn. Lets the user see Visual Studio / VS Code
 * debug sessions / standalone terminals. Output capture is impossible (parent
 * owns the stdout handle) — we expose Stop and "Adopt" actions instead.
 */
app.get('/api/processes/external', async (_req, res) => {
  try {
    const projects = buildProjects().map(p => ({ id: p.id, name: p.name, path: p.path, port: (p as any).port }));
    const ownPids = processManager.getAllTabs().map(t => (t as any).pid).filter((x: any) => typeof x === 'number');
    const list = await ExternalProcessScanner.scan(projects, [], ownPids);
    res.json({ processes: list });
  } catch (e: any) {
    res.status(500).json({ error: e.message, processes: [] });
  }
});

app.post('/api/processes/external/kill', async (req, res) => {
  const pid = parseInt(req.body?.pid, 10);
  if (!pid) return res.status(400).json({ error: 'pid required' });
  try { await ExternalProcessScanner.kill(pid); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** "Adopt": kill the external instance and start the matched project's
 * primary long-running action through DevControl so output gets captured. */
app.post('/api/processes/external/adopt', async (req, res) => {
  const pid = parseInt(req.body?.pid, 10);
  const projectId = req.body?.projectId as string | undefined;
  const actionId = req.body?.actionId as string | undefined;
  if (!pid) return res.status(400).json({ error: 'pid required' });
  try {
    await ExternalProcessScanner.kill(pid);
    if (projectId && actionId) {
      const project = buildProjects().find(p => p.id === projectId);
      const action = project?.actions.find(a => a.id === actionId);
      if (project && action) {
        const procId = `${projectId}::${actionId}`;
        const cwd = action.cwd
          ? (path.isAbsolute(action.cwd) ? action.cwd : path.join(project.path, action.cwd))
          : project.path;
        // Tiny delay so the port is released before we re-bind
        setTimeout(() => {
          processManager.startProcess({
            id: procId, projectId, actionId,
            name: `${project.name} • ${action.label}`,
            command: action.command, cwd, port: action.port,
            nodeVersion: project.nodeVersion,
            isLongRunning: action.type === 'long-running',
          });
        }, 500);
      }
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/processes/stop-all', (_req, res) => {
  processManager.killAll();
  res.json({ success: true });
});

// ====== Config ======
app.get('/api/config', (_req, res) => {
  res.json({ ...configManager.config, userProjects: userProjects.load() });
});

app.post('/api/config', (req, res) => {
  const incoming = req.body || {};
  if (incoming.scanPaths) configManager.config.scanPaths = incoming.scanPaths;
  if (incoming.globalSettings) configManager.config.globalSettings = { ...configManager.config.globalSettings, ...incoming.globalSettings };
  configManager.save();
  res.json({ success: true });
});

app.post('/api/config/paths/add', (req, res) => {
  if (req.body.path) configManager.addScanPath(req.body.path);
  res.json({ scanPaths: configManager.config.scanPaths });
});

app.post('/api/config/paths/remove', (req, res) => {
  if (req.body.path) configManager.removeScanPath(req.body.path);
  res.json({ scanPaths: configManager.config.scanPaths });
});

app.post('/api/config/pin', (req, res) => {
  const { projectId, actionId } = req.body;
  if (projectId && actionId) configManager.togglePin(projectId, actionId);
  res.json({ success: true, pinnedActions: configManager.config.pinnedActions });
});

app.post('/api/config/project', (req, res) => {
  const { projectId, config } = req.body;
  if (!configManager.config.projectConfigs) configManager.config.projectConfigs = {};
  configManager.config.projectConfigs[projectId] = config;
  configManager.save();
  res.json({ success: true });
});

// ====== User projects.json ======
app.get('/api/user-projects', (_req, res) => {
  res.json(userProjects.load());
});

app.post('/api/user-projects', (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'invalid body' });
  userProjects.save(req.body);
  res.json({ success: true });
});

app.post('/api/user-projects/upsert', (req, res) => {
  if (!req.body || !req.body.id) return res.status(400).json({ error: 'project id required' });
  userProjects.upsertProject(req.body);
  res.json({ success: true });
});

app.delete('/api/user-projects/:id', (req, res) => {
  userProjects.removeProject(req.params.id);
  res.json({ success: true });
});

// ====== Credentials (API tester) ======
app.get('/api/credentials', (_req, res) => {
  res.json(configManager.config.apiCredentials || {});
});

app.post('/api/credentials', (req, res) => {
  const { projectId, credentials } = req.body;
  if (!configManager.config.apiCredentials) configManager.config.apiCredentials = {};
  configManager.config.apiCredentials[projectId] = credentials;
  configManager.save();
  res.json({ success: true });
});

// ====== API Tester collections ======
app.get('/api/collections', (_req, res) => {
  res.json(configManager.config.apiCollections || {});
});

app.post('/api/collections', (req, res) => {
  const { projectId, collection } = req.body;
  if (!configManager.config.apiCollections) configManager.config.apiCollections = {};
  configManager.config.apiCollections[projectId] = collection;
  configManager.save();
  res.json({ success: true });
});

// ====== HTTP proxy (for swagger + free requests) ======
function makeRequest(url: string, opts: any, body?: string): Promise<{ status: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const httpModule = isHttps ? require('https') : require('http');
    let parsed: URL;
    try { parsed = new URL(url); } catch (e) { return reject(e); }
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: opts.timeout || 15000,
      rejectUnauthorized: false,
    };
    const req = httpModule.request(reqOpts, (resp: any) => {
      let buf = '';
      resp.on('data', (c: any) => (buf += c));
      resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: buf }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

app.post('/api/proxy/swagger', async (req, res) => {
  if (!req.body.url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await makeRequest(req.body.url, { timeout: 5000 });
    res.json(JSON.parse(result.body));
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/proxy/request', async (req, res) => {
  const { url, method, headers, body } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const headersFinal = { 'Content-Type': 'application/json', ...(headers || {}) };
    const start = Date.now();
    const result = await makeRequest(url, { method, headers: headersFinal }, body && method !== 'GET' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined);
    res.json({ ...result, durationMs: Date.now() - start });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

// ====== IDE / Open ======
app.post('/api/open', (req, res) => {
  const { path: p, app: appName } = req.body;
  if (!p) return res.status(400).json({ error: 'path required' });
  const cmd = appName === 'rider' ? `rider "${p}"` : appName === 'visualstudio' ? `devenv "${p}"` : `code "${p}"`;
  exec(cmd, { windowsHide: true }, (err) => {
    if (err) {
      // fallback: try opening folder in explorer
      exec(`explorer "${p}"`, { windowsHide: true });
    }
  });
  res.json({ success: true });
});

app.post('/api/open-url', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true });
  res.json({ success: true });
});

// ====== Ports ======
app.post('/api/ports/check', async (req, res) => {
  const { ports } = req.body;
  if (!Array.isArray(ports)) return res.status(400).json({ error: 'ports array required' });
  const unique = [...new Set(ports.filter((p: any) => typeof p === 'number'))];
  const result: Record<number, boolean> = {};
  await Promise.all(unique.map(p => new Promise<void>((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err: any) => { result[p] = err.code === 'EADDRINUSE'; resolve(); });
    srv.once('listening', () => { result[p] = false; srv.close(() => resolve()); });
    srv.listen(p, '127.0.0.1');
  })));
  res.json(result);
});

app.post('/api/ports/kill', (req, res) => {
  const { port } = req.body;
  if (!port) return res.status(400).json({ error: 'port required' });
  if (process.platform === 'win32') {
    exec(`FOR /F "tokens=5" %P IN ('netstat -a -n -o ^| findstr LISTENING ^| findstr :${port}') DO if not "%P"=="0" taskkill /PID %P /T /F`, () => res.json({ success: true }));
  } else {
    exec(`lsof -t -i:${port} -sTCP:LISTEN | xargs kill -9`, () => res.json({ success: true }));
  }
});

app.get('/api/ports/list', (_req, res) => {
  if (process.platform !== 'win32') return res.json({ ports: [] });
  exec('netstat -a -n -o', { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
    if (err) return res.json({ ports: [] });
    const lines = stdout.split(/\r?\n/);
    const out: { port: number; pid: number; proto: string }[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const m = line.trim().match(/^(TCP|UDP)\s+\S+:(\d+)\s+\S+\s+(LISTENING|UDP)?\s*(\d+)?/);
      if (!m) continue;
      const proto = m[1];
      const port = parseInt(m[2], 10);
      const pid = parseInt(m[4] || '0', 10);
      const key = `${proto}-${port}-${pid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (port < 1024 || port > 65535) continue;
      out.push({ port, pid, proto });
    }
    out.sort((a, b) => a.port - b.port);
    res.json({ ports: out });
  });
});

// ====== System ======
app.get('/api/system/stats', async (_req, res) => {
  const snap = getSystemSnapshot();
  // include per-process stats
  const pids = processManager.getProcesses().map(p => p.pid).filter(Boolean) as number[];
  const procStats = await getProcessStats(pids);
  res.json({ ...snap, processStats: procStats });
});

// ====== Health-check (for quickLinks badges) ======
app.post('/api/healthcheck', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const r = await makeRequest(url, { timeout: 1500 });
    res.json({ ok: r.status < 500, status: r.status });
  } catch {
    res.json({ ok: false, status: 0 });
  }
});

// ====== Node versions (NVM) ======
app.get('/api/node-versions', (_req, res) => {
  res.json({ versions: nodeResolver.listVersions() });
});

// ====== Static frontend (production) ======
const distPath = path.join(ROOT, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^\/(?!api|ws).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[server] Serving frontend from ${distPath}`);
}

// ====== WebSockets ======
const wssTerminal = new WebSocketServer({ noServer: true });
new TerminalSocket(wssTerminal);

const wssEvents = new WebSocketServer({ noServer: true });
wssEvents.on('connection', (ws) => {
  const safeSend = (obj: any) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  // Translate backend events → frontend WSEvent contract (per-tab events).
  const onLog = (p: { id: string; type: string; data: string }) => {
    safeSend({
      event: 'log',
      tabId: p.id,
      stream: p.type === 'stderr' ? 'stderr' : 'stdout',
      text: p.data,
      ts: Date.now(),
    });
  };

  const onStatusUpdate = (p: { processes: any[] }) => {
    for (const proc of p.processes || []) {
      safeSend({
        event: 'status',
        tabId: proc.id,
        status: proc.status,
        pid: proc.pid,
        exitCode: proc.exitCode ?? null,
        name: proc.name,
        projectId: proc.projectId,
        actionId: proc.actionId,
        port: proc.port,
      });
    }
  };

  const onReady = (p: { id: string; name: string }) => {
    const proc = processManager.getProcess(p.id);
    safeSend({ event: 'ready', tabId: p.id, port: proc?.port });
  };

  const onCrash = (p: { id: string; name: string; code: number | null }) => {
    safeSend({ event: 'crash', tabId: p.id, name: p.name, exitCode: p.code });
  };

  bus.on('process:log', onLog);
  bus.on('process:status-update', onStatusUpdate);
  bus.on('process:ready', onReady);
  bus.on('process:crash', onCrash);

  // Push system stats every 2s
  const statTimer = setInterval(async () => {
    if (ws.readyState !== ws.OPEN) return;
    const snap = getSystemSnapshot();
    const pids = processManager.getProcesses().map(p => p.pid).filter(Boolean) as number[];
    const procStats = await getProcessStats(pids);
    safeSend({ event: 'system', snapshot: snap, processes: procStats });
  }, 2000);

  ws.on('close', () => {
    bus.off('process:log', onLog);
    bus.off('process:status-update', onStatusUpdate);
    bus.off('process:ready', onReady);
    bus.off('process:crash', onCrash);
    clearInterval(statTimer);
  });

  // Initial snapshot — emit a status event per process so the reducer hydrates immediately.
  for (const proc of processManager.getProcesses()) {
    safeSend({
      event: 'status',
      tabId: proc.id,
      status: proc.status,
      pid: proc.pid,
      exitCode: proc.exitCode ?? null,
    });
  }
});

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (url === '/api/terminal' || url.startsWith('/api/terminal')) {
    wssTerminal.handleUpgrade(req, socket, head, (ws) => wssTerminal.emit('connection', ws, req));
  } else if (url === '/ws' || url === '/api/process-logs' || url.startsWith('/ws')) {
    wssEvents.handleUpgrade(req, socket, head, (ws) => wssEvents.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// ====== Start ======
server.listen(PORT, () => {
  const isProd = fs.existsSync(distPath);
  console.log(`\n┌─────────────────────────────────────────────┐`);
  console.log(`│  DevControl V2  •  Port ${PORT}                  │`);
  console.log(`│  → http://localhost:${PORT}                     │`);
  console.log(`│  Mode: ${isProd ? 'PRODUCTION (single port)' : 'DEV (frontend on Vite)  '}│`);
  console.log(`└─────────────────────────────────────────────┘\n`);
  bus.emit('system:ready', { port: PORT });
  if (configManager.config.globalSettings?.autoOpenBrowser !== false && isProd) {
    setTimeout(() => exec(`start "" "http://localhost:${PORT}"`), 500);
  }
});

// ====== Graceful shutdown ======
function shutdown() {
  console.log('\n[shutdown] Killing all child processes...');
  processManager.killAll();
  setTimeout(() => process.exit(0), 800);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

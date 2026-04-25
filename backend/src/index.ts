import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { exec } from 'child_process';
import { EventEmitter } from 'events';
import os from 'os';
import net from 'net';
import path from 'path';
import fs from 'fs';

import { ProcessManager } from './core/ProcessManager';
import { ConfigManager } from './core/ConfigManager';
import { WorkspaceScanner, DiscoveredAction } from './core/WorkspaceScanner';
import { UserProjectsLoader } from './core/UserProjectsLoader';
import { NodeResolver } from './core/NodeResolver';
import { TerminalSocket } from './core/TerminalSocket';
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ====== Helper: build merged projects (auto + user) ======
function buildProjects() {
  scanner.setRoots(configManager.getPaths());
  const auto = scanner.scan();
  const user = userProjects.load();
  let merged = WorkspaceScanner.merge(auto, user.projects || []);

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
  res.json({ workspaces: buildProjects() });
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
  const fwd = (event: string) => (payload: any) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify({ event, ...payload })); } catch {}
    }
  };
  const handlers: { [k: string]: (p: any) => void } = {
    'process:log': fwd('log'),
    'process:status-update': fwd('status'),
    'process:ready': fwd('ready'),
    'process:crash': fwd('crash'),
  };
  for (const [k, h] of Object.entries(handlers)) bus.on(k, h);

  // Push system stats every 2s
  const statTimer = setInterval(async () => {
    if (ws.readyState !== ws.OPEN) return;
    const snap = getSystemSnapshot();
    const pids = processManager.getProcesses().map(p => p.pid).filter(Boolean) as number[];
    const procStats = await getProcessStats(pids);
    try { ws.send(JSON.stringify({ event: 'system', ...snap, processStats: procStats })); } catch {}
  }, 2000);

  ws.on('close', () => {
    for (const [k, h] of Object.entries(handlers)) bus.off(k, h);
    clearInterval(statTimer);
  });

  // Initial snapshot
  try {
    ws.send(JSON.stringify({ event: 'status', processes: processManager.getProcesses() }));
  } catch {}
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

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, GitBranch, Search, Check, AlertCircle, Sparkles,  Cloud, Zap, RefreshCw } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';

interface DetectedAction {
  id: string; label: string; command: string; type: string; category: string; cwd?: string; port?: number;
}
interface DetectedQuickLink { label: string; url: string; healthCheck?: boolean; }
interface DetectedControl {
  id: string; label: string; description: string; recommended: boolean;
  actions: DetectedAction[]; quickLinks?: DetectedQuickLink[];
}
interface DetectionResult {
  suggestedId: string;
  suggestedName: string;
  type: string;
  nodeVersion?: string;
  exists: boolean;
  isGitRepo: boolean;
  gitBranch?: string;
  gitRemote?: string;
  controls: DetectedControl[];
  notes: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded?: (id: string) => void;
}

type Mode = 'local' | 'clone' | 'github' | 'azure';

interface RemoteRepo {
  id: string; name: string; fullName: string; description?: string; defaultBranch?: string;
  cloneUrl: string; webUrl: string; provider: 'github' | 'azure'; private: boolean; updatedAt?: string;
}

export function AddProjectModal({ open, onClose, onAdded }: Props) {
  const [mode, setMode] = useState<Mode>('local');

  // Local-pick state
  const [path, setPath] = useState('');
  // Clone state
  const [gitUrl, setGitUrl] = useState('');
  const [targetParent, setTargetParent] = useState('C:\\Projects');
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  // Shared
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [nodeVersion, setNodeVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bootstrap, setBootstrap] = useState(true);

  // Remote-repo browser
  const [remoteRepos, setRemoteRepos] = useState<RemoteRepo[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteFilter, setRemoteFilter] = useState('');
  const [providers, setProviders] = useState<{ github: boolean; azure: boolean }>({ github: false, azure: false });

  const reset = useCallback(() => {
    setMode('local');
    setPath(''); setGitUrl(''); setTargetParent('C:\\Projects'); setCloneName('');
    setDetection(null); setEnabled({}); setName(''); setGroup(''); setNodeVersion('');
    setError(null); setSaving(false); setCloning(false); setDetecting(false);
  }, []);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  // Load integration status when modal opens
  useEffect(() => {
    if (!open) return;
    api.getIntegrations().then(i => {
      setProviders({ github: !!i.github?.connected, azure: !!i.azureDevOps?.connected });
    }).catch(() => {});
  }, [open]);

  const loadRemoteRepos = useCallback(async () => {
    setRemoteLoading(true); setError(null);
    try {
      const r = await api.listRepos();
      setRemoteRepos(r.repos);
      const errs = Object.values(r.errors || {}).filter(Boolean);
      if (errs.length) setError(errs.join(' • '));
    } catch (e: any) {
      setError(e?.message || 'Failed to load repos');
    } finally {
      setRemoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (mode === 'github' && providers.github && !remoteRepos?.some(r => r.provider === 'github')) {
      loadRemoteRepos();
    } else if (mode === 'azure' && providers.azure && !remoteRepos?.some(r => r.provider === 'azure')) {
      loadRemoteRepos();
    }
  }, [open, mode, remoteRepos, providers, loadRemoteRepos]);

  // ------- Run detection -------
  const detect = useCallback(async (folderPath: string) => {
    if (!folderPath) return;
    setDetecting(true); setError(null);
    try {
      const r: DetectionResult = await api.detectProject(folderPath);
      if (!r.exists) {
        setError('That folder does not exist or is not readable.');
        setDetection(null);
        return;
      }
      setDetection(r);
      setName(r.suggestedName);
      setNodeVersion(r.nodeVersion || '');
      const initEnabled: Record<string, boolean> = {};
      for (const c of r.controls) initEnabled[c.id] = c.recommended;
      setEnabled(initEnabled);
    } catch (e: any) {
      setError(e?.message || 'Detection failed');
    } finally {
      setDetecting(false);
    }
  }, []);

  // ------- Native folder picker (declared after detect so we can call it) -------
  const browse = useCallback(async (target: 'path' | 'parent') => {
    setError(null);
    try {
      const res = await api.pickFolder({
        title: target === 'path' ? 'Select project folder' : 'Select parent folder for clone',
        initialDir: target === 'path' ? (path || 'C:\\Projects') : (targetParent || 'C:\\Projects'),
      });
      if (!res.path) return;
      if (target === 'path') {
        setPath(res.path);
        await detect(res.path);
      } else {
        setTargetParent(res.path);
      }
    } catch (e: any) {
      setError(e?.message || 'Folder picker failed');
    }
  }, [path, targetParent, detect]);

  // ------- Clone then detect -------
  const cloneAndDetect = useCallback(async (overrideUrl?: string, overrideName?: string) => {
    setError(null);
    const url = (overrideUrl || gitUrl).trim();
    if (!url) { setError('Git URL required.'); return; }
    if (!targetParent.trim()) { setError('Target parent folder required.'); return; }
    setCloning(true);
    try {
      const r = await api.cloneProject({ gitUrl: url, targetParent, name: (overrideName || cloneName).trim() || undefined });
      // Poll the tab logs until git clone finishes
      const tabId = r.tabId as string;
      const target = r.targetPath as string;
      let done = false;
      const start = Date.now();
      while (!done && Date.now() - start < 5 * 60 * 1000) {
        await new Promise(res => setTimeout(res, 800));
        const tabs = await api.listTabs();
        const list = (tabs?.tabs ?? tabs ?? []) as any[];
        const tab = list.find(t => t.id === tabId);
        if (tab && !tab.isRunning) { done = true; break; }
      }
      if (!done) throw new Error('Clone is taking longer than 5 minutes — check the Logs tab.');
      // Hand the cloned dir to the detector
      setPath(target);
      await detect(target);
    } catch (e: any) {
      setError(e?.message || 'Clone failed');
    } finally {
      setCloning(false);
    }
  }, [gitUrl, targetParent, cloneName, detect]);

  // ------- Save (build UserProject and POST) -------
  const save = useCallback(async () => {
    if (!detection || !path) return;
    setSaving(true); setError(null);
    try {
      const groupsForSave: { name: string; actions: any[] }[] = [];
      for (const c of detection.controls) {
        if (!enabled[c.id]) continue;
        groupsForSave.push({
          name: c.actions[0]?.category || c.label,
          actions: c.actions.map(a => ({
            id: a.id, label: a.label, command: a.command, type: a.type as any,
            cwd: a.cwd, category: a.category, port: a.port,
          })),
        });
      }
      const quickLinks = detection.controls
        .filter(c => enabled[c.id])
        .flatMap(c => c.quickLinks || []);

      const project = {
        id: (detection.suggestedId || name).replace(/\s+/g, '-'),
        name: name.trim() || detection.suggestedName,
        path,
        group: group.trim() || undefined,
        nodeVersion: nodeVersion.trim() || undefined,
        groups: groupsForSave,
        quickLinks,
      };
      await api.addProject(project);

      // Auto-bootstrap: run setup commands so user doesn't have to click them
      if (bootstrap) {
        const SETUP_PATTERNS = /^(npm|pnpm|yarn)\s+(install|i|ci)|^dotnet\s+(restore|build)|^pip\s+install|^bundle\s+install|^composer\s+install/i;
        const setupActions = (detection.controls || [])
          .filter(c => enabled[c.id])
          .flatMap(c => c.actions)
          .filter(a => SETUP_PATTERNS.test(a.command));
        for (const a of setupActions) {
          try { await api.runAction({ projectId: project.id, actionId: a.id }); } catch {}
        }
      }

      onAdded?.(project.id);
      close();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [detection, enabled, name, group, nodeVersion, path, onAdded, close]);

  // ---------- Render ----------
  return (
    <Modal
      open={open}
      onClose={close}
      title="Add project"
      description="Pick a folder on your machine or clone a Git repo. The detector will suggest controls — you choose what to enable."
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Check size={14} />}
            onClick={save}
            disabled={!detection || saving}
            loading={saving}
          >
            Add to workspace
          </Button>
        </>
      }
    >
      {/* Mode tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-[var(--color-bg-2)]/60 border border-[var(--color-line)] w-fit flex-wrap">
        <ModeBtn active={mode === 'local'} onClick={() => setMode('local')} icon={<FolderOpen size={13} />}>Local folder</ModeBtn>
        <ModeBtn active={mode === 'clone'} onClick={() => setMode('clone')} icon={<GitBranch size={13} />}>Clone URL</ModeBtn>
        <ModeBtn
          active={mode === 'github'}
          onClick={() => setMode('github')}
          icon={<span className="inline-flex items-center justify-center size-4 rounded bg-white/10 text-white text-[9px] font-bold">GH</span>}
        >
          GitHub
          {providers.github && <span className="ml-1 text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">on</span>}
        </ModeBtn>
        <ModeBtn
          active={mode === 'azure'}
          onClick={() => setMode('azure')}
          icon={<span className="inline-flex items-center justify-center size-4 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold">AZ</span>}
        >
          Azure DevOps
          {providers.azure && <span className="ml-1 text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300">on</span>}
        </ModeBtn>
      </div>

      {/* Source picker */}
      {mode === 'local' && (
        <div className="space-y-3">
          <Field label="Project folder">
            <div className="flex gap-2">
              <Input
                placeholder="C:\Projects\my-app"
                value={path}
                onChange={e => setPath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') detect(path); }}
              />
              <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => browse('path')}>Browse…</Button>
              <Button variant="primary" size="sm" icon={<Search size={14} />} onClick={() => detect(path)} disabled={!path || detecting} loading={detecting}>Detect</Button>
            </div>
          </Field>
        </div>
      )}

      {mode === 'clone' && (
        <div className="space-y-3">
          <Field label="Git URL" hint="HTTPS or SSH (you must already be authenticated for SSH).">
            <Input
              placeholder="https://github.com/owner/repo.git"
              value={gitUrl}
              onChange={e => setGitUrl(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Clone into">
              <div className="flex gap-2">
                <Input value={targetParent} onChange={e => setTargetParent(e.target.value)} />
                <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={() => browse('parent')}>Browse…</Button>
              </div>
            </Field>
            <Field label="Folder name (optional)" hint="Defaults to the repo name.">
              <Input placeholder="auto from URL" value={cloneName} onChange={e => setCloneName(e.target.value)} />
            </Field>
          </div>
          <div>
            <Button variant="primary" size="sm" icon={<GitBranch size={14} />} onClick={() => cloneAndDetect()} disabled={!gitUrl || cloning} loading={cloning}>
              {cloning ? 'Cloning…' : 'Clone & detect'}
            </Button>
            {cloning && (
              <p className="mt-2 text-[11px] text-[var(--color-text-3)]">
                Watch progress in the Logs tab — the modal will continue automatically when the clone finishes.
              </p>
            )}
          </div>
        </div>
      )}

      {(mode === 'github' || mode === 'azure') && (
        <RemoteRepoPanel
          provider={mode}
          connected={mode === 'github' ? providers.github : providers.azure}
          repos={(remoteRepos || []).filter(r => r.provider === mode)}
          loading={remoteLoading}
          filter={remoteFilter}
          onFilterChange={setRemoteFilter}
          onRefresh={loadRemoteRepos}
          targetParent={targetParent}
          onTargetParentChange={setTargetParent}
          onBrowse={() => browse('parent')}
          cloning={cloning}
          onClone={r => { setGitUrl(r.cloneUrl); setCloneName(r.name); void cloneAndDetect(r.cloneUrl, r.name); }}
        />
      )}

      {/* Errors */}
      {error && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Detection result */}
      {detection && (
        <div className="mt-5 space-y-4">
          <div className="hr-fade" />

          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-[var(--color-brand-500)]/20 text-[var(--color-brand-300)] flex items-center justify-center">
              <Sparkles size={15} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[var(--color-text-1)]">Detected: {detection.type}</h3>
              <div className="text-[11px] text-[var(--color-text-3)] mt-0.5">
                {detection.isGitRepo && (
                  <>Git: {detection.gitBranch || '?'}{detection.gitRemote ? ` · ${detection.gitRemote}` : ''}{detection.nodeVersion ? ` · Node ${detection.nodeVersion}` : ''}</>
                )}
                {!detection.isGitRepo && detection.nodeVersion && <>Node {detection.nodeVersion}</>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Display name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Group (optional)" hint="Sidebar grouping, e.g. ‘Work’, ‘Personal’.">
              <Input value={group} onChange={e => setGroup(e.target.value)} placeholder="Workspace" />
            </Field>
          </div>
          <Field label="Node version (optional)" hint="Pinned via NVM-Windows when actions run.">
            <Input value={nodeVersion} onChange={e => setNodeVersion(e.target.value)} placeholder="14, 18, 20…" />
          </Field>

          <div>
            <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-3)] mb-2">Controls</h4>
            <p className="text-[11px] text-[var(--color-text-3)] mb-2">
              Choose which control groups appear in the project. You can change this later via the Edit button.
            </p>
            <ul className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {detection.controls.length === 0 && (
                <li className="text-xs text-[var(--color-text-3)] px-3 py-2 rounded border border-[var(--color-line)] bg-[var(--color-bg-1)]/40">
                  No project markers found. You can still add the folder; only generic IDE actions will be available.
                </li>
              )}
              {detection.controls.map(c => (
                <li
                  key={c.id}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2 rounded-lg border transition cursor-pointer',
                    enabled[c.id]
                      ? 'border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/10'
                      : 'border-[var(--color-line)] bg-[var(--color-bg-1)]/40 hover:border-[var(--color-line-strong)]',
                  )}
                  onClick={() => setEnabled(s => ({ ...s, [c.id]: !s[c.id] }))}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-[var(--color-brand-500)]"
                    checked={!!enabled[c.id]}
                    onChange={() => setEnabled(s => ({ ...s, [c.id]: !s[c.id] }))}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text-1)]">{c.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--color-text-3)]">{c.actions.length} actions</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-3)] mt-0.5">{c.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {detection.notes.length > 0 && (
            <div className="text-[11px] text-[var(--color-text-3)] space-y-0.5">
              {detection.notes.map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          )}

          <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-1)]/40 cursor-pointer">
            <input
              type="checkbox"
              checked={bootstrap}
              onChange={e => setBootstrap(e.target.checked)}
              className="mt-0.5 accent-[var(--color-brand-500)]"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-amber-300" />
                <span className="text-sm font-medium text-[var(--color-text-1)]">Bootstrap after add</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-3)] mt-0.5">
                Auto-run setup commands from the enabled controls (npm install, dotnet restore, etc.) so the project is ready to start.
              </p>
            </div>
          </label>
        </div>
      )}
    </Modal>
  );
}

function ModeBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 h-7 px-3 rounded-md text-xs transition',
        active
          ? 'bg-[var(--color-bg-3)] text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_var(--color-line-strong)]'
          : 'text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5',
      )}
    >
      {icon}{children}
    </button>
  );
}

function RemoteRepoPanel(props: {
  provider: 'github' | 'azure';
  connected: boolean;
  repos: RemoteRepo[];
  loading: boolean;
  filter: string;
  onFilterChange: (s: string) => void;
  onRefresh: () => void;
  targetParent: string;
  onTargetParentChange: (s: string) => void;
  onBrowse: () => void;
  cloning: boolean;
  onClone: (r: RemoteRepo) => void;
}) {
  const { provider, connected, repos, loading, filter, onFilterChange, onRefresh, targetParent, onTargetParentChange, onBrowse, cloning, onClone } = props;
  const label = provider === 'github' ? 'GitHub' : 'Azure DevOps';
  const badgeClasses = provider === 'github' ? 'bg-white/10 text-white' : 'bg-blue-500/20 text-blue-300';
  const tag = provider === 'github' ? 'GH' : 'AZ';
  const tokensUrl = provider === 'github'
    ? 'github.com/settings/tokens'
    : 'dev.azure.com/<org>/_usersSettings/tokens';

  if (!connected) {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-1)]/40 p-4 text-center">
        <span className={cn('inline-flex items-center justify-center size-8 rounded mb-2 text-xs font-bold', badgeClasses)}>{tag}</span>
        <p className="text-sm text-[var(--color-text-2)] mb-1">{label} not connected.</p>
        <p className="text-[11px] text-[var(--color-text-3)]">
          Open <strong>Settings → Integrations</strong> (Ctrl+,) and add a PAT from <code>{tokensUrl}</code>.
        </p>
      </div>
    );
  }

  const filtered = repos.filter(r => !filter || r.fullName.toLowerCase().includes(filter.toLowerCase())).slice(0, 200);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <Input
          placeholder={`Filter ${label} repos…`}
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
          className="flex-1"
        />
        <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={onRefresh} loading={loading}>
          Refresh
        </Button>
      </div>
      <Field label="Clone into">
        <div className="flex gap-2">
          <Input value={targetParent} onChange={e => onTargetParentChange(e.target.value)} />
          <Button variant="secondary" size="sm" icon={<FolderOpen size={14} />} onClick={onBrowse}>Browse…</Button>
        </div>
      </Field>
      <ul className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line)] overflow-hidden max-h-[280px] overflow-y-auto bg-[var(--color-bg-1)]/30">
        {loading && <li className="px-3 py-3 text-sm text-[var(--color-text-3)]">Loading {label} repositories…</li>}
        {!loading && filtered.length === 0 && (
          <li className="px-3 py-3 text-sm text-[var(--color-text-3)]">No {label} repos {filter ? 'match the filter' : 'found'}.</li>
        )}
        {!loading && filtered.map(r => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5">
            <span className={cn('inline-flex items-center justify-center size-5 rounded text-[10px] font-bold uppercase', badgeClasses)}>{tag}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-text-1)] truncate">{r.fullName}</span>
                {r.private && <span className="text-[10px] px-1 rounded bg-amber-500/15 text-amber-300">private</span>}
                {r.defaultBranch && <span className="text-[10px] text-[var(--color-text-4)]">{r.defaultBranch}</span>}
              </div>
              {r.description && <p className="text-[11px] text-[var(--color-text-3)] truncate">{r.description}</p>}
            </div>
            <Button
              variant="primary"
              size="xs"
              icon={<GitBranch size={12} />}
              loading={cloning}
              onClick={() => onClone(r)}
            >
              Clone
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[var(--color-text-2)] mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[var(--color-text-3)]">{hint}</p>}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, FolderPlus, Plus, Trash2, FolderOpen, Settings as Cog, Layers } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';

interface DiscoveredProject {
  id: string;
  name: string;
  path: string;
  type: string;
  source: 'auto' | 'user' | 'merged';
  actionCount: number;
  hidden: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after any change so the parent can refresh the workspace list. */
  onChanged?: () => void;
}

type TabId = 'workspaces' | 'projects' | 'general';

export function SettingsModal({ open, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<TabId>('workspaces');
  const [scanPaths, setScanPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState('');
  const [projects, setProjects] = useState<DiscoveredProject[]>([]);
  const [filter, setFilter] = useState('');
  const [globalSettings, setGlobalSettings] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, all] = await Promise.all([api.getConfig(), api.getAllWorkspaces()]);
      setScanPaths(cfg.scanPaths || []);
      setGlobalSettings(cfg.globalSettings || {});
      setProjects(all.projects || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const addPath = async () => {
    const p = newPath.trim();
    if (!p) return;
    await api.addScanPath(p);
    setNewPath('');
    await reload();
    onChanged?.();
  };

  const removePath = async (p: string) => {
    await api.removeScanPath(p);
    await reload();
    onChanged?.();
  };

  const toggleHidden = async (proj: DiscoveredProject) => {
    if (proj.hidden) await api.showProject(proj.id);
    else await api.hideProject(proj.id);
    await reload();
    onChanged?.();
  };

  const hideAll = async () => {
    await api.setHiddenProjects(filtered.map(p => p.id));
    await reload();
    onChanged?.();
  };

  const showAll = async () => {
    await api.setHiddenProjects([]);
    await reload();
    onChanged?.();
  };

  const saveGeneral = async () => {
    await api.patchConfig({ globalSettings });
    onChanged?.();
  };

  const filtered = projects.filter(p =>
    !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.path.toLowerCase().includes(filter.toLowerCase()),
  );
  const hiddenCount = projects.filter(p => p.hidden).length;
  const visibleCount = projects.length - hiddenCount;

  const tabs: { id: TabId; label: string; icon: any; badge?: string | number }[] = [
    { id: 'workspaces', label: 'Scan Paths', icon: FolderOpen, badge: scanPaths.length },
    { id: 'projects', label: 'Projects', icon: Layers, badge: `${visibleCount}/${projects.length}` },
    { id: 'general', label: 'General', icon: Cog },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      description="Control which folders are scanned and which projects appear in the sidebar."
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="flex gap-4 min-h-[420px]">
        {/* Sidebar */}
        <nav className="w-44 flex-shrink-0 flex flex-col gap-1">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 h-9 px-3 rounded-md text-sm transition text-left',
                  tab === t.id
                    ? 'bg-[var(--color-bg-2)] text-[var(--color-text-1)] border border-[var(--color-line)]'
                    : 'text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5',
                )}
              >
                <Icon size={14} />
                <span className="flex-1">{t.label}</span>
                {t.badge !== undefined && (
                  <span className="text-[10px] px-1.5 rounded-full bg-white/5 text-[var(--color-text-3)]">{t.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Body */}
        <div className="flex-1 min-w-0">
          {tab === 'workspaces' && (
            <section className="space-y-3">
              <header>
                <h3 className="text-sm font-semibold">Scan Paths</h3>
                <p className="text-xs text-[var(--color-text-3)] mt-0.5">
                  Top-level folders here are scanned. Each immediate subfolder is checked for project markers
                  (.sln+src, .csproj, package.json, docker-compose.yml, .git). Subfolders are not recursed —
                  add a deeper path if your projects live nested.
                </p>
              </header>

              <div className="flex gap-2">
                <Input
                  placeholder="C:\Projects\company-a"
                  value={newPath}
                  onChange={e => setNewPath(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addPath(); }}
                  className="flex-1"
                />
                <Button variant="primary" size="sm" icon={<FolderPlus size={14} />} onClick={addPath}>Add</Button>
              </div>

              <ul className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line)] overflow-hidden">
                {scanPaths.length === 0 && (
                  <li className="px-3 py-3 text-sm text-[var(--color-text-3)]">No scan paths configured.</li>
                )}
                {scanPaths.map(p => (
                  <li key={p} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-1)]/40">
                    <FolderOpen size={13} className="text-[var(--color-text-3)]" />
                    <code className="flex-1 text-[12.5px] font-mono text-[var(--color-text-2)] truncate">{p}</code>
                    <Button variant="ghost" size="xs" icon={<Trash2 size={12} />} onClick={() => removePath(p)} aria-label="Remove" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === 'projects' && (
            <section className="space-y-3">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Projects</h3>
                  <p className="text-xs text-[var(--color-text-3)] mt-0.5">
                    Toggle visibility per project. Hidden projects are still discovered but won't appear in the sidebar.
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="xs" onClick={showAll} disabled={hiddenCount === 0}>Show all</Button>
                  <Button variant="ghost" size="xs" onClick={hideAll} disabled={filtered.length === 0}>Hide filtered</Button>
                </div>
              </header>

              <Input
                placeholder="Filter by name or path…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />

              <ul className="rounded-lg border border-[var(--color-line)] divide-y divide-[var(--color-line)] overflow-hidden max-h-[340px] overflow-y-auto">
                {loading && <li className="px-3 py-3 text-sm text-[var(--color-text-3)]">Loading…</li>}
                {!loading && filtered.length === 0 && (
                  <li className="px-3 py-3 text-sm text-[var(--color-text-3)]">No projects match the filter.</li>
                )}
                {filtered.map(p => (
                  <li
                    key={p.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 transition',
                      p.hidden ? 'bg-[var(--color-bg-1)]/20 opacity-60' : 'bg-[var(--color-bg-1)]/40',
                    )}
                  >
                    <button
                      onClick={() => toggleHidden(p)}
                      className={cn(
                        'p-1.5 rounded-md transition',
                        p.hidden
                          ? 'text-[var(--color-text-4)] hover:text-emerald-400 hover:bg-emerald-500/10'
                          : 'text-emerald-400 hover:text-rose-400 hover:bg-rose-500/10',
                      )}
                      aria-label={p.hidden ? 'Show' : 'Hide'}
                      title={p.hidden ? 'Show in sidebar' : 'Hide from sidebar'}
                    >
                      {p.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-1)] truncate">{p.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--color-text-3)] uppercase tracking-wider">{p.source}</span>
                        <span className="text-[10px] text-[var(--color-text-3)]">{p.actionCount} actions</span>
                      </div>
                      <code className="text-[11px] font-mono text-[var(--color-text-3)] truncate block">{p.path}</code>
                    </div>
                    <span className="text-[10px] text-[var(--color-text-3)] uppercase tracking-wider">{p.type}</span>
                  </li>
                ))}
              </ul>
              <div className="text-[11px] text-[var(--color-text-3)] flex justify-between">
                <span>{visibleCount} visible · {hiddenCount} hidden</span>
                <span>{projects.length} discovered</span>
              </div>
            </section>
          )}

          {tab === 'general' && (
            <section className="space-y-4">
              <header>
                <h3 className="text-sm font-semibold">General</h3>
                <p className="text-xs text-[var(--color-text-3)] mt-0.5">Global preferences.</p>
              </header>

              <Field label="NVM home" hint="Override the path to NVM-Windows install. Leave blank for auto-detect (%APPDATA%\nvm).">
                <Input
                  value={globalSettings.nvmHome || ''}
                  onChange={e => setGlobalSettings({ ...globalSettings, nvmHome: e.target.value })}
                  placeholder="C:\Users\You\AppData\Roaming\nvm"
                />
              </Field>

              <Toggle
                label="Auto-open browser on start"
                checked={!!globalSettings.autoOpenBrowser}
                onChange={v => setGlobalSettings({ ...globalSettings, autoOpenBrowser: v })}
              />
              <Toggle
                label="Toast on process ready"
                checked={globalSettings.notificationsOnReady !== false}
                onChange={v => setGlobalSettings({ ...globalSettings, notificationsOnReady: v })}
              />
              <Toggle
                label="Toast on process crash"
                checked={globalSettings.notificationsOnCrash !== false}
                onChange={v => setGlobalSettings({ ...globalSettings, notificationsOnCrash: v })}
              />

              <div className="pt-2">
                <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={saveGeneral}>Save</Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </Modal>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-[var(--color-text-2)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-9 h-5 rounded-full transition',
          checked ? 'bg-[var(--color-brand-500)]' : 'bg-[var(--color-bg-3)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </label>
  );
}

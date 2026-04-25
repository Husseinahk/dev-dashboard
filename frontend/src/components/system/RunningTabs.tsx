import { useEffect, useState } from 'react';
import { Square, RotateCcw, ExternalLink, Zap, AlertTriangle } from 'lucide-react';
import type { ProcessTab } from '../../types';
import { StatusDot } from '../ui/StatusDot';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { formatRelative } from '../../utils/format';
import { api } from '../../services/api';

interface Props {
  tabs: ProcessTab[];
  onSelect: (tabId: string) => void;
  onStop: (tabId: string) => void;
  onRestart: (tabId: string) => void;
}

interface ExternalProc {
  pid: number;
  port: number;
  name: string;
  cwd?: string;
  commandLine?: string;
  matchedProjectId?: string;
  matchedProjectName?: string;
}

export function RunningTabs({ tabs, onSelect, onStop, onRestart }: Props) {
  const running = tabs.filter(t => t.isRunning);
  const [external, setExternal] = useState<ExternalProc[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyPid, setBusyPid] = useState<number | null>(null);

  // Poll external processes every 5s
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await api.externalProcesses();
        if (!cancelled) setExternal(r.processes || []);
      } catch {/* ignore */}
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const refreshExternal = async () => {
    setLoading(true);
    try { const r = await api.externalProcesses(); setExternal(r.processes || []); } finally { setLoading(false); }
  };

  const stopExternal = async (pid: number) => {
    setBusyPid(pid);
    try { await api.killExternal(pid); await refreshExternal(); } finally { setBusyPid(null); }
  };

  const adoptExternal = async (e: ExternalProc) => {
    if (!e.matchedProjectId) {
      // No project matched — just kill, user can restart manually
      return stopExternal(e.pid);
    }
    setBusyPid(e.pid);
    try {
      // Try to find a long-running action on the matched project. If not provided, backend just kills.
      await api.adoptExternal(e.pid, e.matchedProjectId);
      await refreshExternal();
    } finally { setBusyPid(null); }
  };

  if (running.length === 0 && external.length === 0) {
    return (
      <div className="px-6 py-4 text-sm text-[var(--color-text-3)]">
        Nothing running. Start a project from the sidebar.
      </div>
    );
  }

  return (
    <div className="px-6 py-3 grid gap-2">
      {/* DevControl-managed processes */}
      {running.map(t => (
        <div key={t.id} className="surface-2 px-3 py-2.5 flex items-center gap-3 group">
          <StatusDot status={t.status} />
          <button onClick={() => onSelect(t.id)} className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium truncate">{t.name}</div>
            <div className="text-[11px] text-[var(--color-text-3)] flex items-center gap-2">
              {t.pid && <span>PID {t.pid}</span>}
              {t.startedAt && <span>· started {formatRelative(t.startedAt)}</span>}
            </div>
          </button>
          {t.port && <Badge tone="brand">:{t.port}</Badge>}
          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
            <Tooltip label="Show logs">
              <Button variant="ghost" size="xs" icon={<ExternalLink size={12} />} onClick={() => onSelect(t.id)} aria-label="Logs" />
            </Tooltip>
            <Tooltip label="Restart">
              <Button variant="ghost" size="xs" icon={<RotateCcw size={12} />} onClick={() => onRestart(t.id)} aria-label="Restart" />
            </Tooltip>
            <Tooltip label="Stop">
              <Button variant="ghost" size="xs" icon={<Square size={12} />} onClick={() => onStop(t.id)} aria-label="Stop" />
            </Tooltip>
          </div>
        </div>
      ))}

      {/* External processes — discovered via netstat */}
      {external.length > 0 && (
        <>
          <div className="mt-2 px-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-text-4)]">
            <span>External processes</span>
            <span className="px-1.5 rounded-full bg-amber-500/15 text-amber-300 normal-case tracking-normal text-[10px]">{external.length}</span>
            <span className="ml-auto normal-case tracking-normal text-[10.5px] text-[var(--color-text-3)]">started outside DevControl · output not captured</span>
          </div>
          {external.map(e => (
            <div key={e.pid} className="surface-2 px-3 py-2.5 flex items-center gap-3 group border-l-2 border-amber-500/40">
              <div className="size-2 rounded-full bg-amber-400" title="External" />
              <a
                href={`http://localhost:${e.port}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-0 text-left hover:text-[var(--color-text-1)]"
                title={e.commandLine || e.cwd || ''}
              >
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {e.matchedProjectName || e.name}
                  <span className="text-[10px] px-1 rounded bg-amber-500/15 text-amber-300">external</span>
                </div>
                <div className="text-[11px] text-[var(--color-text-3)] flex items-center gap-2 truncate">
                  <span>PID {e.pid}</span>
                  <span>· {e.name}</span>
                  {e.cwd && <span className="truncate">· {e.cwd}</span>}
                </div>
              </a>
              <Badge tone="brand">:{e.port}</Badge>
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                {e.matchedProjectId && (
                  <Tooltip label="Adopt: kill external + restart through DevControl (gives logs)">
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Zap size={12} />}
                      onClick={() => adoptExternal(e)}
                      loading={busyPid === e.pid}
                      aria-label="Adopt"
                    />
                  </Tooltip>
                )}
                <Tooltip label={e.matchedProjectId ? 'Kill PID' : 'Kill PID (unknown project — restart manually)'}>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={e.matchedProjectId ? <Square size={12} /> : <AlertTriangle size={12} />}
                    onClick={() => stopExternal(e.pid)}
                    loading={busyPid === e.pid}
                    aria-label="Stop"
                  />
                </Tooltip>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="text-[10.5px] text-[var(--color-text-4)] px-1 pt-1">
        {loading ? 'Refreshing…' : 'External processes refresh every 5s.'}
      </div>
    </div>
  );
}

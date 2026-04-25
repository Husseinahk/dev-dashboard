import { useCallback, useEffect, useState } from 'react';
import { GitBranch, FileDiff, History } from 'lucide-react';
import { api } from '../../services/api';
import type { GitStatus } from '../../types';
import { BranchBar } from './BranchBar';
import { StatusList } from './StatusList';
import { DiffViewer } from './DiffViewer';
import { CommitBox } from './CommitBox';
import { HistoryList } from './HistoryList';

interface Props { projectId: string; }

type Tab = 'changes' | 'history';

/**
 * Top-level Git workspace for a single project.
 * Layout:
 *   [BranchBar — branch + fetch/pull/push]
 *   [Tabs: Changes | History]
 *   Changes:  [StatusList | DiffViewer]
 *             [CommitBox spanning bottom]
 *   History:  scrollable log
 */
export function GitPanel({ projectId }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [tab, setTab] = useState<Tab>('changes');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.gitStatus(projectId);
      setStatus(s);
      // Keep selection if it still exists, else pick first
      if (s.files?.length) {
        if (!selected || !s.files.find((f: any) => f.path === selected)) {
          setSelected(s.files[0].path);
        }
      } else {
        setSelected(null);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }, [projectId, selected]);

  useEffect(() => { refresh(); }, [projectId]); // initial + project switch
  useEffect(() => {
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  /** Wrap an async git op so we can show a busy indicator + auto-refresh after. */
  const withBusy = useCallback(async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { await fn(); await refresh(); setHistoryKey(k => k + 1); }
    catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(null); }
  }, [refresh]);

  if (status && !status.isRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-3)]">
        <GitBranch size={32} />
        <div className="text-sm">This folder is not a Git repository.</div>
        <button
          className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-bg-3)] hover:bg-[var(--color-bg-2)] border border-[var(--color-line)]"
          onClick={() => withBusy('init', () => api.gitInit(projectId))}
        >
          Initialize repository
        </button>
      </div>
    );
  }
  if (!status) {
    return <div className="px-4 py-3 text-[12px] text-[var(--color-text-3)]">Loading repository…</div>;
  }

  const stagedCount = status.files.filter(f => f.index !== '.' && f.index !== '?').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BranchBar
        status={status}
        busy={busy}
        onFetch={() => withBusy('fetch', () => api.gitFetch(projectId))}
        onPull={() => withBusy('pull', () => api.gitPull(projectId))}
        onPush={() => withBusy('push', () => api.gitPush(projectId, !status.upstream))}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-bg-1)]">
        <TabBtn active={tab === 'changes'} onClick={() => setTab('changes')} icon={<FileDiff size={12} />}>
          Changes <span className="text-[var(--color-text-4)]">({status.files.length})</span>
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={<History size={12} />}>
          History
        </TabBtn>
        {error && <span className="ml-auto text-[11px] text-red-400 truncate max-w-[40%]" title={error}>{error}</span>}
      </div>

      {/* Body */}
      {tab === 'changes' ? (
        <div className="flex-1 grid grid-cols-[280px_1fr] grid-rows-[1fr_auto] overflow-hidden">
          <div className="row-span-2 border-r border-[var(--color-line)] overflow-hidden">
            <StatusList
              files={status.files}
              selected={selected || undefined}
              onSelect={setSelected}
              onStage={(f) => withBusy('stage', () => api.gitStage(projectId, f))}
              onUnstage={(f) => withBusy('unstage', () => api.gitUnstage(projectId, f))}
              onDiscard={(f) => withBusy('discard', () => api.gitDiscard(projectId, f))}
              onStageAll={() => withBusy('stage-all', () => api.gitStageAll(projectId))}
              onUnstageAll={() => withBusy('unstage-all', () => api.gitUnstageAll(projectId))}
            />
          </div>
          <div className="overflow-hidden">
            <DiffViewer projectId={projectId} file={selected} />
          </div>
          <div className="col-start-2">
            <CommitBox
              stagedCount={stagedCount}
              busy={busy === 'commit'}
              onCommit={(msg) => withBusy('commit', () => api.gitCommit(projectId, msg, false))}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <HistoryList projectId={projectId} refreshKey={historyKey} />
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] rounded-md transition ${
        active
          ? 'bg-[var(--color-bg-3)] text-[var(--color-text-1)]'
          : 'text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-[var(--color-bg-2)]'
      }`}
    >
      {icon}{children}
    </button>
  );
}

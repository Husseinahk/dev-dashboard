import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { GitLogEntry } from '../../types';
import { formatRelative } from '../../utils/format';

interface Props { projectId: string; refreshKey?: number; }

/** Last 30 commits in a compact scrollable list. */
export function HistoryList({ projectId, refreshKey }: Props) {
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.gitLog(projectId, 30)
      .then(r => { if (!cancelled) setLog(r.log || []); })
      .catch(() => { if (!cancelled) setLog([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  if (loading && log.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-[var(--color-text-4)]">Loading history…</div>;
  }
  if (log.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-[var(--color-text-4)] italic">No commits yet</div>;
  }
  return (
    <div className="overflow-y-auto">
      {log.map(c => (
        <div key={c.hash} className="px-3 py-1.5 border-b border-[var(--color-line)]/50 hover:bg-[var(--color-bg-3)]/40">
          <div className="text-[12px] truncate" title={c.subject}>{c.subject}</div>
          <div className="text-[10.5px] text-[var(--color-text-4)] flex items-center gap-2 mt-0.5">
            <span className="font-mono text-[var(--color-text-3)]">{c.shortHash}</span>
            <span>· {c.author}</span>
            <span>· {formatRelative(new Date(c.date).getTime())}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

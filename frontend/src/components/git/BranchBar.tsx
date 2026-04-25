import { GitBranch, Download, Upload, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import type { GitStatus } from '../../types';

interface Props {
  status: GitStatus;
  busy?: string | null;        // 'pull' | 'push' | 'fetch' | null — disables matching button
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
}

/** Top bar showing current branch, sync state and remote actions. */
export function BranchBar({ status, busy, onFetch, onPull, onPush }: Props) {
  const ahead = status.ahead || 0;
  const behind = status.behind || 0;
  const upstream = status.upstream;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-line)] bg-[var(--color-bg-2)]">
      <GitBranch size={14} className="text-[var(--color-text-3)]" />
      <span className="text-sm font-medium">{status.branch || '(detached)'}</span>
      {upstream && (
        <span className="text-[11px] text-[var(--color-text-3)]">→ {upstream}</span>
      )}
      {(ahead > 0 || behind > 0) && (
        <span className="text-[11px] text-[var(--color-text-3)] ml-1">
          {ahead > 0 && <span className="text-emerald-400">↑{ahead}</span>}
          {ahead > 0 && behind > 0 && ' '}
          {behind > 0 && <span className="text-amber-400">↓{behind}</span>}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Tooltip label="Fetch">
          <Button variant="ghost" size="xs" icon={<RefreshCw size={12} />} loading={busy === 'fetch'} onClick={onFetch} aria-label="Fetch" />
        </Tooltip>
        <Tooltip label={behind > 0 ? `Pull (${behind} behind)` : 'Pull'}>
          <Button variant="ghost" size="xs" icon={<Download size={12} />} loading={busy === 'pull'} onClick={onPull} aria-label="Pull" />
        </Tooltip>
        <Tooltip label={ahead > 0 ? `Push (${ahead} ahead)` : 'Push'}>
          <Button variant="ghost" size="xs" icon={<Upload size={12} />} loading={busy === 'push'} onClick={onPush} aria-label="Push" />
        </Tooltip>
      </div>
    </div>
  );
}

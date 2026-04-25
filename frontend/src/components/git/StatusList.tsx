import { Plus, Minus, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import type { GitStatusFile } from '../../types';

interface Props {
  files: GitStatusFile[];
  selected?: string;
  onSelect: (file: string) => void;
  onStage: (file: string) => void;
  onUnstage: (file: string) => void;
  onDiscard: (file: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
}

/** A file is "staged" when its index column is not '.' or '?'. */
function isStaged(f: GitStatusFile): boolean {
  return f.index !== '.' && f.index !== '?';
}

/** Single-letter status badge with color. */
function StatusBadge({ code }: { code: string }) {
  const map: Record<string, { label: string; cls: string; title: string }> = {
    M: { label: 'M', cls: 'text-amber-400',   title: 'Modified' },
    A: { label: 'A', cls: 'text-emerald-400', title: 'Added' },
    D: { label: 'D', cls: 'text-red-400',     title: 'Deleted' },
    R: { label: 'R', cls: 'text-blue-400',    title: 'Renamed' },
    C: { label: 'C', cls: 'text-blue-400',    title: 'Copied' },
    '?': { label: 'U', cls: 'text-cyan-400',  title: 'Untracked' },
    '.': { label: '·', cls: 'text-[var(--color-text-4)]', title: 'Unchanged' },
  };
  const m = map[code] || { label: code, cls: 'text-[var(--color-text-3)]', title: code };
  return <span title={m.title} className={`inline-block w-3 text-center text-[10px] font-mono ${m.cls}`}>{m.label}</span>;
}

function FileRow({
  file, selected, onSelect, leftAction, rightAction,
}: {
  file: GitStatusFile;
  selected: boolean;
  onSelect: () => void;
  leftAction: { icon: React.ReactNode; label: string; onClick: () => void };
  rightAction?: { icon: React.ReactNode; label: string; onClick: () => void };
}) {
  return (
    <div
      onClick={onSelect}
      className={`group/row flex items-center gap-2 px-2 py-1 text-[12px] cursor-pointer rounded ${
        selected ? 'bg-[var(--color-bg-3)]' : 'hover:bg-[var(--color-bg-3)]/60'
      }`}
    >
      <StatusBadge code={isStaged(file) ? file.index : file.worktree} />
      <span className="flex-1 truncate font-mono text-[11.5px]" title={file.path}>{file.path}</span>
      <div className="opacity-0 group-hover/row:opacity-100 flex items-center gap-0.5 transition">
        {rightAction && (
          <Tooltip label={rightAction.label}>
            <Button variant="ghost" size="xs" icon={rightAction.icon} onClick={(e: any) => { e.stopPropagation(); rightAction.onClick(); }} aria-label={rightAction.label} />
          </Tooltip>
        )}
        <Tooltip label={leftAction.label}>
          <Button variant="ghost" size="xs" icon={leftAction.icon} onClick={(e: any) => { e.stopPropagation(); leftAction.onClick(); }} aria-label={leftAction.label} />
        </Tooltip>
      </div>
    </div>
  );
}

/** Two-section list: Staged (top) + Changes (bottom), each with bulk actions. */
export function StatusList({ files, selected, onSelect, onStage, onUnstage, onDiscard, onStageAll, onUnstageAll }: Props) {
  const staged = files.filter(isStaged);
  const unstaged = files.filter(f => !isStaged(f));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Staged */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-line)]">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-4)]">
          Staged <span className="text-[var(--color-text-3)] normal-case">({staged.length})</span>
        </span>
        {staged.length > 0 && (
          <Tooltip label="Unstage all">
            <Button variant="ghost" size="xs" icon={<Minus size={12} />} onClick={onUnstageAll} aria-label="Unstage all" />
          </Tooltip>
        )}
      </div>
      <div className="overflow-y-auto px-1 py-1 max-h-[40%]">
        {staged.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-[var(--color-text-4)] italic">Nothing staged</div>
        )}
        {staged.map(f => (
          <FileRow
            key={'s-' + f.path}
            file={f}
            selected={selected === f.path}
            onSelect={() => onSelect(f.path)}
            leftAction={{ icon: <Minus size={12} />, label: 'Unstage', onClick: () => onUnstage(f.path) }}
          />
        ))}
      </div>

      {/* Unstaged */}
      <div className="flex items-center justify-between px-3 py-1.5 border-y border-[var(--color-line)]">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-4)]">
          Changes <span className="text-[var(--color-text-3)] normal-case">({unstaged.length})</span>
        </span>
        {unstaged.length > 0 && (
          <Tooltip label="Stage all">
            <Button variant="ghost" size="xs" icon={<Plus size={12} />} onClick={onStageAll} aria-label="Stage all" />
          </Tooltip>
        )}
      </div>
      <div className="overflow-y-auto px-1 py-1 flex-1">
        {unstaged.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-[var(--color-text-4)] italic">No changes</div>
        )}
        {unstaged.map(f => (
          <FileRow
            key={'u-' + f.path}
            file={f}
            selected={selected === f.path}
            onSelect={() => onSelect(f.path)}
            leftAction={{ icon: <Plus size={12} />, label: 'Stage', onClick: () => onStage(f.path) }}
            rightAction={f.worktree !== '?' ? { icon: <RotateCcw size={12} />, label: 'Discard', onClick: () => {
              if (confirm(`Discard changes to ${f.path}?`)) onDiscard(f.path);
            } } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

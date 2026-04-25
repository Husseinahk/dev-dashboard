import { useMemo } from 'react';
import {
  Play, Square, RotateCcw, Pin, ExternalLink, Terminal, GitBranch,
  Box, Database, Sparkles, FileText, Globe,
} from 'lucide-react';
import type { ProjectAction, ProcessTab } from '../../types';
import { Tooltip } from '../ui/Tooltip';
import { StatusDot } from '../ui/StatusDot';
import { cn } from '../../utils/cn';

interface Props {
  action: ProjectAction;
  tab: ProcessTab | undefined;
  onRun: () => void;
  onStop: () => void;
  onRestart: () => void;
  onTogglePin: () => void;
  onShowLogs: () => void;
}

function pickIcon(action: ProjectAction) {
  const id = (action.id + ' ' + (action.label ?? '')).toLowerCase();
  if (id.includes('docker')) return <Box size={14} />;
  if (id.includes('git') || id.includes('branch')) return <GitBranch size={14} />;
  if (id.includes('migration') || id.includes('db')) return <Database size={14} />;
  if (id.includes('format') || id.includes('lint')) return <Sparkles size={14} />;
  if (id.includes('open') || id.includes('explorer')) return <ExternalLink size={14} />;
  if (id.includes('swagger') || id.includes('url')) return <Globe size={14} />;
  if (id.includes('readme') || id.includes('notes')) return <FileText size={14} />;
  if (action.type === 'open') return <ExternalLink size={14} />;
  if (action.type === 'long-running') return <Play size={14} />;
  return <Terminal size={14} />;
}

export function ActionButton({ action, tab, onRun, onStop, onRestart, onTogglePin, onShowLogs }: Props) {
  const icon = useMemo(() => pickIcon(action), [action]);
  const isRunning = !!tab && tab.isRunning;

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 h-9 px-2.5 rounded-lg border transition-all',
        isRunning
          ? 'bg-[var(--color-brand-500)]/8 border-[var(--color-brand-500)]/35 shadow-[inset_0_0_0_1px_rgba(109,99,244,0.15)]'
          : 'bg-[var(--color-bg-2)] border-[var(--color-line)] hover:border-[var(--color-line-strong)] hover:bg-[var(--color-bg-3)]',
      )}
    >
      {/* Run / Stop click target */}
      <button
        onClick={isRunning ? onStop : onRun}
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        <span className={cn(
          'size-6 rounded-md flex items-center justify-center transition-colors',
          isRunning ? 'bg-[var(--color-brand-500)]/20 text-[var(--color-brand-300)]' : 'bg-white/5 text-[var(--color-text-3)] group-hover:text-[var(--color-text-1)]',
        )}>
          {isRunning ? <Square size={12} /> : icon}
        </span>
        <span className="flex-1 text-sm truncate text-left text-[var(--color-text-1)]">
          {action.label}
        </span>
        {tab && <StatusDot status={tab.status} />}
        {action.port && (
          <span className="text-[10px] font-mono text-[var(--color-text-4)] tabular-nums">
            :{action.port}
          </span>
        )}
      </button>

      {/* Hover tools */}
      <div className="hidden group-hover:flex items-center gap-0.5">
        {isRunning && (
          <Tooltip label="Restart">
            <button
              onClick={onRestart}
              className="p-1 rounded text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5"
            >
              <RotateCcw size={12} />
            </button>
          </Tooltip>
        )}
        {tab && (
          <Tooltip label="Show logs">
            <button
              onClick={onShowLogs}
              className="p-1 rounded text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5"
            >
              <Terminal size={12} />
            </button>
          </Tooltip>
        )}
        <Tooltip label={action.pinned ? 'Unpin' : 'Pin'}>
          <button
            onClick={onTogglePin}
            className={cn(
              'p-1 rounded hover:bg-white/5',
              action.pinned ? 'text-[var(--color-brand-300)]' : 'text-[var(--color-text-4)] hover:text-[var(--color-text-2)]',
            )}
          >
            <Pin size={12} className={action.pinned ? 'fill-current' : ''} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

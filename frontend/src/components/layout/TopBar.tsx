import { Activity, Command, RefreshCw, Square } from 'lucide-react';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  wsStatus: 'connecting' | 'open' | 'closed' | 'error';
  onRescan: () => void;
  onStopAll: () => void;
  onOpenPalette: () => void;
}

export function TopBar({ wsStatus, onRescan, onStopAll, onOpenPalette }: Props) {
  const wsLabel = {
    open: { dot: 'bg-emerald-400', label: 'live' },
    connecting: { dot: 'bg-amber-400 animate-pulse', label: 'connecting' },
    closed: { dot: 'bg-rose-400', label: 'offline' },
    error: { dot: 'bg-rose-400', label: 'error' },
  }[wsStatus];

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-bg-1)]/70 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-cyan-500)] flex items-center justify-center shadow-lg shadow-[var(--color-brand-500)]/30">
          <Activity size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">
            Dev<span className="text-gradient">Control</span>
          </div>
          <div className="text-[10px] text-[var(--color-text-3)] uppercase tracking-wider">v2 · workspace</div>
        </div>
      </div>

      {/* Center: command palette trigger */}
      <button
        onClick={onOpenPalette}
        className="hidden md:flex items-center gap-3 h-9 px-3 min-w-[320px] rounded-lg bg-[var(--color-bg-2)]/80 border border-[var(--color-line)] text-sm text-[var(--color-text-3)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-text-2)] transition"
      >
        <Command size={14} />
        <span className="flex-1 text-left">Search projects, actions…</span>
        <span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:flex items-center gap-2 text-xs text-[var(--color-text-3)] mr-1">
          <span className={`size-1.5 rounded-full ${wsLabel.dot}`} />
          {wsLabel.label}
        </span>
        <Tooltip label="Rescan workspaces">
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={onRescan} aria-label="Rescan" />
        </Tooltip>
        <Tooltip label="Stop all running processes">
          <Button variant="ghost" size="sm" icon={<Square size={14} />} onClick={onStopAll} aria-label="Stop all" />
        </Tooltip>
      </div>
    </header>
  );
}

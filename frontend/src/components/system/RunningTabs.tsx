import { Square, RotateCcw, ExternalLink } from 'lucide-react';
import type { ProcessTab } from '../../types';
import { StatusDot } from '../ui/StatusDot';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { formatRelative } from '../../utils/format';

interface Props {
  tabs: ProcessTab[];
  onSelect: (tabId: string) => void;
  onStop: (tabId: string) => void;
  onRestart: (tabId: string) => void;
}

export function RunningTabs({ tabs, onSelect, onStop, onRestart }: Props) {
  const running = tabs.filter(t => t.isRunning);
  if (running.length === 0) {
    return (
      <div className="px-6 py-4 text-sm text-[var(--color-text-3)]">
        Nothing running. Start a project from the sidebar.
      </div>
    );
  }
  return (
    <div className="px-6 py-3 grid gap-2">
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
    </div>
  );
}

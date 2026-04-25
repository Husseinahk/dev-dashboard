import type { PaletteCommand } from './types';
import { Kbd } from '../ui/Kbd';
import { cn } from '../../utils/cn';

export function PaletteItem({
  cmd, active, onSelect, onHover,
}: {
  cmd: PaletteCommand;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors',
        active
          ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-text-1)]'
          : 'text-[var(--color-text-2)] hover:bg-white/3',
      )}
    >
      {cmd.icon && (
        <span className={cn(
          'shrink-0 size-7 rounded-md flex items-center justify-center',
          active ? 'bg-[var(--color-brand-500)]/25 text-[var(--color-brand-300)]' : 'bg-white/5 text-[var(--color-text-3)]',
        )}>
          {cmd.icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{cmd.title}</span>
        {cmd.subtitle && (
          <span className="block text-xs text-[var(--color-text-3)] truncate">{cmd.subtitle}</span>
        )}
      </span>
      {cmd.shortcut && (
        <span className="flex items-center gap-1">
          {cmd.shortcut.map((s, i) => <Kbd key={i}>{s}</Kbd>)}
        </span>
      )}
    </button>
  );
}

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface BottomTab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
}

interface Props {
  tabs: BottomTab[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
}

// Resizable bottom drawer (logs, terminal, system).
// Collapsible — click active tab to collapse.
export function BottomPanel({ tabs, activeId, onActiveChange }: Props) {
  const [height, setHeight] = useState(280);
  const [resizing, setResizing] = useState(false);
  const active = tabs.find(t => t.id === activeId);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(120, Math.min(window.innerHeight - 200, startH - (ev.clientY - startY)));
      setHeight(next);
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-bg-1)]/70 backdrop-blur-xl flex flex-col">
      {/* Resize handle (only if open) */}
      {active && (
        <div
          onPointerDown={onPointerDown}
          className={cn(
            'h-1.5 cursor-row-resize hover:bg-[var(--color-brand-500)]/30 transition',
            resizing && 'bg-[var(--color-brand-500)]/50',
          )}
        />
      )}

      {/* Tab strip */}
      <div className="flex items-center h-9 border-b border-[var(--color-line)] px-2 gap-1">
        {tabs.map(t => {
          const isActive = t.id === activeId;
          return (
            <button
              key={t.id}
              onClick={() => onActiveChange(isActive ? null : t.id)}
              className={cn(
                'h-7 px-3 rounded-md text-xs flex items-center gap-1.5 transition',
                isActive
                  ? 'bg-[var(--color-bg-3)] text-[var(--color-text-1)]'
                  : 'text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5',
              )}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.badge}
            </button>
          );
        })}
        <button
          onClick={() => onActiveChange(active ? null : tabs[0]?.id ?? null)}
          className="ml-auto p-1.5 rounded-md text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5"
          aria-label={active ? 'Collapse' : 'Expand'}
        >
          {active ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Active content */}
      {active && (
        <div style={{ height }} className="overflow-hidden">
          {active.content}
        </div>
      )}
    </div>
  );
}

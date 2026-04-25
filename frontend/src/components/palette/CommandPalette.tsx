import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { PaletteCommand } from './types';
import { PaletteItem } from './PaletteItem';
import { fuzzyScore } from './fuzzy';
import { Kbd } from '../ui/Kbd';

interface Props {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

interface ScoredCmd { cmd: PaletteCommand; score: number; }

export function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter + sort
  const items = useMemo<ScoredCmd[]>(() => {
    const haystack = (c: PaletteCommand) =>
      `${c.title} ${c.subtitle ?? ''} ${c.group} ${c.keywords ?? ''}`;
    return commands
      .map(c => ({ cmd: c, score: fuzzyScore(haystack(c), query) }))
      .filter(s => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
  }, [commands, query]);

  // Group by `group` while preserving order.
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>();
    items.forEach(({ cmd }) => {
      if (!map.has(cmd.group)) map.set(cmd.group, []);
      map.get(cmd.group)!.push(cmd);
    });
    return [...map.entries()];
  }, [items]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Clamp active index when results change
  useEffect(() => {
    setActive(a => Math.max(0, Math.min(a, items.length - 1)));
  }, [items.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(0, a - 1)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const sel = items[active];
        if (sel) { sel.cmd.run(); onClose(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center pt-[14vh] px-4 anim-fade">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-2xl glass anim-pop overflow-hidden shadow-2xl shadow-black/50">
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-line)]">
          <Search size={18} className="text-[var(--color-text-3)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects, actions, ports, settings…"
            className="flex-1 bg-transparent outline-none text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)]"
          />
          <span className="hidden sm:flex items-center gap-1">
            <Kbd>ESC</Kbd>
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--color-text-3)]">
              No results for <span className="text-[var(--color-text-1)]">"{query}"</span>
            </div>
          ) : (
            grouped.map(([group, cmds]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-4)] font-semibold">
                  {group}
                </div>
                {cmds.map(cmd => {
                  const idx = items.findIndex(i => i.cmd.id === cmd.id);
                  return (
                    <div key={cmd.id} data-idx={idx}>
                      <PaletteItem
                        cmd={cmd}
                        active={idx === active}
                        onSelect={() => { cmd.run(); onClose(); }}
                        onHover={() => setActive(idx)}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-line)] text-[11px] text-[var(--color-text-3)]">
          <span className="flex items-center gap-2">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> navigate <Kbd>↵</Kbd> run
          </span>
          <span>{items.length} result{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}

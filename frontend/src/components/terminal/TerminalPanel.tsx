import { useEffect, useRef, useState } from 'react';
import { Terminal as TermIcon, X } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { wsUrls } from '../../services/ws';
import { stripAnsi } from '../logs/ansi';
import { Button } from '../ui/Button';

interface Props {
  onClose?: () => void;
}

// Simple line-based terminal (no node-pty). Sufficient for ad-hoc commands.
// For full TTY (vim, less, color spinners) we'd need xterm.js + node-pty.
export function TerminalPanel({ onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { status, send } = useWebSocket(wsUrls.terminal(), (data) => {
    const text = typeof data === 'string' ? data : String(data);
    setLines(prev => [...prev, stripAnsi(text)].slice(-2000));
  });

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    send(input + '\r\n');
    setHistory(h => [...h, input].slice(-100));
    setHistIdx(null);
    setInput('');
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const next = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next]);
    } else if (e.key === 'ArrowDown' && histIdx !== null) {
      e.preventDefault();
      const next = histIdx + 1;
      if (next >= history.length) { setHistIdx(null); setInput(''); }
      else { setHistIdx(next); setInput(history[next]); }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 h-9 px-3 border-b border-[var(--color-line)] bg-[var(--color-bg-1)]/40">
        <TermIcon size={13} className="text-[var(--color-brand-300)]" />
        <span className="text-xs font-medium">Terminal</span>
        <span className={`size-1.5 rounded-full ${status === 'open' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
        {onClose && <Button variant="ghost" size="xs" icon={<X size={12} />} onClick={onClose} className="ml-auto" aria-label="Close" />}
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto bg-[var(--color-bg-0)]/70 p-3 font-mono text-[12.5px] text-[var(--color-text-2)] whitespace-pre-wrap">
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 h-10 border-t border-[var(--color-line)] bg-[var(--color-bg-1)]/40 font-mono text-sm">
        <span className="text-[var(--color-brand-300)]">❯</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a command…"
          autoFocus
          className="flex-1 bg-transparent outline-none text-[var(--color-text-1)] placeholder:text-[var(--color-text-4)]"
        />
      </form>
    </div>
  );
}

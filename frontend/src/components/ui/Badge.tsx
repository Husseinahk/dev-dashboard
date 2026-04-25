import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'info';

const TONE: Record<Tone, string> = {
  neutral: 'bg-white/5 text-[var(--color-text-2)] border-[var(--color-line)]',
  brand: 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-300)] border-[var(--color-brand-500)]/25',
  success: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25',
  warn: 'bg-amber-500/12 text-amber-300 border-amber-500/25',
  danger: 'bg-rose-500/12 text-rose-300 border-rose-500/25',
  info: 'bg-sky-500/12 text-sky-300 border-sky-500/25',
};

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border',
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  history?: number[];
  accent?: string;        // tailwind color class for icon bg
  sparkColor?: string;
  max?: number;
}

export function StatTile({ icon, label, value, sub, history, accent = 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-300)]', sparkColor = '#8b7cff', max = 100 }: Props) {
  return (
    <div className="surface-2 p-3 flex items-center gap-3">
      <div className={`size-9 rounded-lg flex items-center justify-center ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-4)] font-semibold">{label}</div>
        <div className="text-base font-semibold text-[var(--color-text-1)] tabular-nums leading-tight">{value}</div>
        {sub && <div className="text-[10px] text-[var(--color-text-3)] truncate">{sub}</div>}
      </div>
      {history && history.length > 1 && (
        <div className="shrink-0">
          <Sparkline values={history} color={sparkColor} max={max} />
        </div>
      )}
    </div>
  );
}

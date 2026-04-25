import { useEffect, useState } from 'react';
import { Globe, ExternalLink } from 'lucide-react';
import type { QuickLink } from '../../types';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';

interface Props { links: QuickLink[]; }

export function QuickLinks({ links }: Props) {
  if (!links?.length) return null;
  return (
    <section className="px-6 py-4">
      <h3 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-text-4)] mb-2">
        Quick Links
      </h3>
      <div className="flex flex-wrap gap-2">
        {links.map((l, idx) => (
          <QuickLinkChip key={idx} link={l} />
        ))}
      </div>
    </section>
  );
}

function QuickLinkChip({ link }: { link: QuickLink }) {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    if (!link.healthCheck) return;
    let cancelled = false;
    const probe = async () => {
      try {
        const r = await api.healthcheck(link.url);
        if (!cancelled) setHealthy(!!r?.ok);
      } catch {
        if (!cancelled) setHealthy(false);
      }
    };
    probe();
    const id = setInterval(probe, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [link.url, link.healthCheck]);

  return (
    <button
      onClick={() => api.openUrl(link.url)}
      className={cn(
        'group inline-flex items-center gap-2 px-3 h-8 rounded-lg text-sm transition-all',
        'bg-[var(--color-bg-2)] border border-[var(--color-line)]',
        'hover:bg-[var(--color-bg-3)] hover:border-[var(--color-line-strong)]',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          link.healthCheck
            ? healthy === null ? 'bg-amber-400 animate-pulse'
            : healthy ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
            : 'bg-rose-400'
            : 'bg-[var(--color-text-4)]',
        )}
      />
      <Globe size={12} className="text-[var(--color-text-3)]" />
      <span className="text-[var(--color-text-1)]">{link.label}</span>
      <ExternalLink size={11} className="text-[var(--color-text-4)] group-hover:text-[var(--color-text-2)]" />
    </button>
  );
}

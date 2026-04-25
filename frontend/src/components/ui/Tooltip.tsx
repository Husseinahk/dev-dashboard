import { useState } from 'react';
import type { ReactNode } from 'react';

// Lightweight CSS-only tooltip (no portals, no positioning math).
// For richer tooltips later, swap for Radix.
export function Tooltip({
  label,
  side = 'top',
  children,
}: {
  label: ReactNode;
  side?: 'top' | 'bottom';
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={
            'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap ' +
            'px-2 py-1 text-[11px] rounded-md bg-[var(--color-bg-3)] text-[var(--color-text-1)] ' +
            'border border-[var(--color-line)] shadow-lg anim-fade ' +
            (side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')
          }
        >
          {label}
        </span>
      )}
    </span>
  );
}

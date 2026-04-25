import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

// Portal-based tooltip with viewport-aware auto-flip and horizontal clamping
// so tooltips never clip off-screen at the top, bottom, or sides.
export function Tooltip({
  label,
  side = 'top',
  children,
}: {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!show || !triggerRef.current || !tipRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let chosen = side;

    // Auto-flip when there's not enough room.
    if (chosen === 'top' && t.top - tip.height - gap < 4) chosen = 'bottom';
    else if (chosen === 'bottom' && t.bottom + tip.height + gap > vh - 4) chosen = 'top';
    else if (chosen === 'left' && t.left - tip.width - gap < 4) chosen = 'right';
    else if (chosen === 'right' && t.right + tip.width + gap > vw - 4) chosen = 'left';

    let top = 0, left = 0;
    if (chosen === 'top') { top = t.top - tip.height - gap; left = t.left + t.width / 2 - tip.width / 2; }
    else if (chosen === 'bottom') { top = t.bottom + gap; left = t.left + t.width / 2 - tip.width / 2; }
    else if (chosen === 'left') { top = t.top + t.height / 2 - tip.height / 2; left = t.left - tip.width - gap; }
    else { top = t.top + t.height / 2 - tip.height / 2; left = t.right + gap; }

    // Clamp to viewport
    left = Math.max(4, Math.min(left, vw - tip.width - 4));
    top = Math.max(4, Math.min(top, vh - tip.height - 4));
    setPos({ top, left });
  }, [show, side, label]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => { setShow(false); setPos(null); }}
      onFocus={() => setShow(true)}
      onBlur={() => { setShow(false); setPos(null); }}
    >
      {children}
      {show && createPortal(
        <span
          ref={tipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
          }}
          className={
            'pointer-events-none z-[9999] whitespace-nowrap ' +
            'px-2 py-1 text-[11px] rounded-md bg-[var(--color-bg-3)] text-[var(--color-text-1)] ' +
            'border border-[var(--color-line)] shadow-lg anim-fade'
          }
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  );
}

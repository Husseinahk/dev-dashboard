import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 anim-fade">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full glass anim-pop shadow-2xl shadow-black/40',
          SIZE[size],
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title && <h2 className="text-base font-semibold text-[var(--color-text-1)]">{title}</h2>}
                {description && <p className="mt-0.5 text-xs text-[var(--color-text-3)]">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5 transition"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <div className="hr-fade" />
        {/* Body */}
        <div className="px-5 py-4">{children}</div>
        {/* Footer */}
        {footer && (
          <>
            <div className="hr-fade" />
            <div className="px-5 py-3 flex items-center justify-end gap-2">{footer}</div>
          </>
        )}
      </div>
    </div>
  );
}

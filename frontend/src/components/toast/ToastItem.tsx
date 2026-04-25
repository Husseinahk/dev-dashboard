import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import type { Toast } from '../../hooks/useToast';
import { cn } from '../../utils/cn';

const ICON = {
  info: <Info size={18} className="text-sky-400" />,
  success: <CheckCircle2 size={18} className="text-emerald-400" />,
  warn: <AlertTriangle size={18} className="text-amber-400" />,
  danger: <XCircle size={18} className="text-rose-400" />,
};

const ACCENT = {
  info: 'before:bg-sky-400',
  success: 'before:bg-emerald-400',
  warn: 'before:bg-amber-400',
  danger: 'before:bg-rose-400',
};

export function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      role="status"
      className={cn(
        'relative overflow-hidden glass anim-up shadow-2xl shadow-black/40',
        'min-w-[320px] max-w-sm pl-4 pr-3 py-3 flex gap-3 items-start',
        'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]',
        ACCENT[toast.tone],
      )}
    >
      <div className="mt-0.5 shrink-0">{ICON[toast.tone]}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--color-text-1)]">{toast.title}</div>
        {toast.description && (
          <div className="mt-0.5 text-xs text-[var(--color-text-2)] leading-relaxed">{toast.description}</div>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-medium text-[var(--color-brand-300)] hover:text-[var(--color-brand-400)]"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-md text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-white/5"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

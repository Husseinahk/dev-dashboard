import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'warn' | 'danger';
export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface Ctx {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t-${Date.now()}-${counter.current++}`;
    const toast: Toast = { id, durationMs: 4500, ...t };
    setToasts(prev => [...prev, toast]);
    if (toast.durationMs && toast.durationMs > 0) {
      setTimeout(() => dismiss(id), toast.durationMs);
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
  return <ToastCtx.Provider value={value}>{children}</ToastCtx.Provider>;
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// Convenience wrappers for hot paths.
export function useToastApi() {
  const { push } = useToast();
  return useMemo(
    () => ({
      info: (title: string, description?: string) => push({ tone: 'info', title, description }),
      success: (title: string, description?: string) => push({ tone: 'success', title, description }),
      warn: (title: string, description?: string) => push({ tone: 'warn', title, description }),
      danger: (title: string, description?: string) => push({ tone: 'danger', title, description }),
    }),
    [push],
  );
}

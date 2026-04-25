import { useToast } from '../../hooks/useToast';
import { ToastItem } from './ToastItem';

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}

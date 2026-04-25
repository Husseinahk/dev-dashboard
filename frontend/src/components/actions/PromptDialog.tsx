import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

export interface PromptField {
  name: string;
  label: string;
  default?: string;
  placeholder?: string;
}

interface Props {
  open: boolean;
  title: string;
  description?: string;
  fields: PromptField[];
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (vars: Record<string, string>) => void;
}

// Reusable modal for collecting variables before running an action.
// Example: EF Migration Name, branch name, port number.
export function PromptDialog({
  open, title, description, fields, submitLabel = 'Run', onCancel, onSubmit,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.name] = f.default ?? ''; });
    setValues(init);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [open, fields]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => onSubmit(values)}>{submitLabel}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {fields.map((f, idx) => (
          <label key={f.name} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-2)]">{f.label}</span>
            <Input
              ref={idx === 0 ? firstInputRef : undefined}
              value={values[f.name] ?? ''}
              onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
              placeholder={f.placeholder}
            />
          </label>
        ))}
      </form>
    </Modal>
  );
}

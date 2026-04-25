import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  stagedCount: number;
  busy?: boolean;
  onCommit: (message: string) => Promise<void>;
}

/** Multi-line commit message editor with subject/body separator hint. */
export function CommitBox({ stagedCount, busy, onCommit }: Props) {
  const [msg, setMsg] = useState('');

  const submit = async () => {
    const trimmed = msg.trim();
    if (!trimmed || stagedCount === 0) return;
    await onCommit(trimmed);
    setMsg('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  const disabled = busy || stagedCount === 0 || !msg.trim();

  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-bg-2)] p-2 grid gap-2">
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder={stagedCount > 0 ? 'Commit message (Ctrl+Enter to commit)' : 'Stage files to enable commit'}
        className="w-full resize-y px-2 py-1.5 text-[12px] rounded-md bg-[var(--color-bg-1)] border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-brand-500)] font-mono"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-[var(--color-text-4)]">
          {stagedCount > 0 ? `${stagedCount} file${stagedCount > 1 ? 's' : ''} staged` : 'Nothing staged'}
        </span>
        <Button
          variant="primary"
          size="sm"
          icon={<Check size={12} />}
          loading={busy}
          disabled={disabled}
          onClick={submit}
        >
          Commit
        </Button>
      </div>
    </div>
  );
}

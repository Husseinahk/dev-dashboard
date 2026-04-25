import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProjectAction, ProjectActionGroup, ProcessTab } from '../../types';
import { ActionButton } from './ActionButton';
import { cn } from '../../utils/cn';

interface Props {
  group: ProjectActionGroup;
  tabsById: Map<string, ProcessTab>;          // keyed by `${projectId}:${actionId}`
  projectId: string;
  defaultOpen?: boolean;
  onRun: (a: ProjectAction) => void;
  onStop: (tabId: string) => void;
  onRestart: (tabId: string) => void;
  onTogglePin: (a: ProjectAction) => void;
  onShowLogs: (tabId: string) => void;
}

export function ActionGroup({
  group, tabsById, projectId, defaultOpen = true,
  onRun, onStop, onRestart, onTogglePin, onShowLogs,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="px-6 py-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider font-semibold text-[var(--color-text-4)] hover:text-[var(--color-text-2)] transition"
      >
        <ChevronDown size={12} className={cn('transition-transform', !open && '-rotate-90')} />
        <span>{group.name}</span>
        <span className="text-[10px] font-medium">{group.actions.length}</span>
      </button>
      {open && (
        <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {group.actions.map(a => {
            const tab = tabsById.get(`${projectId}:${a.id}`);
            return (
              <ActionButton
                key={a.id}
                action={a}
                tab={tab}
                onRun={() => onRun(a)}
                onStop={() => tab && onStop(tab.id)}
                onRestart={() => tab && onRestart(tab.id)}
                onTogglePin={() => onTogglePin(a)}
                onShowLogs={() => tab && onShowLogs(tab.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

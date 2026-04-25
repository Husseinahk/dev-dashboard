import type { Project, ProcessTab, ProjectAction } from '../../types';
import { ProjectHeader } from './ProjectHeader';
import { QuickLinks } from './QuickLinks';
import { ActionGroup } from '../actions/ActionGroup';

interface Props {
  project: Project;
  tabsById: Map<string, ProcessTab>;
  onRun: (a: ProjectAction) => void;
  onStop: (tabId: string) => void;
  onRestart: (tabId: string) => void;
  onTogglePin: (a: ProjectAction) => void;
  onShowLogs: (tabId: string) => void;
}

export function ProjectDetail({
  project, tabsById, onRun, onStop, onRestart, onTogglePin, onShowLogs,
}: Props) {
  return (
    <div className="flex flex-col anim-fade">
      <ProjectHeader project={project} />
      <QuickLinks links={project.quickLinks} />
      {project.actionGroups.map(g => (
        <ActionGroup
          key={g.name}
          group={g}
          tabsById={tabsById}
          projectId={project.id}
          onRun={onRun}
          onStop={onStop}
          onRestart={onRestart}
          onTogglePin={onTogglePin}
          onShowLogs={onShowLogs}
        />
      ))}
      {project.notes && (
        <section className="px-6 py-4">
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-text-4)] mb-2">Notes</h3>
          <div className="surface-2 p-4 text-sm text-[var(--color-text-2)] whitespace-pre-wrap leading-relaxed">
            {project.notes}
          </div>
        </section>
      )}
      <div className="h-8" />
    </div>
  );
}

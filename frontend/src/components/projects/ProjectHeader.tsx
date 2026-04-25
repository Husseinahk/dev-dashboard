import { Folder, ExternalLink, Code2, Box } from 'lucide-react';
import type { Project } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { api } from '../../services/api';

export function ProjectHeader({ project }: { project: Project }) {
  return (
    <div className="px-6 py-5 border-b border-[var(--color-line)] bg-[var(--color-bg-1)]/50">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-3)] uppercase tracking-wider">
            <Folder size={12} />
            <span>{project.group || 'Workspace'}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--color-text-1)]">
            {project.name}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-3)] font-mono">
            <span className="truncate max-w-[480px]">{project.path}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {project.framework && <Badge tone="brand" icon={<Code2 size={10} />}>{project.framework}</Badge>}
            {project.type && <Badge tone="info">{project.type}</Badge>}
            {project.nodeVersion && <Badge tone="neutral" icon={<Box size={10} />}>node {project.nodeVersion}</Badge>}
            {project.port && <Badge tone="success">:{project.port}</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ExternalLink size={14} />}
            onClick={() => api.open(project.path)}
          >
            Open in Explorer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Code2 size={14} />}
            onClick={() => api.runCustom({ projectId: project.id, command: `code "${project.path}"`, cwd: project.path, label: 'Open VS Code' })}
          >
            VS Code
          </Button>
        </div>
      </div>
    </div>
  );
}

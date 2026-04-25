import { useMemo } from 'react';
import { Folder, Play, RefreshCw, Square, Terminal, Zap } from 'lucide-react';
import type { PaletteCommand } from '../components/palette/types';
import type { Project, ProjectAction, ProcessTab } from '../types';

interface Args {
  projects: Project[];
  tabs: ProcessTab[];
  onSelectProject: (id: string) => void;
  onRunAction: (projectId: string, action: ProjectAction) => void;
  onStop: (tabId: string) => void;
  onRescan: () => void;
  onStopAll: () => void;
  onOpenTerminal: () => void;
}

export function usePaletteCommands({
  projects, tabs, onSelectProject, onRunAction, onStop, onRescan, onStopAll, onOpenTerminal,
}: Args): PaletteCommand[] {
  return useMemo(() => {
    const cmds: PaletteCommand[] = [];

    // Global commands
    cmds.push(
      { id: 'g:rescan', group: 'General', title: 'Rescan workspaces', icon: <RefreshCw size={14} />, shortcut: ['R'], run: onRescan },
      { id: 'g:stopall', group: 'General', title: 'Stop all running processes', icon: <Square size={14} />, run: onStopAll },
      { id: 'g:terminal', group: 'General', title: 'Open terminal', icon: <Terminal size={14} />, run: onOpenTerminal },
    );

    // Stop running tabs
    for (const t of tabs) {
      if (!t.isRunning) continue;
      cmds.push({
        id: `stop:${t.id}`,
        group: 'Running',
        title: `Stop ${t.name}`,
        subtitle: t.pid ? `PID ${t.pid}` : undefined,
        icon: <Square size={14} />,
        run: () => onStop(t.id),
      });
    }

    // Jump to projects
    for (const p of projects) {
      cmds.push({
        id: `nav:${p.id}`,
        group: 'Projects',
        title: p.name,
        subtitle: p.path,
        icon: <Folder size={14} />,
        keywords: `${p.group} ${p.framework} ${p.type}`,
        run: () => onSelectProject(p.id),
      });
    }

    // Actions
    for (const p of projects) {
      for (const grp of p.actionGroups) {
        for (const a of grp.actions) {
          cmds.push({
            id: `run:${p.id}:${a.id}`,
            group: `Actions · ${p.name}`,
            title: a.label,
            subtitle: grp.name,
            icon: a.type === 'long-running' ? <Play size={14} /> : <Zap size={14} />,
            keywords: a.id + ' ' + (a.command ?? ''),
            run: () => { onSelectProject(p.id); onRunAction(p.id, a); },
          });
        }
      }
    }

    return cmds;
  }, [projects, tabs, onSelectProject, onRunAction, onStop, onRescan, onStopAll, onOpenTerminal]);
}

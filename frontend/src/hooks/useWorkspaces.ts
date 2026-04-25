import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Project, ProjectAction, ProjectActionGroup } from '../types';

// Backend returns `{ workspaces: [{ ...p, actions: ProjectAction[] }] }` (flat).
// We group actions by category here so the UI can render grouped sections.
function normalize(raw: any[]): Project[] {
  return raw.map(p => ({
    id: p.id,
    name: p.name,
    path: p.path,
    group: p.group,
    type: p.type,
    framework: p.framework,
    nodeVersion: p.nodeVersion,
    apiUrl: p.apiUrl,
    port: p.port,
    notes: p.notes,
    envVars: p.envVars,
    quickLinks: p.quickLinks ?? [],
    actionGroups: groupActions(p.actions ?? []),
  }));
}

const GROUP_ORDER = [
  'Pinned',
  'Frontend',
  'Backend',
  'Run',
  'Solution',
  'Node',
  'Build',
  'Docker',
  '.NET',
  'Git',
  'IDE',
  'Custom',
];

function groupActions(actions: ProjectAction[]): ProjectActionGroup[] {
  const map = new Map<string, ProjectAction[]>();

  // Pinned first as a synthetic group
  const pinned = actions.filter(a => a.pinned);
  if (pinned.length) map.set('Pinned', pinned);

  for (const a of actions) {
    const cat = a.category || (a.type === 'long-running' ? 'Run' : 'Custom');
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(a);
  }

  // Sort groups by GROUP_ORDER, unknowns at the end alphabetically.
  return [...map.entries()]
    .sort(([a], [b]) => {
      const ai = GROUP_ORDER.indexOf(a); const bi = GROUP_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map(([name, list]) => ({ name, actions: list }));
}

export function useWorkspaces() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWorkspaces();
      const arr = Array.isArray(data) ? data : (data?.workspaces ?? data?.projects ?? []);
      setProjects(normalize(arr));
    } finally {
      setLoading(false);
    }
  }, []);

  const rescan = useCallback(async () => {
    setLoading(true);
    try {
      await api.rescan();
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  return { projects, loading, refresh, rescan };
}

// Centralized API client. All HTTP calls go through here.
// In production the frontend is served from the backend port, so we use same-origin.
// In dev (vite on 5173), set VITE_API_BASE to http://localhost:3030.

const BASE = (import.meta as any).env?.VITE_API_BASE || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : (res.text() as any);
}

export const api = {
  // Workspaces / projects
  getWorkspaces: () => request<any>('/api/workspaces'),
  getAllWorkspaces: () => request<any>('/api/workspaces/all'),
  hideProject: (id: string) => request<any>('/api/workspaces/hide', { method: 'POST', body: JSON.stringify({ id }) }),
  showProject: (id: string) => request<any>('/api/workspaces/show', { method: 'POST', body: JSON.stringify({ id }) }),
  setHiddenProjects: (ids: string[]) => request<any>('/api/workspaces/hidden', { method: 'POST', body: JSON.stringify({ ids }) }),
  rescan: () => request<any>('/api/workspaces/rescan', { method: 'POST' }),

  // Add / detect / clone / remove a project
  pickFolder: (body?: { initialDir?: string; title?: string }) =>
    request<{ path: string | null }>('/api/system/pick-folder', { method: 'POST', body: JSON.stringify(body || {}) }),
  detectProject: (path: string) =>
    request<any>('/api/projects/detect', { method: 'POST', body: JSON.stringify({ path }) }),
  addProject: (project: any) =>
    request<any>('/api/projects/add', { method: 'POST', body: JSON.stringify(project) }),
  cloneProject: (body: { gitUrl: string; targetParent: string; name?: string }) =>
    request<any>('/api/projects/clone', { method: 'POST', body: JSON.stringify(body) }),
  removeProject: (id: string) =>
    request<any>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Actions
  runAction: (body: { projectId: string; actionId: string; vars?: Record<string, string> }) =>
    request<any>('/api/actions/run', { method: 'POST', body: JSON.stringify(body) }),
  runCustom: (body: { projectId: string; command: string; cwd?: string; label?: string }) =>
    request<any>('/api/actions/run-custom', { method: 'POST', body: JSON.stringify(body) }),

  // Processes
  listTabs: () => request<any>('/api/tabs'),
  stopProcess: (id: string) => request<any>('/api/processes/stop', { method: 'POST', body: JSON.stringify({ id }) }),
  restartProcess: (id: string) => request<any>('/api/processes/restart', { method: 'POST', body: JSON.stringify({ id }) }),
  stopAll: () => request<any>('/api/processes/stop-all', { method: 'POST' }),
  externalProcesses: () => request<{ processes: any[] }>('/api/processes/external'),
  killExternal: (pid: number) => request<any>('/api/processes/external/kill', { method: 'POST', body: JSON.stringify({ pid }) }),
  adoptExternal: (pid: number, projectId?: string, actionId?: string) =>
    request<any>('/api/processes/external/adopt', { method: 'POST', body: JSON.stringify({ pid, projectId, actionId }) }),

  // Config
  getConfig: () => request<any>('/api/config'),
  patchConfig: (patch: any) => request<any>('/api/config', { method: 'POST', body: JSON.stringify(patch) }),
  addScanPath: (p: string) => request<any>('/api/config/paths/add', { method: 'POST', body: JSON.stringify({ path: p }) }),
  removeScanPath: (p: string) => request<any>('/api/config/paths/remove', { method: 'POST', body: JSON.stringify({ path: p }) }),
  togglePin: (projectId: string, actionId: string) =>
    request<any>('/api/config/pin', { method: 'POST', body: JSON.stringify({ projectId, actionId }) }),

  // System
  getSystemStats: () => request<any>('/api/system/stats'),
  checkPort: (port: number) => request<any>(`/api/ports/check?port=${port}`),
  killPort: (port: number) => request<any>('/api/ports/kill', { method: 'POST', body: JSON.stringify({ port }) }),
  listPorts: () => request<any>('/api/ports/list'),
  nodeVersions: () => request<any>('/api/node-versions'),
  healthcheck: (url: string) => request<any>(`/api/healthcheck?url=${encodeURIComponent(url)}`),

  // OS shortcuts
  open: (path: string) => request<any>('/api/open', { method: 'POST', body: JSON.stringify({ path }) }),
  openUrl: (url: string) => request<any>('/api/open-url', { method: 'POST', body: JSON.stringify({ url }) }),

  // Git ops (per project)
  gitStatus: (id: string) => request<any>(`/api/git/${encodeURIComponent(id)}/status`),
  gitLog: (id: string, n = 30) => request<any>(`/api/git/${encodeURIComponent(id)}/log?n=${n}`),
  gitBranches: (id: string) => request<any>(`/api/git/${encodeURIComponent(id)}/branches`),
  gitDiff: (id: string, file?: string, staged = false) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/diff?${file ? `file=${encodeURIComponent(file)}&` : ''}staged=${staged ? 1 : 0}`),
  gitFileVersions: (id: string, file: string) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/file-versions?file=${encodeURIComponent(file)}`),
  gitStageAll: (id: string) => request<any>(`/api/git/${encodeURIComponent(id)}/stage-all`, { method: 'POST' }),
  gitUnstageAll: (id: string) => request<any>(`/api/git/${encodeURIComponent(id)}/unstage-all`, { method: 'POST' }),
  gitInit: (id: string) => request<any>(`/api/git/${encodeURIComponent(id)}/init`, { method: 'POST' }),
  gitCheckout: (id: string, branch: string, create = false) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/checkout`, { method: 'POST', body: JSON.stringify({ branch, create }) }),
  gitPull: (id: string) => request<any>(`/api/git/${encodeURIComponent(id)}/pull`, { method: 'POST' }),
  gitFetch: (id: string) => request<any>(`/api/git/${encodeURIComponent(id)}/fetch`, { method: 'POST' }),
  gitPush: (id: string, setUpstream = false) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/push`, { method: 'POST', body: JSON.stringify({ setUpstream }) }),
  gitCommit: (id: string, message: string, addAll = true) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/commit`, { method: 'POST', body: JSON.stringify({ message, addAll }) }),
  gitStage: (id: string, file: string) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/stage`, { method: 'POST', body: JSON.stringify({ file }) }),
  gitUnstage: (id: string, file: string) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/unstage`, { method: 'POST', body: JSON.stringify({ file }) }),
  gitDiscard: (id: string, file: string) =>
    request<any>(`/api/git/${encodeURIComponent(id)}/discard`, { method: 'POST', body: JSON.stringify({ file }) }),
  gitSetRemote: (id: string, url: string, name = 'origin') =>
    request<any>(`/api/git/${encodeURIComponent(id)}/set-remote`, { method: 'POST', body: JSON.stringify({ url, name }) }),

  // Integrations
  getIntegrations: () => request<any>('/api/integrations'),
  setGithub: (pat: string) => request<any>('/api/integrations/github', { method: 'POST', body: JSON.stringify({ pat }) }),
  removeGithub: () => request<any>('/api/integrations/github', { method: 'DELETE' }),
  setAzure: (pat: string, organization: string, project?: string) =>
    request<any>('/api/integrations/azure', { method: 'POST', body: JSON.stringify({ pat, organization, project }) }),
  removeAzure: () => request<any>('/api/integrations/azure', { method: 'DELETE' }),
  listRepos: () => request<{ repos: any[]; errors: Record<string, string> }>('/api/integrations/repos'),
};

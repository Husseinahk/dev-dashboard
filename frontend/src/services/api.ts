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
};

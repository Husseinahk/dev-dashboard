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
  rescan: () => request<any>('/api/workspaces/rescan', { method: 'POST' }),

  // Actions
  runAction: (body: { projectId: string; actionId: string; vars?: Record<string, string> }) =>
    request<any>('/api/actions/run', { method: 'POST', body: JSON.stringify(body) }),
  runCustom: (body: { command: string; cwd?: string; nodeVersion?: string; name?: string }) =>
    request<any>('/api/actions/run-custom', { method: 'POST', body: JSON.stringify(body) }),

  // Processes
  listTabs: () => request<any>('/api/tabs'),
  stopProcess: (tabId: string) => request<any>(`/api/processes/${tabId}/stop`, { method: 'POST' }),
  restartProcess: (tabId: string) => request<any>(`/api/processes/${tabId}/restart`, { method: 'POST' }),
  stopAll: () => request<any>('/api/processes/stop-all', { method: 'POST' }),

  // Config
  getConfig: () => request<any>('/api/config'),
  patchConfig: (patch: any) => request<any>('/api/config', { method: 'PATCH', body: JSON.stringify(patch) }),
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

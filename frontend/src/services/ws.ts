// WebSocket URL helpers. Same-origin in production, configurable in dev.
const BASE = (import.meta as any).env?.VITE_API_BASE || '';

function wsUrl(path: string): string {
  if (BASE) {
    const u = new URL(BASE);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = path;
    return u.toString();
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

export const wsUrls = {
  events: () => wsUrl('/ws'),
  terminal: (cwd?: string) => {
    const base = wsUrl('/api/terminal');
    return cwd ? `${base}?cwd=${encodeURIComponent(cwd)}` : base;
  },
};

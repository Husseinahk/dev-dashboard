import type { ProcessStatus, SystemSnapshot } from './process';

export type WSEvent =
  | { event: 'log'; tabId: string; stream: 'stdout' | 'stderr'; text: string; ts: number }
  | { event: 'status'; tabId: string; status: ProcessStatus; pid?: number; exitCode?: number | null; name?: string; projectId?: string; actionId?: string; port?: number }
  | { event: 'ready'; tabId: string; port?: number }
  | { event: 'crash'; tabId: string; exitCode: number | null; name: string }
  | { event: 'system'; snapshot: SystemSnapshot; processes?: { pid: number; memKb: number }[] };

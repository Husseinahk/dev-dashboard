export type ProcessStatus = 'idle' | 'starting' | 'running' | 'ready' | 'stopped' | 'crashed';

export interface ProcessTab {
  id: string;
  projectId: string;
  actionId: string;
  name: string;
  status: ProcessStatus;
  port?: number;
  pid?: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number | null;
  isRunning: boolean;
  logs?: LogLine[];
}

export interface LogLine {
  ts: number;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

export interface SystemSnapshot {
  platform: string;
  hostname: string;
  uptime: number;
  totalMem: number;
  freeMem: number;
  loadAvg: number[];
  cpus: number;
  cpuPercent: number;
  nodeVersion: string;
}

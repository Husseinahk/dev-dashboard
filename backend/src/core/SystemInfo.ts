import os from 'os';
import { exec } from 'child_process';

export interface SystemSnapshot {
  platform: NodeJS.Platform;
  hostname: string;
  uptime: number; // seconds
  totalMem: number; // bytes
  freeMem: number;
  loadAvg: number[];
  cpus: number;
  cpuPercent: number; // overall, sampled
  nodeVersion: string;
}

let prevCpu: { idle: number; total: number } | null = null;

function sampleCpu(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

export function getSystemSnapshot(): SystemSnapshot {
  const cur = sampleCpu();
  let cpuPercent = 0;
  if (prevCpu) {
    const idleDiff = cur.idle - prevCpu.idle;
    const totalDiff = cur.total - prevCpu.total;
    cpuPercent = totalDiff > 0 ? Math.max(0, Math.min(100, 100 - (100 * idleDiff) / totalDiff)) : 0;
  }
  prevCpu = cur;
  return {
    platform: os.platform(),
    hostname: os.hostname(),
    uptime: os.uptime(),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    loadAvg: os.loadavg(),
    cpus: os.cpus().length,
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    nodeVersion: process.versions.node,
  };
}

/** Get RAM (KB) for a list of PIDs on Windows. */
export function getProcessStats(pids: number[]): Promise<Record<number, { memKb: number }>> {
  if (!pids.length) return Promise.resolve({});
  return new Promise((resolve) => {
    if (os.platform() !== 'win32') return resolve({});
    // tasklist /fi "PID eq xxx" can only filter one. Use full list and filter in JS.
    exec('tasklist /fo csv /nh', { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({});
      const result: Record<number, { memKb: number }> = {};
      const wanted = new Set(pids);
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        // CSV: "image","pid","session","sessionNum","memUsage"
        const parts = line.split('","').map(s => s.replace(/^"|"$/g, ''));
        if (parts.length < 5) continue;
        const pid = parseInt(parts[1], 10);
        if (!wanted.has(pid)) continue;
        const memStr = parts[4].replace(/[^\d]/g, '');
        const memKb = parseInt(memStr, 10) || 0;
        result[pid] = { memKb };
      }
      resolve(result);
    });
  });
}

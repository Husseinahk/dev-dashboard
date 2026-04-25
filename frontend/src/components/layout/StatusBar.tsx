import { Cpu, MemoryStick, Server, Clock } from 'lucide-react';
import type { SystemSnapshot } from '../../types';
import { formatBytes, formatUptime } from '../../utils/format';

interface Props {
  system: SystemSnapshot | null;
  runningCount: number;
}

export function StatusBar({ system, runningCount }: Props) {
  return (
    <footer className="h-8 px-4 flex items-center justify-between border-t border-[var(--color-line)] bg-[var(--color-bg-1)]/70 backdrop-blur-xl text-[11px] text-[var(--color-text-3)]">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Server size={11} className="text-emerald-400" />
          <span className="text-[var(--color-text-2)]">{runningCount}</span> running
        </span>
        {system && (
          <>
            <span className="flex items-center gap-1.5">
              <Cpu size={11} />
              CPU <span className="text-[var(--color-text-2)]">{system.cpuPercent.toFixed(0)}%</span>
            </span>
            <span className="flex items-center gap-1.5">
              <MemoryStick size={11} />
              <span className="text-[var(--color-text-2)]">
                {formatBytes(system.totalMem - system.freeMem)}
              </span> / {formatBytes(system.totalMem)}
            </span>
            <span className="hidden md:flex items-center gap-1.5">
              <Clock size={11} />
              up {formatUptime(system.uptime)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {system && <span className="text-[var(--color-text-4)]">node {system.nodeVersion}</span>}
        <span className="text-[var(--color-text-4)]">DevControl v2</span>
      </div>
    </footer>
  );
}

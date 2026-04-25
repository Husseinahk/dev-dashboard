import { useEffect, useRef, useState } from 'react';
import { Cpu, MemoryStick, Activity, HardDrive } from 'lucide-react';
import type { SystemSnapshot } from '../../types';
import { StatTile } from './StatTile';
import { formatBytes, formatUptime } from '../../utils/format';

interface Props { system: SystemSnapshot | null; }

const HISTORY_LEN = 40;

export function SystemMonitor({ system }: Props) {
  const cpuHist = useRef<number[]>([]);
  const memHist = useRef<number[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    if (!system) return;
    cpuHist.current = [...cpuHist.current, system.cpuPercent].slice(-HISTORY_LEN);
    const memUsedPct = ((system.totalMem - system.freeMem) / system.totalMem) * 100;
    memHist.current = [...memHist.current, memUsedPct].slice(-HISTORY_LEN);
    force(x => x + 1);
  }, [system]);

  if (!system) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4">
        {[0,1,2,3].map(i => <div key={i} className="skeleton h-16" />)}
      </div>
    );
  }

  const memUsed = system.totalMem - system.freeMem;
  const memPct = (memUsed / system.totalMem) * 100;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4">
      <StatTile
        icon={<Cpu size={16} />}
        label="CPU"
        value={`${system.cpuPercent.toFixed(0)}%`}
        sub={`${system.cpus} cores`}
        history={cpuHist.current}
        accent="bg-violet-500/15 text-violet-300"
        sparkColor="#a78bfa"
      />
      <StatTile
        icon={<MemoryStick size={16} />}
        label="Memory"
        value={`${memPct.toFixed(0)}%`}
        sub={`${formatBytes(memUsed)} / ${formatBytes(system.totalMem)}`}
        history={memHist.current}
        accent="bg-cyan-500/15 text-cyan-300"
        sparkColor="#22d3ee"
      />
      <StatTile
        icon={<Activity size={16} />}
        label="Uptime"
        value={formatUptime(system.uptime)}
        sub={system.hostname}
        accent="bg-emerald-500/15 text-emerald-300"
      />
      <StatTile
        icon={<HardDrive size={16} />}
        label="Platform"
        value={system.platform}
        sub={`node ${system.nodeVersion}`}
        accent="bg-amber-500/15 text-amber-300"
      />
    </div>
  );
}

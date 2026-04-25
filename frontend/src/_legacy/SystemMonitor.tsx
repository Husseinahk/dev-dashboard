import React, { useEffect, useState } from 'react';
import { Square, Activity, RotateCcw, Clock, Zap, AlertTriangle } from 'lucide-react';

export function SystemMonitor({ stopProcessById }: any) {
  const [processes, setProcesses] = useState<any[]>([]);

  const fetchProcesses = () => {
    fetch('http://127.0.0.1:3030/api/processes')
      .then(res => res.json())
      .then(data => setProcesses(data.processes || []))
      .catch(e => console.error(e));
  };

  useEffect(() => {
    fetchProcesses();
    const int = setInterval(fetchProcesses, 2000);
    return () => clearInterval(int);
  }, []);

  const restartProcess = async (id: string) => {
    try {
      await fetch('http://127.0.0.1:3030/api/processes/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setTimeout(fetchProcesses, 1200);
    } catch(e) {}
  };

  const stopAll = () => {
    processes
      .filter(p => p.status === 'running' || p.status === 'ready')
      .forEach(p => stopProcessById(p.id));
    setTimeout(fetchProcesses, 800);
  };

  const running = processes.filter(p => p.status === 'running' || p.status === 'ready');
  const stopped = processes.filter(p => p.status !== 'running' && p.status !== 'ready');

  const formatUptime = (startedAt: number) => {
    if (!startedAt) return '';
    const diff = Math.floor((Date.now() - startedAt) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  return (
    <div className="flex flex-col h-full bg-[#0b1120] p-6 animate-in fade-in duration-300 overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">System Monitor</h2>
              <p className="text-slate-400 text-xs">All processes across all workspaces.</p>
            </div>
          </div>
          {running.length > 0 && (
            <button onClick={stopAll}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg border border-red-500/20 transition-all flex items-center gap-1.5">
              <Square className="w-3 h-3 fill-current" /> Kill All ({running.length})
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Active</div>
            <div className="text-2xl font-bold text-emerald-400">{running.length}</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ready</div>
            <div className="text-2xl font-bold text-blue-400">{processes.filter(p => p.status === 'ready').length}</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Crashed</div>
            <div className="text-2xl font-bold text-red-400">{processes.filter(p => p.status === 'error').length}</div>
          </div>
        </div>

        {/* Process List */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          {processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Activity className="w-8 h-8 mb-3 opacity-20" />
              <span className="italic text-sm">No processes recorded yet.</span>
              <span className="text-xs text-slate-600 mt-1">Start a command from any project to see it here.</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {processes.map(p => (
                <div key={p.id} className={`flex items-center gap-4 px-5 py-3 hover:bg-slate-800/30 transition-colors group ${
                  p.status === 'error' ? 'bg-red-950/10' : ''
                }`}>
                  {/* Status dot */}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    p.status === 'ready' ? 'bg-emerald-400' :
                    p.status === 'running' ? 'bg-emerald-400 animate-pulse' :
                    p.status === 'error' ? 'bg-red-400' :
                    'bg-slate-600'
                  }`}></span>

                  {/* Name + Command */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">{p.name || p.id}</div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">{p.command}</div>
                  </div>

                  {/* CWD */}
                  <div className="text-[10px] font-mono text-slate-600 max-w-[180px] truncate shrink-0 hidden xl:block" title={p.cwd}>
                    {p.cwd}
                  </div>

                  {/* PID */}
                  <div className="text-[10px] font-mono text-slate-500 shrink-0 w-14 text-center">
                    PID {p.pid || '—'}
                  </div>

                  {/* Uptime */}
                  {p.startedAt && (p.status === 'running' || p.status === 'ready') && (
                    <div className="text-[10px] text-slate-500 shrink-0 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {formatUptime(p.startedAt)}
                    </div>
                  )}

                  {/* Status Badge */}
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                    p.status === 'ready' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    p.status === 'running' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    p.status === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-slate-700/50 text-slate-400 border border-slate-600'
                  }`}>
                    {p.status === 'ready' ? '✓ ready' : p.status}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    {(p.status === 'running' || p.status === 'ready') && (
                      <>
                        <button onClick={() => restartProcess(p.id)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-amber-500/20 hover:text-amber-400 transition-colors" title="Restart">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { stopProcessById(p.id); setTimeout(fetchProcesses, 500); }}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-red-500/20 hover:text-red-400 transition-colors" title="Kill">
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </>
                    )}
                    {p.status === 'error' && (
                      <span className="w-6 h-6 flex items-center justify-center text-red-400" title="Crashed">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

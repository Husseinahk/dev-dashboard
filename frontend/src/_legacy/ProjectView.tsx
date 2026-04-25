import React, { useState, useEffect, useMemo } from 'react';
import { Play, Square, HardDrive, Box, Zap, Star, Search, Terminal, Settings, RotateCcw, ExternalLink, GitBranch, ArrowUp, ArrowDown, Code2, Rocket, FolderOpen, ChevronDown, ChevronRight, Clock, Activity, Globe } from 'lucide-react';
import { LogViewerPanel } from './LogViewerPanel';
import { ProjectSettings } from './ProjectSettings';
import { ApiTester } from './ApiTester';

interface GitInfo {
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
  isGitRepo: boolean;
}

export function ProjectView({ project, startProcess, stopProcess, togglePin, updateProjectConfig }: any) {
  const [search, setSearch] = useState('');
  const [customCommand, setCustomCommand] = useState('');
  const [viewTab, setViewTab] = useState<'dashboard'|'settings'|'apitester'>('dashboard');
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [runningProcesses, setRunningProcesses] = useState<any[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [busyPorts, setBusyPorts] = useState<Record<number, boolean>>({});

  // Poll git status
  useEffect(() => {
    if (!project) return;
    const fetchGit = () => {
      fetch(`http://127.0.0.1:3030/api/git/${project.id}`)
        .then(res => res.json())
        .then(data => setGitInfo(data))
        .catch(() => {});
    };
    fetchGit();
    const interval = setInterval(fetchGit, 10000);
    return () => clearInterval(interval);
  }, [project?.id]);

  // Poll running processes
  useEffect(() => {
    const fetchProcs = () => {
      fetch('http://127.0.0.1:3030/api/processes')
        .then(res => res.json())
        .then(data => setRunningProcesses(data.processes || []))
        .catch(() => {});
    };
    fetchProcs();
    const interval = setInterval(fetchProcs, 2000);
    return () => clearInterval(interval);
  }, []);

  // Poll port statuses
  useEffect(() => {
    if (!project || !project.actions) return;
    const portsToCheck = project.actions.filter((a: any) => a.port).map((a: any) => a.port);
    if (portsToCheck.length === 0) return;

    const fetchPorts = () => {
      fetch('http://127.0.0.1:3030/api/ports/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ports: portsToCheck })
      })
      .then(res => res.json())
      .then(data => setBusyPorts(data))
      .catch(() => {});
    };
    fetchPorts();
    const interval = setInterval(fetchPorts, 3000);
    return () => clearInterval(interval);
  }, [project?.id]);

  // Reset view when project changes
  useEffect(() => {
    setViewTab('dashboard');
    setSearch('');
  }, [project?.id]);

  if (!project) return null;

  const filteredActions = (project.actions || []).filter((a: any) => 
     a.label.toLowerCase().includes(search.toLowerCase()) || 
     a.command.toLowerCase().includes(search.toLowerCase())
  );
  
  const pinnedActions = filteredActions.filter((a: any) => a.pinned);

  // Group actions by category (must be before early returns — React hooks rule)
  const categories = useMemo(() => {
    const cats: Record<string, any[]> = {};
    filteredActions.filter((a: any) => !a.pinned).forEach((a: any) => {
      const cat = a.category || 'Other';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(a);
    });
    return cats;
  }, [filteredActions]);

  const categoryOrder = ['Backend', 'Frontend', 'Solution', 'Build', 'Docker', 'Git', 'Node', 'Other'];
  const sortedCategories = Object.keys(categories).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (viewTab === 'settings') {
     return <ProjectSettings 
       project={project} 
       onSave={(cfg: any) => { updateProjectConfig(project.id, cfg); setViewTab('dashboard'); }}
       onCancel={() => setViewTab('dashboard')} 
     />;
  }

  if (viewTab === 'apitester') {
     return <ApiTester project={project} />;
  }

  const getProcessStatus = (actionId: string) => {
    const key = `${project.id}-${actionId}`;
    const proc = runningProcesses.find(p => p.id === key);
    if (proc && (proc.status === 'running' || proc.status === 'ready')) {
      return proc.status;
    }
    
    // Check external process via port
    const action = project?.actions?.find((a: any) => a.id === actionId);
    if (action && action.port && busyPorts[action.port]) {
      // Is it another project in OUR dashboard?
      const otherProc = runningProcesses.find(p => p.port === action.port && p.id !== key && (p.status === 'running' || p.status === 'ready'));
      if (otherProc) {
        return `busy-${otherProc.id.split('-')[0]}`;
      }
      return 'external';
    }
    
    return proc?.status || 'stopped';
  };

  const isRunning = (actionId: string) => {
    const status = getProcessStatus(actionId);
    return status === 'running' || status === 'ready' || status === 'external' || status.startsWith('busy-');
  };

  const restartProcess = async (actionId: string) => {
    const key = `${project.id}-${actionId}`;
    try {
      await fetch('http://127.0.0.1:3030/api/processes/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key })
      });
    } catch(e) { console.error(e); }
  };

  const killPort = async (port: number) => {
    try {
      await fetch('http://127.0.0.1:3030/api/ports/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      });
      setBusyPorts(prev => ({ ...prev, [port]: false }));
    } catch(e) { console.error(e); }
  };

  const takeOverProcess = async (action: any) => {
    if (!action.port) return;
    await killPort(action.port);
    setTimeout(() => {
      startWithCwd(action);
    }, 1500); // give OS time to free port
  };

  const startWithCwd = (action: any) => {
    const cwd = action.cwd || project.path;
    startProcess(project.id, action.id, action.command, cwd, action.port);
  };

  // Quick Start: start API + Frontend together
  const hasApiAndFrontend = project.actions.some((a: any) => a.id === 'api-run' || a.id === 'api-watch') &&
                            project.actions.some((a: any) => a.id === 'frontend-start');

  const quickStartAll = () => {
    const apiAction = project.actions.find((a: any) => a.id === 'api-watch' || a.id === 'api-run');
    const feAction = project.actions.find((a: any) => a.id === 'frontend-start');
    if (apiAction) startWithCwd(apiAction);
    if (feAction) setTimeout(() => startWithCwd(feAction), 500);
  };

  const stopAll = () => {
    runningProcesses
      .filter(p => p.id.startsWith(project.id + '-') && (p.status === 'running' || p.status === 'ready'))
      .forEach(p => {
        fetch('http://127.0.0.1:3030/api/processes/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id })
        });
      });
  };

  const projectRunningCount = runningProcesses.filter(
    p => p.id.startsWith(project.id + '-') && (p.status === 'running' || p.status === 'ready')
  ).length;

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case 'Backend': return '🔧';
      case 'Frontend': return '🎨';
      case 'Solution': return '📦';
      case 'Build': return '🔨';
      case 'Docker': return '🐳';
      case 'Git': return '📊';
      case 'Node': return '📗';
      default: return '⚡';
    }
  };

  const renderAction = (action: any, compact = false) => {
    const running = isRunning(action.id);
    const status = getProcessStatus(action.id);

    return (
      <div 
        key={action.id}
        className={`group relative flex items-center gap-3 p-2.5 rounded-lg transition-all border text-left overflow-hidden ${
          running 
            ? status === 'ready'
              ? 'bg-emerald-950/40 border-emerald-600/40 shadow-[0_0_12px_rgba(16,185,129,0.08)]'
              : 'bg-emerald-950/20 border-emerald-700/30'
            : 'bg-slate-800/40 hover:bg-slate-800/70 border-slate-700/30 hover:border-slate-600/50'
        }`}
      >
        {/* Pin */}
        <button 
          onClick={() => togglePin(project.id, action.id)}
          className={`shrink-0 transition-colors ${action.pinned ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400/50'}`}
          title="Pin"
        >
          <Star className={`w-3 h-3 ${action.pinned ? 'fill-current' : ''}`} />
        </button>

        {/* Status indicator */}
        {running && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            status === 'ready' ? 'bg-emerald-400' : 'bg-emerald-400 animate-pulse'
          }`}></span>
        )}

        {/* Label + command */}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors truncate leading-tight">
            {action.label}
          </div>
          {!compact && (
            <div className="text-[9px] font-mono text-slate-500 truncate mt-0.5">{action.command}</div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-1 shrink-0">
          {running ? (
            status.startsWith('busy-') ? (
              <div className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 font-medium tracking-wide flex items-center justify-center whitespace-nowrap">
                IN USE BY {status.replace('busy-', '').toUpperCase()}
              </div>
            ) : status === 'external' ? (
              <div className="flex items-center gap-1">
                <div className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-medium tracking-wide flex items-center justify-center group-hover:hidden">
                  EXTERNAL
                </div>
                <div className="hidden group-hover:flex items-center gap-1 transition-opacity">
                  <button onClick={() => takeOverProcess(action)}
                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-[10px] text-white font-bold tracking-wide transition-colors flex items-center gap-1 shadow-lg shadow-blue-500/20 border border-blue-400/50" title="Kill external process and run it here">
                    TAKE OVER
                  </button>
                  <button onClick={() => killPort(action.port)}
                    className="w-5 h-5 rounded bg-red-500/10 flex items-center justify-center border border-red-500/20 hover:bg-red-500/30 transition-all" title="Kill External Process">
                    <Square className="w-2.5 h-2.5 text-red-400 fill-current" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={() => restartProcess(action.id)}
                  className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center border border-amber-500/20 hover:bg-amber-500/30 transition-all" title="Restart">
                  <RotateCcw className="w-2.5 h-2.5 text-amber-400" />
                </button>
                <button onClick={() => stopProcess(project.id, action.id)}
                  className="w-5 h-5 rounded bg-red-500/10 flex items-center justify-center border border-red-500/20 hover:bg-red-500/30 transition-all" title="Stop">
                  <Square className="w-2.5 h-2.5 text-red-400 fill-current" />
                </button>
              </>
            )
          ) : (
            <button onClick={() => startWithCwd(action)}
              className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/30 opacity-0 group-hover:opacity-100 transition-all" title="Start">
              <Play className="w-2.5 h-2.5 text-emerald-400 fill-current ml-px" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden animate-in fade-in duration-300">
       {/* Header */}
       <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/80 shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/5 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3"></div>
          <div className="relative z-10 flex items-start justify-between gap-4">
            {/* Left: Project info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-emerald-500/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Box className="w-4 h-4 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight truncate">{project.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border shrink-0 ${
                  project.type?.includes('Node') || project.type?.includes('Angular') ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                  project.type?.includes('.NET') ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                  'bg-slate-700/50 text-slate-400 border-slate-600'
                }`}>
                  {project.version || project.type}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-slate-500 font-mono text-[10px] bg-slate-900/50 inline-flex items-center px-1.5 py-0.5 rounded border border-slate-800 max-w-xs truncate">
                  <HardDrive className="w-2.5 h-2.5 mr-1 shrink-0" /> {project.path}
                </span>
                <button 
                  onClick={() => fetch('http://127.0.0.1:3030/api/open', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: project.path }) })}
                  className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded border border-slate-700 transition-colors flex items-center gap-0.5"
                >
                  <Code2 className="w-2.5 h-2.5" /> IDE
                </button>
                <button onClick={() => setViewTab('apitester')} 
                  className="text-[10px] flex items-center gap-0.5 text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800/50 hover:bg-slate-700 transition-colors border border-slate-700">
                   <Globe className="w-2.5 h-2.5" /> API Tester
                </button>
                <button onClick={() => setViewTab('settings')} 
                  className="text-[10px] flex items-center gap-0.5 text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800/50 hover:bg-slate-700 transition-colors border border-slate-700">
                   <Settings className="w-2.5 h-2.5" /> Settings
                </button>
                {gitInfo && gitInfo.isGitRepo && (
                  <span className="text-[10px] font-mono bg-slate-900/50 border border-slate-800 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                    <GitBranch className="w-2.5 h-2.5 text-purple-400" />
                    <span className="text-slate-200">{gitInfo.branch}</span>
                    {gitInfo.dirty > 0 && <span className="text-amber-400">● {gitInfo.dirty}</span>}
                    {gitInfo.ahead > 0 && <span className="text-emerald-400 flex items-center"><ArrowUp className="w-2 h-2" />{gitInfo.ahead}</span>}
                    {gitInfo.behind > 0 && <span className="text-red-400 flex items-center"><ArrowDown className="w-2 h-2" />{gitInfo.behind}</span>}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Power controls */}
            <div className="flex items-center gap-2 shrink-0">
              {projectRunningCount > 0 && (
                <button onClick={stopAll}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-bold rounded-lg border border-red-500/20 transition-all flex items-center gap-1.5">
                  <Square className="w-3 h-3 fill-current" /> Stop All ({projectRunningCount})
                </button>
              )}
              {hasApiAndFrontend && (
                <button onClick={quickStartAll}
                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 hover:from-emerald-500/30 hover:to-blue-500/30 text-emerald-400 text-[11px] font-bold rounded-lg border border-emerald-500/20 transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/5">
                  <Rocket className="w-3.5 h-3.5" /> Start Full Stack
                </button>
              )}
            </div>
          </div>
          
          {/* Quick Links Bar */}
          {project.quickLinks && project.quickLinks.length > 0 && (
            <div className="relative z-10 mt-2.5 flex items-center gap-1.5 flex-wrap">
              {project.quickLinks.map((link: any, i: number) => (
                <a key={i} href={link.url} target="_blank" rel="noopener"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors">
                  <ExternalLink className="w-2.5 h-2.5 text-emerald-400" />
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {/* Custom Command */}
          <div className="relative z-10 mt-2.5 flex gap-2">
            <div className="relative flex-1">
               <Terminal className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
               <input 
                 type="text" 
                 placeholder="Run command... (npm install, dotnet ef, git pull, etc.)" 
                 value={customCommand}
                 onChange={(e) => setCustomCommand(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && customCommand) {
                     startProcess(project.id, `custom-${Date.now()}`, customCommand, project.path);
                     setCommandHistory(prev => [customCommand, ...prev.slice(0, 9)]);
                     setCustomCommand('');
                   }
                 }}
                 className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1.5 pl-7 pr-3 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-all shadow-inner"
               />
            </div>
            <button 
              onClick={() => {
                if (customCommand) {
                  startProcess(project.id, `custom-${Date.now()}`, customCommand, project.path);
                  setCommandHistory(prev => [customCommand, ...prev.slice(0, 9)]);
                  setCustomCommand('');
                }
              }}
              className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1 shrink-0"
            >
              <Play className="w-3 h-3 fill-current" /> Run
            </button>
          </div>
       </div>

       {/* Main Area */}
       <div className="flex-1 flex overflow-hidden">
         {/* Actions Panel */}
         <div className="w-[340px] border-r border-slate-800 overflow-y-auto bg-slate-900/50 flex flex-col custom-scrollbar shrink-0">
            {/* Search */}
            <div className="p-3 border-b border-slate-800/50 sticky top-0 bg-slate-900/90 backdrop-blur z-10">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" placeholder="Filter commands..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/50 rounded-lg py-1.5 pl-7 pr-3 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500/50 transition-all shadow-inner"
                />
              </div>
            </div>

            <div className="p-3 space-y-4 flex-1">
              {/* Pinned Quick Actions */}
              {pinnedActions.length > 0 && (
                <div>
                  <h3 className="text-[9px] font-bold text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" /> Quick Actions
                  </h3>
                  <div className="space-y-1.5">
                     {pinnedActions.map((a: any) => renderAction(a, true))}
                  </div>
                </div>
              )}

              {/* Categorized Actions */}
              {sortedCategories.map(cat => (
                <div key={cat}>
                  <button 
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 hover:text-slate-200 transition-colors"
                  >
                    {collapsedCategories[cat] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <span>{categoryIcon(cat)}</span>
                    <span>{cat}</span>
                    <span className="text-slate-600 font-normal">({categories[cat].length})</span>
                  </button>
                  {!collapsedCategories[cat] && (
                    <div className="space-y-1">
                       {categories[cat].map((a: any) => renderAction(a))}
                    </div>
                  )}
                </div>
              ))}

              {/* Command History */}
              {commandHistory.length > 0 && (
                <div>
                  <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Recent Commands
                  </h3>
                  <div className="space-y-1">
                    {commandHistory.map((cmd, i) => (
                      <button key={i} onClick={() => {
                        startProcess(project.id, `custom-${Date.now()}`, cmd, project.path);
                      }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-mono text-slate-400 hover:text-emerald-400 bg-slate-800/30 hover:bg-slate-800/60 transition-all border border-transparent hover:border-slate-700/50 truncate"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
         </div>
         
         {/* Log Output */}
         <div className="flex-1 p-3 flex flex-col bg-[#0b1120] relative min-w-0">
            <div className="flex-1 rounded-xl overflow-hidden border border-slate-800 shadow-2xl relative bg-slate-950">
              <LogViewerPanel />
            </div>
         </div>
       </div>
    </div>
  )
}

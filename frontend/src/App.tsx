import { useCallback, useEffect, useMemo, useState } from 'react';
import { Terminal as TermIcon, ListTree, FileText } from 'lucide-react';

import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { BottomPanel } from './components/layout/BottomPanel';

import { ProjectDetail } from './components/projects/ProjectDetail';
import { WelcomeState } from './components/projects/WelcomeState';

import { LogViewer } from './components/logs/LogViewer';
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { SystemMonitor } from './components/system/SystemMonitor';
import { RunningTabs } from './components/system/RunningTabs';

import { CommandPalette } from './components/palette/CommandPalette';
import { PromptDialog } from './components/actions/PromptDialog';
import { ToastContainer } from './components/toast/ToastContainer';

import { ToastProvider, useToastApi } from './hooks/useToast';
import { useHotkey } from './hooks/useHotkeys';
import { useWebSocket } from './hooks/useWebSocket';
import { useWorkspaces } from './hooks/useWorkspaces';
import { useProcessTabs } from './hooks/useProcessTabs';
import { usePaletteCommands } from './hooks/usePaletteCommands';

import { wsUrls } from './services/ws';
import { api } from './services/api';

import type { ProjectAction, SystemSnapshot, WSEvent } from './types';

function AppInner() {
  const toast = useToastApi();

  // ---------- State ----------
  const { projects, refresh, rescan } = useWorkspaces();
  const { tabs, tabsByActionKey, handleEvent } = useProcessTabs();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<string | null>('running');
  const [activeLogTabId, setActiveLogTabId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ project: string; action: ProjectAction } | null>(null);

  // ---------- WebSocket ----------
  const onMessage = useCallback((data: any) => {
    if (!data || typeof data !== 'object') return;
    const ev = data as WSEvent;
    if (ev.event === 'system') {
      setSystem(ev.snapshot);
      return;
    }
    handleEvent(ev);
    if (ev.event === 'crash') {
      toast.danger(`${ev.name} crashed`, `Exit code ${ev.exitCode ?? 'n/a'}`);
    } else if (ev.event === 'ready') {
      const tab = tabs.find(t => t.id === ev.tabId);
      if (tab) toast.success(`${tab.name} is ready`, ev.port ? `Listening on :${ev.port}` : undefined);
    }
  }, [handleEvent, tabs, toast]);

  const { status: wsStatus } = useWebSocket(wsUrls.events(), onMessage);

  // ---------- Selection ----------
  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  // Auto-select first project on initial load
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  // ---------- Action handlers ----------
  const runAction = useCallback(async (projectId: string, action: ProjectAction, vars?: Record<string, string>) => {
    if (action.promptFor && action.promptFor.length > 0 && !vars) {
      setPrompt({ project: projectId, action });
      return;
    }
    try {
      await api.runAction({ projectId, actionId: action.id, vars });
      toast.info(`Started ${action.label}`);
    } catch (e: any) {
      toast.danger('Failed to run', e?.message ?? 'Unknown error');
    }
  }, [toast]);

  const stopProc = useCallback(async (tabId: string) => {
    try { await api.stopProcess(tabId); toast.info('Stopped'); } catch (e: any) { toast.danger('Stop failed', e?.message); }
  }, [toast]);

  const restartProc = useCallback(async (tabId: string) => {
    try { await api.restartProcess(tabId); toast.info('Restarting…'); } catch (e: any) { toast.danger('Restart failed', e?.message); }
  }, [toast]);

  const togglePin = useCallback(async (action: ProjectAction) => {
    if (!selectedProjectId) return;
    try {
      await api.togglePin(selectedProjectId, action.id);
      await refresh();
    } catch (e: any) { toast.danger('Pin failed', e?.message); }
  }, [selectedProjectId, refresh, toast]);

  const stopAll = useCallback(async () => {
    try { await api.stopAll(); toast.info('All processes stopped'); } catch (e: any) { toast.danger('Stop-all failed', e?.message); }
  }, [toast]);

  const showLogs = useCallback((tabId: string) => {
    setActiveLogTabId(tabId);
    setBottomTab('logs');
  }, []);

  // ---------- Hotkeys ----------
  useHotkey('mod+k', e => { e.preventDefault(); setPaletteOpen(true); });
  useHotkey('mod+`', e => { e.preventDefault(); setBottomTab(b => b === 'terminal' ? null : 'terminal'); });
  useHotkey('esc', () => { if (paletteOpen) setPaletteOpen(false); }, [paletteOpen]);

  // ---------- Palette commands ----------
  const paletteCmds = usePaletteCommands({
    projects, tabs,
    onSelectProject: setSelectedProjectId,
    onRunAction: runAction,
    onStop: stopProc,
    onRescan: () => { rescan(); toast.info('Rescanning…'); },
    onStopAll: stopAll,
    onOpenTerminal: () => setBottomTab('terminal'),
  });

  // ---------- Bottom panel tabs ----------
  const activeLogTab = tabs.find(t => t.id === activeLogTabId) ?? tabs.find(t => t.isRunning) ?? null;
  const runningCount = tabs.filter(t => t.isRunning).length;

  const bottomTabs = [
    {
      id: 'running',
      label: 'Running',
      icon: <ListTree size={13} />,
      badge: runningCount > 0 ? <span className="ml-1 text-[10px] px-1.5 rounded-full bg-emerald-500/20 text-emerald-300">{runningCount}</span> : null,
      content: <RunningTabs tabs={tabs} onSelect={showLogs} onStop={stopProc} onRestart={restartProc} />,
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: <FileText size={13} />,
      content: activeLogTab ? <LogViewer tab={activeLogTab} /> : <div className="p-6 text-sm text-[var(--color-text-3)]">Select a process to view logs.</div>,
    },
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <TermIcon size={13} />,
      content: <TerminalPanel onClose={() => setBottomTab(null)} />,
    },
  ];

  return (
    <div className="h-screen flex flex-col">
      <TopBar
        wsStatus={wsStatus}
        onRescan={() => { rescan(); toast.info('Rescanning…'); }}
        onStopAll={stopAll}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        <Sidebar
          projects={projects}
          tabs={tabs}
          selectedId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 overflow-y-auto">
            {selectedProject ? (
              <>
                <SystemMonitor system={system} />
                <ProjectDetail
                  project={selectedProject}
                  tabsById={tabsByActionKey}
                  onRun={a => runAction(selectedProject.id, a)}
                  onStop={stopProc}
                  onRestart={restartProc}
                  onTogglePin={togglePin}
                  onShowLogs={showLogs}
                />
              </>
            ) : (
              <WelcomeState projectCount={projects.length} onOpenPalette={() => setPaletteOpen(true)} />
            )}
          </div>

          <BottomPanel
            tabs={bottomTabs}
            activeId={bottomTab}
            onActiveChange={setBottomTab}
          />
        </main>
      </div>

      <StatusBar system={system} runningCount={runningCount} />

      {/* Overlays */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCmds}
      />
      <PromptDialog
        open={!!prompt}
        title={prompt ? `Run: ${prompt.action.label}` : ''}
        description="Provide values used in the command."
        fields={prompt?.action.promptFor ?? []}
        onCancel={() => setPrompt(null)}
        onSubmit={vars => {
          if (prompt) runAction(prompt.project, prompt.action, vars);
          setPrompt(null);
        }}
      />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

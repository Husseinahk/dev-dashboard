import { useCallback, useEffect, useReducer } from 'react';
import { api } from '../services/api';
import type { ProcessTab, WSEvent, LogLine } from '../types';

const MAX_LINES_PER_TAB = 4000;

type State = { tabs: Map<string, ProcessTab> };

type Action =
  | { type: 'replace'; tabs: ProcessTab[] }
  | { type: 'event'; ev: WSEvent };

function reducer(state: State, action: Action): State {
  if (action.type === 'replace') {
    const map = new Map<string, ProcessTab>();
    for (const t of action.tabs) {
      map.set(t.id, { ...t, logs: t.logs ?? [] });
    }
    return { tabs: map };
  }
  if (action.type === 'event') {
    const ev = action.ev;
    if (ev.event === 'system') return state;
    const map = new Map(state.tabs);
    const existing = map.get(ev.tabId);
    if (ev.event === 'log') {
      const tab: ProcessTab = existing ?? blankTab(ev.tabId);
      const logs: LogLine[] = [...(tab.logs ?? []), { ts: ev.ts, stream: ev.stream, text: ev.text }];
      if (logs.length > MAX_LINES_PER_TAB) logs.splice(0, logs.length - MAX_LINES_PER_TAB);
      map.set(ev.tabId, { ...tab, logs });
    } else if (ev.event === 'status') {
      const tab: ProcessTab = existing ?? blankTab(ev.tabId);
      map.set(ev.tabId, {
        ...tab,
        status: ev.status,
        pid: ev.pid ?? tab.pid,
        exitCode: ev.exitCode ?? tab.exitCode,
        isRunning: ev.status === 'running' || ev.status === 'starting' || ev.status === 'ready',
      });
    } else if (ev.event === 'ready') {
      const tab: ProcessTab = existing ?? blankTab(ev.tabId);
      map.set(ev.tabId, { ...tab, status: 'ready', port: ev.port ?? tab.port, isRunning: true });
    } else if (ev.event === 'crash') {
      const tab: ProcessTab = existing ?? blankTab(ev.tabId);
      map.set(ev.tabId, { ...tab, status: 'crashed', isRunning: false });
    }
    return { tabs: map };
  }
  return state;
}

function blankTab(id: string): ProcessTab {
  return {
    id, projectId: '', actionId: '', name: id,
    status: 'idle', isRunning: false, logs: [],
  };
}

export function useProcessTabs() {
  const [state, dispatch] = useReducer(reducer, { tabs: new Map() });

  // Initial load
  useEffect(() => {
    api.listTabs()
      .then(res => {
        const tabs = Array.isArray(res) ? res : (res?.tabs ?? res?.processes ?? []);
        dispatch({ type: 'replace', tabs });
      })
      .catch(() => {});
  }, []);

  const handleEvent = useCallback((ev: WSEvent) => dispatch({ type: 'event', ev }), []);

  const tabs = [...state.tabs.values()];
  const tabsByActionKey = new Map<string, ProcessTab>();
  for (const t of tabs) tabsByActionKey.set(`${t.projectId}:${t.actionId}`, t);

  return { tabs, tabsById: state.tabs, tabsByActionKey, handleEvent };
}

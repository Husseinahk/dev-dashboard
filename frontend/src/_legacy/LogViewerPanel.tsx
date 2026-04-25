import React, { useEffect, useRef, useState } from 'react';
import { Search, Trash2, Copy, ArrowDown } from 'lucide-react';

interface LogMessage {
  id: string;
  type: string;
  data: string;
}

export function LogViewerPanel() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [logSearch, setLogSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore historical tabs on mount
  useEffect(() => {
    fetch('http://127.0.0.1:3030/api/tabs')
      .then(res => res.json())
      .then(data => {
        const restoredTabs = (data.tabs || []);
        restoredTabs.forEach((tab: any) => {
          if (!tabs.includes(tab.id)) {
            setTabs(prev => [...new Set([...prev, tab.id])]);
            if (tab.logs) {
              setLogs(prev => [...prev, { id: tab.id, type: 'restored', data: tab.logs }]);
            }
          }
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:3030/api/process-logs');
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.data && msg.id) {
          setLogs(prev => {
            const newLogs = [...prev, msg];
            if (newLogs.length > 2000) return newLogs.slice(newLogs.length - 2000);
            return newLogs;
          });
          setTabs(prev => {
            if (!prev.includes(msg.id)) {
              return [...prev, msg.id];
            }
            return prev;
          });
          // Auto-select first tab
          setActiveTab(prev => prev || msg.id);
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    if (scrollRef.current && autoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  const filteredLogs = activeTab 
    ? logs.filter(l => l.id === activeTab).filter(l => {
        if (!logSearch) return true;
        return l.data.toLowerCase().includes(logSearch.toLowerCase());
      })
    : [];

  const closeTab = (tabId: string) => {
    setTabs(prev => prev.filter(t => t !== tabId));
    setLogs(prev => prev.filter(l => l.id !== tabId));
    if (activeTab === tabId) setActiveTab(tabs.find(t => t !== tabId) || null);
    fetch(`http://127.0.0.1:3030/api/tabs/${encodeURIComponent(tabId)}`, { method: 'DELETE' }).catch(() => {});
  };

  const copyLogs = () => {
    const text = filteredLogs.map(l => l.data).join('');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const clearLogs = () => {
    if (activeTab) {
      setLogs(prev => prev.filter(l => l.id !== activeTab));
    }
  };

  const shortLabel = (id: string) => {
    const parts = id.split('-');
    return parts.length > 1 ? parts.slice(1).join('-') : id;
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 rounded-md border border-slate-800 overflow-hidden shadow-inner">
      {/* Tab Bar */}
      {tabs.length > 0 && (
        <div className="flex items-center border-b border-slate-800 bg-slate-900/60 shrink-0">
          <div className="flex-1 flex overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`group relative px-3 py-2 text-xs font-mono whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === tab
                    ? 'border-emerald-400 text-emerald-300 bg-slate-950'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <span className="truncate max-w-[120px]">{shortLabel(tab)}</span>
                <span 
                  onClick={(e) => { e.stopPropagation(); closeTab(tab); }}
                  className="ml-1 w-4 h-4 flex items-center justify-center rounded text-slate-600 hover:text-white hover:bg-red-500/60 transition-colors"
                >×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      {activeTab && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/40 border-b border-slate-800 text-xs shrink-0">
          <div className="relative flex-1">
            <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Search in logs..."
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 pl-7 text-xs font-mono text-slate-300 focus:border-emerald-500/50 outline-none"
            />
            {logSearch && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 flex items-center gap-1">
                <span>{filteredLogs.length} matches</span>
                <button onClick={() => setLogSearch('')} className="hover:text-white">✕</button>
              </span>
            )}
          </div>
          <label className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-white">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="w-3 h-3" />
            <ArrowDown className="w-3 h-3" />
          </label>
          <button onClick={copyLogs} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700" title="Copy logs">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={clearLogs} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Log Content */}
      <div className="flex-1 overflow-auto p-3 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed" ref={scrollRef}>
        {!activeTab ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-4">
            <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin"></div>
            <span>Waiting for process output...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50 space-y-2">
            <span className="text-slate-500 italic">{logSearch ? 'No matching lines.' : '(no output yet)'}</span>
          </div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className={`mb-0.5 break-all ${
              log.type === 'stderr' ? 'text-red-400' : 
              log.type === 'info' ? 'text-blue-400' : 
              'text-slate-300'
            }`}>
              {log.data}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

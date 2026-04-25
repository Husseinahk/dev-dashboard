import React, { useState, useEffect } from 'react';
import { Settings2, Trash2, Plus, FolderOpen, X, Save, Code, Globe } from 'lucide-react';

export function GlobalSettings({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<any>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:3030/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(() => {});
  }, []);

  const save = async () => {
    try {
      await fetch('http://127.0.0.1:3030/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      setDirty(false);
      onClose();
    } catch(e) { console.error(e); }
  };

  if (!config) return (
    <div className="flex-1 flex items-center justify-center bg-[#0b1120]">
      <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-emerald-400 animate-spin"></div>
    </div>
  );

  const addScanPath = () => {
    config.scanPaths = [...(config.scanPaths || []), ''];
    setConfig({ ...config });
    setDirty(true);
  };

  const removeScanPath = (index: number) => {
    config.scanPaths.splice(index, 1);
    setConfig({ ...config });
    setDirty(true);
  };

  const updateScanPath = (index: number, value: string) => {
    config.scanPaths[index] = value;
    setConfig({ ...config });
    setDirty(true);
  };

  return (
    <div className="flex-1 p-8 bg-[#0b1120] overflow-y-auto animate-in fade-in duration-300">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center">
              <Settings2 className="w-6 h-6 text-slate-300" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Global Settings</h2>
              <p className="text-slate-400 text-sm">Configure scan paths, defaults, and system preferences.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-amber-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span> unsaved</span>}
            <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg font-semibold transition-colors text-sm">
              <X className="w-4 h-4" />
            </button>
            <button onClick={save} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20 text-sm">
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </div>

        {/* Scan Paths */}
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><FolderOpen className="w-5 h-5 text-blue-400" /> Scan Paths</h3>
              <p className="text-slate-400 text-xs mt-1">Directories where DevControl will scan for projects (Node.js, .NET, Docker).</p>
            </div>
            <button onClick={addScanPath} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add Path
            </button>
          </div>
          <div className="space-y-2">
            {(config.scanPaths || []).map((p: string, i: number) => (
              <div key={i} className="flex gap-3 items-center">
                <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" />
                <input type="text" value={p} onChange={e => updateScanPath(i, e.target.value)}
                  placeholder="C:\Projects" className="flex-1 bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm font-mono text-white focus:border-emerald-500/50 outline-none" />
                <button onClick={() => removeScanPath(i)} className="p-2 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* JSON Preview */}
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Code className="w-5 h-5 text-emerald-400" /> Config Preview (JSON)</h3>
          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-auto max-h-80">
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

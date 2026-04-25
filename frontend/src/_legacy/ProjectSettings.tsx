import React, { useState } from 'react';
import { Save, Plus, Trash2, Settings2, X, Link, ChevronDown, ChevronRight } from 'lucide-react';

export function ProjectSettings({ project, onSave, onCancel }: any) {
  const [name, setName] = useState(project.name);
  const [group, setGroup] = useState(project.group || '');
  const [quickLinks, setQuickLinks] = useState<any[]>(project.quickLinks || []);
  const [actionGroups, setActionGroups] = useState<any[]>(project.actionGroups || []);
  const [customActions, setCustomActions] = useState<any[]>(
     project.actions?.filter((a: any) => a.id.startsWith('custom-')) || []
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  const handleSave = () => {
    onSave({ name, group, customActions, quickLinks, actionGroups });
  };

  // Custom Actions
  const addAction = () => {
    setCustomActions([...customActions, { id: `custom-${Date.now()}`, label: '', command: '' }]);
  };
  const updateAction = (index: number, key: string, value: string) => {
    const newActions = [...customActions];
    newActions[index][key] = value;
    setCustomActions(newActions);
  };
  const removeAction = (index: number) => {
    setCustomActions(customActions.filter((_, i) => i !== index));
  };

  // Quick Links
  const addQuickLink = () => {
    setQuickLinks([...quickLinks, { label: '', url: 'http://' }]);
  };
  const updateQuickLink = (index: number, key: string, value: string) => {
    const newLinks = [...quickLinks];
    newLinks[index][key] = value;
    setQuickLinks(newLinks);
  };
  const removeQuickLink = (index: number) => {
    setQuickLinks(quickLinks.filter((_, i) => i !== index));
  };

  // Action Groups
  const addActionGroup = () => {
    setActionGroups([...actionGroups, { name: 'New Group', actions: [] }]);
  };
  const addGroupAction = (groupIdx: number) => {
    const newGroups = [...actionGroups];
    newGroups[groupIdx].actions.push({ id: `action-${Date.now()}`, label: '', command: '', type: 'one-shot' });
    setActionGroups(newGroups);
  };
  const updateGroupAction = (gIdx: number, aIdx: number, key: string, value: string) => {
    const newGroups = [...actionGroups];
    newGroups[gIdx].actions[aIdx][key] = value;
    setActionGroups(newGroups);
  };
  const removeGroupAction = (gIdx: number, aIdx: number) => {
    const newGroups = [...actionGroups];
    newGroups[gIdx].actions.splice(aIdx, 1);
    setActionGroups(newGroups);
  };
  const removeActionGroup = (index: number) => {
    setActionGroups(actionGroups.filter((_, i) => i !== index));
  };

  const toggleGroupExpand = (idx: number) => {
    setExpandedGroups(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="flex-1 p-6 bg-[#0b1120] overflow-y-auto custom-scrollbar">
       <div className="max-w-5xl mx-auto">
         {/* Header */}
         <div className="flex items-center justify-between mb-6">
           <div>
             <h2 className="text-2xl font-bold text-white flex items-center gap-3">
               <Settings2 className="w-6 h-6 text-emerald-400" /> Project Settings
             </h2>
             <p className="text-slate-400 text-sm mt-1">Configure <span className="text-white font-semibold">{project.name}</span> — metadata, commands, groups, and quick links.</p>
           </div>
           <div className="flex items-center gap-3">
             <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg font-semibold transition-colors flex items-center gap-1.5 text-sm">
               <X className="w-4 h-4" /> Cancel
             </button>
             <button onClick={handleSave} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20 text-sm">
               <Save className="w-4 h-4" /> Save
             </button>
           </div>
         </div>

         {/* Grid: Basic Info */}
         <div className="grid grid-cols-2 gap-6 mb-6">
           <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Display Name</label>
             <input type="text" value={name} onChange={e => setName(e.target.value)}
               className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" />
           </div>
           <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Sidebar Group</label>
             <input type="text" value={group} onChange={e => setGroup(e.target.value)}
               placeholder="e.g. Frontend, APIs, Microservices"
               className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500/50 outline-none" />
           </div>
         </div>

         {/* Quick Links */}
         <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 mb-6">
           <div className="flex items-center justify-between mb-4">
             <div>
               <h3 className="text-base font-bold text-white flex items-center gap-2"><Link className="w-4 h-4 text-blue-400" /> Quick Links</h3>
               <p className="text-slate-400 text-xs">URLs that appear as clickable badges in the project view (e.g. localhost, Swagger, docs).</p>
             </div>
             <button onClick={addQuickLink} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1">
               <Plus className="w-3.5 h-3.5" /> Add Link
             </button>
           </div>
           <div className="space-y-2">
             {quickLinks.map((link, i) => (
               <div key={i} className="flex gap-3 items-center">
                 <input type="text" value={link.label} onChange={e => updateQuickLink(i, 'label', e.target.value)}
                   placeholder="Label" className="w-36 bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-white focus:border-emerald-500/50 outline-none" />
                 <input type="text" value={link.url} onChange={e => updateQuickLink(i, 'url', e.target.value)}
                   placeholder="https://..." className="flex-1 bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:border-emerald-500/50 outline-none" />
                 <button onClick={() => removeQuickLink(i)} className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                   <Trash2 className="w-3.5 h-3.5" />
                 </button>
               </div>
             ))}
             {quickLinks.length === 0 && <div className="text-center py-4 text-slate-600 text-xs border border-dashed border-slate-700 rounded-lg">No quick links defined.</div>}
           </div>
         </div>

         {/* Custom Commands */}
         <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 mb-6">
           <div className="flex items-center justify-between mb-4">
             <div>
               <h3 className="text-base font-bold text-white">Custom Commands</h3>
               <p className="text-slate-400 text-xs">Permanent buttons that always appear in this project's action list.</p>
             </div>
             <button onClick={addAction} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1">
               <Plus className="w-3.5 h-3.5" /> Add Command
             </button>
           </div>
           <div className="space-y-3">
             {customActions.map((action, i) => (
               <div key={action.id} className="flex gap-3 items-start bg-slate-950 p-3 rounded-xl border border-slate-800">
                 <div className="flex-1 grid grid-cols-2 gap-3">
                   <div>
                     <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Label</label>
                     <input type="text" value={action.label} onChange={e => updateAction(i, 'label', e.target.value)}
                       placeholder="e.g. Deploy" className="w-full bg-slate-900 border border-slate-700/50 rounded px-2.5 py-1.5 text-xs text-white focus:border-emerald-500/50 outline-none" />
                   </div>
                   <div>
                     <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Command</label>
                     <input type="text" value={action.command} onChange={e => updateAction(i, 'command', e.target.value)}
                       placeholder="e.g. npm run build" className="w-full bg-slate-900 border border-slate-700/50 rounded px-2.5 py-1.5 text-xs font-mono text-white focus:border-emerald-500/50 outline-none" />
                   </div>
                 </div>
                 <button onClick={() => removeAction(i)} className="p-1.5 mt-4 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                   <Trash2 className="w-3.5 h-3.5" />
                 </button>
               </div>
             ))}
             {customActions.length === 0 && <div className="text-center py-4 text-slate-600 text-xs border border-dashed border-slate-700 rounded-lg">No custom commands. Click + Add Command.</div>}
           </div>
         </div>

         {/* Action Groups */}
         <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
           <div className="flex items-center justify-between mb-4">
             <div>
               <h3 className="text-base font-bold text-white">Action Groups</h3>
               <p className="text-slate-400 text-xs">Organize commands into collapsible groups (e.g. Backend, Frontend, DevOps).</p>
             </div>
             <button onClick={addActionGroup} className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1">
               <Plus className="w-3.5 h-3.5" /> Add Group
             </button>
           </div>
           <div className="space-y-3">
             {actionGroups.map((group, gIdx) => (
               <div key={gIdx} className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                 <div className="flex items-center gap-2 p-3 bg-slate-900/60 border-b border-slate-800">
                   <button onClick={() => toggleGroupExpand(gIdx)} className="text-slate-500 hover:text-white transition-colors">
                     {expandedGroups[gIdx] !== false ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                   </button>
                   <input type="text" value={group.name} onChange={e => { const ng = [...actionGroups]; ng[gIdx].name = e.target.value; setActionGroups(ng); }}
                     placeholder="Group name" className="flex-1 bg-transparent border-none text-sm font-semibold text-white focus:outline-none" />
                   <button onClick={() => addGroupAction(gIdx)} className="text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">+ Action</button>
                   <button onClick={() => removeActionGroup(gIdx)} className="text-red-400 hover:text-red-300 text-xs px-2 transition-colors">✕</button>
                 </div>
                 {expandedGroups[gIdx] !== false && (
                   <div className="p-3 space-y-2">
                     {group.actions.map((action: any, aIdx: number) => (
                       <div key={aIdx} className="bg-slate-900/60 border border-slate-700 rounded-lg p-2.5">
                         <div className="grid grid-cols-12 gap-2">
                           <input type="text" value={action.label || ''} onChange={e => updateGroupAction(gIdx, aIdx, 'label', e.target.value)}
                             placeholder="Label" className="col-span-4 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none" />
                           <select value={action.type || 'one-shot'} onChange={e => updateGroupAction(gIdx, aIdx, 'type', e.target.value)}
                             className="col-span-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none">
                             <option value="long-running">long-running</option>
                             <option value="one-shot">one-shot</option>
                             <option value="open">open</option>
                           </select>
                           <input type="text" value={action.cwd || ''} onChange={e => updateGroupAction(gIdx, aIdx, 'cwd', e.target.value)}
                             placeholder="cwd (relative)" className="col-span-5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white outline-none" />
                           <button onClick={() => removeGroupAction(gIdx, aIdx)} className="col-span-1 text-red-400 hover:text-red-300 text-xs flex items-center justify-center">✕</button>
                         </div>
                         <input type="text" value={action.command || ''} onChange={e => updateGroupAction(gIdx, aIdx, 'command', e.target.value)}
                           placeholder="command (e.g. npm run dev)" className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white outline-none" />
                       </div>
                     ))}
                     {group.actions.length === 0 && <div className="text-xs text-slate-500 italic py-2">No actions in this group. Click "+ Action".</div>}
                   </div>
                 )}
               </div>
             ))}
             {actionGroups.length === 0 && <div className="text-center py-4 text-slate-600 text-xs border border-dashed border-slate-700 rounded-lg">No action groups defined.</div>}
           </div>
         </div>
       </div>
    </div>
  );
}

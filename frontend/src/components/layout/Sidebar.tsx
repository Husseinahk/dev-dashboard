import { useMemo, useState } from 'react';
import { ChevronRight, Folder, Search } from 'lucide-react';
import type { Project, ProcessTab } from '../../types';
import { Input } from '../ui/Input';
import { StatusDot } from '../ui/StatusDot';
import { cn } from '../../utils/cn';

interface Props {
  projects: Project[];
  tabs: ProcessTab[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Sidebar({ projects, tabs, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Map projectId → most-relevant running status (for the dot in the list)
  const statusByProject = useMemo(() => {
    const m = new Map<string, ProcessTab>();
    for (const t of tabs) {
      const existing = m.get(t.projectId);
      const rank = (s: string) => ['ready', 'running', 'starting', 'crashed', 'stopped', 'idle'].indexOf(s);
      if (!existing || rank(t.status) < rank(existing.status)) m.set(t.projectId, t);
    }
    return m;
  }, [tabs]);

  // Filter & group
  const groups = useMemo(() => {
    const q = filter.toLowerCase().trim();
    const filtered = projects.filter(p =>
      !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    );
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      const g = p.group || 'Workspace';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    // Sort projects in each group alphabetically
    for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [projects, filter]);

  return (
    <aside className="w-72 shrink-0 flex flex-col border-r border-[var(--color-line)] bg-[var(--color-bg-1)]/40">
      {/* Filter */}
      <div className="p-3 border-b border-[var(--color-line)]">
        <Input
          icon={<Search size={14} />}
          placeholder="Filter projects…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto py-2">
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--color-text-3)]">
            No projects match.
          </div>
        ) : (
          groups.map(([group, list]) => {
            const collapsed = collapsedGroups[group];
            return (
              <div key={group} className="mb-1">
                <button
                  onClick={() => setCollapsedGroups(c => ({ ...c, [group]: !collapsed }))}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--color-text-4)] hover:text-[var(--color-text-2)]"
                >
                  <ChevronRight size={12} className={cn('transition-transform', !collapsed && 'rotate-90')} />
                  <span>{group}</span>
                  <span className="ml-auto text-[10px] font-medium">{list.length}</span>
                </button>
                {!collapsed && (
                  <ul className="px-2">
                    {list.map(p => {
                      const tab = statusByProject.get(p.id);
                      const active = p.id === selectedId;
                      return (
                        <li key={p.id}>
                          <button
                            onClick={() => onSelect(p.id)}
                            className={cn(
                              'group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-all',
                              active
                                ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-text-1)] shadow-[inset_0_0_0_1px_var(--color-brand-500)]'
                                : 'text-[var(--color-text-2)] hover:bg-white/5 hover:text-[var(--color-text-1)]',
                            )}
                          >
                            <Folder size={14} className={active ? 'text-[var(--color-brand-300)]' : 'text-[var(--color-text-4)]'} />
                            <span className="flex-1 truncate text-left">{p.name}</span>
                            {tab && <StatusDot status={tab.status} />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}

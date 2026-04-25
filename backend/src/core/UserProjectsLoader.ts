import fs from 'fs';
import path from 'path';

export interface UserAction {
  id: string;
  label: string;
  command: string;
  type?: 'long-running' | 'one-shot' | 'open' | 'prompt' | 'chain';
  cwd?: string;
  category?: string;
  port?: number;
  promptFor?: { name: string; label: string; placeholder?: string; default?: string }[];
  chain?: string[]; // ids of actions to run sequentially (for type:'chain')
  waitForReady?: boolean; // chain helper: wait for ready before next step
}

export interface UserActionGroup {
  name: string;
  actions: UserAction[];
}

export interface UserQuickLink {
  label: string;
  url: string;
  healthCheck?: boolean;
}

export interface UserProject {
  id: string;
  name: string;
  path: string;
  group?: string;
  nodeVersion?: string;
  description?: string;
  groups?: UserActionGroup[];
  quickLinks?: UserQuickLink[];
  envVars?: Record<string, string>;
  notes?: string; // scratchpad
}

export interface GlobalSettings {
  port?: number;
  openBrowserOnStart?: boolean;
  nvmHome?: string;
  defaultGroups?: UserActionGroup[];
  theme?: 'dark' | 'darker' | 'midnight';
}

export interface UserConfig {
  globalSettings?: GlobalSettings;
  projects?: UserProject[];
}

export class UserProjectsLoader {
  constructor(private filePath: string) {}

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  load(): UserConfig {
    if (!this.exists()) return { globalSettings: {}, projects: [] };
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const cfg = JSON.parse(raw) as UserConfig;
      cfg.projects = cfg.projects || [];
      cfg.globalSettings = cfg.globalSettings || {};
      return cfg;
    } catch (e) {
      console.error('[UserProjectsLoader] Failed to parse projects.json:', e);
      return { globalSettings: {}, projects: [] };
    }
  }

  save(cfg: UserConfig) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(cfg, null, 2), 'utf-8');
  }

  /** Patch (or insert) a project entry */
  upsertProject(project: UserProject) {
    const cfg = this.load();
    cfg.projects = cfg.projects || [];
    const idx = cfg.projects.findIndex(p => p.id === project.id);
    if (idx >= 0) cfg.projects[idx] = { ...cfg.projects[idx], ...project };
    else cfg.projects.push(project);
    this.save(cfg);
  }

  removeProject(id: string) {
    const cfg = this.load();
    cfg.projects = (cfg.projects || []).filter(p => p.id !== id);
    this.save(cfg);
  }

  patchGlobal(patch: Partial<GlobalSettings>) {
    const cfg = this.load();
    cfg.globalSettings = { ...cfg.globalSettings, ...patch };
    this.save(cfg);
  }
}

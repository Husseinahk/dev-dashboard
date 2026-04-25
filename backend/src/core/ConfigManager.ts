import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ProjectConfig {
  name?: string;
  group?: string;
  customActions?: { id: string; label: string; command: string; category?: string; type?: string; cwd?: string }[];
  quickLinks?: { label: string; url: string; healthCheck?: boolean }[];
  notes?: string;
}

export interface DevControlConfig {
  scanPaths: string[];
  /** Project ids the user has chosen to hide from the workspace list. */
  hiddenProjects: string[];
  pinnedActions: Record<string, string[]>;
  projectConfigs: Record<string, ProjectConfig>;
  apiCredentials?: Record<string, any>;
  apiCollections?: Record<string, any>;
  globalSettings?: {
    nvmHome?: string;
    theme?: string;
    notificationsOnReady?: boolean;
    notificationsOnCrash?: boolean;
    autoOpenBrowser?: boolean;
  };
}

export class ConfigManager {
  private configPath: string;
  public config: DevControlConfig = {
    scanPaths: [],
    hiddenProjects: [],
    pinnedActions: {},
    projectConfigs: {},
    apiCredentials: {},
    apiCollections: {},
    globalSettings: {
      notificationsOnReady: true,
      notificationsOnCrash: true,
      autoOpenBrowser: false,
    },
  };

  constructor(customPath?: string) {
    this.configPath = customPath || path.join(os.homedir(), '.devcontrol', 'config.json');
    this.load();
  }

  load() {
    if (fs.existsSync(this.configPath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        this.config = {
          scanPaths: loaded.scanPaths || [],
          hiddenProjects: loaded.hiddenProjects || [],
          pinnedActions: loaded.pinnedActions || {},
          projectConfigs: loaded.projectConfigs || {},
          apiCredentials: loaded.apiCredentials || {},
          apiCollections: loaded.apiCollections || {},
          globalSettings: {
            notificationsOnReady: true,
            notificationsOnCrash: true,
            autoOpenBrowser: false,
            ...(loaded.globalSettings || {}),
          },
        };
      } catch (e) {
        console.error('[ConfigManager] Failed to load config', e);
      }
    } else {
      // Reasonable defaults
      this.config.scanPaths = ['C:\\Projects', 'C:\\Tools'];
      this.save();
    }
  }

  save() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  addScanPath(p: string) {
    if (!this.config.scanPaths.includes(p)) {
      this.config.scanPaths.push(p);
      this.save();
    }
  }

  removeScanPath(p: string) {
    this.config.scanPaths = this.config.scanPaths.filter(x => x !== p);
    this.save();
  }

  hideProject(id: string) {
    if (!this.config.hiddenProjects.includes(id)) {
      this.config.hiddenProjects.push(id);
      this.save();
    }
  }

  showProject(id: string) {
    this.config.hiddenProjects = this.config.hiddenProjects.filter(x => x !== id);
    this.save();
  }

  setHiddenProjects(ids: string[]) {
    this.config.hiddenProjects = [...new Set(ids)];
    this.save();
  }

  togglePin(projectId: string, actionId: string) {
    if (!this.config.pinnedActions[projectId]) this.config.pinnedActions[projectId] = [];
    const pins = this.config.pinnedActions[projectId];
    if (pins.includes(actionId)) {
      this.config.pinnedActions[projectId] = pins.filter(x => x !== actionId);
    } else {
      pins.push(actionId);
    }
    this.save();
  }

  isPinned(projectId: string, actionId: string): boolean {
    return (this.config.pinnedActions[projectId] || []).includes(actionId);
  }

  getPaths() {
    return this.config.scanPaths;
  }
}

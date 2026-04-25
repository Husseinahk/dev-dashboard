export interface ProjectAction {
  id: string;
  label: string;
  command?: string;
  category?: string;
  type?: 'long-running' | 'one-shot' | 'open' | 'prompt' | 'chain';
  cwd?: string;
  port?: number;
  nodeVersion?: string;
  source?: 'auto' | 'user';
  promptFor?: { name: string; label: string; default?: string }[];
  chain?: { actionId: string; vars?: Record<string, string> }[];
  pinned?: boolean;
}

export interface ProjectActionGroup {
  name: string;
  actions: ProjectAction[];
}

export interface QuickLink {
  label: string;
  url: string;
  healthCheck?: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  group?: string;
  type?: string;
  framework?: string;
  nodeVersion?: string;
  apiUrl?: string;
  port?: number;
  actionGroups: ProjectActionGroup[];
  quickLinks: QuickLink[];
  notes?: string;
  envVars?: Record<string, string>;
}

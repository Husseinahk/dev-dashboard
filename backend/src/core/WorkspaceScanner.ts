import fs from 'fs';
import path from 'path';
import { UserProject, UserAction } from './UserProjectsLoader';

export interface DiscoveredAction {
  id: string;
  label: string;
  command: string;
  type?: string;
  category?: string;
  cwd?: string;
  port?: number;
  promptFor?: any[];
  chain?: string[];
  source?: 'auto' | 'user';
  description?: string;
}

export interface DiscoveredProject {
  id: string;
  name: string;
  path: string;
  type: string;
  group?: string;
  version?: string;
  nodeVersion?: string;
  description?: string;
  quickLinks: { label: string; url: string; healthCheck?: boolean }[];
  actions: DiscoveredAction[];
  envVars?: Record<string, string>;
  notes?: string;
  source: 'auto' | 'user' | 'merged';
}

interface LaunchProfile {
  applicationUrl?: string;
  launchUrl?: string;
}

export class WorkspaceScanner {
  constructor(private rootDirs: string[]) {}

  setRoots(roots: string[]) {
    this.rootDirs = roots;
  }

  /** Discover projects by scanning rootDirs. */
  scan(): DiscoveredProject[] {
    const projects: DiscoveredProject[] = [];
    const seen = new Set<string>();
    for (const rootDir of this.rootDirs) {
      if (!fs.existsSync(rootDir)) continue;
      let dirs: fs.Dirent[];
      try {
        dirs = fs.readdirSync(rootDir, { withFileTypes: true })
          .filter(d => d.isDirectory() && d.name !== 'node_modules' && !d.name.startsWith('.') && d.name !== 'bin' && d.name !== 'obj');
      } catch { continue; }

      for (const dir of dirs) {
        const fullPath = path.join(rootDir, dir.name);
        const norm = fullPath.toLowerCase().replace(/\\/g, '/');
        if (seen.has(norm)) continue;
        seen.add(norm);
        try {
          const project = this.analyzeProject(fullPath, dir.name);
          if (project && project.actions.length > 0) projects.push(project);
        } catch (e) {
          console.error(`[Scanner] Error scanning ${fullPath}:`, e);
        }
      }
    }
    return projects;
  }

  /** Merge auto-discovered with user-defined projects. User wins. */
  static merge(auto: DiscoveredProject[], userProjects: UserProject[] = []): DiscoveredProject[] {
    const result: DiscoveredProject[] = [];
    const userById = new Map(userProjects.map(p => [p.id, p]));
    const userByPath = new Map(userProjects.map(p => [p.path.toLowerCase().replace(/\\/g, '/'), p]));
    const consumedUserIds = new Set<string>();

    // Pass 1: enrich auto-discovered projects with matching user config
    for (const a of auto) {
      const normPath = a.path.toLowerCase().replace(/\\/g, '/');
      const u = userById.get(a.id) || userByPath.get(normPath);
      if (u) {
        consumedUserIds.add(u.id);
        result.push(WorkspaceScanner.mergeProject(a, u));
      } else {
        result.push(a);
      }
    }

    // Pass 2: add user-only projects (paths not auto-discovered)
    for (const u of userProjects) {
      if (consumedUserIds.has(u.id)) continue;
      result.push(WorkspaceScanner.fromUser(u));
    }
    return result;
  }

  static fromUser(u: UserProject): DiscoveredProject {
    const actions: DiscoveredAction[] = [];
    for (const g of u.groups || []) {
      for (const a of g.actions) {
        actions.push({
          id: a.id,
          label: a.label,
          command: a.command,
          type: a.type,
          category: g.name,
          cwd: a.cwd,
          port: (a as any).port,
          promptFor: a.promptFor,
          chain: a.chain,
          source: 'user',
        });
      }
    }
    return {
      id: u.id,
      name: u.name,
      path: u.path,
      type: 'User',
      group: u.group,
      nodeVersion: u.nodeVersion,
      description: u.description,
      quickLinks: u.quickLinks || [],
      actions,
      envVars: u.envVars,
      notes: u.notes,
      source: 'user',
    };
  }

  static mergeProject(auto: DiscoveredProject, user: UserProject): DiscoveredProject {
    // User actions override auto by id; otherwise add
    const actionMap = new Map<string, DiscoveredAction>();
    for (const a of auto.actions) actionMap.set(a.id, a);
    for (const g of user.groups || []) {
      for (const a of g.actions) {
        actionMap.set(a.id, {
          id: a.id,
          label: a.label,
          command: a.command,
          type: a.type,
          category: g.name,
          cwd: a.cwd,
          port: (a as any).port,
          promptFor: a.promptFor,
          chain: a.chain,
          source: 'user',
        });
      }
    }
    return {
      ...auto,
      name: user.name || auto.name,
      group: user.group || auto.group,
      nodeVersion: user.nodeVersion || auto.nodeVersion,
      description: user.description || auto.description,
      quickLinks: [...(auto.quickLinks || []), ...(user.quickLinks || [])],
      actions: Array.from(actionMap.values()),
      envVars: user.envVars,
      notes: user.notes,
      source: 'merged',
    };
  }

  private analyzeProject(fullPath: string, dirName: string): DiscoveredProject | null {
    let files: string[];
    try { files = fs.readdirSync(fullPath); } catch { return null; }

    const project: DiscoveredProject = {
      id: dirName, name: dirName, path: fullPath, type: 'unknown',
      version: '', actions: [], quickLinks: [], source: 'auto',
    };
    const types: string[] = [];
    const slnFiles = files.filter(f => f.endsWith('.sln'));
    const hasSrc = files.includes('src');

    if (slnFiles.length > 0 && hasSrc) {
      types.push('.NET Solution');
      const solutionName = slnFiles[0].replace('.sln', '');
      project.name = solutionName;

      const srcPath = path.join(fullPath, 'src');
      let srcDirs: string[] = [];
      try { srcDirs = fs.readdirSync(srcPath); } catch {}

      // API project
      const apiDir = srcDirs.find(d => d.toLowerCase().includes('.api'));
      if (apiDir) {
        const apiPath = path.join(srcPath, apiDir);
        const apiCwd = path.relative(fullPath, apiPath);
        let apiUrl = 'http://localhost:5000';
        let swaggerPath = '';
        try {
          const launchPath = path.join(apiPath, 'Properties', 'launchSettings.json');
          if (fs.existsSync(launchPath)) {
            const launch = JSON.parse(fs.readFileSync(launchPath, 'utf-8'));
            const profiles = launch.profiles || {};
            for (const [key, profile] of Object.entries(profiles)) {
              const p = profile as LaunchProfile;
              if (p.applicationUrl && !key.includes('IIS') && !key.includes('Docker')) {
                // Take first http URL only (no https for local dev)
                apiUrl = p.applicationUrl.split(';').find(u => u.startsWith('http://')) || p.applicationUrl.split(';')[0];
              }
              if (p.launchUrl) swaggerPath = p.launchUrl;
            }
          }
        } catch {}
        let apiPort: number | undefined;
        try { if (apiUrl) apiPort = parseInt(new URL(apiUrl).port, 10); } catch {}
        project.actions.push(
          { id: 'api-run', label: 'Start API', command: `dotnet run --project ${apiCwd}`, category: 'Backend', port: apiPort, type: 'long-running', source: 'auto' },
          { id: 'api-watch', label: 'Start API (hot-reload)', command: `dotnet watch run --project ${apiCwd}`, category: 'Backend', port: apiPort, type: 'long-running', source: 'auto' },
          { id: 'api-build', label: 'Build API', command: `dotnet build ${apiCwd}`, category: 'Backend', type: 'one-shot', source: 'auto' },
        );
        project.quickLinks.push({ label: 'API root', url: apiUrl, healthCheck: true });
        if (swaggerPath) {
          const fullSwagger = swaggerPath.startsWith('http') ? swaggerPath : `${apiUrl}/${swaggerPath}`;
          project.quickLinks.push({ label: 'Swagger', url: fullSwagger });
        }
      }

      // Client project (Angular usually has ClientApp)
      const clientDir = srcDirs.find(d => d.toLowerCase().includes('.client'));
      if (clientDir) {
        const clientPath = path.join(srcPath, clientDir);
        const clientAppPath = path.join(clientPath, 'ClientApp');
        let frontendPath = clientPath;
        let hasFrontend = false;
        if (fs.existsSync(clientAppPath) && fs.existsSync(path.join(clientAppPath, 'package.json'))) {
          frontendPath = clientAppPath; hasFrontend = true;
        } else if (fs.existsSync(path.join(clientPath, 'package.json'))) {
          frontendPath = clientPath; hasFrontend = true;
        }
        if (hasFrontend) {
          let nodeVersion = '';
          for (const candidate of ['.node-version', '.nvmrc']) {
            const f = path.join(frontendPath, candidate);
            if (fs.existsSync(f)) {
              try { nodeVersion = fs.readFileSync(f, 'utf-8').trim().replace(/^v/, ''); break; } catch {}
            }
          }
          let framework = 'Node';
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(frontendPath, 'package.json'), 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['@angular/core']) framework = 'Angular';
            else if (deps['react']) framework = 'React';
            else if (deps['vue']) framework = 'Vue';
            else if (deps['next']) framework = 'Next.js';
            else if (deps['svelte']) framework = 'Svelte';
          } catch {}
          types.push(framework);
          if (nodeVersion) project.nodeVersion = nodeVersion;
          const fePort = framework === 'Angular' ? 4200 : framework === 'Next.js' ? 3000 : framework === 'React' ? 3000 : 5173;
          const feActions: DiscoveredAction[] = [
            { id: 'fe-start', label: `Start ${framework}`, command: 'npm start', category: 'Frontend', port: fePort, cwd: frontendPath, type: 'long-running', source: 'auto' },
            { id: 'fe-install', label: 'npm install', command: 'npm install', category: 'Frontend', cwd: frontendPath, type: 'one-shot', source: 'auto' },
            { id: 'fe-build', label: 'Build', command: 'npm run build', category: 'Frontend', cwd: frontendPath, type: 'one-shot', source: 'auto' },
            { id: 'fe-test', label: 'Test', command: 'npm test', category: 'Frontend', cwd: frontendPath, type: 'one-shot', source: 'auto' },
          ];
          project.actions.push(...feActions);
          project.quickLinks.push({ label: `${framework} dev`, url: `http://localhost:${fePort}`, healthCheck: true });
          if (nodeVersion) project.version = `.NET + ${framework} (Node ${nodeVersion})`;
        }
      }

      // Solution-level
      project.actions.push(
        { id: 'sln-build', label: 'Build Solution', command: 'dotnet build', category: 'Solution', type: 'one-shot', source: 'auto' },
        { id: 'sln-clean', label: 'Clean Solution', command: 'dotnet clean', category: 'Solution', type: 'one-shot', source: 'auto' },
        { id: 'sln-restore', label: 'NuGet restore', command: 'dotnet restore', category: 'Solution', type: 'one-shot', source: 'auto' },
        { id: 'sln-test', label: 'Run Tests', command: 'dotnet test', category: 'Solution', type: 'one-shot', source: 'auto' },
      );

      if (files.includes('docker-compose.yml') || files.includes('docker-compose.yaml')) {
        types.push('Docker');
        project.actions.push(
          { id: 'docker-up', label: 'Compose Up', command: 'docker-compose up -d', category: 'Docker', type: 'one-shot', source: 'auto' },
          { id: 'docker-down', label: 'Compose Down', command: 'docker-compose down', category: 'Docker', type: 'one-shot', source: 'auto' },
          { id: 'docker-logs', label: 'Compose Logs', command: 'docker-compose logs -f', category: 'Docker', type: 'long-running', source: 'auto' },
        );
      }
    } else if (files.some(f => f.endsWith('.csproj'))) {
      types.push('.NET');
      project.actions.push(
        { id: 'dotnet-run', label: 'Run', command: 'dotnet run', category: 'Backend', type: 'long-running', source: 'auto' },
        { id: 'dotnet-watch', label: 'Watch', command: 'dotnet watch run', category: 'Backend', type: 'long-running', source: 'auto' },
        { id: 'dotnet-build', label: 'Build', command: 'dotnet build', category: 'Build', type: 'one-shot', source: 'auto' },
      );
    } else if (slnFiles.length > 0) {
      types.push('.NET Solution');
      project.actions.push(
        { id: 'sln-build', label: 'Build Solution', command: 'dotnet build', category: 'Build', type: 'one-shot', source: 'auto' },
      );
    }

    // Standalone Node.js
    if (files.includes('package.json') && !types.some(t => ['Angular', 'React', 'Vue', 'Next.js', 'Svelte'].includes(t))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(fullPath, 'package.json'), 'utf-8'));
        if (pkg.name) project.name = pkg.name;
        if (pkg.scripts) {
          if (!types.length) types.push('Node');
          for (const scriptName of Object.keys(pkg.scripts)) {
            if (['postinstall', 'preinstall', 'prepublish', 'prepare'].includes(scriptName)) continue;
            project.actions.push({
              id: `npm-${scriptName}`, label: `npm run ${scriptName}`, command: `npm run ${scriptName}`,
              category: 'Node', type: scriptName === 'start' || scriptName === 'dev' ? 'long-running' : 'one-shot', source: 'auto',
            });
          }
        }
        // Node version
        for (const candidate of ['.node-version', '.nvmrc']) {
          const f = path.join(fullPath, candidate);
          if (fs.existsSync(f)) {
            try { project.nodeVersion = fs.readFileSync(f, 'utf-8').trim().replace(/^v/, ''); break; } catch {}
          }
        }
      } catch {}
    }

    // Docker (standalone)
    if (!types.includes('Docker') && (files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'))) {
      types.push('Docker');
      project.actions.push(
        { id: 'docker-up', label: 'Compose Up', command: 'docker-compose up -d', category: 'Docker', type: 'one-shot', source: 'auto' },
        { id: 'docker-down', label: 'Compose Down', command: 'docker-compose down', category: 'Docker', type: 'one-shot', source: 'auto' },
        { id: 'docker-logs', label: 'Compose Logs', command: 'docker-compose logs -f', category: 'Docker', type: 'long-running', source: 'auto' },
      );
    }

    // Git
    if (fs.existsSync(path.join(fullPath, '.git'))) {
      project.actions.push(
        { id: 'git-status', label: 'Status', command: 'git status', category: 'Git', type: 'one-shot', source: 'auto' },
        { id: 'git-pull', label: 'Pull', command: 'git pull', category: 'Git', type: 'one-shot', source: 'auto' },
        { id: 'git-fetch', label: 'Fetch all', command: 'git fetch --all --prune', category: 'Git', type: 'one-shot', source: 'auto' },
        { id: 'git-log', label: 'Log (20)', command: 'git log --oneline -20 --graph --decorate', category: 'Git', type: 'one-shot', source: 'auto' },
      );
    }

    // IDE
    project.actions.push(
      { id: 'open-vscode', label: 'Open VS Code', command: 'code .', category: 'IDE', type: 'open', source: 'auto' },
      { id: 'open-explorer', label: 'Open Explorer', command: process.platform === 'win32' ? 'explorer .' : 'xdg-open .', category: 'IDE', type: 'open', source: 'auto' },
    );

    if (project.actions.length === 0) return null;
    project.type = types.join(' + ') || 'Generic';
    if (!project.version) project.version = project.type;
    return project;
  }
}

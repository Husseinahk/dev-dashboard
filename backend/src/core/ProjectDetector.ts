import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Inspects a folder and reports the project markers it finds, together with a
 * catalogue of suggested actions/quick links the user can opt-in to.
 *
 * Unlike the old WorkspaceScanner this NEVER imports anything automatically —
 * it just describes what's there. The user picks what to enable via the UI.
 */

export interface DetectedAction {
  id: string;
  label: string;
  command: string;
  type: 'long-running' | 'one-shot' | 'open' | 'prompt' | 'chain';
  category: string;
  cwd?: string;
  port?: number;
}

export interface DetectedQuickLink {
  label: string;
  url: string;
  healthCheck?: boolean;
}

export interface DetectedControl {
  /** Stable id ("frontend", "backend", "solution", "docker", "git", "ide", "node") */
  id: string;
  /** Display name */
  label: string;
  /** Hint shown in the UI */
  description: string;
  /** Default-on when the marker is found */
  recommended: boolean;
  actions: DetectedAction[];
  quickLinks?: DetectedQuickLink[];
}

export interface DetectionResult {
  /** Suggested project id (folder name, lower-case, dot-stripped) */
  suggestedId: string;
  /** Suggested display name (.sln name if present, else folder name) */
  suggestedName: string;
  /** Detected primary type, e.g. ".NET Solution + Angular + Docker" */
  type: string;
  /** Detected node version (if any) */
  nodeVersion?: string;
  /** Whether this folder exists */
  exists: boolean;
  /** Whether this folder contains a .git directory */
  isGitRepo: boolean;
  gitBranch?: string;
  gitRemote?: string;
  /** Available control groups the user can enable */
  controls: DetectedControl[];
  /** Notes / warnings for the UI */
  notes: string[];
}

interface LaunchProfile { applicationUrl?: string; launchUrl?: string; }

export class ProjectDetector {
  detect(folderPath: string): DetectionResult {
    const notes: string[] = [];
    const result: DetectionResult = {
      suggestedId: '',
      suggestedName: '',
      type: 'Generic',
      exists: false,
      isGitRepo: false,
      controls: [],
      notes,
    };

    if (!fs.existsSync(folderPath)) {
      notes.push('Folder does not exist.');
      return result;
    }
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      notes.push('Path is not a directory.');
      return result;
    }
    result.exists = true;

    const folderName = path.basename(folderPath);
    result.suggestedId = folderName;
    result.suggestedName = folderName;

    let files: string[] = [];
    try { files = fs.readdirSync(folderPath); } catch { notes.push('Cannot read directory.'); return result; }

    // ---- Git ----
    const gitDir = path.join(folderPath, '.git');
    if (fs.existsSync(gitDir)) {
      result.isGitRepo = true;
      try {
        result.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: folderPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      } catch {}
      try {
        result.gitRemote = execSync('git remote get-url origin', { cwd: folderPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      } catch {}
      result.controls.push({
        id: 'git',
        label: 'Git',
        description: result.gitBranch ? `Branch: ${result.gitBranch}` : 'Git repository',
        recommended: true,
        actions: [
          { id: 'git-status', label: 'Status', command: 'git status', category: 'Git', type: 'one-shot' },
          { id: 'git-pull',   label: 'Pull',   command: 'git pull',   category: 'Git', type: 'one-shot' },
          { id: 'git-fetch',  label: 'Fetch all', command: 'git fetch --all --prune', category: 'Git', type: 'one-shot' },
          { id: 'git-log',    label: 'Log (20)',  command: 'git log --oneline -20 --graph --decorate', category: 'Git', type: 'one-shot' },
        ],
      });
    }

    // ---- .NET Solution (sln + src) ----
    const slnFiles = files.filter(f => f.toLowerCase().endsWith('.sln'));
    const hasSrc = files.includes('src');
    const types: string[] = [];

    if (slnFiles.length > 0) {
      const slnName = slnFiles[0].replace(/\.sln$/i, '');
      result.suggestedName = slnName;
      types.push('.NET Solution');

      const solutionActions: DetectedAction[] = [
        { id: 'sln-build',   label: 'Build Solution', command: 'dotnet build',   category: 'Solution', type: 'one-shot' },
        { id: 'sln-clean',   label: 'Clean Solution', command: 'dotnet clean',   category: 'Solution', type: 'one-shot' },
        { id: 'sln-restore', label: 'NuGet restore',  command: 'dotnet restore', category: 'Solution', type: 'one-shot' },
        { id: 'sln-test',    label: 'Run Tests',      command: 'dotnet test',    category: 'Solution', type: 'one-shot' },
      ];
      result.controls.push({
        id: 'solution',
        label: 'Solution',
        description: `${slnFiles[0]} — build/clean/restore/test`,
        recommended: true,
        actions: solutionActions,
      });

      if (hasSrc) {
        const srcPath = path.join(folderPath, 'src');
        let srcDirs: string[] = [];
        try { srcDirs = fs.readdirSync(srcPath); } catch {}

        // ---- API project (.api in name) ----
        const apiDir = srcDirs.find(d => /\.api$/i.test(d) || d.toLowerCase().endsWith('.api'));
        if (apiDir) {
          const apiPath = path.join(srcPath, apiDir);
          const apiCwdRel = path.relative(folderPath, apiPath);
          let apiUrl = 'http://localhost:5000';
          let swaggerPath = '';
          try {
            const launchPath = path.join(apiPath, 'Properties', 'launchSettings.json');
            if (fs.existsSync(launchPath)) {
              const launch = JSON.parse(fs.readFileSync(launchPath, 'utf-8'));
              for (const [key, profile] of Object.entries<any>(launch.profiles || {})) {
                const p = profile as LaunchProfile;
                if (p.applicationUrl && !key.includes('IIS') && !key.includes('Docker')) {
                  apiUrl = p.applicationUrl.split(';').find((u: string) => u.startsWith('http://')) || p.applicationUrl.split(';')[0];
                }
                if (p.launchUrl) swaggerPath = p.launchUrl;
              }
            }
          } catch {}
          let apiPort: number | undefined;
          try { if (apiUrl) apiPort = parseInt(new URL(apiUrl).port, 10); } catch {}

          const links: DetectedQuickLink[] = [{ label: 'API root', url: apiUrl, healthCheck: true }];
          if (swaggerPath) {
            const fullSwagger = swaggerPath.startsWith('http') ? swaggerPath : `${apiUrl}/${swaggerPath}`;
            links.push({ label: 'Swagger', url: fullSwagger });
          }

          result.controls.push({
            id: 'backend',
            label: 'Backend (.NET API)',
            description: `${apiDir} on ${apiUrl}`,
            recommended: true,
            actions: [
              { id: 'api-run',   label: 'Start API',              command: `dotnet run --project ${apiCwdRel}`,       category: 'Backend', port: apiPort, type: 'long-running' },
              { id: 'api-watch', label: 'Start API (hot-reload)', command: `dotnet watch run --project ${apiCwdRel}`, category: 'Backend', port: apiPort, type: 'long-running' },
              { id: 'api-build', label: 'Build API',              command: `dotnet build ${apiCwdRel}`,               category: 'Backend',                type: 'one-shot' },
            ],
            quickLinks: links,
          });
          types.push('API');
        }

        // ---- Client (.client in name with ClientApp/package.json) ----
        const clientDir = srcDirs.find(d => /\.client$/i.test(d) || d.toLowerCase().endsWith('.client'));
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
            const fe = this.describeFrontend(frontendPath);
            if (fe.nodeVersion) result.nodeVersion = fe.nodeVersion;
            types.push(fe.framework);
            result.controls.push({
              id: 'frontend',
              label: `Frontend (${fe.framework})`,
              description: `${path.relative(folderPath, frontendPath)} on http://localhost:${fe.port}`,
              recommended: true,
              actions: fe.actions.map(a => ({ ...a, cwd: frontendPath })),
              quickLinks: [{ label: `${fe.framework} dev`, url: `http://localhost:${fe.port}`, healthCheck: true }],
            });
          }
        }
      }
    } else if (files.some(f => f.endsWith('.csproj'))) {
      types.push('.NET');
      result.controls.push({
        id: 'backend',
        label: 'Backend (.NET)',
        description: 'Standalone .csproj',
        recommended: true,
        actions: [
          { id: 'dotnet-run',   label: 'Run',   command: 'dotnet run',       category: 'Backend', type: 'long-running' },
          { id: 'dotnet-watch', label: 'Watch', command: 'dotnet watch run', category: 'Backend', type: 'long-running' },
          { id: 'dotnet-build', label: 'Build', command: 'dotnet build',     category: 'Build',   type: 'one-shot' },
        ],
      });
    }

    // ---- Standalone Node ----
    if (files.includes('package.json') && !result.controls.find(c => c.id === 'frontend')) {
      const fe = this.describeFrontend(folderPath);
      if (fe.nodeVersion) result.nodeVersion = fe.nodeVersion;
      if (fe.framework !== 'Node') types.push(fe.framework);
      else types.push('Node');
      result.controls.push({
        id: 'node',
        label: fe.framework === 'Node' ? 'Node scripts' : `Frontend (${fe.framework})`,
        description: `package.json — ${fe.scripts.length} scripts`,
        recommended: true,
        actions: fe.actions,
        quickLinks: fe.framework !== 'Node' ? [{ label: `${fe.framework} dev`, url: `http://localhost:${fe.port}`, healthCheck: true }] : [],
      });
    }

    // ---- Docker ----
    if (files.includes('docker-compose.yml') || files.includes('docker-compose.yaml')) {
      types.push('Docker');
      result.controls.push({
        id: 'docker',
        label: 'Docker Compose',
        description: 'docker-compose.yml — up/down/logs',
        recommended: true,
        actions: [
          { id: 'docker-up',   label: 'Compose Up',   command: 'docker-compose up -d',   category: 'Docker', type: 'one-shot' },
          { id: 'docker-down', label: 'Compose Down', command: 'docker-compose down',    category: 'Docker', type: 'one-shot' },
          { id: 'docker-logs', label: 'Compose Logs', command: 'docker-compose logs -f', category: 'Docker', type: 'long-running' },
        ],
      });
    }

    // ---- IDE (always offered, off by default) ----
    result.controls.push({
      id: 'ide',
      label: 'IDE / Open',
      description: 'Open in VS Code, Explorer, etc.',
      recommended: false,
      actions: [
        { id: 'open-vscode',   label: 'Open VS Code',  command: 'code .',     category: 'IDE', type: 'open' },
        { id: 'open-explorer', label: 'Open Explorer', command: process.platform === 'win32' ? 'explorer .' : 'xdg-open .', category: 'IDE', type: 'open' },
      ],
    });

    result.type = types.length ? types.join(' + ') : 'Generic';
    if (result.controls.length === 0) notes.push('No project markers found in this folder.');
    return result;
  }

  private describeFrontend(folderPath: string): {
    framework: string;
    nodeVersion?: string;
    port: number;
    scripts: string[];
    actions: DetectedAction[];
  } {
    let framework = 'Node';
    let scripts: string[] = [];
    let nodeVersion: string | undefined;

    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(folderPath, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['@angular/core']) framework = 'Angular';
      else if (deps['next']) framework = 'Next.js';
      else if (deps['react']) framework = 'React';
      else if (deps['vue']) framework = 'Vue';
      else if (deps['svelte']) framework = 'Svelte';
      scripts = Object.keys(pkg.scripts || {});
    } catch {}

    for (const candidate of ['.node-version', '.nvmrc']) {
      const f = path.join(folderPath, candidate);
      if (fs.existsSync(f)) {
        try { nodeVersion = fs.readFileSync(f, 'utf-8').trim().replace(/^v/, ''); break; } catch {}
      }
    }

    const port = framework === 'Angular' ? 4200
      : framework === 'Next.js' ? 3000
      : framework === 'React' ? 3000
      : framework === 'Vue' || framework === 'Svelte' ? 5173
      : 3000;

    const actions: DetectedAction[] = [];
    if (framework !== 'Node') {
      actions.push(
        { id: 'fe-start',   label: `Start ${framework}`, command: 'npm start',     category: 'Frontend', type: 'long-running', port },
        { id: 'fe-install', label: 'npm install',        command: 'npm install',   category: 'Frontend', type: 'one-shot' },
        { id: 'fe-build',   label: 'Build',              command: 'npm run build', category: 'Frontend', type: 'one-shot' },
        { id: 'fe-test',    label: 'Test',               command: 'npm test',      category: 'Frontend', type: 'one-shot' },
      );
    } else {
      // Standalone Node — emit one action per script
      for (const s of scripts) {
        if (['postinstall', 'preinstall', 'prepublish', 'prepare'].includes(s)) continue;
        actions.push({
          id: `npm-${s}`,
          label: `npm run ${s}`,
          command: `npm run ${s}`,
          category: 'Node',
          type: s === 'start' || s === 'dev' ? 'long-running' : 'one-shot',
        });
      }
    }
    return { framework, nodeVersion, port, scripts, actions };
  }
}

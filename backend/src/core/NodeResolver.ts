import fs from 'fs';
import path from 'path';

/**
 * Resolves an NVM-Windows node version directory.
 * Lookup order:
 *   1. Explicit override (e.g. global setting)
 *   2. NVM_HOME env var
 *   3. %APPDATA%\nvm (default install)
 */
export class NodeResolver {
  private nvmRoot: string | null;

  constructor(overridePath?: string) {
    this.nvmRoot = this.resolveNvmRoot(overridePath);
  }

  private resolveNvmRoot(override?: string): string | null {
    const candidates = [
      override,
      process.env.NVM_HOME,
      process.env.APPDATA ? path.join(process.env.APPDATA, 'nvm') : null,
    ].filter(Boolean) as string[];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  /** List installed Node versions (e.g. ["20.20.1", "18.20.8", "14.21.2"]) */
  listVersions(): string[] {
    if (!this.nvmRoot) return [];
    try {
      return fs.readdirSync(this.nvmRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^v\d+/.test(d.name))
        .map(d => d.name.replace(/^v/, ''))
        .sort((a, b) => {
          const pa = a.split('.').map(Number);
          const pb = b.split('.').map(Number);
          for (let i = 0; i < 3; i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
          }
          return 0;
        });
    } catch {
      return [];
    }
  }

  /** Find best-matching directory for a version spec like "14", "14.21", "v20.20.1" */
  findVersionDir(spec: string): string | null {
    if (!this.nvmRoot || !spec) return null;
    const cleaned = spec.replace(/^v/, '').trim();
    const versions = this.listVersions();
    const match = versions.find(v => v === cleaned || v.startsWith(cleaned + '.'));
    return match ? path.join(this.nvmRoot, 'v' + match) : null;
  }

  /**
   * Build env vars that prepend the requested Node to PATH for one child process,
   * without touching the global shell.
   */
  buildEnv(versionSpec?: string, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const env = { ...baseEnv };
    if (!versionSpec) return env;
    const dir = this.findVersionDir(versionSpec);
    if (!dir) return env;
    // Prepend node dir + npm global to PATH
    const npmGlobal = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '';
    const segments = [dir, npmGlobal].filter(Boolean);
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PATH = segments.join(sep) + sep + (env.PATH || '');
    env.Path = env.PATH;
    env.DEVCONTROL_NODE_VERSION = versionSpec;
    return env;
  }
}

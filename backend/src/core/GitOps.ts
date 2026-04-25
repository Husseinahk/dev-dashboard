import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const exec = promisify(execFile);

/** Wraps a single git invocation with cwd + environment for credential helpers. */
async function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  try {
    const r = await exec('git', args, { cwd, env: { ...process.env, ...env }, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: r.stdout, stderr: r.stderr };
  } catch (e: any) {
    // execFile rejects on non-zero exit; surface stderr
    const msg = e?.stderr?.toString?.() || e?.message || 'git failed';
    throw new Error(msg);
  }
}

export interface GitStatusFile { path: string; index: string; worktree: string; }
export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  files: GitStatusFile[];
  remoteUrl?: string;
}

export interface GitLogEntry { hash: string; shortHash: string; subject: string; author: string; date: string; }

export class GitOps {
  static isRepo(cwd: string): boolean {
    return fs.existsSync(path.join(cwd, '.git'));
  }

  static async init(cwd: string): Promise<void> {
    if (!fs.existsSync(cwd)) fs.mkdirSync(cwd, { recursive: true });
    await git(cwd, ['init']);
  }

  static async status(cwd: string): Promise<GitStatus> {
    if (!this.isRepo(cwd)) return { isRepo: false, files: [] };
    const { stdout } = await git(cwd, ['status', '--porcelain=2', '--branch']);
    const lines = stdout.split('\n');
    const files: GitStatusFile[] = [];
    let branch: string | undefined;
    let upstream: string | undefined;
    let ahead = 0, behind = 0;
    for (const ln of lines) {
      if (ln.startsWith('# branch.head ')) branch = ln.substring('# branch.head '.length).trim();
      else if (ln.startsWith('# branch.upstream ')) upstream = ln.substring('# branch.upstream '.length).trim();
      else if (ln.startsWith('# branch.ab ')) {
        const m = ln.match(/\+(\d+)\s+-(\d+)/);
        if (m) { ahead = +m[1]; behind = +m[2]; }
      } else if (ln.startsWith('1 ') || ln.startsWith('2 ')) {
        const parts = ln.split(' ');
        const xy = parts[1];
        const filePath = ln.startsWith('2 ')
          ? parts.slice(9).join(' ').split('\t')[0]
          : parts.slice(8).join(' ');
        files.push({ path: filePath, index: xy[0], worktree: xy[1] });
      } else if (ln.startsWith('? ')) {
        files.push({ path: ln.substring(2), index: '?', worktree: '?' });
      }
    }
    let remoteUrl: string | undefined;
    try { remoteUrl = (await git(cwd, ['config', '--get', 'remote.origin.url'])).stdout.trim(); } catch {}
    return { isRepo: true, branch, upstream, ahead, behind, files, remoteUrl };
  }

  static async log(cwd: string, n = 30): Promise<GitLogEntry[]> {
    if (!this.isRepo(cwd)) return [];
    const sep = '\u001F';
    const fmt = ['%H', '%h', '%s', '%an', '%ad'].join(sep);
    const { stdout } = await git(cwd, ['log', `-n${n}`, `--pretty=format:${fmt}`, '--date=iso']);
    return stdout.split('\n').filter(Boolean).map(line => {
      const [hash, shortHash, subject, author, date] = line.split(sep);
      return { hash, shortHash, subject, author, date };
    });
  }

  static async branches(cwd: string): Promise<{ current: string | null; local: string[]; remote: string[] }> {
    if (!this.isRepo(cwd)) return { current: null, local: [], remote: [] };
    const { stdout } = await git(cwd, ['branch', '-a', '--format=%(HEAD) %(refname:short)']);
    let current: string | null = null;
    const local: string[] = [];
    const remote: string[] = [];
    for (const raw of stdout.split('\n').filter(Boolean)) {
      const isHead = raw.startsWith('* ');
      const name = raw.substring(2).trim();
      if (!name) continue;
      if (isHead) current = name;
      if (name.startsWith('remotes/')) remote.push(name.substring('remotes/'.length));
      else local.push(name);
    }
    return { current, local, remote };
  }

  static async checkout(cwd: string, branch: string, create = false): Promise<void> {
    await git(cwd, create ? ['checkout', '-b', branch] : ['checkout', branch]);
  }

  static async pull(cwd: string): Promise<{ stdout: string; stderr: string }> {
    return git(cwd, ['pull', '--ff-only']);
  }

  static async fetch(cwd: string): Promise<{ stdout: string; stderr: string }> {
    return git(cwd, ['fetch', '--all', '--prune']);
  }

  static async push(cwd: string, opts?: { setUpstream?: boolean }): Promise<{ stdout: string; stderr: string }> {
    const args = ['push'];
    if (opts?.setUpstream) {
      const br = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
      args.push('-u', 'origin', br);
    }
    return git(cwd, args);
  }

  static async commit(cwd: string, message: string, addAll = true): Promise<{ stdout: string; stderr: string }> {
    if (addAll) await git(cwd, ['add', '-A']);
    return git(cwd, ['commit', '-m', message]);
  }

  static async stage(cwd: string, file: string): Promise<void> {
    await git(cwd, ['add', '--', file]);
  }

  static async unstage(cwd: string, file: string): Promise<void> {
    await git(cwd, ['reset', 'HEAD', '--', file]);
  }

  static async discard(cwd: string, file: string): Promise<void> {
    await git(cwd, ['checkout', '--', file]);
  }

  static async diff(cwd: string, file?: string, staged = false): Promise<string> {
    const args = ['diff', '--no-color'];
    if (staged) args.push('--cached');
    if (file) args.push('--', file);
    const { stdout } = await git(cwd, args);
    return stdout;
  }

  /**
   * Returns the three textual versions of a file needed for side-by-side review:
   *   head     — last committed content (HEAD:file)
   *   staged   — content currently in the index (:0:file)
   *   worktree — current on-disk content
   * Empty string if the version doesn't exist (e.g. untracked = head/staged empty).
   * Binary files are detected and returned as `null` for each side.
   */
  static async fileVersions(cwd: string, file: string): Promise<{ head: string | null; staged: string | null; worktree: string | null; binary: boolean }> {
    const fileAbs = path.join(cwd, file);
    let head: string | null = '';
    let staged: string | null = '';
    let worktree: string | null = '';
    let binary = false;

    // Quick binary heuristic on worktree file
    try {
      if (fs.existsSync(fileAbs)) {
        const buf = fs.readFileSync(fileAbs);
        if (buf.includes(0)) binary = true;
        worktree = binary ? null : buf.toString('utf8');
      } else {
        worktree = '';
      }
    } catch { worktree = ''; }

    if (!binary) {
      try {
        const r = await git(cwd, ['show', `HEAD:${file.replace(/\\/g, '/')}`]);
        head = r.stdout;
      } catch { head = ''; }
      try {
        const r = await git(cwd, ['show', `:${file.replace(/\\/g, '/')}`]);
        staged = r.stdout;
      } catch { staged = head; }
    } else {
      head = staged = null;
    }
    return { head, staged, worktree, binary };
  }

  static async setRemote(cwd: string, url: string, name = 'origin'): Promise<void> {
    try { await git(cwd, ['remote', 'remove', name]); } catch {}
    await git(cwd, ['remote', 'add', name, url]);
  }
}

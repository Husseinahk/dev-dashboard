import { spawn, exec, ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';
import { EventEmitter } from 'events';
import { NodeResolver } from './NodeResolver';

export interface RunningProcess {
  id: string;
  projectId?: string;
  actionId?: string;
  name: string;
  command: string;
  cwd: string;
  pid: number | undefined;
  status: 'starting' | 'running' | 'ready' | 'stopped' | 'error';
  startedAt: number;
  exitCode?: number;
  port?: number;
  nodeVersion?: string;
  isLongRunning?: boolean;
}

interface StartOptions {
  id: string;
  projectId?: string;
  actionId?: string;
  name: string;
  command: string;
  cwd: string;
  port?: number;
  nodeVersion?: string;
  isLongRunning?: boolean;
  env?: Record<string, string>;
  /** If true, do not log to historical buffer (for spawn-and-forget like 'open vscode') */
  ephemeral?: boolean;
}

const READY_PATTERNS = [
  /compiled successfully/i,
  /listening on:?\s*https?:\/\//i,
  /open your browser on http/i,
  /\bready\b.*started server/i,
  /server running at http/i,
  /local:\s+http:\/\/localhost/i,
  /webpack compiled/i,
  /started server on/i,
  /now listening on/i,
  /application started/i,
  /\bdev server running\b/i,
  /vite\b.*ready/i,
];

const MAX_LOG_CHARS = 250000;

export class ProcessManager {
  private processes = new Map<string, { proc: ChildProcessWithoutNullStreams; info: RunningProcess; readyResolved?: () => void }>();
  private historicalLogs = new Map<string, string>();
  private readyWaiters = new Map<string, Promise<void>>();
  private nodeResolver: NodeResolver;

  constructor(private bus: EventEmitter, nodeResolver?: NodeResolver) {
    this.nodeResolver = nodeResolver || new NodeResolver();
  }

  setNodeResolver(r: NodeResolver) {
    this.nodeResolver = r;
  }

  startProcess(opts: StartOptions): RunningProcess {
    const { id, name, command, cwd } = opts;

    // Already running? Don't double-start.
    const existing = this.processes.get(id);
    if (existing && (existing.info.status === 'running' || existing.info.status === 'ready' || existing.info.status === 'starting')) {
      this.bus.emit('process:log', { id, type: 'info', data: `\n[ALREADY RUNNING] ${name}\n` });
      return existing.info;
    }

    if (existing) this.processes.delete(id);

    const env = this.nodeResolver.buildEnv(opts.nodeVersion, { ...process.env, ...(opts.env || {}) });

    const isWin = os.platform() === 'win32';
    // On Windows, the env we pass to spawn doesn't always include System32, so
    // resolving "cmd.exe" via PATH can fail with ENOENT. Use ComSpec (always
    // absolute) or a hard-coded fallback so the shell is always findable.
    const shell = isWin
      ? (process.env.ComSpec || `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\cmd.exe`)
      : 'bash';
    const args = isWin ? ['/d', '/s', '/c', command] : ['-c', command];

    // Make sure the child env always has System32 on PATH so child commands
    // (where, taskkill, npm.cmd shims, etc.) work even if the parent env was
    // stripped down by NodeResolver or callers.
    if (isWin) {
      const sys32 = `${process.env.SystemRoot || 'C:\\Windows'}\\System32`;
      const sysRoot = process.env.SystemRoot || 'C:\\Windows';
      const cur = env.PATH || env.Path || '';
      if (!cur.toLowerCase().includes(sys32.toLowerCase())) {
        const merged = `${sys32};${sysRoot};${cur}`;
        env.PATH = merged;
        env.Path = merged;
      }
    }

    const banner = this.banner(opts);

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(shell, args, { cwd, env, windowsHide: true });
    } catch (err: any) {
      const errMsg = `[SPAWN ERROR] ${err.message}\n`;
      this.appendHistorical(id, banner + errMsg);
      this.bus.emit('process:log', { id, type: 'stderr', data: banner + errMsg });
      throw err;
    }

    const info: RunningProcess = {
      id, projectId: opts.projectId, actionId: opts.actionId,
      name, command, cwd, pid: child.pid,
      status: 'starting', startedAt: Date.now(),
      port: opts.port, nodeVersion: opts.nodeVersion, isLongRunning: opts.isLongRunning,
    };
    this.processes.set(id, { proc: child, info });

    if (!opts.ephemeral) {
      this.appendHistorical(id, banner);
      this.bus.emit('process:log', { id, type: 'info', data: banner });
    }
    this.broadcastStatus();

    // Setup ready promise
    const readyPromise = new Promise<void>((resolve) => {
      const entry = this.processes.get(id);
      if (entry) entry.readyResolved = resolve;
    });
    this.readyWaiters.set(id, readyPromise);

    // After 200ms, mark "running" if still alive (so chain can proceed for non-ready-pattern processes)
    setTimeout(() => {
      const entry = this.processes.get(id);
      if (entry && entry.info.status === 'starting') {
        entry.info.status = 'running';
        this.broadcastStatus();
      }
    }, 200);

    child.stdout.on('data', (buf) => {
      const txt = buf.toString();
      this.appendHistorical(id, txt);
      this.bus.emit('process:log', { id, type: 'stdout', data: txt });
      this.checkReady(id, txt);
    });
    child.stderr.on('data', (buf) => {
      const txt = buf.toString();
      this.appendHistorical(id, txt);
      this.bus.emit('process:log', { id, type: 'stderr', data: txt });
      this.checkReady(id, txt);
    });

    child.on('exit', (code) => {
      const entry = this.processes.get(id);
      if (!entry) return;
      const wasReady = entry.info.status === 'ready' || entry.info.status === 'running';
      entry.info.status = code === 0 ? 'stopped' : 'error';
      entry.info.exitCode = code ?? undefined;
      const exitMsg = `\n[EXIT ${code}] ${name}\n`;
      this.appendHistorical(id, exitMsg);
      this.bus.emit('process:log', { id, type: code === 0 ? 'info' : 'stderr', data: exitMsg });
      this.broadcastStatus();
      // Resolve ready waiter so chains don't hang
      if (entry.readyResolved) entry.readyResolved();
      if (code !== 0 && opts.isLongRunning && wasReady) {
        this.bus.emit('process:crash', { id, name, command, code });
      }
    });

    child.on('error', (err) => {
      const entry = this.processes.get(id);
      if (entry) entry.info.status = 'error';
      const errMsg = `[ERROR] ${err.message}\n`;
      this.appendHistorical(id, errMsg);
      this.bus.emit('process:log', { id, type: 'stderr', data: errMsg });
      this.broadcastStatus();
    });

    return info;
  }

  /**
   * Run a one-shot or chain. Returns when process started (long-running) or finished (one-shot/chain).
   */
  stopProcess(id: string): boolean {
    const entry = this.processes.get(id);
    if (!entry) return false;
    if (entry.info.status === 'stopped' || entry.info.status === 'error') return false;
    const pid = entry.proc.pid;
    const stopMsg = `\n[STOP] killing PID ${pid} (tree)...\n`;
    this.appendHistorical(id, stopMsg);
    this.bus.emit('process:log', { id, type: 'info', data: stopMsg });
    if (os.platform() === 'win32' && pid) {
      exec(`taskkill /PID ${pid} /T /F`, () => {
        entry.info.status = 'stopped';
        if (entry.readyResolved) entry.readyResolved();
        this.broadcastStatus();
      });
    } else {
      try { entry.proc.kill('SIGTERM'); } catch {}
      entry.info.status = 'stopped';
      this.broadcastStatus();
    }
    return true;
  }

  async restartProcess(id: string): Promise<RunningProcess | null> {
    const entry = this.processes.get(id);
    if (!entry) return null;
    const opts: StartOptions = {
      id,
      projectId: entry.info.projectId,
      actionId: entry.info.actionId,
      name: entry.info.name,
      command: entry.info.command,
      cwd: entry.info.cwd,
      port: entry.info.port,
      nodeVersion: entry.info.nodeVersion,
      isLongRunning: entry.info.isLongRunning,
    };
    this.stopProcess(id);
    await new Promise(r => setTimeout(r, 1200));
    this.processes.delete(id);
    return this.startProcess(opts);
  }

  /**
   * Run a chain of actions sequentially.
   * For long-running steps, waits for ready-event (or 8s timeout) before starting next.
   */
  async runChain(chainId: string, steps: StartOptions[]): Promise<void> {
    this.bus.emit('process:log', { id: chainId, type: 'info', data: `\n[CHAIN START] ${steps.length} steps\n` });
    for (const [i, step] of steps.entries()) {
      this.bus.emit('process:log', { id: chainId, type: 'info', data: `\n[CHAIN STEP ${i + 1}/${steps.length}] ${step.name}\n` });
      const proc = this.startProcess(step);
      if (step.isLongRunning) {
        // Wait for ready or running, max 12s
        const waiter = this.readyWaiters.get(step.id);
        await Promise.race([
          waiter || Promise.resolve(),
          this.waitForStatus(step.id, ['ready', 'running'], 12000),
        ]);
        // Small spacing
        await new Promise(r => setTimeout(r, 400));
      } else {
        // Wait until process exits
        await this.waitForStatus(step.id, ['stopped', 'error'], 120000);
      }
    }
    this.bus.emit('process:log', { id: chainId, type: 'info', data: `\n[CHAIN COMPLETE]\n` });
  }

  private waitForStatus(id: string, states: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const entry = this.processes.get(id);
        if (!entry || states.includes(entry.info.status)) return resolve();
        if (Date.now() - start > timeoutMs) return resolve();
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  /** Replace the stored variables in a command template (e.g. {name}). */
  static interpolateCommand(tmpl: string, vars: Record<string, string>): string {
    return tmpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }

  getProcesses(): RunningProcess[] {
    return Array.from(this.processes.values()).map(p => p.info);
  }

  getProcess(id: string): RunningProcess | undefined {
    return this.processes.get(id)?.info;
  }

  getHistoricalLogs(id: string): string {
    return this.historicalLogs.get(id) || '';
  }

  getAllTabs(): { id: string; logs: string; isRunning: boolean; info?: RunningProcess }[] {
    const tabs: { id: string; logs: string; isRunning: boolean; info?: RunningProcess }[] = [];
    this.historicalLogs.forEach((logs, id) => {
      const entry = this.processes.get(id);
      tabs.push({
        id, logs,
        isRunning: !!entry && (entry.info.status === 'running' || entry.info.status === 'ready' || entry.info.status === 'starting'),
        info: entry?.info,
      });
    });
    return tabs;
  }

  clearLogs(id: string) {
    this.historicalLogs.delete(id);
    const entry = this.processes.get(id);
    if (entry && (entry.info.status === 'stopped' || entry.info.status === 'error')) {
      this.processes.delete(id);
    }
  }

  killAll(force = false) {
    for (const [id] of this.processes) {
      this.stopProcess(id);
    }
  }

  private banner(opts: StartOptions) {
    return `\n${'='.repeat(50)}\n[START] ${opts.name}\n  cmd: ${opts.command}\n  cwd: ${opts.cwd}${opts.nodeVersion ? `\n  node: v${opts.nodeVersion}` : ''}\n${'='.repeat(50)}\n`;
  }

  private appendHistorical(id: string, text: string) {
    const cur = this.historicalLogs.get(id) || '';
    let next = cur + text;
    if (next.length > MAX_LOG_CHARS) {
      next = '... [truncated] ...\n' + next.slice(-MAX_LOG_CHARS);
    }
    this.historicalLogs.set(id, next);
  }

  private checkReady(id: string, text: string) {
    const entry = this.processes.get(id);
    if (!entry || entry.info.status === 'ready') return;
    for (const pattern of READY_PATTERNS) {
      if (pattern.test(text)) {
        entry.info.status = 'ready';
        this.bus.emit('process:ready', { id, name: entry.info.name });
        this.broadcastStatus();
        if (entry.readyResolved) entry.readyResolved();
        break;
      }
    }
  }

  private broadcastStatus() {
    this.bus.emit('process:status-update', { processes: this.getProcesses() });
  }
}

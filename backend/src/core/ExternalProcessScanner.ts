import { exec } from 'child_process';
import { promisify } from 'util';

const pexec = promisify(exec);

export interface ExternalProcess {
  pid: number;
  port: number;
  name: string;            // e.g. "dotnet.exe", "node.exe"
  exePath?: string;        // full path to executable
  commandLine?: string;    // full command line (best effort)
  cwd?: string;            // best-effort working dir
  matchedProjectId?: string;
  matchedProjectName?: string;
}

/** Common dev/web ports we care about. Scan everything else only if requested. */
const COMMON_DEV_PORTS = [
  3000, 3001, 3030, 3333, 3500, 4000, 4173, 4200, 4444, 5000, 5001, 5050,
  5173, 5174, 5175, 5500, 5555, 7000, 7077, 7100, 7200, 8000, 8080, 8081,
  8088, 8090, 8100, 8200, 8443, 8888, 9000, 9001, 9090, 9229,
];

interface KnownProject { id: string; name: string; path: string; port?: number; }

export class ExternalProcessScanner {
  /**
   * Discover LISTENING TCP sockets + owning PIDs.
   * Uses PowerShell Get-NetTCPConnection because it sees HTTP.sys / kernel-mode
   * bindings that plain `netstat` misses (e.g. .NET ASP.NET Core via Kestrel
   * behind HTTP.sys, or any URL ACL'd reservation). Falls back to netstat.
   */
  static async listListeningPorts(): Promise<{ port: number; pid: number }[]> {
    if (process.platform !== 'win32') return [];
    // Primary: PowerShell Get-NetTCPConnection
    try {
      const { stdout } = await pexec(
        'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -State Listen | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress"',
        { windowsHide: true, maxBuffer: 5 * 1024 * 1024 },
      );
      let parsed: any = JSON.parse(stdout || 'null');
      if (parsed) {
        if (!Array.isArray(parsed)) parsed = [parsed];
        const out = parsed
          .map((x: any) => ({ port: parseInt(x.LocalPort, 10), pid: parseInt(x.OwningProcess, 10) }))
          .filter((x: any) => x.port > 0 && x.pid > 0);
        // Dedup by port
        const seen = new Set<number>();
        const dedup = out.filter((x: { port: number; pid: number }) => (seen.has(x.port) ? false : (seen.add(x.port), true)));
        if (dedup.length > 0) return dedup;
      }
    } catch {/* fall through to netstat */}

    // Fallback: netstat
    try {
      const { stdout } = await pexec('netstat -ano -p TCP', { windowsHide: true });
      const out: { port: number; pid: number }[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (!m) continue;
        const port = parseInt(m[1], 10);
        const pid = parseInt(m[2], 10);
        if (pid > 0) out.push({ port, pid });
      }
      const seen = new Set<number>();
      return out.filter(x => (seen.has(x.port) ? false : (seen.add(x.port), true)));
    } catch { return []; }
  }

  /** Get process Name + ExecutablePath + CommandLine + CWD for a list of PIDs in one shot. */
  static async getProcessDetails(pids: number[]): Promise<Map<number, { name: string; exePath?: string; commandLine?: string; cwd?: string }>> {
    const result = new Map<number, { name: string; exePath?: string; commandLine?: string; cwd?: string }>();
    if (pids.length === 0 || process.platform !== 'win32') return result;

    // Use PowerShell + CIM (Get-CimInstance Win32_Process) for one batched call
    const idList = pids.join(',');
    const ps = `Get-CimInstance Win32_Process -Filter "ProcessId=${pids.map(p => `${p}`).join(' OR ProcessId=')}" | Select-Object ProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
    void idList; // (kept for trace)
    try {
      const { stdout } = await pexec(
        `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`,
        { windowsHide: true, maxBuffer: 5 * 1024 * 1024 },
      );
      let parsed: any = JSON.parse(stdout || 'null');
      if (!parsed) return result;
      if (!Array.isArray(parsed)) parsed = [parsed];
      for (const it of parsed) {
        const pid = parseInt(it.ProcessId, 10);
        if (!pid) continue;
        const cmd: string | undefined = it.CommandLine || undefined;
        const cwd = ExternalProcessScanner.guessCwdFromCommandLine(cmd, it.ExecutablePath);
        result.set(pid, { name: it.Name, exePath: it.ExecutablePath, commandLine: cmd, cwd });
      }
    } catch {/* ignore — best-effort */}
    return result;
  }

  /**
   * Heuristics to pull a workdir hint from the command line.
   * Many devs run `dotnet run --project C:\path\to\project.csproj` or
   * `node C:\path\to\server.js`. We extract the deepest-existing path token.
   */
  private static guessCwdFromCommandLine(cmdLine?: string, exePath?: string): string | undefined {
    if (!cmdLine) return undefined;
    // Token-split on quoted/unquoted boundaries
    const tokens = cmdLine.match(/"[^"]+"|\S+/g) || [];
    const path = require('path');
    const fs = require('fs');
    let bestDir: string | undefined;
    for (let raw of tokens) {
      raw = raw.replace(/^"|"$/g, '');
      if (!raw.match(/[\\/]/)) continue;
      // turn file paths into their dir
      try {
        if (fs.existsSync(raw) && fs.statSync(raw).isDirectory()) {
          if (!bestDir || raw.length > bestDir.length) bestDir = raw;
        } else if (fs.existsSync(raw)) {
          const d = path.dirname(raw);
          if (!bestDir || d.length > bestDir.length) bestDir = d;
        }
      } catch {/* ignore */}
    }
    if (bestDir) return bestDir;
    // Fall back: derive from exe path. For .NET builds the exe lives at
    // <project>\bin\<Debug|Release>\netN.0\<name>.exe — strip those segments.
    if (exePath) {
      try {
        const p = require('path');
        let dir = p.dirname(exePath);
        const m = dir.match(/^(.+?)\\bin\\(debug|release)(\\.+)?$/i);
        if (m) dir = m[1];
        if (/projects|tools|src|repos|workspace|github|dev/i.test(dir)) return dir;
        return dir;
      } catch {/* */}
    }
    return undefined;
  }

  /** Match an external process to a known project: prefer port match, then cwd-prefix. */
  static matchToProject(ext: ExternalProcess, projects: KnownProject[]): KnownProject | undefined {
    if (ext.port) {
      const byPort = projects.find(p => p.port && p.port === ext.port);
      if (byPort) return byPort;
    }
    if (ext.cwd) {
      const cwdLower = ext.cwd.toLowerCase();
      const byCwd = projects
        .filter(p => cwdLower.startsWith(p.path.toLowerCase()))
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (byCwd) return byCwd;
    }
    return undefined;
  }

  /**
   * Scan the system for external dev processes and (optionally) match each to a known project.
   * @param projects list of known projects to attempt matching against
   * @param ports custom ports to include (in addition to COMMON_DEV_PORTS)
   * @param ownPids PIDs of processes we already manage — exclude them from results
   */
  static async scan(projects: KnownProject[] = [], ports: number[] = [], ownPids: number[] = []): Promise<ExternalProcess[]> {
    const allPorts = new Set([...COMMON_DEV_PORTS, ...ports, ...projects.map(p => p.port).filter((x): x is number => !!x)]);
    const listening = await this.listListeningPorts();
    // Pre-fetch details for ALL listening PIDs so we can also include processes
    // whose CWD matches a known project, even on non-standard ports.
    const allDetails = await this.getProcessDetails(listening.map(x => x.pid));
    const projectPathsLower = projects.map(p => p.path.toLowerCase());
    const interesting = listening.filter(l => {
      if (allPorts.has(l.port)) return true;
      const d = allDetails.get(l.pid);
      const cwd = (d?.cwd || '').toLowerCase();
      const exe = (d?.exePath || '').toLowerCase();
      // Include if process lives inside a known project tree
      return projectPathsLower.some(pp => cwd.startsWith(pp) || exe.startsWith(pp));
    });
    // Exclude our own PIDs
    const filtered = interesting.filter(x => !ownPids.includes(x.pid));
    if (filtered.length === 0) return [];

    const out: ExternalProcess[] = [];
    for (const { port, pid } of filtered) {
      const d = allDetails.get(pid);
      if (!d) continue;
      // Reject obvious system noise; accept everything else (compiled .NET
      // exes are named after the project, not "dotnet.exe", so a positive list
      // is too narrow). Also accept anything that matched a known project.
      const lower = (d.name || '').toLowerCase();
      const exeLower = (d.exePath || '').toLowerCase();
      const matched = !!this.matchToProject({ pid, port, name: d.name, exePath: d.exePath, commandLine: d.commandLine, cwd: d.cwd } as any, projects);
      const isSystemNoise = /^(svchost|system|services|lsass|smss|csrss|wininit|spoolsv|searchindexer|searchapp|conhost|rundll32|fontdrvhost|ctfmon|dwm|wuauclt|sihost|taskhostw|explorer|msedge|chrome|firefox|brave|opera|cmd|powershell|pwsh|wsl|wslhost|docker|com\.docker|wpr|registry|memory|idle)/i.test(lower);
      const looksDev = matched
        || /node|dotnet|python|java|deno|bun|ruby|php|nginx|caddy|iis|vite|nest|next|webpack|kestrel|w3wp|iisexpress|uvicorn|gunicorn|flask|tomcat|jetty/i.test(lower)
        || /\\(projects|tools|repos|src|dev|workspace|github)\\/i.test(exeLower)
        || /\\bin\\(debug|release)\\/i.test(exeLower)            // .NET debug/release builds
        || /\.(api|web|server|service|app|host)\.exe$/i.test(lower); // common naming
      if (!looksDev || isSystemNoise) continue;
      const ext: ExternalProcess = {
        pid, port,
        name: d.name,
        exePath: d.exePath,
        commandLine: d.commandLine,
        cwd: d.cwd,
      };
      const match = this.matchToProject(ext, projects);
      if (match) {
        ext.matchedProjectId = match.id;
        ext.matchedProjectName = match.name;
      }
      out.push(ext);
    }
    return out;
  }

  static async kill(pid: number): Promise<void> {
    if (process.platform !== 'win32') {
      try { process.kill(pid, 'SIGTERM'); } catch {}
      return;
    }
    try { await pexec(`taskkill /PID ${pid} /T /F`, { windowsHide: true }); } catch {/* ignore */}
  }
}

import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import { IncomingMessage } from 'http';

/**
 * Bridges a WebSocket to a real shell child process.
 * Note: without node-pty we don't get full TTY semantics (no arrow keys for history, no colors from cmd in some scenarios),
 * but stdin pass-through works for typing commands.
 */
export class TerminalSocket {
  constructor(private wss: WebSocketServer) {
    this.setup();
  }

  private setup() {
    this.wss.on('connection', (ws: WebSocket, req?: IncomingMessage) => {
      const isWin = os.platform() === 'win32';
      const shell = isWin ? 'cmd.exe' : (process.env.SHELL || 'bash');
      const args = isWin ? ['/Q', '/K', 'prompt $P$G$_'] : ['-i'];

      // Resolve cwd: ?cwd=<absolute-path> takes precedence over user home.
      let cwd = process.env.USERPROFILE || process.env.HOME || process.cwd();
      try {
        const url = new URL(req?.url || '', 'http://localhost');
        const requested = url.searchParams.get('cwd');
        if (requested && fs.existsSync(requested) && fs.statSync(requested).isDirectory()) {
          cwd = requested;
        }
      } catch {}

      const child = spawn(shell, args, {
        env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' },
        cwd,
        windowsHide: true,
      });

      const send = (data: Buffer | string) => {
        if (ws.readyState === ws.OPEN) ws.send(typeof data === 'string' ? data : data.toString('utf-8'));
      };

      child.stdout.on('data', send);
      child.stderr.on('data', send);

      ws.on('message', (msg) => {
        try {
          if (child.stdin.writable) child.stdin.write(msg);
        } catch {}
      });

      ws.on('close', () => {
        try { child.kill(); } catch {}
      });

      child.on('exit', (code) => {
        send(`\r\n[shell exited with code ${code}]\r\n`);
        try { ws.close(); } catch {}
      });

      send(`\x1b[1;32m[DevControl]\x1b[0m Terminal connected (${shell})\r\n  cwd: ${cwd}\r\n`);
    });
  }
}

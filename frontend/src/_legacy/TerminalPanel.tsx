import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function TerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#f1f5f9',
        cursor: '#34d399',
        selectionBackground: '#334155',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    const ws = new WebSocket('ws://127.0.0.1:3030/api/terminal');
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln('\x1b[1;32m[Connected]\x1b[0m Connection to Agnostic Engine established.');
    };

    ws.onmessage = (event) => {
      let data = event.data;
      if (typeof data === 'string') {
        data = data.replace(/\r?\n/g, '\r\n');
        term.write(data);
      }
    };

    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
      
      // Local echo
      if (data === '\r') {
        term.write('\r\n');
      } else if (data === '\x7f') {
        term.write('\b \b');
      } else {
        term.write(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      ws.close();
    };
  }, []);

  return (
    <div className="w-full h-full p-2 bg-slate-900 rounded-md border border-slate-700/50 overflow-hidden relative shadow-inner">
      <div className="absolute top-2 right-4 z-10 flex gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
      </div>
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
}

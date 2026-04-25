import { useEffect, useRef, useState, useCallback } from 'react';

export type WSStatus = 'connecting' | 'open' | 'closed' | 'error';

export function useWebSocket(url: string, onMessage: (msg: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WSStatus>('connecting');
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const connect = useCallback(() => {
    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setStatus('open');
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        handlerRef.current(data);
      } catch {
        handlerRef.current(ev.data);
      }
    };
    ws.onclose = () => {
      setStatus('closed');
      // Reconnect after 1.5s
      setTimeout(connect, 1500);
    };
    ws.onerror = () => setStatus('error');
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      try { wsRef.current?.close(); } catch {}
    };
  }, [connect]);

  const send = useCallback((data: string | Uint8Array) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data as any);
  }, []);

  return { status, send };
}

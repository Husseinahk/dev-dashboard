import { useEffect } from 'react';

// Simple hotkey hook. Combo format: "mod+k", "ctrl+shift+p", "esc".
// `mod` = Ctrl on Windows/Linux, Cmd on Mac.
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, deps: any[] = []) {
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const parts = combo.toLowerCase().split('+').map(s => s.trim());
    const wantCtrl = parts.includes('ctrl') || (parts.includes('mod') && !isMac);
    const wantMeta = parts.includes('meta') || (parts.includes('mod') && isMac);
    const wantShift = parts.includes('shift');
    const wantAlt = parts.includes('alt');
    const key = parts.filter(p => !['ctrl', 'meta', 'mod', 'shift', 'alt'].includes(p))[0];

    function onKey(e: KeyboardEvent) {
      if (!key) return;
      if (e.key.toLowerCase() !== key) return;
      if (!!e.ctrlKey !== wantCtrl) return;
      if (!!e.metaKey !== wantMeta) return;
      if (!!e.shiftKey !== wantShift) return;
      if (!!e.altKey !== wantAlt) return;
      handler(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo, ...deps]);
}

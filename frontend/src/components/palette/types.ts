import type { ReactNode } from 'react';

export interface PaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon?: ReactNode;
  keywords?: string;          // extra search terms
  shortcut?: string[];        // visual hint, e.g. ["mod", "n"]
  run: () => void | Promise<void>;
}

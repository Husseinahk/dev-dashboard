import { useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { api } from '../../services/api';
import type { GitFileVersions } from '../../types';

interface Props {
  projectId: string;
  file: string | null;
  /** When 'staged': compare HEAD vs staged. Otherwise HEAD vs worktree (default). */
  mode?: 'worktree' | 'staged';
}

/** Best-effort language detection from file extension for Monaco syntax highlighting. */
function detectLanguage(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown',
    cs: 'csharp', csproj: 'xml', xml: 'xml',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    sh: 'shell', ps1: 'powershell', yaml: 'yaml', yml: 'yaml',
    sql: 'sql', dockerfile: 'dockerfile',
  };
  return map[ext] || 'plaintext';
}

/** Side-by-side diff using Monaco. Null/binary files show a placeholder. */
export function DiffViewer({ projectId, file, mode = 'worktree' }: Props) {
  const [versions, setVersions] = useState<GitFileVersions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setVersions(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.gitFileVersions(projectId, file)
      .then(v => { if (!cancelled) setVersions(v); })
      .catch(e => { if (!cancelled) setError(e.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, file]);

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-4)] text-sm">
        Select a file to see the diff
      </div>
    );
  }
  if (loading) {
    return <div className="px-4 py-3 text-[12px] text-[var(--color-text-3)]">Loading diff…</div>;
  }
  if (error) {
    return <div className="px-4 py-3 text-[12px] text-red-400">Failed to load: {error}</div>;
  }
  if (!versions || versions.binary) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-4)] text-sm">
        Binary file — no text diff available
      </div>
    );
  }

  const original = versions.head ?? '';
  const modified = (mode === 'staged' ? versions.staged : versions.worktree) ?? '';
  const language = detectLanguage(file);

  return (
    <div className="h-full w-full">
      <DiffEditor
        original={original}
        modified={modified}
        language={language}
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, Consolas, monospace',
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          diffWordWrap: 'on',
        }}
      />
    </div>
  );
}

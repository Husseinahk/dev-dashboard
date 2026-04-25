// Git domain types — mirror backend GitOps interfaces.
export interface GitStatusFile {
  path: string;
  /** Index/staged status code: M A D R C ? */
  index: string;
  /** Worktree status code: M A D R C ? */
  worktree: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  files: GitStatusFile[];
  remoteUrl?: string;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitFileVersions {
  head: string | null;
  staged: string | null;
  worktree: string | null;
  binary: boolean;
}

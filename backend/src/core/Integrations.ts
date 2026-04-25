/**
 * Thin wrappers over the GitHub REST API and the Azure DevOps REST API.
 * Both use Personal Access Tokens (PATs) supplied by the user via Settings →
 * Integrations. Tokens are stored in plain JSON in the local config file —
 * acceptable for a single-user local dev tool.
 */

export interface RepoSummary {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  defaultBranch?: string;
  cloneUrl: string;
  webUrl: string;
  provider: 'github' | 'azure';
  private: boolean;
  updatedAt?: string;
}

export class GitHubIntegration {
  constructor(private pat: string) {}

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.pat}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'DevControl-V2',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async whoAmI(): Promise<{ login: string; name?: string; avatarUrl?: string }> {
    const r = await fetch('https://api.github.com/user', { headers: this.headers() });
    if (!r.ok) throw new Error(`GitHub auth failed: ${r.status} ${await r.text()}`);
    const j: any = await r.json();
    return { login: j.login, name: j.name, avatarUrl: j.avatar_url };
  }

  async listRepos(opts?: { affiliation?: string; perPage?: number }): Promise<RepoSummary[]> {
    const aff = opts?.affiliation || 'owner,collaborator,organization_member';
    const per = opts?.perPage || 100;
    const out: RepoSummary[] = [];
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.github.com/user/repos?affiliation=${encodeURIComponent(aff)}&per_page=${per}&page=${page}&sort=updated`;
      const r = await fetch(url, { headers: this.headers() });
      if (!r.ok) throw new Error(`GitHub list failed: ${r.status} ${await r.text()}`);
      const arr: any[] = await r.json() as any[];
      for (const it of arr) {
        out.push({
          id: `github:${it.id}`,
          name: it.name,
          fullName: it.full_name,
          description: it.description || undefined,
          defaultBranch: it.default_branch,
          cloneUrl: it.clone_url,
          webUrl: it.html_url,
          provider: 'github',
          private: !!it.private,
          updatedAt: it.updated_at,
        });
      }
      if (arr.length < per) break;
    }
    return out;
  }
}

export class AzureDevOpsIntegration {
  constructor(private pat: string, private organization: string, private project?: string) {}

  private headers(): Record<string, string> {
    const auth = Buffer.from(`:${this.pat}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'User-Agent': 'DevControl-V2',
    };
  }

  async whoAmI(): Promise<{ displayName: string; mail?: string }> {
    // ConnectionData is the cheapest call to verify auth
    const url = `https://dev.azure.com/${encodeURIComponent(this.organization)}/_apis/connectionData?api-version=7.1-preview`;
    const r = await fetch(url, { headers: this.headers() });
    if (!r.ok) throw new Error(`Azure DevOps auth failed: ${r.status} ${await r.text()}`);
    const j: any = await r.json();
    const id = j.authenticatedUser || {};
    return { displayName: id.providerDisplayName || id.customDisplayName || 'unknown', mail: id.properties?.Mail?.$value };
  }

  async listProjects(): Promise<{ id: string; name: string }[]> {
    const url = `https://dev.azure.com/${encodeURIComponent(this.organization)}/_apis/projects?api-version=7.1-preview.4`;
    const r = await fetch(url, { headers: this.headers() });
    if (!r.ok) throw new Error(`Azure DevOps projects failed: ${r.status} ${await r.text()}`);
    const j: any = await r.json();
    return (j.value || []).map((p: any) => ({ id: p.id, name: p.name }));
  }

  async listRepos(): Promise<RepoSummary[]> {
    // If project is set, scope to it; else list across all projects
    const out: RepoSummary[] = [];
    const projects = this.project ? [{ name: this.project }] : await this.listProjects();
    for (const p of projects) {
      const url = `https://dev.azure.com/${encodeURIComponent(this.organization)}/${encodeURIComponent(p.name)}/_apis/git/repositories?api-version=7.1-preview.1`;
      const r = await fetch(url, { headers: this.headers() });
      if (!r.ok) continue;
      const j: any = await r.json();
      for (const repo of (j.value || [])) {
        out.push({
          id: `azure:${repo.id}`,
          name: repo.name,
          fullName: `${p.name}/${repo.name}`,
          defaultBranch: (repo.defaultBranch || '').replace('refs/heads/', '') || undefined,
          cloneUrl: repo.remoteUrl,  // HTTPS URL; PAT will be injected at clone time
          webUrl: repo.webUrl,
          provider: 'azure',
          private: true,
          updatedAt: undefined,
        });
      }
    }
    return out;
  }

  /** Inject the PAT into a clone URL so `git clone` works without a credential helper. */
  static injectPat(cloneUrl: string, pat: string): string {
    try {
      const u = new URL(cloneUrl);
      u.username = '';            // strip any existing user
      u.password = pat;
      return u.toString();
    } catch {
      return cloneUrl;
    }
  }
}

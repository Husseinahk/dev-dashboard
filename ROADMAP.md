# DevControl Roadmap

## Phase 1 — Git Daily Driver ✅ FERTIG

Status, Diff (Monaco side-by-side), Stage/Unstage/Discard per File + Bulk, Commit (Ctrl+Enter), Branch + Pull/Push/Fetch, History (letzte 30 commits). Im Bottom-Panel als "Git" Tab.

## Phase 2 — Hunk-Staging + Conflicts (NÄCHSTE)

Ziel: VS-Code-Niveau an Diff-Interaktivität.

- **Stage per Hunk** — `git diff` parsen, jeden Hunk im DiffViewer mit "Stage Hunk" Button overlayen
- **Stage per Line/Selection** — Selektion im DiffViewer → `git apply --cached` mit gefiltertem patch
- **Discard Hunk** — analog
- **3-way Merge Editor** — Monaco kann's nativ. Bei Conflict-Files Merge-Mode statt Diff-Mode rendern
- **Blame View** — `git blame --porcelain`, Hover zeigt commit/author/date inline links neben Lines
- Backend: `GitOps.applyPatch(cwd, patch, {cached, reverse})`, `GitOps.blame(cwd, file)`

## Phase 3 — PR Workflow (GitHub + Azure DevOps)

Wir haben PATs schon konfiguriert in `Integrations.ts`. Wird ein neuer Tab im Project-Detail.

- **PR-Liste** pro Projekt — gefiltert nach repo URL match
- **PR-Detail-Tab** — Description, Commits, Files Changed (Monaco Diff!), CI-Status, Reviews
- **Inline Comments** — im Diff posten/lesen
- **Review submitten** — Approve/Request Changes/Comment
- **Create PR** — aus aktuellem Branch, Title/Body/Reviewer-Picker
- **Merge** — Squash/Rebase/Merge Wahl
- Backend: erweitere `Integrations.ts` um `listPRs`, `getPR`, `getPRDiff`, `createPR`, `submitReview`, `mergePR` für beide Provider

## Phase 4 — Polish & Power

- **Commit-Graph** — `git log --graph` parser oder `gitgraph.js`
- **File-History** — pro Datei alle commits
- **Stash UI** — list/apply/pop/drop/named create
- **Cherry-Pick / Tags / Reset** — Buttons + confirm dialogs
- **Branch-Compare-View** — zwei refs picken, files dazwischen sehen

## Bonus-Backlog (nicht-Git)

- **Command-Palette ausbauen** — bisher dünn, mehr Commands rein
- **Per-Process Resource-Graph** (CPU/RAM Sparkline neben Running-Tab)
- **Notifications** — toast wenn extern getriggerte Builds fertig sind
- **.env Editor** mit masked secrets
- **Port-Konflikt Auto-Resolve** Dialog
- **HTTP Healthcheck Widget** (Latenz + grün/rot)
- **Project Templates** (`dotnet new`/`npm create`)
- **Multi-Project Sessions** ("Stack starten")
- **Docker Panel** (`docker ps` + start/stop/logs)
- **DB Quick-Connect** Button (DBeaver/SSMS)
- **README-Preview Tab** pro Projekt
- **Settings Theme Toggle** + Density (compact/cozy)
- **Config Export/Import**
- **Onboarding-Tour**

## Wenn die nächste Session loslegt

1. `CLAUDE.md` lesen — voller Kontext
2. Hier weitermachen mit Phase 2 (oder das was Hussein priorisiert)
3. Build-Konvention beachten: `$env:Path = "C:\Users\Hussein\AppData\Roaming\nvm\v20.20.1;" + $env:Path` davor

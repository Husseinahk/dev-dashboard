# DevControl V2 — Project Context

> **Lies das zuerst in einer neuen Session.** Danach `ROADMAP.md` für was als nächstes ansteht.

## Was ist das?

Lokales Developer-Dashboard für Hussein. Ersetzt die Notwendigkeit, mehrere Terminals + Git-Tools + IDEs offen zu haben. Verwaltet Projekte, startet/stoppt Prozesse, zeigt Logs, integriert GitHub + Azure DevOps, und (seit Phase 1) komplette Git-Verwaltung mit VS-Code-Diff-Viewer.

**Pfad:** `C:\Tools\dev-dashboard`
**Backend:** Express + ws auf Port `3030` (Node 20 zwingend, Node 14 default kann nicht builden)
**Frontend:** React 19 + Vite 8 + Tailwind 4, vom Backend auf `:3030` ausgeliefert
**Dev-Mode:** Frontend separat auf `:5173` (vite), `VITE_API_BASE=http://localhost:3030`

## Wichtige Befehle

```powershell
# Build (Node 20 PATH erzwingen!)
$env:Path = "C:\Users\Hussein\AppData\Roaming\nvm\v20.20.1;" + $env:Path
cd C:\Tools\dev-dashboard\backend  ; npm run build
cd C:\Tools\dev-dashboard\frontend ; npm run build

# Backend neu starten
$existing = Get-NetTCPConnection -LocalPort 3030 -State Listen -ErrorAction SilentlyContinue
if ($existing) { Stop-Process -Id $existing.OwningProcess -Force }
Start-Process node.exe "dist/index.js" -WorkingDirectory "C:\Tools\dev-dashboard\backend" -WindowStyle Hidden
```

## Architektur

```
backend/src/
  index.ts                    Express app, alle HTTP/WS Routen
  core/
    ConfigManager.ts          ~/.devcontrol/config.json laden+schreiben (incl. integrations)
    ProcessManager.ts         child_process spawn + stdout streaming via WS
    WorkspaceScanner.ts       Scan paths → Projekte detektieren
    ExternalProcessScanner.ts Get-NetTCPConnection + Win32_Process für externe procs
    GitOps.ts                 Wrapper um execFile('git', ...) — alle Git-Operationen
    Integrations.ts           GitHubIntegration + AzureDevOpsIntegration (REST clients)
  detectors/                  pro Project-Typ (npm, dotnet, ...)

frontend/src/
  App.tsx                     Top-level state, WS, hotkeys, layout
  components/
    layout/    TopBar, Sidebar, BottomPanel, StatusBar
    projects/  ProjectDetail, ProjectHeader, AddProjectModal, WelcomeState
    actions/   ActionGroup, ActionButton, PromptDialog
    git/       GitPanel, BranchBar, StatusList, DiffViewer, CommitBox, HistoryList
    logs/      LogViewer
    terminal/  TerminalPanel (xterm.js)
    system/    RunningTabs, SystemMonitor
    settings/  SettingsModal (workspace mode + integrations PAT)
    palette/   CommandPalette (Ctrl+K)
    ui/        Button, Tooltip (portal-based, viewport-aware), StatusDot, Badge
    toast/     ToastContainer
  hooks/       useWebSocket, useWorkspaces, useProcessTabs, useHotkeys, useToast
  services/
    api.ts     **Alle** HTTP calls hier zentralisiert
    ws.ts      WebSocket URLs
  types/       project, process, events, git
  utils/       cn, format
```

## Konventionen (BITTE EINHALTEN)

- **Saubere Komponententrennung** — eine Verantwortung pro File. Hussein hat das explizit gefordert.
- **Alle HTTP calls über `services/api.ts`** — keine fetch() in Components.
- **Tooltips immer via `<Tooltip>`** — der ist portal-basiert mit Auto-Flip & Viewport-Clamping.
- **Lucide hat KEINE Brand-Icons** (Github/Azure deprecated). Nutze custom Badges (`<span className="bg-white/10">GH</span>`).
- **Node 20 zwingend für Build** — Node 14 ist System-Default und failt mit `??=` SyntaxError.
- **Backend exposed `req.params.id`** = Project-ID. `projectPath(id)` liefert cwd.
- **Auto-refresh Polling-Intervalle**: External processes 5s, Git status 4s, System stats 2s.
- **`dotnet ef database update` NIE selbst** — Migrationen laufen beim API-Start automatisch.
- **Niemals Co-Authored-By in Commits.**

## Aktiver Stand (Stand: aktuelle Session)

### Phase 1 — Git-Verwaltung ✅ FERTIG

Bottom-Panel hat jetzt einen **Git-Tab** mit:
- BranchBar: Branch + ahead/behind + Fetch/Pull/Push
- StatusList: Staged/Unstaged Files mit per-file Stage/Unstage/Discard + Bulk-Actions
- DiffViewer: Monaco DiffEditor (lazy-loaded von CDN, ~28KB gzipped extra), syntax-highlighted, side-by-side
- CommitBox: multi-line message + Ctrl+Enter shortcut
- HistoryList: letzte 30 commits

Backend-Endpoints (alle in `index.ts`):
```
GET  /api/git/:id/status
GET  /api/git/:id/log?n=30
GET  /api/git/:id/branches
GET  /api/git/:id/diff?file=&staged=0|1
GET  /api/git/:id/file-versions?file=     ← head/staged/worktree für Monaco
POST /api/git/:id/{init,checkout,pull,fetch,push,commit,stage,unstage,discard,stage-all,unstage-all,set-remote}
```

`GitOps.fileVersions(cwd, file)` returns `{ head, staged, worktree, binary }` — ist das Herz vom DiffViewer.

### Vorher fertig

- Project add/remove via Modal + Trash-Button + Ctrl+N
- Native Windows Folder-Picker (PowerShell IFileOpenDialog COM, Alt-keypress + BackgroundWorker für Foreground)
- Auto-Detect on Browse, Bootstrap (`npm install`/`dotnet restore`/etc.) on Add
- GitHub + Azure DevOps PAT integrations (separate Tabs in AddProjectModal)
- `normalizeAzureOrg()` strippt URLs/Pfade aus dem org-Field
- External Process Scanner: PowerShell `Get-NetTCPConnection` (sieht HTTP.sys!) + `Get-CimInstance Win32_Process`, broadened executable filter (akzeptiert `.api/.web/.server.exe`, .NET bin paths, project-tree matches)
- Adopt-Workflow: External PID killen → DevControl-managed restart
- Tooltip-Komponente: Portal-basiert mit Auto-Flip + Viewport-Clamping (keine geclippten Tooltips mehr)

## Bekannte Patterns / Gotchas

- **HTTP.sys binding**: .NET Kestrel hinter HTTP.sys → `netstat` sieht den Port nicht, `Get-NetTCPConnection` schon. Immer PS-Variante zuerst.
- **Native AOT .NET exes** heißen `<projektname>.api.exe`, nicht `dotnet.exe`. ExternalProcessScanner muss das matchen.
- **Monaco lazy-load**: `@monaco-editor/react` zieht sich Monaco zur Laufzeit von CDN — Bundle-Size bleibt klein, aber offline geht nicht (für lokales Tool egal).
- **Git status porcelain=2**: index `.` = unchanged, `?` = untracked, `M/A/D/R/C` = changes. Frontend `isStaged(f)` checkt `index !== '.' && index !== '?'`.
- **PowerShell-Output als JSON**: `ConvertTo-Json -Compress` einzelnes Object kommt als Object, mehrere als Array. Immer `if (!Array.isArray) parsed = [parsed]` davor.

## Nächste Phasen

Siehe `ROADMAP.md`.

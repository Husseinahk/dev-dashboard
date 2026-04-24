# DevControl — Architecture

## Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Server | **Node.js** + **Express** + **ws** | Zero deps beyond these two. WebSocket for live log streaming. |
| Client | **Vanilla HTML** + **Tailwind CSS (CDN)** + **Alpine.js** (CDN) + **@alpinejs/collapse** | No build step. Open `index.html`, it works. Alpine is enough for a single-page dashboard. |
| Config | **JSON file** (`projects.json`) | Human-readable, version-controllable, hot-reloaded per request. |
| Process Mgmt | `child_process.spawn` + Windows `taskkill /T /F` | Reliable tree kill on Windows; graceful cleanup on SIGINT. |

## File Structure

```
dev-dashboard/
├── server.js                   # Express + WebSocket + process manager
├── package.json
├── projects.json               # User config (gitignored in user's copy)
├── projects.example.json       # Template committed to repo
├── start.bat                   # Double-click launcher (with npm install on first run)
├── install.bat / install.ps1   # Desktop shortcut + optional autostart
├── README.md                   # User-facing docs
├── ARCHITECTURE.md             # This file
├── ROADMAP.md                  # Planned features
├── CHANGELOG.md                # Version history
├── CONTRIBUTING.md             # Contribution guide
├── .gitignore
└── public/
    ├── index.html              # UI shell (Tailwind + Alpine bindings)
    ├── app.js                  # Alpine data + methods (~500 LOC)
    └── style.css               # Scrollbar + toast animations
```

## Server (server.js)

### Responsibilities

1. **Serve** the static UI (`public/`)
2. **Load/save** `projects.json`
3. **Spawn/manage** child processes (long-running, one-shot, open)
4. **Broadcast** logs + status via WebSocket
5. **Detect** ready patterns + crashes
6. **Proxy** Git commands via `GET /api/git/:projectId`

### State (in-memory)

```js
runningProcs     // Map<actionKey, { proc, projectId, actionId, logs }>
historicalLogs   // Map<actionKey, { logs: string, lastSeenAt, ... }>
readyActions     // Set<actionKey>       — detected 'ready' signal
userStoppedKeys  // Set<actionKey>       — manual stop, suppresses crash notify
```

Logs are trimmed to `MAX_LOG_LENGTH` (200 KB) per tab to avoid unbounded growth.

### REST API

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/config` | — | Merged config (defaults + project groups) + active node version + running keys |
| `GET` | `/api/config/raw` | — | Raw JSON content of projects.json (for editor) |
| `POST` | `/api/config` | Full config JSON | `{ok: true}` — writes file |
| `POST` | `/api/run` | `{projectId, actionId, params?}` | `{ok, key}` — spawns / executes |
| `POST` | `/api/stop` | `{projectId, actionId}` | `{ok}` — taskkill tree |
| `GET` | `/api/tabs` | — | All known log tabs + contents |
| `GET` | `/api/logs/:projectId/:actionId` | — | Log buffer for a key |
| `DELETE` | `/api/tabs/:key` | — | Drop log buffer |
| `GET` | `/api/git/:projectId` | — | `{branch, dirty, ahead, behind, isGitRepo}` |

### WebSocket Protocol

Client connects to `ws://localhost:3030`. Server broadcasts messages of type:

| Type | Payload | When |
|---|---|---|
| `log` | `{key, line, level}` | Every stdout/stderr chunk |
| `status` | `{running: [{key, projectId, actionId}]}` | Process starts/stops |
| `ready` | `{key}` | Ready regex matched in log |
| `crash` | `{key, projectId, actionId, label, code}` | Process exited non-zero without user-stop |

### Process Spawning Flow

```
POST /api/run
  └─ runActionInternal(project, action, params)
       ├─ Substitute {paramName} placeholders in command
       ├─ Compute cwd (project.path + action.cwd)
       ├─ Build env (base + prepend NVM node dir if nodeVersion)
       ├─ type === 'open'?    → exec (detached), broadcast log, done
       ├─ type === 'chain'?   → iterate chain[], await runActionInternal for each
       └─ else                → spawn(command, {cwd, env, shell: true})
                                 ├─ stdout → checkReady + broadcast log
                                 ├─ stderr → checkReady + broadcast log
                                 └─ close  → broadcast log, detect crash, cleanup
```

### Per-Project Node Version

`findNodeVersionDir(version)` scans `%NVM_HOME%\v*` directories, matches prefix (`"14"` → highest `v14.*`), returns path.

`buildEnv(project)` prepends that path to `PATH` in the child's env, **only** for this `spawn`. Global `PATH` and `nvm use` state untouched.

### Ready Detection

Configurable regex list (`READY_PATTERNS`) is matched against every log line. On first match:

- `readyActions.add(key)`
- WebSocket `{type:'ready', key}` broadcast

Current patterns cover Angular/Vite/Webpack/ASP.NET/Next.js "listening on …" signatures.

### Crash Detection

In `proc.on('close')`:

- If `exitCode !== 0`
- AND action type is `long-running`
- AND `!userStoppedKeys.has(key)` (not a user-initiated stop)

→ broadcast `crash` → client shows toast + browser notification.

## Client (app.js)

### State Model

Alpine.js data object with ~20 state properties:

- **Data**: `projects`, `runningKeys`, `readyKeys`, `gitStatus`, `logs`, `logTabs`
- **UI**: `collapsedGroups`, `logSearch`, `autoScroll`, `logWidth`, `toasts`, `paletteOpen`
- **Settings**: `openSettings`, `settingsTab`, `editConfig`, `editingProjectIdx`, `settingsDirty`

### Persistence (localStorage)

| Key | Value |
|---|---|
| `devcontrol.activeProject` | Last selected project ID |
| `devcontrol.activeTab` | Last active log tab |
| `devcontrol.collapsedGroups` | Per-group collapsed state |
| `devcontrol.logWidth` | Resized width of log panel |
| `devcontrol.autoScroll` | Auto-scroll toggle state |

### WebSocket Handling

Single `connectWS()` with auto-reconnect on close (1s retry). Messages are dispatched to state updates via `msg.type` switch.

### Keyboard Shortcut Registry

Global `keydown` listener ignores events in input/textarea/select. Dispatches Ctrl+K, Ctrl+/, Ctrl+Shift+S.

## Configuration Schema

See the [Config Reference](CONFIG.md) for the full schema.

## Security Considerations

- **Local-only** — binds to `localhost` by default. Not exposed on the network.
- **No auth** — intended for single-user local development. **Don't port-forward.**
- **Arbitrary command execution** — any command defined in `projects.json` runs with the user's privileges. Don't share your config with untrusted users.
- **Path traversal** — `cwd` is `path.join(project.path, action.cwd)`. `action.cwd = "../../etc"` would escape. Fine for personal use, risky if config came from an untrusted source.

## Extension Points

### Adding a new action type

1. Extend the `actionIcon()` mapping in `app.js`
2. Handle the new type in `runActionInternal()` in `server.js`
3. Add type to the `<select>` in `index.html` settings editor

### Adding a new WebSocket event

1. `broadcast({type: 'myEvent', ...})` from server
2. Handle in `ws.onmessage` switch in `app.js`

### Adding a new API endpoint

Just add a new `app.get/post('/api/...', handler)` in `server.js`.

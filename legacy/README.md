# DevControl Dashboard

> A **local web dashboard** to manage multiple development projects — start/stop servers, run builds, check git status, open editors — all from one browser tab.

![Dashboard Preview](docs/preview.png)

No installer, no signup, no cloud. Just a Node.js server on `localhost:3030` with a clean UI for everything you'd otherwise do across 10 terminals and IDEs.

---

## Why?

When you juggle 3-5 projects daily, you end up with:

- 6 open terminals (API, frontend, git status, migrations, …)
- Multiple VS Code / Visual Studio windows
- Constant context switching (which node version? which port?)
- Forgotten stopped processes, orphaned tasks in the taskbar

**DevControl** centralises all of it:

- 🎛 **One dashboard** per machine, all projects visible
- 🔀 **Per-project Node version** — no more `nvm use` collisions
- 🧩 **Configurable actions** — define any CLI command as a clickable button
- 📡 **Live logs** via WebSocket — survives browser refresh
- 🔗 **Quick links** to frontend, Swagger, DevOps repo
- ⚡ **Structured editor** — no JSON hand-editing

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/<your-org>/dev-dashboard C:\Tools\dev-dashboard
cd C:\Tools\dev-dashboard
npm install
```

### 2. Create Desktop Shortcut (optional but recommended)

Double-click `install.bat`. Creates:

- ✅ Desktop shortcut (`DevControl.lnk`)
- ✅ Start menu entry
- ❓ Windows autostart (optional — asked interactively)

### 3. Run

Either:

- Double-click the **DevControl** icon on your desktop, **or**
- Double-click `start.bat` inside `C:\Tools\dev-dashboard\`, **or**
- Run `npm start` in the project directory

Browser opens automatically to [http://localhost:3030](http://localhost:3030).

---

## Configuration

On first start, `projects.json` is populated with example projects. Open **Settings (⚙)** in the top-right to add / edit / remove projects via the UI.

Manual edits to `projects.json` are also supported — the Settings dialog has a read-only JSON preview tab.

### Project Structure

| Field | Description |
|---|---|
| `id` | Internal slug (no spaces) |
| `name` | Display name in the project dropdown |
| `path` | Absolute path to the project root |
| `nodeVersion` | Optional — e.g. `"14"` or `"20.11.0"`. Maps to `%NVM_HOME%\v{version}*\` |
| `groups` | Array of action groups (Backend, Frontend, …) |
| `quickLinks` | Array of `{label, url}` — external links (frontend URL, Swagger, DevOps) |

### Action Types

| Type | Icon | Behaviour |
|---|---|---|
| `long-running` | ▶ | Spawns a process in background, live logs, Stop/Restart controls. For `npm start`, `dotnet run`. |
| `one-shot` | ⚡ | Runs and exits (build, git status). Output streams, then closes. |
| `open` | ↗ | Detached launch (e.g. `code .`, `devenv`, `explorer`). No log streaming. |
| `prompt` | ✎ | Asks user for input before running (e.g. Migration name). Use `{placeholder}` in command. |
| `chain` | ⛓ | Runs a list of other action IDs sequentially. Great for "Start Everything". |

### Default Groups

Define `defaultGroups` in `globalSettings` and they are automatically available in **all** projects. Perfect for common tools like Git and IDE commands.

If a project has a group with the same name as a default, the project's group takes precedence.

---

## Per-Project Node Version (without `nvm use`)

One of DevControl's best features. When you define `nodeVersion: "14"` on a project:

1. DevControl scans `%NVM_HOME%\` (defaults to `%APPDATA%\nvm`) for `v14*`
2. Picks the highest installed patch (e.g. `v14.21.2`)
3. **Only in the child process**, prepends that node's directory to `PATH`

This means:

- ✅ Your global `nvm use` is untouched
- ✅ Other terminals running `nvm use 20` continue to work
- ✅ Different projects can run simultaneously with different Node versions

The active version is displayed in the header: `● Node v14.21.2`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + K` | Command palette — fuzzy-search and switch project |
| `Ctrl + /` | Focus log search |
| `Ctrl + Shift + S` | Open Settings |
| `Esc` | Close modals / palette |

---

## Features Overview

### Running

- **Live Git status** in header: branch, dirty count, ahead/behind
- **Node version indicator** per project
- **Running processes tag bar** with inline Stop / Restart buttons
- **Auto-reconnect** WebSocket if network hiccups

### Log Panel

- **Live stream** with stdout/stderr coloring
- **Search** with match highlighting and counter
- **Auto-scroll** toggle
- **Copy** full log to clipboard
- **Clear** current tab
- **Resizable** via drag handle
- **Log persistence** — survives browser refresh (server keeps buffer up to 200KB per tab)

### Feedback

- **Ready detection** — recognises `compiled successfully` / `listening on` / etc. and marks the process/quick-link as ready
- **Crash notifications** — Browser notification + red toast when a long-running process exits unexpectedly (non-zero exit, not manually stopped)
- **Toast messages** for save confirmations, errors, etc.

### Settings Editor

- **Tabbed interface**: Projects / Default Groups / Global / JSON Preview
- **Project browser** (sidebar, add/delete)
- **Inline action editor** with type dropdown, command, cwd, prompt params, chain targets
- **Unsaved changes indicator**
- **JSON export / copy**

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for internals (process management, WebSocket protocol, file structure).

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and status.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — PRs welcome!

## License

MIT

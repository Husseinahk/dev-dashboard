# DevControl — Roadmap

## ✅ Shipped

### v1.0 — Core Dashboard
- [x] Multi-project config via `projects.json`
- [x] Long-running / one-shot / open / prompt actions
- [x] Live logs via WebSocket
- [x] Log persistence (survives browser refresh)
- [x] Per-project Node version (no `nvm use` global switch)
- [x] Structured settings editor (no JSON hand-editing)
- [x] Default groups (Git, IDE) shared across projects

### v1.1 — UI/UX Polish
- [x] Keyboard shortcuts (Ctrl+K palette, Ctrl+/, Ctrl+Shift+S)
- [x] Resizable log panel
- [x] Collapsible action groups with state persistence
- [x] Log search + highlighting + match counter
- [x] Auto-scroll toggle
- [x] Toast notifications (replaces `alert()`)
- [x] Smooth transitions, backdrop blur modals
- [x] Empty states with helpful actions
- [x] Confirmation dialogs for destructive actions

### v1.2 — Feature Highlights
- [x] Live Git branch + dirty count + ahead/behind in header
- [x] Ready-detection (compiled successfully, listening on …) → green pulse
- [x] Crash notifications (browser notification + toast)
- [x] Restart button in running-tags
- [x] Action chains (`type: chain` with `chain: [ids]`)
- [x] Desktop installer (`install.bat` → shortcut + autostart)

---

## 🚧 In Progress / Next Up

### v1.3 — Developer Workflow
- [ ] **Git commit modal** — type message, see staged files, commit with one click
- [ ] **Branch switcher** — dropdown in header to checkout/create branch
- [ ] **Open PR on DevOps/GitHub** — button to open create-PR page for current branch
- [ ] **Action Shell** — editable ad-hoc command line next to each project
- [ ] **Auto-open browser on ready** — if a ready pattern matches, optionally open the linked quick-link URL

### v1.4 — Multi-Workspace
- [ ] **Workspace profiles** — save a set of projects+actions as a "Morning Standup" workspace
- [ ] **Project tags/groups** — group projects (backend, mobile, internal tools)
- [ ] **Global search** across all configs (Ctrl+Shift+K)
- [ ] **Bulk actions** — run git fetch on all projects at once

### v1.5 — Intelligence
- [ ] **Health check** — ping API endpoint periodically, show status dot
- [ ] **Log filters** — per-tab filter by level (errors/warnings/info)
- [ ] **Structured log viewer** — recognise JSON-per-line logs, pretty-print
- [ ] **Environment variable editor** per action
- [ ] **Before/After hooks** per action (e.g. `beforeStart: "git pull"`)

### v1.6 — Ergonomics
- [ ] **Drag & drop** to reorder projects, groups, actions in settings
- [ ] **Import/export** individual projects as JSON snippets
- [ ] **Theme toggle** (dark/light)
- [ ] **Mobile-responsive** layout (read-only on phones)

### v1.7 — Advanced
- [ ] **Docker integration** — docker compose up/down/logs buttons
- [ ] **Process stats** — CPU/RAM per long-running process
- [ ] **Uptime counter** — "API running for 2h 14m"
- [ ] **PID display** + context menu to attach debugger
- [ ] **Integrated terminal** tab (xterm.js in the log panel)

---

## 💭 Ideas / Backlog

Nice-to-haves, not scheduled:

- Plugin system (`./plugins/*.js` loaded at server start)
- Remote dashboard (connect to another machine's DevControl, read-only)
- Scheduled tasks (cron-like, e.g. daily `git fetch`)
- Azure DevOps / GitHub integration — list PRs, build status
- Database browser tab (connect to local DBs)
- Slack notifications for crashes
- VS Code extension to launch DevControl actions from VS Code

---

## Known Issues

See [GitHub Issues](https://github.com/<your-org>/dev-dashboard/issues).

---

## Versioning

This project follows semver-ish: `MAJOR.MINOR.PATCH`

- **MAJOR** — breaking config format changes
- **MINOR** — new features, backwards-compatible
- **PATCH** — bugfixes only

Current version: `1.2.0`

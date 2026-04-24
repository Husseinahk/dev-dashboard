# Changelog

All notable changes to DevControl are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

## [1.2.0] — 2026-04-20

### Added
- **Live Git status** in header: branch name, dirty file count, ahead/behind commit counters. Auto-polls every 10 s.
- **Ready-detection**: server scans process output for patterns like `compiled successfully`, `listening on http`, `Local: http://localhost`. When matched, the quick-link and running-tag get a green pulse.
- **Crash notifications**: when a `long-running` process exits with non-zero code and was NOT manually stopped, show a red toast AND a Browser notification (with permission).
- **Restart button** in the running-tag bar (↻ icon next to ✕).
- **Action chains** — new action type `chain` with a `chain: [actionId, ...]` array. Runs each target sequentially. Great for "Start Everything".
- **Desktop installer** (`install.bat` / `install.ps1`): creates a Desktop shortcut, Start Menu entry, and optionally an autostart entry.

### Changed
- `start.bat` now checks for Node.js in PATH and gives a helpful error if missing.
- `start.bat` runs `npm install` only on first use (when `node_modules/` is absent).

## [1.1.0] — 2026-04-20

### Added
- **Keyboard shortcuts**:
  - `Ctrl+K` — command palette with fuzzy project search
  - `Ctrl+/` — focus log search input
  - `Ctrl+Shift+S` — open Settings
  - `Esc` — close modals
- **Resizable log panel** — drag the left edge of the log to adjust width. Persisted in localStorage.
- **Collapsible action groups** — click the group header to expand/collapse. State persisted per group.
- **Log search + highlighting** — live-match with match counter, yellow highlight on occurrences.
- **Auto-scroll toggle** — checkbox in the log toolbar.
- **Copy log to clipboard** — 📋 button.
- **Toast notifications** replace `alert()` popups. Success (emerald), error (red), info (slate).
- **Empty states** for missing project/logs, with links to resolve.
- **Backdrop blur** on all modal overlays for depth.

### Changed
- Long-running action buttons now toggle to "stop" on click when running (was disabled before).
- Save confirmations use toasts instead of `alert()`.
- Header is now sticky with subtle backdrop blur.

## [1.0.0] — 2026-04-20

### Added
- Initial release.
- Multi-project dashboard with dropdown switcher.
- Action types: `long-running`, `one-shot`, `open`, `prompt`.
- Per-project Node version via nvm-windows directory scan (no `nvm use` global switching).
- Live log streaming via WebSocket. Log buffer persisted server-side (200 KB cap per tab).
- Default groups (shared across all projects, overridable).
- Structured settings editor with tabs: Projects / Default Groups / Global / JSON Preview.
- Quick links panel (external URLs: Frontend, Swagger, DevOps).
- Prompt parameter substitution in commands (`{name}` placeholders).
- Windows `taskkill /T /F` for clean process tree termination.

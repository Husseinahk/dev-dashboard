# DevControl — Project Memory

Internal notes, design decisions, and learnings for future contributors and for anyone picking this up cold.

## Mission

DevControl exists because I (the original author) was tired of managing 5 open terminals + 2 IDE windows across 3 projects. It's a **one-user, one-machine** tool intended to replace manual process juggling.

**Non-goals**:
- ❌ Multi-user collaboration
- ❌ Remote deployment / CI
- ❌ Replacing your IDE for actual coding
- ❌ Running in production

## Design Principles

1. **Zero build step** — HTML + CDN-loaded Tailwind/Alpine. Open in any browser, it just works.
2. **One config file** — `projects.json`. Everything is there. The UI is just a view of it.
3. **Survive refresh** — nothing important lives only in the browser. Logs, running state, everything is server-side.
4. **Don't touch global state** — `nvm use` affects the whole shell. We never run it. We manipulate the child process's PATH only.
5. **Explicit > implicit** — confirmations on destructive actions, visible unsaved-changes indicator, clear WebSocket status.
6. **Cheap enough that it's obvious** — if a feature takes more than a day to add, it probably doesn't belong. Keep the server < 800 LOC.

## Key Architectural Decisions

### "Why Node.js and not Rust / Go / .NET?"
- Can be edited and restarted in seconds
- No compile step for contributors
- `child_process` is easy + battle-tested on Windows
- All our users have Node installed anyway (frontend devs)

### "Why Alpine and not React / Vue / Svelte?"
- No build step ⇒ no Webpack/Vite config ⇒ no node_modules for the UI
- Single-page dashboard doesn't need component abstractions
- Reactive data is trivial for this scale
- Contributor on-boarding: open `public/app.js`, read it in 10 minutes

### "Why JSON config and not SQLite / YAML?"
- JSON is editable by any tool, diffable in Git
- Validates via `JSON.parse` — no schema library needed
- Settings editor can round-trip it perfectly
- Users can hand-edit if they prefer

### "Why Windows-only process kill?"
- `taskkill /T /F` handles the process tree (which Node's `proc.kill()` does not on Windows)
- If Mac/Linux support is added: branch on `process.platform` and use `kill -TERM -pid` for process groups
- Not prioritised because DevControl's primary audience is on Windows dev machines

## Tricky Bits (aka "Gotchas")

### Node Version Lookup
NVM-windows installs to `%APPDATA%\nvm\v{version}\` by default — but the install folder is configurable and **NVM_HOME** may or may not be set.

Resolution order in `findNodeVersionDir()`:
1. `globalSettings.nvmHome` (user override)
2. `process.env.NVM_HOME`
3. `path.join(process.env.APPDATA, 'nvm')` (default)

If none of these exist, returns `null` → child inherits system PATH.

### Log Buffer Memory
Historical logs are kept in a `Map<key, {logs: string, ...}>`. Without a cap, long-running processes would blow up memory.

`MAX_LOG_LENGTH = 200000` bytes (~200 KB). When exceeded, we keep the **last** 200 KB and prefix with `... [truncated] ...`.

Per-process, not global. With 20 tabs × 200 KB = 4 MB max. Fine for a dashboard.

### Chain Action — "Already Running" Errors
`type: chain` calls `runActionInternal()` for each target. For `long-running` actions this resolves after 200 ms even if the process is still alive (allowing the next chain step to start).

Edge case: If you click a chain a second time while its long-running members are already running, the second chain will log errors like "Action already running" for each member. Intentional — users expect "start-all" to be a noop when already started. Future: detect and skip silently.

### Ready Detection Is Fragile
`READY_PATTERNS` is a fixed list of regexes. If your framework outputs a different "ready" message, you won't see a green pulse. Adding new patterns in `server.js` is a one-line change — file a PR.

### Browser Notifications
Requested on page load via `Notification.requestPermission()`. If the user denied, we silently skip. No retry. User has to re-enable via browser site settings.

### WebSocket Auto-Reconnect
On `ws.onclose`, we `setTimeout(connectWS, 1000)`. No max retries, no backoff. Intentional — server restarts should be transparent to the browser.

### `taskkill` May Fail Gracefully
If the child already exited between `/api/stop` and `taskkill`, we log the error but **still** clean up `runningProcs.delete(key)`. Without this, the UI would show "stuck running" after a process dies unexpectedly during stop.

## Layout Quirks

### Resizable Log Panel
Grid template columns: `1fr ${logWidth}px`. Drag handle has `cursor: col-resize` + a mouse listener on window that adjusts `logWidth`. Clamped to `[320, 1400]` px.

### Log Auto-scroll
When logs update, `$watch('logs')` scrolls `logBox` to bottom **if** `autoScroll === true`. User can disable to scroll up and read.

### Persist UI State
Keys in `localStorage`:
- `devcontrol.activeProject`, `devcontrol.activeTab` — last selection
- `devcontrol.collapsedGroups` — JSON map
- `devcontrol.logWidth` — number
- `devcontrol.autoScroll` — boolean

No migration logic — all keys are defensive-read with fallbacks.

## Common Extension Requests

### "Can I run this on a remote machine and access from my desktop?"
Technically yes — bind to `0.0.0.0`, expose port 3030. **Please don't.** No auth, arbitrary command execution. Only safe on your local machine.

If you really need this, put it behind an SSH tunnel:
```bash
ssh -L 3030:localhost:3030 user@remote
```

### "Can I have project-specific log colors?"
Not yet. Stderr is styled red-ish via the CSS. If you want per-project themes, add a `theme: { accentColor: '#...' }` to the project config and apply inline styles.

### "Can I define actions from a script?"
Not directly. You can write to `projects.json` and hit `GET /api/config` to reload (the server re-reads on each request). We considered a `watch: true` flag to reload UI automatically but it's not implemented.

### "What if two projects have the same `id`?"
`runningProcs` and `logs` keys are `${projectId}::${actionId}`. Duplicate `id` means collisions. No validation. Don't do it.

## Debugging Tips

### Server prints nothing when a command fails
The child's stderr is broadcast to the client log. Check the active tab in the UI, not the server console.

### Process won't stop
- Is it really the PID? `tasklist | findstr node` — the listed PID is the direct child (usually `cmd.exe` launching your command).
- `taskkill /T` kills the tree — but Windows can leave orphan child processes for ~2s. Rare.
- Nuclear option: restart the DevControl server.

### Changes to projects.json aren't showing
- The server re-reads on every `/api/config` request — so a refresh of the browser should pick it up.
- If the Settings Editor is open, it has its own `editConfig` state — close it first, then save via POST.

### Node version mismatch
- `http://localhost:3030/api/config` shows `activeNodeVersion` per project
- If it says "system" when you expect a specific version, check `%APPDATA%\nvm\` — does `v{version}*` exist?
- Check with `npx ng --version` in a terminal that inherits from the same PATH

## Release Notes for Future Contributors

- Keep `server.js` as one file unless it grows past 800 lines. Splitting earlier adds indirection without benefit.
- Before adding new dependencies, ask: can this be done with the stdlib + Alpine?
- Test in Chromium + Firefox before shipping. Edge case: clipboard API requires HTTPS on some configs; falls back silently.
- When adding a new setting, always give it a default that makes the old config work unchanged.

## Who To Ask

- **Hussein** — original author, knows all the gotchas
- **GitHub Issues** — for public questions
- **Internal Slack channel** — for teammates

Good luck, and welcome to DevControl. 🎛

# Contributing to DevControl

Thanks for wanting to improve DevControl! This is a small, focused tool — PRs for bugfixes, UI polish, and scoped features are all welcome.

## Setup

```bash
git clone <repo-url> dev-dashboard
cd dev-dashboard
npm install
npm start
```

That's it. Edit `public/*` or `server.js`, refresh browser (no build step).

## Code Style

- **No build step** — HTML / Alpine / Tailwind CDN. Keep it that way.
- **Tailwind classes in HTML** — avoid custom CSS unless unavoidable (e.g. scrollbars, animations).
- **Server is a single file** — `server.js`. If it gets over ~800 lines, discuss splitting.
- **No TypeScript** — keep the barrier to entry low. JSDoc is welcome.
- **2-space indentation**, single quotes in JS, double quotes in JSON.

## Branching

- `main` — stable, deployable
- `develop` — next release integration (if used)
- `feature/<short-desc>` — PR target
- `fix/<short-desc>` — bugfix PR

## Commit Messages

Conventional commits style:

```
feat: add git branch switcher in header
fix: escape taskkill argument for PIDs with spaces
docs: clarify nodeVersion matching in README
refactor: extract runActionInternal helper
```

## Testing

No test framework yet. Manual testing steps for a new feature:

1. Load `http://localhost:3030`
2. Switch between both demo projects
3. Trigger the feature
4. Check log panel output
5. Refresh browser — state should restore
6. Check DevTools console for errors

## Adding a Feature

1. **UI-only change** — edit `public/index.html` + `public/app.js`.
2. **New API endpoint** — add handler in `server.js`. Document in `ARCHITECTURE.md`.
3. **New action type** — update the switch in `runActionInternal`, add icon in `actionIcon()`, add option in settings editor `<select>`.
4. **New WebSocket event** — broadcast from server, handle in `connectWS()`.

## Documentation

Any user-facing change should update:

- `README.md` — if it changes user workflow
- `ROADMAP.md` — move from "In Progress" to "Shipped"
- `CHANGELOG.md` — under "[Unreleased]", promote to a version on release
- `ARCHITECTURE.md` — if it changes internals

## Pull Requests

- Keep PRs **small and focused** — one feature or fix at a time
- Include **before/after screenshots** for UI changes
- Reference related ROADMAP items if applicable
- If you're adding a dependency, **justify it** — this project prides itself on minimal deps

## Code of Conduct

Be kind. We're all here to make dev life less painful. Personal attacks, gatekeeping, and toxic behaviour are not welcome.

## Questions?

Open a GitHub Discussion or ping the maintainer.

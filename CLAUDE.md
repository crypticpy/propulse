# Propulse — Project Rules

## UX Rules

### No Flyout/Slide-in Panels

**NEVER** use side-of-browser flyout panels (position: fixed, slide-in from right/left).
They break user focus, appear off-screen, and don't match the app's interaction model.

Use instead:

- **Centered modals** with backdrop for detail views and confirmations
- **Inline expansion** within the current view for contextual editing
- **Popovers** anchored near the trigger element for quick actions

### Canvas-Based Views

For visual builder / flowchart views (Station Builder Lab):

- Use **zoom** (mouse wheel / pinch), not horizontal scroll
- Use **pan** (click-drag background, or middle-click drag)
- Equipment interactions: drag-and-drop like Kanban cards
- Keep user focus centered — no actions that move attention to browser edges

## Engineering Governance (Claude + Codex)

### Local-First Development Is Allowed

You can continue local iterative development without PRs while prototyping.
For stability, still use short-lived feature branches and small commits.
Move to PR-first for integration and release branches.

### Strict Local Quality Gates (No Warning Phase)

All agents must fix issues immediately when checks fail. Do not defer.

Required checks:

- `npm run lint`
- `npm run build`
- `npm run check:bundles`

Combined command:

- `npm run verify`

### Git Hooks (Auto-run Locally)

Install once per clone:

- `npm run hooks:install`

Hook behavior:

- `pre-commit`: blocks generated artifacts + oversized staged diffs, then runs lint
- `pre-push`: blocks oversized branch pushes, then runs full `npm run verify`

### Agent Rules for Failures

- Never \"fix\" by relaxing budgets or thresholds unless explicitly requested.
- Never bypass checks by adding broad ignores or disabling lint/type rules.
- Prefer structural fixes: code splitting, dead-code removal, dependency hygiene.
- Keep commits focused; avoid mixing refactors, generated data, and feature work.
- If a push is intentionally large, use explicit override: `ALLOW_LARGE_PUSH=1 git push ...`

### Repo Hygiene Rules

Do not commit generated/build artifacts:

- `node_modules/`, `dist/`, `dev-dist/`, `bridge/dist/`, `collector/dist/`
- `.next/`, `coverage/`, `.cache/`, `.vite/`, `.turbo/`
- `*.tsbuildinfo`, logs, tmp files

Lockfiles:

- `package-lock.json` is source-controlled and should be committed when dependencies change.

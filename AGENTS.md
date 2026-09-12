# Repository Guidelines

## Start here

- Read `docs/AGENT-CONSTITUTION.md` before claiming any work. It is the process: board, claims, branches, PRs, review, done.
- Work is tracked on GitHub Project **ProPulse Delivery** (Project #4), <https://github.com/users/crypticpy/projects/4>.
- One issue → one branch off `origin/main` in a worktree → one PR of at most 15 files with `Closes #N` (or `Refs #N` for a partial slice).
- Never force push, never rewrite a pushed branch, never relax a quality gate to get through.

## Project Structure & Module Organization

- `src/`: application source.
  - `src/main.tsx`: app entry (React, router, React Query).
  - `src/App.tsx`: top-level layout + routes.
  - `src/pages/`: route-level pages (e.g., `Home`, `SolarPulse`, `PropSphere`).
  - `src/components/`: reusable UI and feature components.
  - `src/hooks/`: data-fetching and UI hooks (prefixed `use*`).
  - `src/stores/`: Zustand stores (suffixed `*Store.ts`).
  - `src/lib/`: API clients, utilities, data, and IndexedDB helpers.
  - `src/styles/`: global CSS and design tokens.
- `api/`: Vercel-style serverless endpoints (`api/solar/*`, `api/spots/*`).
- `public/`: static assets served as-is.
- `dist/`: production build output (generated; do not edit).

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev`: run the Vite dev server.
- `npm run build`: typecheck (`tsc -b`) and build (`vite build`) into `dist/`.
- `npm run preview`: serve the built app locally (smoke-test production output).
- `npm run lint`: run ESLint across the repo.

## Coding Style & Naming Conventions

- Language: TypeScript (strict) + React function components.
- Formatting: follow existing code style (2-space indentation, trailing commas, double quotes).
- Naming: components `PascalCase.tsx`, hooks `useThing.ts`, stores `thingStore.ts`.
- Imports: prefer `@/…` alias for `src/` (configured in `vite.config.ts`/`tsconfig.json`).
- Styling: Tailwind CSS utilities + shared styles in `src/styles/` (`tailwind.config.js`).

## Testing Guidelines

- Vitest is configured: `npm run test` (runs the station-postgres harness, then `vitest run`). Bridge tests: `npm run test:bridge`. Radio daemon tests: `npm run test:radio-daemon`.
- The gate before pushing is `npm run verify`, which chains tracked-artifact, design-token, ML pre-registration/archive, production-boundary, and view-library type checks with lint, the full test suite, the build, and the bundle budget check.
- Focused runs: `npx vitest run <path>`.
- **One dev server per machine, at <http://localhost:5173>, owned by the human or the orchestrator. Agents never start one** — not `npm run dev`, not `npm run dev:session start`, not `vite` or `vite preview`, not a Playwright `webServer`, not any other listener — and never reach the site through another port, a tunnel, or a build. Before a rendered check, run `npm run dev:session -- status` (or `ps -axo pid=,command= | grep '[v]ite'`) and use the shared URL. If it is not running, report that and stop; do not start one. A brief that hands you a URL is the only authorization to use a server. If your PR needs a rendered check and no brief handed you a URL, leave a comment on the PR listing what to check (route, viewport, text scale, steps); the orchestrator or the human runs it on the shared server and posts the result. `npm run dev:session -- start` itself refuses when any dev server, managed or not, is already running. See `docs/guides/LOCAL-AGENT-TESTING.md` and the shared-machine rules in `CLAUDE.md`.
- The Playwright `scripts/check-hamclock-display.mjs` harness was retired (#780); do not run it or restore its selectors.

## Commit & Pull Request Guidelines

- Commits follow a lightweight Conventional Commits style (seen in history): `feat: …`, `refactor: …`.
- Branch names: `<type>/<epic-slug>-<task-slug>` (`type` is `feat`, `fix`, `docs`, `chore`, `refactor`, or `test`).
- PRs follow `.github/PULL_REQUEST_TEMPLATE.md`: `Closes #N` or `Refs #N`, an `Agent:` line, a test plan (commands run + pages verified), and risks/follow-ups. At most 15 files, base `main`, merge `main` in before review, drain every review thread, and workers do not merge their own PRs — see the Pull requests section of `docs/AGENT-CONSTITUTION.md`.
- Any design, and any PR that touches UI (anything a person sees; the path list is in the constitution), needs an `approved` **design review** comment from a Claude Fable session naming the current head SHA before merge; `pr-contract` checks the comment. Opus, Sonnet, Codex, Copilot, Sourcery, Grok and Composer reviews do not count — see the Design and UI review section of `docs/AGENT-CONSTITUTION.md`.
- After five bot review rounds on a PR, `.github/workflows/review-cap.yml` labels it `review-capped` and `pr-contract` blocks merge until an **architecture review** comment (`ship` or `redesign` verdict) names the current head; that review is posted by CI automation (`anthropics/claude-code-action@v1`), never by the fix agent, the orchestrator, or the owner — see the Review cap section of `docs/AGENT-CONSTITUTION.md`.

## Delivery Board

Work is tracked on [Project #4](https://github.com/users/crypticpy/projects/4). Read its README first: it names the delivery phases, the epic each item belongs to and the lead model per epic. Claim only items shown in the **Ready to work** view, inside the epic you were handed, P1 before P2 before P3, oldest first. Owner-gated items sit in **Owner decisions**; anything in **Future initiatives** is parked and not claimable. Keep `ready`/`blocked`/`needs-owner` and `size:*`/`difficulty:*` labels current, and record blockers as native blocked-by links; the board fields are synced from them at each sweep.

## GitHub API budget

Every session, sub-agent and bot on this machine shares ONE owner-token GraphQL budget (5,000 points/hour). Board sweeps and per-PR polling have drained it to zero and stalled everyone, so three GitHub Apps split the work, each with its own 12,500/hour budget:

- **Reads** (`pr view`, `pr checks`, `issue view`, review-thread listing, `api rate_limit`, any poll): `~/.config/propulse-reader/ghr`. Read-only App; it cannot comment, resolve or merge, so a wrong call fails instead of writing.
- **Writes** (comments, thread replies and resolves, merges, design reviews): `~/.config/propulse-bot/ghb`. Same CLI, the bot identity the base-branch ruleset accepts for merges.
- **Board** (reserved): `~/.config/propulse-board/ghp`. Currently inert: GitHub Apps only get a Projects permission on organization-owned projects, and Project #4 is user-owned. Do not use it until the project moves to an org.
- **Owner token** (`gh`): the user-owned Project #4 (no App can see it, for the reason above), `gh pr create` and `gh pr edit` (opening via the owner token triggers Codex's automatic review-on-open), and the `@codex review` trigger comment (Codex authorises by the commenting account; a bot-posted trigger gets no review). Never for status checks or polling.

Write `ghr` for reads and `ghb` for writes into every sub-agent brief; a brief that says `gh` is wrong.

- One census per sweep: fetch the PR or board state once with the minimal fields, cache it under `docs/plans.local/`, and work from the cache. Never re-query per PR, per thread or per poll.
- Poll a check at most once per 60 seconds, and prefer REST (`ghr api repos/{owner}/{repo}/commits/{sha}/check-runs`, the separate core budget) over `gh pr checks` in loops.
- Before any bulk loop, read `ghr api rate_limit` and stop when GraphQL remaining is under 1,000. Never `gh run rerun` to refresh a status.

## Configuration & API Notes

- Local dev proxies some `/api/*` paths to NOAA in `vite.config.ts` (keeps frontend calls consistent).
- `api/` routes are intended for deployment on Vercel; avoid putting secrets in client code.

## Coordinating local browser testing

- Read [Local agent testing](docs/guides/LOCAL-AGENT-TESTING.md) before using a server, including login and first-visit setup.
- Check `npm run dev:session -- status` (or `ps -axo pid=,command= | grep '[v]ite'`) for the one shared server at <http://localhost:5173>. Agents never start their own — see the single-server rule above.
- Different code changes still require separate worktrees for source edits; the shared server only covers the checkout it was started from.
- Verify the printed URL and `/__propulse_dev_session` identity before testing. Never stop or kill the shared server; it is not yours to end.

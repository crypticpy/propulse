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
- Browser verification follows `docs/guides/LOCAL-AGENT-TESTING.md`. Agents start dev servers only through `npm run dev:session` (check `status` first); plain `npm run dev` is reserved for the owner's manual use. See the shared-machine rules in `CLAUDE.md`.

## Commit & Pull Request Guidelines

- Commits follow a lightweight Conventional Commits style (seen in history): `feat: …`, `refactor: …`.
- Branch names: `<type>/<epic-slug>-<task-slug>` (`type` is `feat`, `fix`, `docs`, `chore`, `refactor`, or `test`).
- PRs follow `.github/PULL_REQUEST_TEMPLATE.md`: `Closes #N` or `Refs #N`, an `Agent:` line, a test plan (commands run + pages verified), and risks/follow-ups. At most 15 files, base `main`, merge `main` in before review, drain every review thread, and workers do not merge their own PRs — see the Pull requests section of `docs/AGENT-CONSTITUTION.md`.
- Any design, and any PR that touches UI (anything a person sees; the path list is in the constitution), needs an `approved` **design review** comment from a Claude Fable session naming the current head SHA before merge; `pr-contract` checks the comment. Opus, Sonnet, Codex, Copilot, Sourcery, Grok and Composer reviews do not count — see the Design and UI review section of `docs/AGENT-CONSTITUTION.md`.
- After five `@codex review` rounds on a PR, `pr-contract` labels it `review-capped` and blocks merge until an **architecture review** comment (`ship` or `redesign` verdict) names the current head; the fix agent stops fixing and never posts that review itself — see the Review cap section of `docs/AGENT-CONSTITUTION.md`.

## Configuration & API Notes

- Local dev proxies some `/api/*` paths to NOAA in `vite.config.ts` (keeps frontend calls consistent).
- `api/` routes are intended for deployment on Vercel; avoid putting secrets in client code.

## Coordinating local browser testing

- Read [Local agent testing](docs/guides/LOCAL-AGENT-TESTING.md) before launching or borrowing a server, including login and first-visit setup.
- Check `npm run dev:session -- status`; start owned sessions with `npm run dev:session -- start --owner <slug> --task <description> --profile local`.
- Different code changes require separate worktrees. Separate ports alone do not isolate HMR or source edits.
- Verify the printed URL and `/__propulse_dev_session` identity before testing. Stop only your own session; never kill shared Node/Vite processes broadly.

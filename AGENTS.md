# Repository Guidelines

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
- No automated test runner is currently configured (no `vitest`/`jest` scripts).
- Minimum bar before opening a PR: `npm run lint` and `npm run build`, plus manual UI checks via `npm run dev`.

## Commit & Pull Request Guidelines
- Commits follow a lightweight Conventional Commits style (seen in history): `feat: …`, `refactor: …`.
- PRs: include a short summary, testing notes (commands run + pages verified), and screenshots/GIFs for UI changes.

## Configuration & API Notes
- Local dev proxies some `/api/*` paths to NOAA in `vite.config.ts` (keeps frontend calls consistent).
- `api/` routes are intended for deployment on Vercel; avoid putting secrets in client code.

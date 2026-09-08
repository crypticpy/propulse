# Spots & Paths integration ledger

Live status/claims: [#510](https://github.com/crypticpy/propulse/issues/510) and
[Delivery project](https://github.com/users/crypticpy/projects/4). This is the SP-01
baseline record, not an independent task board.

- Baseline: `fd57fd525fd2857034e1badbd6018be6e4806c02`, origin/main inspected 2026-09-07.
- Contract version: 1. Freeze occurs only after SP-01 merge/acceptance on GitHub.
- Codex branch: `feat/spots-paths-sp01-codex`; unique session
  `codex-sp01-20260907-0845`; isolated worktree `/private/tmp/propulse-sp01-codex`.
- SP-01 owns `src/lib/views/{contracts,spotContracts,defaults,fixtures}.ts`, contract
  tests, type reexports and this documentation directory. No production wiring yet.
- Shared checkout has unrelated work; no bulk staging/reset or borrowed dev server.

| Lane | Ordered packages | File boundary |
| --- | --- | --- |
| Codex | #511 → #512 → #514; #520/#521 → #522 | contracts, persistence/sync, scoped runtimes, map integration, display lifecycle, final acceptance |
| Grok 1 | #515 → #516 → #519 | pure normalization/filter pipeline, geography/expansion, new preference components and recipe catalog |
| Grok 2 | #517 → #518 | pure motion/scheduler + AnimatedSpotTraces adapter; RayPathArc and point details |

Codex is sole reviewer/merger; Ready requires merged accepted native blockers.
Grok 2 waits for SP-04, not just SP-01. Renderer toolbars, PathArc/LiveSpotArcs,
globe/flat/azimuthal hit testing and Display Center wiring stay with Codex. Changes
to these boundaries or frozen signatures must be agreed in the relevant GitHub issue.

## Current-main findings

- `useSpotClustering` currently groups by geographic cells and does not read the
  camera. Rotation-dependent visibility is a reported symptom, not reproduced proof
  of camera-dependent grouping. SP-09 must isolate culling/hit tests vs membership.
- Prefix resolution can return US centroid 39.8,-98.6. Existing explicit/grid/prefix
  fallback explains a plausible central-US accumulation but not every reported spot.
- `spotDensity.ts` fetch budget is coupled to global displayDensity (50–200 fetch).
  SP-04/SP-09 separate ingestion from view budgeting to avoid starving other views.
- Main already includes HamClock foreground/control improvements (#497), shared
  page identities, strict kiosk migration, approximate location flags, and some
  finite-coordinate handling. Preserve these instead of recreating older code.
- #207 owns HamClock widget dialogs; #232 owns related chrome. HamClock keeps its
  centered dialogs and standalone pulse/classic/brass themes. PropSphere uses #481
  station tokens, including the existing plasma accent ID.
- #288 stays open. Numeric-default decision is in CONTRACTS.md and must be linked
  on GitHub. #160/#161 are prior scope/performance/lookup context, not acceptance
  evidence for this new work.

## Dependencies still requiring implementation/verification

- Geography packages pinned by lockfile: world-atlas2.0.2, world-countries5.1.0,
  us-atlas3.0.1, plus existing generated country boundaries. SP-05 must check license,
  source version, multipolygon/dateline behavior and Canadian provinces. No verified
  Canadian subdivision dataset is supplied by SP-01; explicit acquisition is required.
- Current display API has authenticated owner claim and token-based state reads,
  but localStorage holds one device identity per origin. Four same-origin TVs need
  scoped launch identity in SP-10. No per-account four-display cap was found in the
  inspected claim handler; that is not an entitlement or successful capacity test.
  State rate limit is 30/minute per IP: four 20-second polls use 12/minute before
  retries/nudges. Verify real auth, refresh, account switch and rate-limit backoff.
- Registered HamClock widget schemas must validate scoped imports before activation.
- Legacy cloud preference pull, backup import and LAN automatic apply still mutate
  global stores on this baseline. SP-02/SP-03 must remove those live-view write paths.

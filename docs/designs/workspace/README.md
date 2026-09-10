# Workspace design contact sheets

Owner-approved design record for the workspace canvases (issue #892). These are static,
self-contained HTML contact sheets — no build step, no external assets — checked into the
repo so any agent working from GitHub, or the Claude Design project sync, can see the
approved layouts without digging through local scratch directories.

- [`workspace-contact-sheet.html`](https://github.com/crypticpy/propulse/blob/main/docs/designs/workspace/workspace-contact-sheet.html) —
  the four workspace canvases: wall (the existing HamClock wall stays the wall canvas),
  workstation, tablet, and phone.
- [`heatmap-contact-sheet.html`](https://github.com/crypticpy/propulse/blob/main/docs/designs/workspace/heatmap-contact-sheet.html) —
  the heat-map sheet, v2, owner-approved on 2026-09-08. `HeatMapPanel` and `HeatMapStrip`
  (`src/components/workspace/widgets/HeatMapPanel.tsx`,
  `src/components/workspace/widgets/HeatMapStrip.tsx`) were built from it.

The HTML sheets live in the repo, not in the Claude Design project — the design-sync
guidelines glob only carries markdown, so only this README is mirrored there; the sheets
themselves are reachable through the links above.

Every workspace widget shown here is composed from the existing design-system components
tracked in the Claude Design project via `.design-sync/` (see `.design-sync/config.json`'s
`componentSrcMap`) — these sheets are a layout/composition record on top of that shared
component set, not a separate design language.

**Open decision:** the workspace sheet's audit note (§16, "the heat-map encoding itself is
two different pictures") proposes a baseline-ratio encoding — per-cell normalisation
against the same-UTC-hour baseline on a diverging quiet-grey / workable-green /
crowded-orange ramp — as an alternative to the v2 hue-by-verdict, opacity-by-traffic ramp
used in `heatmap-contact-sheet.html`. The owner has not chosen between them. Until then,
the v2 sheet is the built record (`HeatMapPanel`/`HeatMapStrip` implement it) and the
baseline-ratio proposal is a candidate, tracked on epic #892 (Phase D2.A).

Epic [#892](https://github.com/crypticpy/propulse/issues/892) is the plan of record for this work.

## Viewing

These are plain HTML files with inlined styles — open either file directly in a browser
(e.g. `open docs/designs/workspace/workspace-contact-sheet.html` on macOS, or drag it into
a browser tab). No dev server or build step is required.

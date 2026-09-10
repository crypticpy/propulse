# Workspace design contact sheets

Owner-approved design record for the workspace canvases (issue #892). These are static,
self-contained HTML contact sheets — no build step, no external assets — checked into the
repo so any agent working from GitHub, or the Claude Design project sync, can see the
approved layouts without digging through local scratch directories.

- [`workspace-contact-sheet.html`](./workspace-contact-sheet.html) — the four workspace
  canvases: wall (the existing HamClock wall stays the wall canvas), workstation, tablet,
  and phone.
- [`heatmap-contact-sheet.html`](./heatmap-contact-sheet.html) — the heat-map sheet, v2
  owner-approved. `HeatMapPanel` and `HeatMapStrip`
  (`src/components/workspace/widgets/HeatMapPanel.tsx`,
  `src/components/workspace/widgets/HeatMapStrip.tsx`) were built from this sheet.

Every workspace widget shown here is composed from the existing design-system components
tracked in the Claude Design project via `.design-sync/` (see `.design-sync/config.json`'s
`componentSrcMap`) — these sheets are a layout/composition record on top of that shared
component set, not a separate design language.

Epic [#892](https://github.com/crypticpy/propulse/issues/892) is the plan of record for this work.

## Viewing

These are plain HTML files with inlined styles — open either file directly in a browser
(e.g. `open docs/designs/workspace/workspace-contact-sheet.html` on macOS, or drag it into
a browser tab). No dev server or build step is required.

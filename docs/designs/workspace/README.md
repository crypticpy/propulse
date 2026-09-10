# Workspace design contact sheets

Design record for the workspace canvases (issue #892). These are static, self-contained
HTML contact sheets — no build step, no external assets — checked into the repo so any
agent working from GitHub, or the Claude Design project sync, can see them without digging
through local scratch directories.

- [`workspace-contact-sheet.html`](https://github.com/crypticpy/propulse/blob/main/docs/designs/workspace/workspace-contact-sheet.html) —
  the owner-reviewed design source for the four workspace canvases: wall (the existing
  HamClock wall stays the wall canvas), workstation, tablet, and phone. It is a review
  artifact, not a fully owner-approved spec — the sheet itself marks several rules as
  proposed and lists a set of open decisions; see "Not yet decided" below.
- [`heatmap-contact-sheet.html`](https://github.com/crypticpy/propulse/blob/main/docs/designs/workspace/heatmap-contact-sheet.html) —
  the heat-map sheet, v2, owner-approved on 2026-09-08. `HeatMapPanel` and `HeatMapStrip`
  (`src/components/workspace/widgets/HeatMapPanel.tsx`,
  `src/components/workspace/widgets/HeatMapStrip.tsx`) were built from it.

### Not yet decided

Items the workspace sheet (and, for the heat map, the heatmap sheet) raises but does not
resolve. Each is settled on epic #892 (Owner decisions), not in this README:

- **Tablet rules** — proposed defaults (`canvasRules.ts`), not owner-stated; moving them is
  a data change, not a code change (sheet, "Tablet rules are proposed defaults").
- **Page roaming** — does a page pin to the workspace, or roam with the operator? (sheet
  §2 notes, "does a page pin to the workspace, or roam with the operator?").
- **Auto-docking** — what happens when a rail is already full: refuse, evict, or spill to a
  new page? (sheet §2 notes, "what does auto-dock do when a rail is already full?").
- **Band visibility** — does it follow the operator, the placement, or the station profile?
  (sheet §2 notes; also raised in the heatmap sheet's notes).
- **Click behavior** — wall click opens a report, workstation click performs an action;
  confirm that split or add a modifier (sheet §2 notes; also raised in the heatmap sheet's
  notes as "does a cell click filter, or filter and open the report?").
- **Headline rule** — which default ships: hottest cell, newest opening, or best workable
  band? (sheet §2 notes; also raised in the heatmap sheet's notes).
- **Phone World scope** — a phone at a 44 px tap target cannot fit six columns in World
  scope; paged matrix, continent picker, or disabling World scope on phones are the three
  undrawn options (sheet §2 notes; heatmap sheet's notes, "Phone in World scope").
- **Heat-map encoding** — the workspace sheet's v2 hue/opacity ramp vs. the later
  baseline-ratio proposal from its own audit note; see "Open decision" below.
- **Cell tap target** — the 44 px tap-target rule is asserted at each density (wall,
  desk/workstation, phone) but not drawn as a single settled spec across all three; closest
  citations are the heatmap sheet's "44 px target rule" notes at desk density and in Phone
  in World scope. This one is not a separately enumerated open item in either sheet the way
  the others above are — flagging that here rather than overstating it as a distinct,
  named decision point.

**Heat-map sheet** — additional open questions raised only in the heatmap sheet's own notes:

- **Verdict vocabulary** — "One verdict vocabulary, or two?" (open / marginal / closed vs.
  the shipped five-state ladder).
- **Opacity ramp scaling** — "Is the opacity ramp linear or logarithmic?" (and whether the
  400-spot ceiling is fixed or rescales to the current maximum).
- **"Can't work this" hatching** — "What counts as 'can't work this'?" (whether a
  low-confidence Band Health "closed" should hatch a cell at all).
- **Footprint-mode ladder** — "Does 'My footprint' need its own ladder?" (footprint counts
  measure receptions of me, not verified opens).
- **Count vs. verdict windows** — "Window choice: 30 min / 2 h — or does the verdict window
  differ from the count window?"

This README is a summary, not the source of truth — each sheet's own "Notes for review" /
"Open decisions" block is authoritative; if this list and a sheet ever disagree, the sheet
wins.

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

## References in the sheet

`workspace-contact-sheet.html` cites `WORKSPACE-CONCEPT.md` (§3, §4, §5, §7, §9, §10)
throughout. That file is an untracked 2026-09-08 planning document under
`docs/plans.local/` — not part of this repo's tracked tree — so a reader following the
sheet's citations from GitHub cannot open it directly. The sheet itself is the
owner-reviewed design source and is not edited here; this section maps each citation to
where its decision now lives instead. `WORKSPACE-CONCEPT.md`'s decisions were carried into epic #652
(concept, decisions round 2); its plan is superseded by epic #892.

- **§3** — the widget registry ("one entry, four densities") → epic #892, Phase D3
  (registry table).
- **§4** — resolving the wall-report / workstation-action click split by putting
  "Open report" in every widget header → epic #652 (shared operating state). Note: this
  citation is about a per-widget interaction convention rather than state itself; flagged
  as an approximate mapping in the PR discussion.
- **§5** — recipes A–D ("Recipe D … ships last", depends on the operating-session object)
  → epic #652 (recipes).
- **§7** — reusing `HamClockDialog`/`HamClockTabs`/`HamClockToggleRow`/`HamClockSegmented`
  verbatim, no new dialog shell → superseded by epic #892, Phase B (blocked until D4).
- **§9** — "PR 1 in WORKSPACE-CONCEPT.md §9 (heat map compute + baseline)" → superseded by
  epic #892, Phase B (blocked until D4). This is the citation that is literally about PR
  sequencing.
- **§10** — pin-by-default vs. recipes-roam for pages → superseded by epic #892, Phase B
  (blocked until D4). Note: this citation is about page pin/roam behavior rather than PR
  sequencing itself; flagged as an approximate mapping in the PR discussion.

## Viewing

These are plain HTML files with inlined styles — open either file directly in a browser
(e.g. `open docs/designs/workspace/workspace-contact-sheet.html` on macOS, or drag it into
a browser tab). No dev server or build step is required.

# Color system consolidation

Epic: [#1256](https://github.com/crypticpy/propulse/issues/1256). Census task: [#1257](https://github.com/crypticpy/propulse/issues/1257).

Status: design direction reviewed; census tooling and ownership baseline in review. Application migration has not started. Source baseline: `5d6fc51396f220e5275f0651147029b197c9b8c3` (2026-09-12).

## Contract

The [station design system](../design-system/README.md) remains the color authority for application UI. Extend its existing `stationTokens`, `StationTone`, `su-tone-*`, badges, notices and actions. Add shared treatments that combine foreground, fill, border and interaction states; consumers keep their layout, native semantics and events. A palette change alone cannot fix independently composed foreground/background pairs.

The [visual comfort contract](../station-ui/VISUAL-COMFORT.md) applies: primary text reaches 7:1 on canvas/panel/input, secondary and status text reaches 4.5:1, status retains words and notices retain icons. Selection and focus remain visible without relying on hue. Preserve live text, scale propagation into portals, reduced-motion behavior and comfortable targets. No text glow or whole-element fading that compromises readable content.

The owner authorized Codex to lead this epic with sub-agents and to perform the design review against the checked-in Claude Design system. Review records identify Codex accurately. This task-specific reviewer override does not remove technical checks or rendered verification. An automated check that cannot represent that authorization must be reconciled explicitly; never manufacture a Fable identity or approval.

## Homes and interfaces

| Concern | Authority | Consumers and boundaries |
| --- | --- | --- |
| Theme palettes, accessibility transforms, accent contrast | Existing `src/lib/themes/stationTokens.ts` and `colorblind.ts` | Root and `StationProvider` use the same resolver. Preserve scoped previews and portal inheritance. |
| Semantic treatment combinations | `src/lib/themes/treatments.ts` (new), existing station CSS/primitives | `subtle`, `solid`, `outline` and demonstrated interactive states. No arbitrary per-call tint/border opacity API. |
| Content-family accents | Existing `src/lib/themes/sectionAccent.ts` | Preserve `data-accent`, shared section anatomy, and family-to-tone meaning. |
| Domain categorical palettes and measured scales | `src/lib/colors/palettes/` (new, named modules) | Pure data/resolvers feed DOM adapters, canvas/WebGL, legends and previews. Do not import React/Three renderers just to get colors. |
| Color setting metadata | `src/lib/appearance/` (new, scoped modules) | One default, options list, validation and reset contract per setting. Existing stores retain persistence. |
| Saved views and settings transfer | Existing `src/lib/views/`, preference sync and backup adapters | Reuse appearance definitions at boundaries; preserve saved schemas, old payloads and import/export round trips. |
| Nonstation themes and decorative identity | Registered independent namespaces | HamClock keeps `--hc-*`; rank and map identities remain named domains. No competing feature UI theme variables. |
| Startup and build aliases | Existing root fallback CSS and Tailwind aliases | Generate or consistency-test fallback values; don't maintain another hand-copied palette. |
| Claude Design component mirrors | Existing `.design-sync` exports and previews | Preserve `Badge`/`StationBadge` compatibility while migrating. Record remote sync status separately from local source changes. |

Proposed minimal API, to finalize with the first implementation slice:

```ts
stationTreatmentClasses({
  tone: "warning",
  treatment: "subtle",
  interactive: true,
});
```

Return static, build-discoverable class names. CSS owns hover/focus/selected treatments, with explicit state selectors supported by actual callers. Extend existing primitives and retain compatibility adapters while consumers migrate. Do not create a third badge library or a universal polymorphic component. CSS used by global consumers must load without applying the scoped station typography/layout reset globally.

Subtle status text defaults to `--su-text`; solid fills need independently resolved foregrounds. Validate actual composited surfaces and state layers. Existing station badge fills are opaque panel mixes at 6%, while legacy consumers use transparent tints at several strengths. Unifying these is a reviewed visual decision, not an assumption of pixel identity. `/20` is not a universal safety guarantee.

## Reviewed ownership ledger

The ledger assigns each discovered family a home; individual lexical candidates remain subject to migration review. A retained namespace is intentional ownership, not an excuse for untracked duplication.

| Family / current entry points | Disposition | Preserve or correct |
| --- | --- | --- |
| Station UI and legacy `ui/Badge.tsx` | Extend recipes; adapt consumers | Foreground overrides, scoped CSS, refs, native semantics, hint/icon inheritance. Decorative purple `quiet` is not automatically neutral. |
| Conditions / `bands.ts`, verdict presentation, operating status | Domain state-to-role maps | Scientific thresholds and operational state transitions stay in their current domains. |
| `spotColors.ts` | Named spot palette authority | Raw renderer fills differ from theme-safe text. Preserve band lookup, mode aliases, SNR/age scales, missing-data fallback and replay brown. |
| `qsoBandColors.ts`, `wsprBandColors.ts` | Separate named contexts | QSO normalization/fallback and WSPR exclusive MHz bounds differ from spot allocation ranges in kHz. `BandPill` continues to use spot band identity. |
| SDR `modeColors.ts` | SDR context plus UI recipe adapter | SDR CW cyan differs from spot CW amber; digital groupings also differ. |
| `ColorsPopover`, `StyleSelector`, Preferences | Shared map setting options and previews | Correct the two-option versus four-option mismatch; derive previews from renderer palettes. High-viz retains its 2D scope. |
| `waterfallPalette.ts` | Extract palette definitions/adapters | Retain LUT/gamma caching, gradients and scaling; leave frequency/passband algorithms with SDR. |
| SDR settings modal, hook and settings store | Shared setting specs | Eliminate duplicated defaults/resets; preserve `auto`, CSS rgba alpha, gamma and blend semantics. A hex-only input must not destroy alpha. |
| Appearance section/preset control and theme store | Shared global setting metadata | Preserve custom primary/saturation and cross-tab behavior. Correct reachable copy promising secondary global highlight changes; secondary currently serves the swatch. |
| View contracts/defaults/presets and legacy view conversion | Shared definitions through schema adapters | Preserve versioned view semantics, explicit overrides and accepted legacy `customSecondary`; retirement from active UI does not authorize breaking old saved views. |
| `preferencesSync.ts` and `settingsBackup.ts` | Transfer adapters to existing stores and shared specs | Audit direct theme-state writes, sync fields, exported/imported settings and per-pin colors. Centralization includes transfer paths, not only local controls. |
| Color-blind setting/hook/resolver | Shared accessibility metadata | Every theme write includes the setting; no late overlay undoing the active mode. |
| Workspace heatmap compute/store/display settings | Named bucket presets and setting specs | Preserve threshold meaning, CSS-token user colors, and intentional reset of colors and thresholds when switching preset. |
| HamClock theme/display settings and wall heatmap | Retain registered wall namespace | Pulse/Classic/Brass, theme fonts, bucket-to-wall-tone mapping, no-baseline hatch and ladder clamp. |
| Solar chart series / wall reports | Shared chart definitions with current adapter | Keep `--hcr-chart-*` over `--su-*` fallback, observed/estimated/predicted semantics and line shapes. |
| Map beacon/NVIS opacity | Shared map specs | Preserve independent storage keys, clamps and layer scopes. |
| Pins and categories | Named pin palette, entity overrides | User pin colors remain per-entity data; sync and presets cannot overwrite them with global accent changes. |
| Satellite tracks, FT8, grid activity and activation markers | Named map palettes | Preserve live/replay distinctions, selected/occluded visibility and renderer-specific contrast. |
| Weather, lightning, earthquakes, cyclone, rivers, ionosphere overlays | Named measured/categorical scales | Move renderer-embedded constants to pure modules; legends share entries, units, bounds and missing-data behavior. |
| MUF overlay, legend, flat raster and embedded GLSL | One scale with CPU/GLSL/legend adapters | Replace hand-matched ramp copies; preserve MHz thresholds, interpolation and modeled-versus-observed meaning. |
| `types/livespot.ts` source colors and `types/pin.ts` category colors | Pure domain palette definitions | Schema directories are not an exemption from visual ownership; preserve source/category identities and compatibility exports. |
| Profile/share card rendering and exported images | Explicit export palette/context | Background/foreground pair validated in the exported output; do not assume app DOM variables exist in canvas. |
| Rank, awards, radio ports and decorative identity | Registered decorative palettes | Meaningful labels use readable text recipes; effects do not reduce text legibility. |
| Shader colors and external basemaps | Explicit renderer/external ownership | Review numeric color vectors separately from geometry; external tiles and provider imagery are not theme-token migration targets. |
| Static logos, attribution and generated FT8 artifacts | Retain assets with named exceptions | Preserve brand/attribution identity; do not edit generated/vendor binary assets as appearance code. |

## Persistence contracts

| Scope | Existing persistence | Requirements |
| --- | --- | --- |
| Global theme | `propulse-theme`, manual persistence | Preserve theme/accent/custom-primary/saturation; validate old or malformed blobs and storage events. |
| Accessibility, map UI, SDR | `propulse-settings`, version 39 at baseline | Keep store ownership; introduce shared definitions through adapters before considering migration. |
| Workspace heatmaps | `propulse-workspace-store`, version 3 | Per-workspace colors and thresholds; support valid CSS-token references. |
| HamClock display | `propulse-hamclock-display`, version 11 | Theme belongs to `hamclockDisplayStore`, not the layout store. |
| Map layer opacity | `propulse-beacon-inactive-opacity`, `propulse-nvis-opacity` | Independent numeric validation and reset semantics. |
| Pins | `propulse-pins`, version 1, existing entity sync | Preserve user colors as entity data. |
| Saved views and transfer payloads | Existing view schemas, preference sync and settings backup formats | Preserve accepted legacy fields, migration behavior and import/export round trips. Validate resolved theme updates after sync as well as direct UI edits. |

`SettingSpec<T>` should distinguish automatic values, manual hex colors, alpha-bearing CSS colors and supported token references. Centralized definitions do not require a mega-store or moving every control out of its contextual UI. A persistence move requires an explicit migration and rollback tests.

## Paused hue PRs

On 2026-09-12 the owner requested that standalone hue changes pause in favor of this epic. All thirteen PRs below were converted to drafts, each received a coordination comment, and a follow-up census verified their heads were unchanged. No branch or worktree was deleted, no commits were rewritten, and merged fixes remain in main. [#844](https://github.com/crypticpy/propulse/issues/844) stays open and is blocked by #1256 until coverage is reconciled.

| Batch | PR | Preserved head | Migration family |
| --- | --- | --- | --- |
| 9 | #1223 | `4aa58ded` | DX console / scheduling / WSJT-X |
| 10 | #1224 | `dd8949b9` | Settings / account / spot-library confirmation |
| 11 | #1227 | `654cdb9b` | QSO / QSL / conflict feedback |
| 12 | #1228 | `d8434f4e` | Contest controls and status |
| 13 | #1229 | `6fd0f60a` | Logbook awards and lookup |
| 14 | #1231 | `0dc09014` | Alerts / emcomm / DX / export / location |
| 15 | #1232 | `ac5730b9` | HamClock panels / ops / profile lookup |
| 16 | #1233 | `90d1d488` | Map band conditions / selected spot / forecast |
| 17 | #1235 | `acc596dc` | SDR controls and skins |
| 18 | #1237 | `fab27b27` | SDR EQ / slices / tabs |
| 19 | #1239 | `490d4977` | Equipment detail/hero, chain warnings, sharing |
| 20 | #1241 | `9ceda529` | Credentials and subscriptions |
| 21 | #1242 | `8adcff92` | Weather / contest / DX / QSO / SDR leftovers |

Batch 19 remains the vertical slice. Retain meaningful behavioral fixes found during prior review. The [integration handoff on #844](https://github.com/crypticpy/propulse/issues/844) preserves local changes for #1223, #1224, #1227 and #1228, including narrow-layout clipping, destructive hover feedback, bulk-action/conflict-footer overflow and Light-theme headings. Those worktrees may contain uncommitted repairs; inspect and port selectively rather than resetting them or merging their batch-specific test structures.

## Delivery and completion

| Task | Issue | Gate before next task |
| --- | --- | --- |
| COLOR-01 census | #1257 | Reproducible candidate ledger, reviewed family ownership, paused-PR reconciliation, detection limits. |
| COLOR-02 recipes | #1258 | Shared token/state/surface contract and central numerical tests; existing primitives consume it. |
| COLOR-03 vertical slice | #1259 | Eight batch-19 sites migrated; real state/interaction checks and rendered evidence. |
| COLOR-04 UI migration | #1260 | Every UI family migrated or explicitly retained with ownership; split into <=15-file child PRs. |
| COLOR-05 domain palettes | #1261 | Renderer, preview and legend agreement; units, thresholds and contexts preserved. |
| COLOR-06 settings | #1262 | One definition per setting, accurate UI, persisted preferences and reset behavior verified. |
| COLOR-07 enforcement | #1263 | New ad hoc combinations caught; batch tests retired only after tracing replacement coverage. |
| COLOR-08 closure | #1264 | Gallery/docs, technical gates, rendered review, real-operator gate disposition, final ledger counts and deployment evidence. |

The lead owns shared tokens, CSS, settingsStore, exports and integration. Sub-agents receive disjoint file ownership and the agreed API; helpers read/edit/test but do not commit, push, write to GitHub or deploy. A review helper evaluates concrete changes independently. Dependency tasks wait for merged prerequisites; unmerged partial work is never reported Done.

The contrast matrix uses actual resolved tokens across all four themes, accessibility modes, supported saturation values and boundary/custom accents. Test composited glass/hover states, inherited text, solid fills, disabled/pending states and animations. Keep semantic static enforcement separate from rendered proof. The existing token guard bans selected raw color syntax; it does not establish a safe recipe or prove contrast.

Rendered review covers affected phone/tablet/workstation/wall layouts at 390/834/1920/3840 widths and supported text scales, plus the visual-comfort contract's reflow/spacing checks. Reuse the authorized shared server and test harness; no helper starts a listener. Source-only census work needs no browser claim. Remote Claude Design mirror updates and production deployment are distinct closure evidence.

The visual-comfort contract also names real-operator validation [W22 #194](https://github.com/crypticpy/propulse/issues/194) before final cutover. COLOR-08 must link the applicable participant evidence or record an explicit scoped disposition of that dependency before closure. Browser emulation, numerical contrast and a Codex review are not substitutes for participant observations. This final-cutover requirement does not prevent inventory or foundation implementation.

## Census usage

`scripts/color-system-census.py` reads a pinned Git tree, never untracked worktrees or dirty source. Write output under ignored local storage or a temporary directory:

```sh
python3 scripts/color-system-census.py --ref 5d6fc51396f220e5275f0651147029b197c9b8c3 --out /tmp/propulse-color-census
python3 scripts/color-system-census.test.py
```

An optional `--prs` path accepts a cached `ghr pr list --json number,title,headRefOid,files,url` result for overlap hints. It does not contact GitHub. Refresh that cache before editing an area; a snapshot is not a lock. Candidate JSON and generated reports remain untracked; this reviewed ownership contract is maintained by hand.

The maintained scanner at the pinned baseline scans 2,068 production text files and finds 28,752 overlapping lexical candidates. It separately scans 230 design-preview text files and finds 265 candidates. These are not violation counts or counts of visible controls. The initial exploratory scan counted four additional generated source files and missed two native color-input references; fixture tests corrected those differences in the maintained scanner. The separate domain audit identified 44 ownership contracts and 21 setting fields; its matches overlap the UI scan and must not be added to that total.

The census is lexical, not an AST, reachability or computed-style proof. Comments and noncolor tokens can be candidates; dynamic classes, API colors and numeric shader colors require manual review. Binary/vendor assets are retained as classified exceptions. No claim of exhaustive per-element accessibility approval follows from a zero-unclassified-family ledger. Each migration task resolves its individual candidates and records retained exceptions.

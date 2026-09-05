# Profile and shack redesign punch list

Planning only. Baseline: released `d052ec17`. Scope excludes HamClock. No implementation changes were made.

Priority records the original design importance, not execution order or calendar estimates. The approved [delivery plan](DELIVERY-PLAN.md) sequences implementation by technical dependencies. Existing chain, sync, operating-context, and profile contracts should be preserved during migration.

## Editing contract requirements

| ID | Priority | Deliverable | Acceptance criteria |
|---|---|---|---|
| S01 | P0 | Separate editor selection from operating selection | Opening, expanding, collapsing, duplicating, or editing a setup never changes active operating context. Only Use in ProPulse does. Edits to the in-use setup also remain a draft, marked Changes not yet in use; promotion selects a reviewed revision. An incomplete draft cannot silently replace a working setup. |
| S02 | P0 | Honor insertion intent | Dropping/clicking a gap inserts there, or previews why another location is required before commit. Inline gear selects an explicit cable run rather than the first run. |
| S03 | P0 | Reversible ordinary edits | Add, remove from setup, reconnect, move, reorder and auto-layout have undo/redo. Shared inventory deletion is a separate operation with reference impact shown. |
| S04 | P0 | Make existing connection controls discoverable | A user can create radio→cable→antenna through labeled buttons without dragging or context menus. Insert and Connect to… are visible on selection. |
| S05 | P0 | Review experiment promotion | Preview never changes physical inventory. Save as new setup is the default. Shared updates identify other affected setups and apply only selected changes. Used configurations pin reviewed equipment inputs; updated measurements prompt review without rewriting existing log entries. |
| S06 | P0 | Honest capabilities and publication | Calculations visibly say Estimated and expose inputs/assumptions. Missing input is Unknown, not zero. Verify owner/friend/visitor projections, caches and image delivery before expanding public detail. |

## Workbench and profile requirements

| ID | Priority | Deliverable | Acceptance criteria |
|---|---|---|---|
| S07 | P1 | Guided first setup | Start from a simple HF/portable/receive-only example or blank setup. Add custom gear and save incomplete specifications. Finish in the same editor used later. |
| S08 | P1 | Explicit graph model | Stable equipment, device port, connection and setup IDs; layout coordinates separate from connections. Existing ordered chains migrate without silently creating unsupported branches or changing the selected setup. |
| S09 | P1 | Selected RF route and switch state | A switch has actual modeled ports and an explicitly selected intended route. Exclusive-route conflicts and unknown compatibility are distinct. Drawing a branch never means hardware switched. |
| S10 | P1 | Diagram/list parity | Mouse, touch and keyboard can add, connect, reconnect, inspect, reorder and remove. No essential operation depends on tiny handles. Focus survives edits, cancellation and undo. |
| S11 | P1 | Practical gear inventory | Catalog model and owned physical instance are distinct. Custom/homebrew/legacy items, partial specs, owned/borrowed/planned/retired status, labels/photos, and Used in… references are supported. Preserve existing metadata fields. |
| S12 | P1 | Personal profile composition | Choose featured setup, show/hide/reorder modules, set cover crop/accent/theme/density, reset layout and preview audience. Exact location, serials, receipts and private notes do not publish automatically. |
| S13 | P1 | Measurement provenance | Separate assumptions from measurements; store frequency, date, point and source. Scenario assumptions cannot become measured SWR through a generic Apply action. |

## Extended views and documentation requirements

| ID | Priority | Deliverable | Acceptance criteria |
|---|---|---|---|
| S14 | P2 | Broader station documentation | Optional power, audio, control and bonding layers have recorded typed endpoints. Unsupported analysis is labeled; documentation is not presented as a validated installation. |
| S15 | P2 | Named comparison notebook | Save alternate gear/routes, compare changes at a fixed band/power, keep build/measurement notes, and restore prior revisions. |
| S16 | P2 | Share and print | Export a sanitized diagram and connection schedule with chosen audience/detail, readable monochrome labels, and estimate/provenance context. |
| S17 | Later | Physical rack/bench view | Optional arrangement of the same equipment graph; switching views does not change connectivity. Generic/custom equipment works without a bespoke image. |

## Model boundaries to establish before a graph-editor library is selected

| Concept | Owns | Must not own |
|---|---|---|
| Equipment model | Reusable catalog/manual specifications and port templates | Ownership, serial number or personal notes |
| Equipment instance | Physical item identity, lifecycle, measured details, private metadata | A global inferred operating state from an open editor |
| Setup | Equipment references, connections, selected modeled routes, settings and location association | Copies that silently fork the same physical item |
| Canvas layout | Positions, groups, view preferences | Electrical connectivity |
| Experiment | Baseline revision and explicit overrides | Unreviewed writes to shared inventory |
| Operating selection | The setup/route/revision currently used by relevant app context | Editor expansion or hardware telemetry |
| Published profile | Audience-correct selected summaries/media/modules | Raw working records or private metadata |

Keep the existing station calculation engine behind an adapter that extracts a supported ordered RF route from the graph. Preserve unsupported topology as documentation with explicit calculation limits. Do not route arbitrary power/audio/control diagrams through an RF loss engine.

Switch and adapter compatibility must use recorded port role, signal class, connector and relevant ratings. Missing information produces Unknown. A definite modeled conflict requires explicit contradictory data; inferred defaults should not produce a verified status.

## Evidence map

These are source observations, not all established production defects. Links pin the baseline for future review.

| Finding | Baseline evidence |
|---|---|
| Outer Equipment/Diagram/Performance views plus an inner overview/edit switch | [ShackPage](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/pages/ShackPage.tsx), [AllChainsView](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/components/shack/builder/AllChainsView.tsx) |
| Expansion/collapse changes activeChainId; drop handler ignores its requested position | [AllChainsView](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/components/shack/builder/AllChainsView.tsx) |
| The existing model is an ordered pipeline, not a port/edge graph | [stationChain types](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/types/stationChain.ts) |
| Preview sandbox and selected-band SWR preservation already exist; promotion writes shared inventory | [WhatIfSimulator](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/components/shack/WhatIfSimulator.tsx) |
| Engine assumptions and warning codes are useful foundations | [stationChainEngine](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/lib/station/stationChainEngine.ts) |
| Photos, a public sketch and equipment cards already exist; estimate labels can improve | [PublicShackPanel](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/components/profile/PublicShackPanel.tsx) |
| Section-level Friends rendering and media delivery require an audience audit; no live leak established | [ProfilePage](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/pages/ProfilePage.tsx), [VisibilitySettings](https://github.com/crypticpy/propulse/blob/d052ec177d9c190da9fe788d65297e1a756ff158/src/components/profile/VisibilitySettings.tsx) |
| A non-drag pointer method and keyboard access are separate requirements | [W3C SC 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [W3C G219](https://www.w3.org/WAI/WCAG22/Techniques/general/G219.html) |

## Approved execution order

The owner approved dependency-first construction on 5 September 2026 because there are no live users yet. The [delivery plan](DELIVERY-PLAN.md) supersedes the earlier S01–S05 patch-first suggestion: contracts and fixtures → durable data/access boundaries → graph and operating services → accessible workbench → profile/alternate views → integrated validation and cutover. Preserve existing owner/development records during migration. Every requirement above maps to GitHub implementation issues, including S17.

Do not spend the first implementation on a photo-realistic 3D room, arbitrary profile CSS, equipment wealth rankings, a universal station score, or claims that diagram completeness proves installation quality.

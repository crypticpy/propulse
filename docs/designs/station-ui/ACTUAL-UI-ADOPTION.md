# Station language on the working application

6 September 2026 · parent [#173](https://github.com/crypticpy/propulse/issues/173) · contributes to W10 #183, W11 #184, W12 #185 and W16 #189.

The owner approved the station primitives and then explicitly prioritized the actual shack/profile design build over further storage implementation. This slice applies the approved library to the existing working application. It preserves its real stores and access rules; the remaining canonical draft, service and publication integrations are still separate acceptance criteria.

## Delivered surfaces

- `/shack`: a responsive station workspace with Workbench, My gear, and Performance & experiments. View/category links survive reload and support browser history. Existing rank background and the application header remain in place.
- Workbench: equipment shelf, visible add/configure/swap actions, canvas and ordered path-list alternatives, named path controls, equipment search, centered inspectors, and collapsible performance detail. The existing schematic overview, ground connections, chain warnings, bands, loss budget, power, duplication and confirmed removal remain available.
- My gear: all five existing inventory managers with category filtering. A new operator can choose guided setup or immediately add individual equipment. Existing photos, metadata, custom radio definitions, active radio selection and equipment detail/history controls remain available.
- Equipment editing: approved labeled controls and centered dialogs for the real inventory flows, using their existing save handlers and validation. Insertion and inventory deletion remain distinct actions.
- `/profile`: owner identity, station story, interests, operating schedule/frequencies, on-air state, nets, equipment, QSL, stats/records, awards and social/sharing controls retain their data paths. Mobile identity editing opens the real form. Equipment summaries show readable rows rather than truncated miniature cards.
- Visitor profiles: the same common page language, retaining the existing configured-client authentication gate, visibility checks, follow/unfollow behavior, public station projection and per-tab content.

## Behavior boundaries

Current signal-path changes save directly. Opening a path selects it in ProPulse. The interface says so; it does not present a separate uncommitted draft or imply physical radio switching. Performance remains an estimate from the existing engine.

This is not completion of W10, W11, W12 or W16. Canonical service integration, independent edit/use state, React Flow replacement, explicit named-port connection authoring, undo/redo, profile module ordering, persisted composition controls and friend/visitor projection previews remain tracked in their work packages. Existing privacy behavior is retained; this slice does not broaden publication.

HamClock display and the global application header are outside this change.

## Verification

`node scripts/check-station-workspace.mjs <owned-local-url>` refuses an unmanaged or different checkout and requires the `station-profile-ui` owner. It uses disposable browser state, synthetic equipment and the existing development logbook fixture. It checks empty inventory access, all three real shack views in four palettes, mobile reflow, and all five owner profile tabs. Evidence and server identity are written under ignored `tmp/station-workspace/`.

Focused tests cover the actual stored path/order controls, equipment selection/inventory navigation, and visitor access/visibility/follow bindings. Additional owned browser checks exercise create/edit/reload of equipment and mobile profile identity saves. Local tests do not establish real Supabase login, cross-device synchronization or an independently verified visitor projection API.

The normal lint, production build and bundle checks are required before merge. Visual inspection uses the existing theme preferences with softer station text tokens; it is not a claim of complete screen-reader or physical-monitor certification.

## Actual browser evidence

[Workbench, dark](evidence/actual-pages/workbench-dark.png) · [Workbench, light](evidence/actual-pages/workbench-light.png) · [Owner profile](evidence/actual-pages/profile-desktop.png) · [Mobile profile](evidence/actual-pages/profile-mobile.png).

These are local application screenshots with synthetic station/equipment data. The mobile capture shows the app's fixed scrolling viewport. They are implementation evidence, not ImageGen concepts or evidence of production authentication.

# ProPulse station design library

Version 1 · 5 September 2026 · [Delivery #219](https://github.com/crypticpy/propulse/issues/219) · child of [W01 #174](https://github.com/crypticpy/propulse/issues/174)

The approved navy/orange visual direction now has a shared React implementation. Import components from `@/components/station-ui`. The catalog is at `/design-system`; the representative working page is at `/design-system/add-equipment`. Both are public, data-free review routes. All existing application routes retain their auth gate and operating hosts.

**Review gate:** Codex implemented this foundation personally. The owner reviews the deployed equipment page before broad UI implementation is assigned to other agents. Publication of this library does not complete W01, unlock its dependents, or authorize changes to Claude's HamClock work.

## Design decisions

- Deep navy canvas and surfaces, plasma orange primary actions with a calculated contrasting label, muted cyan information/focus. Status always has a label; notices add an icon.
- Inter for body and controls, Orbitron for page/brand emphasis, JetBrains Mono for callsigns, measurements and technical identifiers. Existing font assets and app text scaling are reused.
- 4/8 px spacing rhythm; 8 px controls and 12 px surfaces. Comfortable controls are 44 px at the default text scale. Compact desktop controls are 40 px; coarse pointers retain 44 px targets.
- Four semantic palettes: deep space, daylight, high contrast and midnight. A provider follows existing app theme/accent preferences unless given a local override. Review controls never persist changes to the user's theme settings.
- Native input, select, checkbox, radio, details and button behavior comes first. Focus outlines, text errors, keyboard tab navigation and explicit reorder buttons are part of the shared implementation.
- Modal focus, Escape isolation, background inertness and focus restoration use the existing `AccessibleDialog`. The wrapper carries scoped theme tokens into its portal.
- Styles live under the `station-ui` / `su-` namespace. No global palette, legacy component or HamClock change is required.

## Component inventory and contracts

| Group | Exports | Consumer contract |
|---|---|---|
| Theme | `StationProvider`, `stationTokens`, `stationPalettes`, `stationContrast` | Wrap each feature boundary. Optional `theme`, `accent`, `density`; omit to follow app preferences. Keep tokens semantic. |
| Actions | `Button`, `IconButton`, `ActionLink` | Button defaults to `type="button"`; explicit `type="submit"` for forms. `pending` disables and announces busy. IconButton requires `label`. Links navigate; buttons act. |
| Fields | `Field`, `TextField`, `SelectField`, `TextAreaField` | Native attributes and refs are forwarded. `label`, `hint`, `error`, `required` wire accessible descriptions. Field's render prop supports specialized native controls. |
| Selection | `Checkbox`, `Switch`, `ChoiceGroup` | Controlled or native uncontrolled inputs. ChoiceGroup needs a unique option value; it uses native radio keyboard behavior. |
| Media | `ImagePicker`, `Avatar` | ImagePicker validates MIME, size and preview decode; consumer owns file storage and object URL lifetime. No upload is implied. Avatar accepts `name` and optional `src`. |
| Layout | `Stack`, `Inline`, `Grid`, `Surface`, `Divider`, `PageHeader`, `Section`, `ActionBar`, `Disclosure` | Surface owns its inset; Section supplies an h2 and grouping. One PageHeader/h1 per page. Disclosure is native details. Grid collapses on small screens. |
| Feedback | `Badge`, `ProvenanceBadge`, `Notice`, `EmptyState`, `Skeleton` | Tone is not a domain status. Provenance is measured/manufacturer/declared/estimated/unknown. Set Notice `live` only for changing feedback; default notices do not announce on mount. |
| Navigation | `SectionNav`, `Tabs` | SectionNav takes href/label/current. Tabs takes value/onChange/items; unique values, automatic activation, arrows/Home/End, disabled items skipped. |
| Overlays | `Dialog`, `Drawer` | `open`, `onClose`, `title`, optional description/footer. Keep a trigger mounted for focus return. Consumer handles dirty-form confirmation and save lifecycle. |
| Data | `KeyValueList`, `Table` | KeyValueList takes label/value pairs. Table requires a caption; supply proper header cells and scopes. Scroll region supports keyboard overflow. |
| Station objects | `EquipmentGlyph`, `EquipmentTile`, `PortButton`, `ConnectionPreview`, `SetupStatus`, `ReorderControls` | Presentation only. Selection callbacks never switch hardware. Name each port. Editing and using are separate labels. Supply both reorder callbacks and boundary states. |

Public prop types are exported for controls/provider/fields/equipment kind. Other component props can be inferred with React's `ComponentProps<typeof Component>`; no duplicate feature-side type definitions are needed.

```tsx
import { StationProvider, Surface, Section, TextField, Button } from "@/components/station-ui";

<StationProvider>
  <Surface>
    <Section title="Equipment">
      <TextField label="Name" required value={name} onChange={(event) => setName(event.target.value)} />
      <Button variant="primary" onClick={save}>Save draft</Button>
    </Section>
  </Surface>
</StationProvider>
```

## Representative composition

`src/components/station/EquipmentForm.tsx` composes the library into custom/homebrew equipment entry. Its `EquipmentFormValues` is an **input contract for the review**, not the future canonical inventory or graph schema. W01 remains responsible for those models and fixtures.

The form supports required basics, ownership, optional local photo, named/ordered ports, connector selection including Unknown, optional power rating and private notes, a draft-placement intent, async submission, duplicate-submit prevention, preserved entries on save failure and confirmed reset. Unknown specifications are allowed. Duplicate port names are rejected without changing their meaning or guessing a connector.

The review host stores saved examples in React state only. The inspector shows captured values and can remove an example. Reloading or navigating away discards the review session. The draft checkbox records an intent only; it never activates gear, creates a graph edge, publishes profile details or changes operating selection. Model lookup, persistence, the full equipment taxonomy and production save wording belong to W01/W10 integration.

## Verification and evidence

Run the normal repository checks, then claim an owned server using the [local testing guide](../../guides/LOCAL-AGENT-TESTING.md).

```sh
npm run lint
npm test
npm run build
npm run check:bundles
npm run dev:session -- start --owner station-design-system --task "Review station primitives and equipment form" --profile local
PROPULSE_REVIEW_URL=http://127.0.0.1:<allocated-port> node scripts/check-station-design.mjs
```

The browser check requires an identity match for the current checkout, owner and local profile. It creates a fresh browser context and writes evidence to `/private/tmp/station-review-evidence` (override with `PROPULSE_REVIEW_OUTPUT`). It checks both routes across all four themes with axe, responsive overflow, photo selection/removal, port editing, validation, saves, drawer/Escape, reset cancellation, compact mode, reduced motion and 200% text scaling.

Unit tests cover token/text contrast including extreme custom accents, native label/error associations, keyboard tab navigation, portal themes/focus restoration, invalid image handling, port operations, validation, save failure and in-flight submission locking. Existing dialog and auth tests remain part of the full suite. Automated checks supplement visual and keyboard inspection; they are not a claim of full screen-reader certification.

| Review surface | Desktop | Mobile |
|---|---|---|
| Catalog | [Dark](evidence/catalog-dark.png) · [Light](evidence/catalog-light.png) | [390 px](evidence/catalog-mobile.png) |
| Equipment | [Dark](evidence/equipment-dark.png) · [Light](evidence/equipment-light.png) | [390 px](evidence/equipment-mobile.png) |

The [approved ImageGen concepts](../profile-shack-workbench/visual-language/README.md) remain reference art. These evidence images are actual browser renders.

## Adoption after owner review

Use the barrel exports and semantic tokens. Extend this library when a pattern is needed across screens; keep feature state, graph commands, persistence, hardware and visibility enforcement in their owning layers. Add meaningful interaction tests when extending behavior. Do not copy private CSS into new pages or create parallel theme palettes.

Keep W01 and the dependency plan open until their full contracts and fixtures are delivered. Downstream agents must claim scoped issues/worktrees and cite this library. Public projection, canvas interactions, graph evaluation, undo/redo and production inventory are tracked by the existing work packages; this foundation does not silently replace their acceptance criteria.

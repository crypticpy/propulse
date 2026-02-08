# PRD: Shack Builder V2 -- The Station Management Platform

**Status:** Draft
**Owner:** Product / Engineering
**Version:** 2.0
**Date:** 2026-02-07

**Supersedes:** `docs/requirements/PRD-SHACK-BUILDER.md` (V1, now fully implemented)

**Related docs:**

- `docs/requirements/PRD-SUPABASE-MIGRATION.md` -- Cloud backend architecture
- `docs/requirements/PRD-OPERATOR-PROFILE.md` -- Operator identity & social
- `src/pages/ShackPage.tsx` -- Current 7-tab Shack page (392 lines)
- `src/stores/shackStore.ts` -- Zustand shack store (649 lines, persists to localStorage)
- `src/lib/data/radios.ts` -- Hardcoded radio database (770 lines, 24 curated + ~200 Sherwood)
- `src/lib/data/sherwood.generated.ts` -- Sherwood Engineering data (5,980 lines)
- `src/lib/data/feedlines.ts` -- Feedline loss tables & calculation engine
- `src/lib/data/antennas.ts` -- Antenna pattern library
- `src/hooks/useStationPerformance.ts` -- Per-band ERP calculator (192 lines)
- `src/components/shack/SignalChainDiagram.tsx` -- SVG signal chain (243 lines)
- `src/components/shack/PerformanceDashboard.tsx` -- Per-band capability matrix (184 lines)
- `src/components/shack/AntennaManager.tsx` -- Antenna CRUD (553 lines)
- `src/components/shack/FeedlineManager.tsx` -- Feedline CRUD (421 lines)
- `src/components/shack/AccessoryManager.tsx` -- Accessory CRUD (602 lines)
- `src/components/shack/PresetBuilder.tsx` -- Station preset CRUD (561 lines)
- `src/components/shack/BandCapabilityStrip.tsx` -- Band loss pills (52 lines)
- `src/components/settings/RadioManager.tsx` -- Radio fleet manager (1,686 lines)
- `src/types/shack.ts` -- UserAntenna, UserFeedline, UserAccessory, StationPreset types
- `src/types/radio.ts` -- RadioEquipment, UserRadio, ReceiverPerformance types

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Experience](#3-target-experience)
4. [Feature Specifications](#4-feature-specifications)
5. [Data Model](#5-data-model)
6. [Cloud Radio Database Migration](#6-cloud-radio-database-migration)
7. [DX Engineering / Retail Links](#7-dx-engineering--retail-links)
8. [Privacy Controls](#8-privacy-controls)
9. [UX Specifications](#9-ux-specifications)
10. [Bug Fixes](#10-bug-fixes)
11. [Migration](#11-migration)
12. [Success Metrics](#12-success-metrics)

---

## 1. Overview

### Vision

Shack Builder V1 delivered the engineering foundation: CRUD for all equipment types, station presets with per-band ERP, a feedline loss engine, a signal chain diagram, and a performance dashboard. It proved the concept -- operators can model their real station and get meaningful numbers out of it.

V2 transforms that foundation into something operators _want to spend time in_. The Shack page becomes a station management platform -- part engineering workbench, part digital showroom, part optimization game. Think of it as what happens when you cross a flight simulator's system panel with a car configurator's "build and price" tool, designed for the kind of person who reads datasheets for fun.

The core insight: ham operators are engineers and tinkerers. They don't just want to _record_ their equipment -- they want to _play with it_. "What if I swap my RG-58 for LMR-400?" "What if I add an amplifier?" "How does my 20m setup compare to my 40m setup?" These are the questions that keep operators engaged, and V2 answers every one of them with live, interactive calculations.

Simultaneously, V2 migrates the radio database from hardcoded TypeScript files to Supabase, enabling community contributions, richer equipment data, and a foundation for social features like shareable station profiles.

### Goals

1. **Cloud radio database**: Migrate 224+ radios from `src/lib/data/radios.ts` and `src/lib/data/sherwood.generated.ts` to Supabase, enabling community contributions and richer metadata (photos, manual links, DX Engineering product links, user reviews).

2. **What-if simulator**: Let operators swap equipment in a sandbox and see performance changes in real time, without modifying their saved configuration.

3. **Engagement through data**: Make the performance dashboard so rich and interactive that operators voluntarily spend 10+ minutes exploring their station's capabilities -- not because they have to, but because it is genuinely interesting.

4. **Fix all known bugs**: Resolve every one of the 10 documented issues in the current Shack page, bringing UX quality up to the standard of the rest of Propulse.

5. **Shareable station profiles**: Let operators generate a public link to their station setup, creating the first social feature in Propulse.

6. **Equipment recommendations**: Based on an operator's current setup and stated goals, suggest specific upgrades with quantified impact ("Upgrading to LMR-400 saves you 2.1 dB on 10m, increasing ERP by 62%").

### Non-Goals

- **Antenna simulation**: V2 uses simplified gain patterns, not NEC-4 electromagnetic simulation. EZNEC and 4NEC2 handle that.
- **Equipment marketplace**: No buying/selling. Links to retailers are informational, not transactional.
- **VHF/UHF propagation integration**: Equipment can be tagged for VHF/UHF, but the performance engine remains HF-focused (1.8-54 MHz).
- **Real-time SWR monitoring**: SWR input remains user-entered, not live bridge data.
- **Multi-operator shared equipment**: Each user owns their inventory. Club station support is future scope.

---

## 2. Current State Analysis

### What exists (V1 implementation)

The Shack page at `/shack` provides a 7-tab interface:

| Tab         | Component                  | Lines | Function                                                                                          |
| ----------- | -------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Overview    | `ShackPage.tsx` (inline)   | ~120  | Equipment count cards, active preset summary, signal chain diagram, band capability strip         |
| Radios      | `RadioManager.tsx`         | 1,686 | Full radio fleet manager with Sherwood database search, custom radio creation, per-radio metadata |
| Antennas    | `AntennaManager.tsx`       | 553   | Card-grid CRUD with type, bands, height, mounting, polarization, gain pattern mapping             |
| Feedlines   | `FeedlineManager.tsx`      | 421   | Card-list CRUD with type, length, connectors, condition, inline loss display at 20m               |
| Accessories | `AccessoryManager.tsx`     | 602   | Grouped-card CRUD for amplifiers, tuners, filters, switches, power supplies, grounding            |
| Presets     | `PresetBuilder.tsx`        | 561   | Expandable preset cards with equipment links, band preview, activate/edit/delete                  |
| Performance | `PerformanceDashboard.tsx` | 184   | Per-band capability matrix (TX power, feedline loss, accessory gain, antenna gain, ERP)           |

**Data layer:** `shackStore.ts` (649 lines) persists to `localStorage` under key `propulse-shack`. All equipment references use UUIDs. The store enforces inventory limits: 10 radios, 20 antennas, 20 feedlines, 30 accessories, 10 presets.

**Radio database:** 24 hand-curated radios in `radios.ts` plus ~200 from Sherwood Engineering in `sherwood.generated.ts` (5,980 lines). The build process merges these, preferring Sherwood tested specs where available. Custom radios are stored in `shackStore.customRadios` with `custom-` prefix IDs.

**Performance engine:** `useStationPerformance.ts` computes per-band ERP by combining operating power, feedline loss (frequency-interpolated with SWR correction), accessory gain/loss, and antenna gain. This feeds the `BandCapabilityStrip` (green/amber/red pills) and the per-band performance table.

**Signal chain diagram:** `SignalChainDiagram.tsx` renders an SVG flow: Radio -> Accessories -> Feedline -> Antenna, with dB annotations on connector arrows.

### Known issues (10 bugs)

| #   | Issue                                                                               | Severity      | Location                                                                                                 |
| --- | ----------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Delete confirmation uses `window.confirm()` instead of styled modal                 | UX            | `AntennaManager.tsx:151`, `FeedlineManager.tsx:113`, `AccessoryManager.tsx:193`, `PresetBuilder.tsx:219` |
| 2   | No SWR input UI despite store support for `swrByBand`                               | Feature gap   | `AntennaManager.tsx` (form lacks SWR fields), `UserAntenna.swrByBand` in `shack.ts:79`                   |
| 3   | Feedline loss annotation shows average instead of range/specific band               | Data accuracy | `ShackPage.tsx:198-208` (averages `performance.bands` feedline loss)                                     |
| 4   | Two confusing type dropdowns in antenna form (Antenna Type + Gain Pattern Type)     | UX confusion  | `AntennaManager.tsx:329-377` (side-by-side dropdowns with overlapping names)                             |
| 5   | Preset "Create" button enabled with only feedlines (should require radio + antenna) | Validation    | `PresetBuilder.tsx:196-197` (`hasEquipment` checks `radios OR antennas OR feedlines`)                    |
| 6   | No drag-to-reorder for presets or equipment                                         | UX            | All manager components                                                                                   |
| 7   | No bulk operations (select all bands)                                               | UX            | `AntennaManager.tsx:385-410`, `AccessoryCategoryFields.tsx:116-139`                                      |
| 8   | No "duplicate" action for equipment/presets                                         | UX            | All manager components                                                                                   |
| 9   | Category can't be changed when editing an accessory                                 | UX            | `AccessoryManager.tsx:484-506` (`{!editingId && ...}` gates category selector)                           |
| 10  | `AccessoryManager.tsx` is 602 lines (extraction candidate)                          | Maintenance   | `AccessoryManager.tsx`                                                                                   |

### Gaps identified through research

1. **Radio database is static**: 224 radios hardcoded in TypeScript cannot grow without a code deploy. Community contributions are impossible.
2. **No equipment detail pages**: Operators cannot view full specs, photos, manuals, or reviews for any radio. The database is a selection dropdown, not a browsable resource.
3. **No what-if scenarios**: Changing equipment requires actual edits to saved data. There is no sandbox mode.
4. **No equipment timeline**: When an operator swaps their antenna, the old configuration is lost. No history.
5. **No photos**: Ham culture revolves around shack photos. The Shack page has zero visual content beyond SVG diagrams.
6. **No sharing**: Station configurations cannot be shown to others.
7. **No recommendations**: The system knows the operator's equipment and their performance numbers, but never suggests improvements.
8. **No RF exposure calculation**: FCC requires stations above certain power levels to evaluate RF exposure. This is a natural fit for a station modeling tool.
9. **No power budget**: Operators with multiple devices connected to a single power supply need to know total current draw.

---

## 3. Target Experience

### The dream walkthrough

Imagine you are a ham operator who just got your Extra class license and bought an Icom IC-7610. You open Propulse and navigate to Shack.

**First visit -- guided setup:**

The Overview tab greets you with a tasteful empty state. Not a blank page -- a subtle animation of a signal chain building itself, block by block, inviting you to fill it in. "Build your station" with four glowing entry points: Radios, Antennas, Feedlines, Accessories.

You tap Radios. Instead of a dropdown, you see a search field with typeahead. You type "7610" and the database responds instantly -- not just the model name, but a card showing the IC-7610's photo, key specs (RMDR: 104 dB, 100W, HF+6m), Sherwood ranking, and tier badge (High-End, purple). You tap "Add to My Shack" and it lands in your fleet with a satisfying micro-animation. The radio count badge on the Overview tab increments in real time.

**Building the signal chain:**

You add your Cushcraft A3S (3-element Yagi) in Antennas. The form is smart -- when you select "3-Element Yagi" as the type, the gain pattern auto-maps to `yagi_3el` and the form expands to show per-band SWR entry. You pulled your SWR readings last weekend: 1.3:1 on 20m, 1.8:1 on 15m, 2.2:1 on 10m. You enter them. The system already knows this will affect your feedline loss calculations.

You add your 100-foot run of LMR-400. The loss display updates in real time as you type the length -- not just a single number, but a mini per-band sparkline: "1.8m: 0.2 dB, 20m: 0.4 dB, 10m: 0.6 dB." You can _see_ the frequency dependence.

**The preset moment:**

You go to Presets and tap "Create Preset." You name it "Home Contest Station," select your IC-7610, your A3S, your LMR-400, set operating power to 100W. The moment you save, the Overview tab transforms. The signal chain diagram lights up with your actual equipment. The band capability strip shows green across 20m/15m/10m. The performance dashboard populates with real numbers.

Then you see it -- the number that makes you lean forward: **ERP: 780W on 20m**. Your 100W radio, through your feedline and Yagi, delivers 780 watts of effective radiated power toward the horizon. You didn't calculate that. The system did it for you, and the number is _right_.

**The what-if moment (this is where it gets addictive):**

Below the performance table, there is a toggle: "What-If Mode." You flip it. The interface shifts subtly -- a dashed orange border appears around the performance area, indicating sandbox mode. Now every equipment selection becomes a playground.

You click the feedline block in the signal chain diagram. A popover appears: "What if you used a different feedline?" You select RG-58 from the dropdown. Instantly, the performance table updates -- the 10m feedline loss jumps from 0.6 dB to 2.8 dB. ERP on 10m drops from 510W to 260W. The delta is shown in red: "-49%". You see _exactly_ why you spent the money on LMR-400.

You try one more: What if you added an amplifier? You drop a hypothetical 500W amp into the chain. ERP on 20m jumps to 3,900W. The RF exposure calculator -- which has been quietly running in the background -- turns amber: "At 3.9 kW ERP on 20m, evaluate RF exposure for distances under 14.2 meters."

You close what-if mode. Your real configuration is untouched. But you learned something, and you had fun doing it.

**The social moment:**

You navigate to the new Profile tab (linked from the Shack header). There is a toggle: "Make my shack public." You flip it. Propulse generates a shareable URL and a preview card -- your callsign, your station summary, your best-band ERP, a mini signal chain diagram. You copy the link and paste it into your local ham club's Discord. Five people ask where you got your feedline loss numbers.

---

## 4. Feature Specifications

### 4.1 Cloud Radio Database (Supabase Migration)

**Current state:** 24 hand-curated radios in `src/lib/data/radios.ts` (RAW_RADIO_DATABASE array) plus ~200 entries from Sherwood Engineering in `src/lib/data/sherwood.generated.ts`. These are merged at build time in `buildRadioDatabase()`, producing the exported `RADIO_DATABASE` constant. Custom radios live in `shackStore.customRadios` in localStorage.

**Target state:** All radio equipment data lives in a Supabase `equipment` table. The app fetches from Supabase when online, falls back to a bundled snapshot when offline. Community users can suggest new radios via a contribution flow. Moderators approve contributions before they become public.

#### 4.1.1 Supabase `equipment` table

See [Section 5: Data Model](#5-data-model) for full schema. Key behaviors:

- **Seeded on deploy** with all 224+ current radios, preserving existing IDs (e.g., `icom-ic7300`, `sherwood-aerial-51-alt-512`).
- **Read by all, write by moderators**: RLS policy allows `SELECT` for all authenticated users. `INSERT`/`UPDATE` restricted to users with `role = 'moderator'` or `role = 'admin'` in the `profiles` table.
- **Community contributions**: Any authenticated user can insert into `equipment_suggestions` (a staging table). Suggestions include all fields from `equipment` plus `submitter_id`, `submission_notes`, and `status` (pending/approved/rejected).
- **Sherwood data preserved**: Entries originating from Sherwood Engineering retain `source = 'sherwood'` and `tested_specs` fields. The `sherwood.generated.ts` data is imported as seed data with full attribution.

#### 4.1.2 Offline fallback

The bundled `radios.ts` and `sherwood.generated.ts` files remain in the build as a static fallback. On first load, the app attempts to fetch from Supabase. If the fetch succeeds, results are cached in IndexedDB (`propulse-equipment-cache`). Subsequent loads use the cache with a 24-hour TTL, refreshing in the background. If both Supabase and cache are unavailable (offline, no prior cache), the bundled static data is used.

Priority chain: **Supabase (live) > IndexedDB (cached) > Bundled static (fallback)**

#### 4.1.3 Search & filtering

The current `searchRadios()` function does client-side substring matching. V2 enhances this:

- **Full-text search** via Supabase `to_tsvector` index on `manufacturer || ' ' || model || ' ' || display_name`.
- **Filter facets**: Manufacturer, tier (entry/midrange/highend/flagship), band coverage, mode support, power range, year range.
- **Sort options**: Alphabetical, receiver score (calculated), popularity (most added to shacks), newest first.
- Client-side filtering continues to work on the cached/static dataset when offline.

### 4.2 Community Equipment Contributions

#### 4.2.1 Suggestion flow

1. User navigates to Radios tab, searches for a radio that doesn't exist.
2. "Can't find your radio? Suggest it" link appears below search results.
3. Suggestion form collects: manufacturer, model, display name, power range, bands, modes, tier, receiver specs (optional), photo URL (optional), source URLs.
4. Submission creates a row in `equipment_suggestions` with `status = 'pending'`.
5. User sees their pending suggestion in a "My Suggestions" section with status badge.

#### 4.2.2 Moderation flow

1. Moderators see a "Review Suggestions" panel (accessible from admin route, not the public Shack page).
2. Each suggestion shows submitted data side-by-side with any auto-detected duplicates (fuzzy match on manufacturer + model).
3. Moderator can: approve (copies to `equipment` table), reject (with reason), request changes (sends notification to submitter).
4. Approved equipment gets `contributor_id` set to the submitter's user ID. The contributor's name appears on the equipment detail page as "Contributed by [callsign]."

#### 4.2.3 Quality controls

- **Duplicate detection**: Before submission, fuzzy match against existing equipment. If match score > 0.8, show "This might already exist" with the matching entry.
- **Spam prevention**: Rate limit of 5 suggestions per user per day. Suggestions require a verified email.
- **Required fields**: Manufacturer, model, and at least one of (max power, bands) must be filled. Receiver specs are optional -- better to have a radio with incomplete specs than not have it at all.

### 4.3 Equipment Detail Pages

**Every radio in the database gets a detail view.** This is the single biggest UX upgrade from V1. Currently, radios are items in a dropdown. V2 gives each one a page.

#### 4.3.1 Detail page content

- **Hero section**: Radio photo (from Supabase storage or placeholder silhouette), manufacturer logo, model name, tier badge, release year.
- **Specs panel**: Receiver performance (RMDR, IMDR3, blocking gain, sensitivity, noise floor, IP3), transmit performance (IMD3, spurious suppression), power range, bands, modes. Factory vs. tested (Sherwood) specs shown side-by-side when both available.
- **Receiver score**: The 0-100 score from `calculateReceiverScore()`, visualized as a radial gauge with color coding (red < 50, amber 50-75, green > 75).
- **DX Engineering link**: "View on DX Engineering" button linking to `https://www.dxengineering.com/search?keyword={manufacturer}+{model}`. See [Section 7](#7-dx-engineering--retail-links).
- **Manual/resources links**: Optional links to manufacturer manual PDF, QST review, eHam review page.
- **"Add to My Shack" button**: Directly adds the radio to the user's fleet from the detail page.
- **Community notes**: Free-text reviews/tips from users who own this radio (stored in `equipment_reviews` table). Displayed as a threaded comment list sorted by helpfulness votes.

#### 4.3.2 Navigation

- Clicking a radio name anywhere in the Shack UI opens the detail page as a slide-over panel (desktop) or full-screen modal (mobile).
- Detail pages are also accessible via direct URL: `/shack/equipment/{id}` (for sharing and deep linking).

### 4.4 Enhanced Antenna Manager

#### 4.4.1 SWR input UI

The `UserAntenna` type already includes `swrByBand?: Record<string, number>` (defined at `src/types/shack.ts:79`), but the `AntennaManager` form has no fields to populate it. V2 adds:

- **SWR entry section**: Below the band selector in the antenna form, for each selected band, a numeric input labeled "{band} SWR" with placeholder "e.g., 1.5". Default value: empty (treated as 1.5 in calculations, matching the current `useStationPerformance.ts:132` default).
- **SWR visualization**: A mini horizontal bar chart next to the SWR inputs showing the SWR value as a colored bar (green < 1.5, amber 1.5-2.5, red > 2.5). This provides instant visual feedback on antenna performance per band.
- **Bulk SWR entry**: A "Set all to..." quick-fill button that populates all band SWR fields with a single value.

#### 4.4.2 Unified type selector

Bug #4: The current form has two confusing dropdowns ("Antenna Type" and "Gain Pattern Type") that map to `UserAntennaType` and `AntennaType` respectively. V2 merges these:

- **Single "Antenna Type" dropdown** using the `UserAntennaType` enum (24 types).
- **Automatic gain pattern mapping**: A lookup table maps each `UserAntennaType` to its closest `AntennaType` gain pattern. For example: `efhw` -> `dipole`, `moxon` -> `yagi_3el`, `steppir` -> `yagi_3el`, `log_periodic` -> `yagi_3el`, `dish` -> `yagi_5el`.
- **"Override gain pattern" toggle**: An advanced collapsible section that lets power users override the auto-mapped gain pattern. This replaces the second dropdown for the 5% of users who need it, while eliminating confusion for the other 95%.

#### 4.4.3 Pattern visualization (future-ready placeholder)

- A placeholder card in the antenna detail view labeled "Antenna Pattern" with a polar plot placeholder showing the selected gain pattern type's theoretical radiation pattern.
- V2 renders a static SVG polar plot from the `ANTENNA_TYPES` data. Future versions could support user-uploaded NEC pattern files.

#### 4.4.4 Select all bands

Bug #7: Add "Select All" and "Clear All" buttons above the band pill grid. When "Select All" is clicked, all bands from `ALL_BANDS` are added to the form's band set.

### 4.5 Enhanced Feedline Manager

#### 4.5.1 Per-band loss display

Bug #3: The current feedline card shows loss at a single frequency (14.1 MHz / 20m center). V2 replaces this with:

- **Loss sparkline**: A mini horizontal chart showing loss values at 160m, 80m, 40m, 20m, 15m, 10m, and 6m. Each point is a tiny colored dot (green/amber/red using the same thresholds as `BandCapabilityStrip`).
- **Hover/tap detail**: Hovering (desktop) or tapping (mobile) a dot shows a tooltip with exact loss value and frequency.
- **Summary text**: Below the sparkline, show the range: "Loss: 0.2 - 0.9 dB (160m - 6m)" instead of the current "Loss @ 20m: 0.60 dB".

#### 4.5.2 What-if feedline comparison

- A "Compare" action on feedline cards opens a modal showing the current feedline's per-band loss side-by-side with a user-selected alternative feedline type (same length and connectors). This lets operators evaluate an upgrade without creating a new feedline entry.
- Delta values shown in green (improvement) or red (degradation) for each band.

### 4.6 Enhanced Accessory Manager

#### 4.6.1 Extract custom hook

Bug #10: `AccessoryManager.tsx` at 602 lines is an extraction candidate. V2 extracts form logic into `useAccessoryForm.ts`:

- **`useAccessoryForm` hook**: Encapsulates form state, validation, `formFromAccessory()` mapping, and `buildPayload()` construction. Reduces `AccessoryManager.tsx` to ~300 lines focused on rendering.
- **File ownership**: `src/hooks/useAccessoryForm.ts` (new, ~200 lines), `src/components/shack/AccessoryManager.tsx` (reduced).

#### 4.6.2 Styled delete confirmation

Bug #1: Replace all `window.confirm()` calls with a shared `ConfirmDialog` component:

- **`ConfirmDialog` component**: A styled modal matching the existing `DetailModal` design language. Props: `isOpen`, `onConfirm`, `onCancel`, `title`, `message`, `confirmLabel` (default: "Delete"), `confirmVariant` ("danger" | "warning").
- **Apply everywhere**: `AntennaManager.tsx:151`, `FeedlineManager.tsx:113`, `AccessoryManager.tsx:193`, `PresetBuilder.tsx:219`.
- **Danger styling**: Red confirm button (`bg-alert-red/20 border-alert-red/50 text-alert-red`), descriptive message showing what will be deleted (e.g., "Delete antenna '20m Yagi on Tower'? This will also remove it from any presets using it.").

#### 4.6.3 Category change in edit mode

Bug #9: The category selector is currently gated by `{!editingId && ...}` in `AccessoryManager.tsx:484`. V2 changes this:

- Category selector is always visible, even in edit mode.
- When the category changes, category-specific fields reset to defaults (matching the behavior of selecting a new category in add mode).
- A warning appears if the category change would lose entered data: "Changing category will reset category-specific fields. Continue?"

### 4.7 Station Preset Enhancements

#### 4.7.1 Duplicate action

Bug #8: Add a "Duplicate" button to preset cards (and equipment cards in all managers):

- **Preset duplicate**: Creates a new preset with the same equipment selections, appending " (Copy)" to the name. Immediately opens the edit modal for the duplicate so the user can rename it.
- **Equipment duplicate**: Same pattern for antennas, feedlines, and accessories. Preserves all fields except `id` and `addedAt`.

#### 4.7.2 Drag-to-reorder

Bug #6: Add drag-and-drop reordering for presets and equipment lists:

- **Implementation**: Use `@dnd-kit/core` and `@dnd-kit/sortable` (the standard React DnD library). Each card gets a drag handle (6-dot grip icon) on the left edge.
- **Persistence**: The store arrays preserve insertion order. Reordering updates the array order, which persists via the existing Zustand persist middleware.
- **Mobile**: Long-press to initiate drag on touch devices. Visual feedback: elevated card with subtle shadow during drag.
- **Accessibility**: Keyboard reorder via arrow keys when the drag handle is focused.

#### 4.7.3 Preset validation fix

Bug #5: Change the `hasEquipment` check in `PresetBuilder.tsx:196-197` from:

```typescript
// Current (incorrect): enables button if ANY equipment type exists
const hasEquipment =
  radios.length > 0 || antennas.length > 0 || feedlines.length > 0;
```

To:

```typescript
// Fixed: requires both a radio and an antenna (feedline is optional per the validate() function)
const hasEquipment = radios.length > 0 && antennas.length > 0;
```

This aligns with the `validate()` function at line 234-242, which requires both `radioId` and `antennaId`.

#### 4.7.4 What-if preset comparison

- A "Compare" view that shows two presets side-by-side: their per-band ERP, feedline loss, and total system gain/loss. Color-coded deltas highlight which preset is better on each band.
- Accessible from the preset card via a "Compare with..." action that opens a modal with a preset selector.

### 4.8 Performance Dashboard V2

#### 4.8.1 What-if simulator

The centerpiece of V2. A toggle at the top of the Performance tab: "What-If Mode."

**When activated:**

- An orange dashed border appears around the performance area (visual indicator of sandbox mode).
- Each equipment slot in the signal chain becomes editable via inline dropdowns.
- Changing any equipment selection recomputes the entire per-band performance table in real time using a temporary `whatIfPreset` object that does not persist to the store.
- A "Reset" button restores the what-if state to match the current active preset.
- A "Save as New Preset" button creates a new preset from the what-if configuration.

**Delta display:**

- When what-if values differ from the active preset, each cell shows the delta: "+2.1 dB" in green or "-1.4 dB" in red.
- The summary cards (Best Band, Worst Band, Feedline Loss Range) also show deltas.

#### 4.8.2 Band unlocking visualization

A visual representation of which bands the operator's equipment covers:

- All amateur bands from 160m to 23cm displayed as a horizontal strip.
- Bands covered by the active preset's antenna are "unlocked" (full color, clickable).
- Bands not covered are "locked" (grayed out, with a lock icon).
- Hovering a locked band shows: "Your antenna doesn't cover {band}. Add a {suggested antenna type} to unlock it."
- As the operator adds equipment, bands progressively unlock with a subtle glow animation -- the "mini-game" feel of building capability.

#### 4.8.3 Enhanced metrics

Beyond the current per-band table, V2 adds:

- **System noise figure**: Calculated from receiver sensitivity + feedline NF contribution. Displayed as a single number with context: "Your system noise figure is 8.2 dB. On 40m, atmospheric noise dominates (25 dB), so your system is not the bottleneck. On 6m, atmospheric noise drops to 8 dB, making your system noise figure the limiting factor."
- **Signal-to-noise context**: For each band, a qualitative assessment of whether the operator is receiver-limited or antenna/propagation-limited.

### 4.9 Signal Chain Interactive Diagram

The current `SignalChainDiagram.tsx` is a static SVG. V2 makes it interactive:

#### 4.9.1 Clickable blocks

- Each stage block (Radio, Accessories, Feedline, Antenna) is clickable.
- Clicking a block navigates to that equipment's edit form (in a slide-over panel on desktop, modal on mobile).
- Hover state: subtle glow effect matching the equipment type's color theme.

#### 4.9.2 Per-band annotations

Bug #3 related: The current diagram shows average feedline loss. V2 adds:

- A band selector strip above or below the diagram. Default: the best band from the active preset.
- When a band is selected, the diagram annotations update to show that band's specific values: feedline loss at that frequency, SWR-adjusted loss, ERP at the antenna.
- The connector line color changes based on the selected band's loss thresholds.

#### 4.9.3 Animated signal flow

- A subtle pulsing animation on the connector arrows, moving from radio to antenna, representing signal flow.
- The pulse speed scales with the operating power: faster at 1500W, slower at 5W QRP. A small visual delight.
- Animation can be disabled in accessibility settings.

### 4.10 Equipment Timeline

A new section (accessible from the Overview tab or a new "History" sub-tab) showing the evolution of the operator's station over time.

#### 4.10.1 Timeline events

Every equipment add/remove/modify action creates a timeline entry:

- **Data source**: The `addedAt` field already exists on all equipment types. V2 adds a `retiredAt` field and an `equipment_history` table in Supabase (for cloud-synced users) or a local `equipmentHistory` array in shackStore (for local-only users).
- **Entry format**: ISO timestamp, action type (added/removed/modified), equipment type, equipment name, optional notes.
- **Display**: Vertical timeline with date markers. Each entry shows an icon (radio/antenna/feedline/accessory), action badge (green "Added", red "Removed", amber "Modified"), equipment name, and optional notes.

#### 4.10.2 Station snapshots

- At each timeline event, the system captures a snapshot of the active preset configuration.
- Users can click a timeline entry to see "Station as of [date]" -- a read-only view of what their station looked like at that point.
- This creates the "equipment timeline" that no other ham radio tool provides.

### 4.11 Shack Photos

#### 4.11.1 Photo gallery

- A "Photos" section on the Overview tab (or a dedicated sub-tab).
- Users can upload photos of their shack, antennas, and equipment installations.
- Photos are stored in Supabase Storage under `shack-photos/{user_id}/`.
- Client-side compression to max 1 MB before upload (using browser canvas API).
- Gallery display: masonry grid on desktop, horizontal scroll on mobile.
- Each photo can be tagged with equipment IDs (e.g., "This photo shows my IC-7610 and A3S antenna").

#### 4.11.2 Equipment-linked photos

- On equipment detail cards, photos tagged with that equipment appear as a thumbnail strip.
- Users can set a "hero photo" for their station profile that appears on the shareable page.

#### 4.11.3 Limits

- Max 20 photos per user (Supabase free tier consideration).
- Max 10 MB per photo before compression, target 1 MB after.
- Supported formats: JPEG, PNG, WebP.

### 4.12 Equipment Recommendations

#### 4.12.1 Recommendation engine

Based on the operator's current setup and performance numbers, suggest specific improvements:

- **Feedline upgrade suggestions**: If the user has RG-58 and their 10m loss exceeds 3 dB, suggest LMR-400 with computed savings: "Upgrading your 100ft run from RG-58 to LMR-400 saves 2.3 dB on 10m, increasing your ERP from 260W to 440W (+69%)."
- **Amplifier suggestions**: If the user's operating power is at their radio's maximum and they have no amplifier, suggest: "Adding a 500W amplifier would increase your ERP on 20m from 780W to 3,900W. Estimated gain: +7.0 dB."
- **Antenna upgrade suggestions**: If the user has a dipole on a band where a Yagi would provide significant improvement, quantify the delta.
- **SWR improvement suggestions**: If any band has SWR > 2.5, suggest tuner addition or antenna adjustment.

#### 4.12.2 Goal-based recommendations

- An optional "Goals" section in station settings where the user selects their operating priorities: DX (long distance), Contesting, POTA/SOTA (portable), Ragchew (local), Digital modes.
- Recommendations are weighted by goals. A DX-focused operator gets antenna gain suggestions; a portable operator gets weight/power efficiency suggestions.

#### 4.12.3 Presentation

- Recommendations appear as cards in a "Suggested Improvements" section on the Performance tab.
- Each card shows: equipment category, specific suggestion, quantified improvement (dB and %), estimated cost range (from DX Engineering API or manual tiers), and a "What-If" button that loads the suggestion into the what-if simulator.

### 4.13 Shareable Station Profile

#### 4.13.1 Public shack page

- Users with Supabase accounts can toggle "Make my shack public" in privacy settings.
- Public URL: `https://propulse.app/shack/{callsign}` (or a short code if callsign is not set).
- Public page shows: callsign, station summary (radio, antenna, power), best-band ERP, signal chain diagram, band capability strip, and hero photo.
- Equipment serial numbers, purchase details, and notes are never shown publicly.
- Physical address is never shown. Location shown as city/state only (matching QRZ/callbook precedent).

#### 4.13.2 Embed code

- A "Share" button generates:
  - Direct URL (copy to clipboard).
  - Open Graph meta tags for rich previews when shared on social media (station name, best band ERP, thumbnail of signal chain diagram).
  - Optional embed code (`<iframe>`) for forums and websites.

#### 4.13.3 QR code

- Generate a QR code linking to the public shack page. Useful for hamfests and QSL cards.

### 4.14 Equipment-Based Challenges

Engagement features that make building a station feel like progression in a game, without being childish or condescending. These are nods to the ham radio culture of achievement (think DXCC, WAS, VUCC awards).

#### 4.14.1 Challenge definitions

| Challenge            | Requirement                                                                  | Badge Name       |
| -------------------- | ---------------------------------------------------------------------------- | ---------------- |
| QRP Hero             | Create a preset with max power <= 5W                                         | QRP Hero         |
| Wire Antenna Warrior | Add a wire antenna type (dipole, EFHW, random wire, inverted V)              | Wire Warrior     |
| Full Spectrum        | Have presets covering all HF bands (160m through 10m)                        | Full Spectrum    |
| Low Loss Leader      | Achieve < 1 dB feedline loss on any band                                     | Low Loss Leader  |
| Kilowatt Club        | Create a preset with an amplifier producing >= 1000W                         | Kilowatt Club    |
| Silent Key Collector | Add 5+ radios to your shack                                                  | Fleet Commander  |
| Portable Pioneer     | Create a preset with total equipment weight < 10 lbs (requires weight field) | Portable Pioneer |
| Band Conqueror       | Unlock all amateur bands from 160m to 6m                                     | Band Conqueror   |

#### 4.14.2 Presentation

- Challenges appear as small badge cards in a "Challenges" section on the Overview tab.
- Unearned challenges are shown with a grayed-out badge and a progress indicator (e.g., "5/10 HF bands covered").
- Earned challenges show the badge in full color with the date earned.
- Challenges are local-only (not synced to Supabase) to avoid gamification pressure.

### 4.15 RF Exposure Calculator

FCC OET Bulletin 65 requires amateur stations to evaluate RF exposure at certain power levels. This is a natural feature for a station modeling tool.

#### 4.15.1 Calculation

- For each band in the active preset, calculate the minimum safe distance using the standard far-field formula: `d = sqrt(PxG / (4 * pi * S))` where P = power in watts, G = antenna gain (numeric), S = power density limit (mW/cm^2, varies by frequency per FCC table).
- Power density limits sourced from FCC OET-65 Table 1 (controlled environment) and Table 2 (uncontrolled environment).

#### 4.15.2 Display

- A dedicated section on the Performance tab: "RF Exposure Evaluation."
- Per-band table showing: ERP, antenna gain, controlled/uncontrolled safe distances in meters and feet.
- Color coding: green (safe at typical residential distances, > 10m), amber (marginal, 3-10m), red (requires evaluation, < 3m).
- A printable summary that can serve as the operator's RF exposure evaluation documentation.
- Disclaimer: "This is an estimated evaluation based on simplified far-field calculations. Consult a qualified engineer for complex installations."

### 4.16 Power Budget Calculator

#### 4.16.1 Current draw tracking

- Each equipment type gains an optional `currentDrawAmps` field (or `currentDrawAmps` in the accessory types that have power specs).
- For radios: current draw at full TX power and at idle/receive.
- For amplifiers: current draw at full power.
- For accessories: standby current draw.

#### 4.16.2 Budget display

- A "Power Budget" card on the Overview or Performance tab.
- Shows: total receive current draw (all equipment idle), total TX current draw (worst case, all equipment active), power supply capacity (from `PowerSupplyAccessory.maxCurrentAmps`), margin.
- Color coding: green (> 30% margin), amber (10-30%), red (< 10% or over budget).
- Useful for portable and field day operations where power supply capacity is a genuine constraint.

---

## 5. Data Model

### 5.1 Supabase Tables (new for V2)

#### `equipment` (cloud radio database)

```sql
CREATE TABLE equipment (
  id TEXT PRIMARY KEY,                          -- e.g., 'icom-ic7300', 'sherwood-aerial-51-alt-512'
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  display_name TEXT,                            -- optional user-facing label
  tier TEXT NOT NULL CHECK (tier IN ('entry', 'midrange', 'highend', 'flagship')),

  -- Receiver specs
  rx_rmdr REAL,
  rx_imdr3 REAL,
  rx_blocking_gain REAL,
  rx_sensitivity REAL,
  rx_noise_floor_dbm REAL,
  rx_ip3_dbm REAL,
  rx_phase_noise JSONB,                        -- { "2kHz": -120, "10kHz": -135 }

  -- Tested (Sherwood) receiver specs
  tested_rmdr REAL,
  tested_imdr3 REAL,
  tested_blocking_gain REAL,
  tested_sensitivity REAL,
  tested_noise_floor_dbm REAL,
  tested_ip3_dbm REAL,

  -- Transmit specs
  tx_imd3_db REAL,
  tx_spurious_dbc REAL,
  tx_notes TEXT,

  -- General specs
  max_power INTEGER NOT NULL DEFAULT 100,
  min_power REAL NOT NULL DEFAULT 5,
  modes TEXT[] NOT NULL DEFAULT '{"CW","SSB","AM","FM"}',
  bands TEXT[] NOT NULL DEFAULT '{"160m","80m","40m","20m","15m","10m"}',

  -- Metadata
  release_year INTEGER,
  current_draw_rx_amps REAL,                   -- receive/idle current
  current_draw_tx_amps REAL,                   -- full power TX current
  weight_kg REAL,                              -- for portable scoring
  photo_url TEXT,
  manual_url TEXT,
  dx_engineering_url TEXT,
  eham_review_url TEXT,

  -- Source attribution
  source TEXT CHECK (source IN ('curated', 'sherwood', 'community')),
  sources JSONB,                               -- array of { name, url, notes }
  contributor_id UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(manufacturer, '') || ' ' || coalesce(model, '') || ' ' || coalesce(display_name, ''))
  ) STORED
);

CREATE INDEX idx_equipment_search ON equipment USING GIN (search_vector);
CREATE INDEX idx_equipment_manufacturer ON equipment (manufacturer);
CREATE INDEX idx_equipment_tier ON equipment (tier);
```

#### `equipment_suggestions` (community contributions)

```sql
CREATE TABLE equipment_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id UUID NOT NULL REFERENCES auth.users(id),

  -- Same spec fields as equipment table
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  display_name TEXT,
  tier TEXT,
  max_power INTEGER,
  min_power REAL,
  modes TEXT[],
  bands TEXT[],
  rx_rmdr REAL,
  rx_imdr3 REAL,
  rx_blocking_gain REAL,
  rx_sensitivity REAL,
  release_year INTEGER,
  photo_url TEXT,
  source_urls TEXT[],

  -- Moderation
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_changes')),
  submission_notes TEXT,
  reviewer_id UUID REFERENCES auth.users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `equipment_reviews` (community reviews)

```sql
CREATE TABLE equipment_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  body TEXT NOT NULL CHECK (length(body) >= 20 AND length(body) <= 2000),
  helpful_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(equipment_id, user_id)  -- one review per user per equipment
);
```

#### `shack_photos` (station photos)

```sql
CREATE TABLE shack_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,                  -- Supabase storage path
  caption TEXT,
  equipment_tags TEXT[],                       -- array of equipment IDs shown in photo
  is_hero BOOLEAN NOT NULL DEFAULT false,      -- hero photo for public profile

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT max_photos CHECK (
    (SELECT count(*) FROM shack_photos sp WHERE sp.user_id = shack_photos.user_id) <= 20
  )
);
```

#### `equipment_history` (timeline events)

```sql
CREATE TABLE equipment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('added', 'removed', 'modified')),
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('radio', 'antenna', 'feedline', 'accessory', 'preset')),
  equipment_name TEXT NOT NULL,
  equipment_id TEXT,                           -- reference to the equipment (may be null if deleted)
  snapshot JSONB,                              -- snapshot of preset config at this point
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_history_user ON equipment_history (user_id, created_at DESC);
```

### 5.2 Local Store Extensions

The `shackStore.ts` gains these additional fields:

```typescript
interface ShackStoreV3 extends ShackStore {
  // Equipment ordering (array of IDs defining display order)
  antennaOrder: string[];
  feedlineOrder: string[];
  accessoryOrder: string[];
  presetOrder: string[];

  // Equipment history (for local-only users)
  equipmentHistory: EquipmentHistoryEntry[];

  // What-if state (ephemeral, not persisted)
  whatIfPreset: StationPreset | null;
  whatIfMode: boolean;

  // Challenges (local, not synced)
  earnedChallenges: Record<string, string>; // challengeId -> ISO date earned

  // Reorder actions
  reorderAntennas: (ids: string[]) => void;
  reorderFeedlines: (ids: string[]) => void;
  reorderAccessories: (ids: string[]) => void;
  reorderPresets: (ids: string[]) => void;

  // What-if actions
  setWhatIfMode: (enabled: boolean) => void;
  setWhatIfPreset: (preset: StationPreset | null) => void;

  // Duplicate actions
  duplicateAntenna: (id: string) => string | null;
  duplicateFeedline: (id: string) => string | null;
  duplicateAccessory: (id: string) => string | null;
  duplicatePreset: (id: string) => string | null;
}
```

### 5.3 Type Extensions

New fields on existing types:

```typescript
// UserAntenna additions
interface UserAntenna {
  // ... existing fields ...
  retiredAt?: string; // ISO date when antenna was removed
  photos?: string[]; // Supabase storage paths
}

// UserFeedline additions
interface UserFeedline {
  // ... existing fields ...
  retiredAt?: string;
}

// UserAccessory additions (for power budget)
interface AccessoryBase {
  // ... existing fields ...
  currentDrawAmps?: number; // idle/standby current draw
  retiredAt?: string;
}

// AmplifierAccessory additions
interface AmplifierAccessory extends AccessoryBase {
  // ... existing fields ...
  currentDrawTxAmps?: number; // current draw at full TX power
}

// RadioEquipment additions (in Supabase `equipment` table)
interface RadioEquipment {
  // ... existing fields ...
  currentDrawRxAmps?: number;
  currentDrawTxAmps?: number;
  weightKg?: number;
  photoUrl?: string;
  manualUrl?: string;
  dxEngineeringUrl?: string;
  ehamReviewUrl?: string;
}

// UserRadio additions
interface UserRadio {
  // ... existing fields ...
  serialNumber?: string; // for insurance documentation
  insuranceValue?: number; // USD
  retiredAt?: string;
}
```

---

## 6. Cloud Radio Database Migration

### 6.1 Migration strategy

The migration from hardcoded TypeScript to Supabase proceeds in three phases:

#### Phase 1: Seed & shadow (no user-facing changes)

1. **Create the `equipment` table** in Supabase with the schema from Section 5.1.
2. **Write a seed script** (`scripts/seed-equipment.ts`) that:
   - Reads `RAW_RADIO_DATABASE` from `src/lib/data/radios.ts` (24 curated radios).
   - Reads `SHERWOOD_RECEIVERS` from `src/lib/data/sherwood.generated.ts` (~200 entries).
   - Runs the same merge logic as `buildRadioDatabase()` to produce the unified list.
   - Inserts all entries into the `equipment` table, preserving existing IDs.
   - Sets `source = 'curated'` for hand-curated entries and `source = 'sherwood'` for Sherwood-only entries.
3. **Shadow reads**: The app continues using the bundled static database. A background fetch from Supabase runs on app load and logs discrepancies (entries in Supabase but not in static, and vice versa) to the console in development mode. No user-facing changes.

#### Phase 2: Supabase primary, static fallback

1. **Replace `RADIO_DATABASE` import** with a `useEquipmentDatabase()` hook that:
   - Returns the Supabase data when available (cached in IndexedDB with 24-hour TTL).
   - Falls back to the static bundled data when offline or on first load before cache is populated.
   - Exposes `isLoading`, `isOffline`, and `lastUpdated` flags.
2. **Update `getRadioById()`** to first check the cloud/cached database, then fall back to the static array.
3. **Update `RadioManager.tsx`** to use the new hook. Search queries hit the Supabase full-text index when online, with client-side filtering as fallback.
4. **Custom radios remain in localStorage** (`shackStore.customRadios`). They are not migrated to Supabase in this phase. Custom radio IDs retain the `custom-` prefix to distinguish them from database radios.

#### Phase 3: Community contributions & detail pages

1. **Enable the community suggestion flow** (Section 4.2).
2. **Build equipment detail pages** (Section 4.3).
3. **Migrate custom radios to Supabase** for cloud-synced users. Custom radios become entries in the `equipment` table with `source = 'custom'` and `contributor_id` set to the user. They are visible only to the creator (RLS policy).

### 6.2 ID stability guarantee

Every existing radio ID (e.g., `icom-ic7300`, `sherwood-aerial-51-alt-512`, `custom-{uuid}`) is preserved verbatim during migration. The `UserRadio.equipmentId` field in `shackStore.radios` references these IDs. Changing them would break every user's saved radio fleet. The seed script enforces this by using the static file's `id` field directly, never generating new IDs.

### 6.3 Backward compatibility

- The static `radios.ts` and `sherwood.generated.ts` files remain in the source tree indefinitely. They serve as the offline fallback and as documentation of the original dataset.
- The `getRadioById()` function signature does not change. Callers do not need to know whether the data came from Supabase or the static array.
- `shackStore.customRadios` continues to work for local-only users who never create a Supabase account.

---

## 7. DX Engineering / Retail Links

### 7.1 Philosophy

Propulse is a tool, not an ad platform. Retail links exist because operators genuinely want to find equipment, not because Propulse earns commission. (There are no affiliate arrangements.) The guiding principle: _would a helpful fellow ham include this link?_

### 7.2 Implementation

- **Equipment detail pages**: A "Where to buy" section with links to major retailers. Default link pattern:
  - DX Engineering: `https://www.dxengineering.com/search?keyword={manufacturer}+{model}`
  - Ham Radio Outlet: `https://www.hamradio.com/search?q={manufacturer}+{model}`
  - These are search URLs, not direct product links, so they are robust against URL changes and product ID rotations.
- **Manual override**: The `equipment` table includes a `dx_engineering_url` field for cases where the search URL doesn't find the right product. Moderators can set this to a direct product URL.
- **Visual treatment**: Retail links are styled as plain text links (`text-gray-400 hover:text-gray-200 underline`), not buttons or calls-to-action. They are clearly labeled "Search on DX Engineering" rather than "Buy Now."
- **No tracking**: Links do not include UTM parameters, tracking pixels, or affiliate codes.

### 7.3 In recommendation cards

When the recommendation engine suggests equipment (Section 4.12), the recommendation card may include a retail link. This is clearly separated from the recommendation logic: "If you decide to upgrade, you can find [LMR-400 on DX Engineering](https://...)." The recommendation itself is based purely on performance data.

---

## 8. Privacy Controls

### 8.1 Public/private toggle

- **Location**: Shack settings (accessible from the Shack page header).
- **Default**: Private (nothing shared publicly).
- **Granularity**: Three levels:
  1. **Private** (default): No public page. Station data is visible only to the user.
  2. **Summary only**: Public page shows callsign, radio model, antenna type, best-band ERP, and hero photo. No detailed specs, no serial numbers, no purchase info.
  3. **Full detail**: Public page shows complete station configuration including all presets, per-band performance, signal chain diagram, and photo gallery.

### 8.2 What is never public (regardless of privacy setting)

- Serial numbers
- Purchase prices / insurance values
- Purchase dates / locations
- Equipment notes (may contain personal information)
- Physical address (location shown as grid square, city/state, or nothing -- matching whatever the user has set in their operator profile)
- Firmware revisions / wiring configurations
- Custom radio definitions with `source = 'custom'` (unless the user explicitly opts in)

### 8.3 Data deletion

- "Delete my shack data" button in settings removes all equipment, presets, photos, history, and reviews from Supabase.
- Local data is cleared from `shackStore` and `localStorage`.
- This is a destructive operation requiring two-step confirmation: "Are you sure?" -> type "DELETE" to confirm.

---

## 9. UX Specifications

### 9.1 Design language

V2 maintains the existing Propulse design language:

- **Colors**: `plasma-orange` for primary actions and active states, `signal-green` for good/gain, `caution-amber`/`caution-yellow` for warnings, `alert-red` for danger/loss, `nebula-blue` for secondary actions, `void-black` for input backgrounds, `panel` for card backgrounds.
- **Surfaces**: `bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl` for all cards (matching the established pattern across all 8 shack components).
- **Typography**: System sans-serif. `text-gray-200` for primary text, `text-gray-400` for secondary, `text-gray-500` for muted.
- **Spacing**: Consistent with existing: `space-y-4` between card groups, `gap-2` for inline elements, `p-4` (mobile) / `p-6` (desktop) for card padding.

### 9.2 The "mini-game" feel

The Shack page should feel like progression and discovery, not data entry. This is achieved through:

1. **Progressive disclosure**: Empty states are inviting, not blank. Each equipment type added reveals new capabilities and numbers. The Overview tab visually fills in as equipment is added.

2. **Live numbers everywhere**: Every card shows at least one computed value. Feedline cards show per-band loss sparklines. Antenna cards show SWR indicators. Preset cards show ERP. Numbers update in real time as data changes.

3. **Band unlocking**: The band capability visualization treats each band as something to be "unlocked." Adding a multi-band antenna that covers 160m-10m shows bands lighting up one by one. This creates the sensation of building capability.

4. **Challenges**: The badge system (Section 4.14) provides lightweight achievement tracking without gamification pressure. Challenges are informational ("you've achieved this") not competitive ("you should do this").

5. **What-if interactivity**: The what-if simulator (Section 4.8.1) turns performance analysis into exploration. Operators discover things about their station they didn't know, and the deltas create natural "what if I..." curiosity loops.

6. **Micro-animations**: Equipment being added gets a subtle slide-in animation. Band pills light up with a 200ms glow when they transition from locked to unlocked. The signal chain diagram has a gentle pulse animation. These are tasteful, not distracting.

### 9.3 Desktop layout

- **Max width**: `max-w-[1200px]` centered (existing pattern from `ShackPage.tsx:258`).
- **Tab bar**: Horizontal button tabs (existing). V2 adds icons before tab labels for visual distinction: Radio icon, antenna icon, cable icon, gear icon, layers icon, chart icon.
- **Equipment detail slide-over**: 480px wide panel sliding in from the right, with a semi-transparent backdrop. Contains the equipment detail page content.
- **What-if mode**: Orange dashed `border-2 border-dashed border-plasma-orange/50` around the performance area, with a floating "Exit What-If" button in the top-right corner.
- **Side-by-side comparison**: When comparing presets, a two-column layout within the main content area.

### 9.4 Mobile layout

- **Tab bar**: Scrollable pill tabs (existing pattern from `ShackPage.tsx:332`).
- **Equipment detail**: Full-screen modal with back navigation arrow.
- **What-if mode**: Same visual treatment, but inline controls instead of popovers (mobile doesn't support hover).
- **Photo gallery**: Horizontal scroll with swipe navigation. Full-screen photo viewer on tap.
- **Drag-to-reorder**: Long-press to initiate drag. Haptic feedback via the Vibration API.

### 9.5 Component architecture

V2 introduces these new components:

| Component                   | Location                | Purpose                                               |
| --------------------------- | ----------------------- | ----------------------------------------------------- |
| `ConfirmDialog.tsx`         | `src/components/ui/`    | Styled delete/danger confirmation modal               |
| `EquipmentDetailPanel.tsx`  | `src/components/shack/` | Slide-over/modal equipment detail page                |
| `WhatIfSimulator.tsx`       | `src/components/shack/` | What-if mode wrapper for performance dashboard        |
| `BandUnlockStrip.tsx`       | `src/components/shack/` | Band unlock visualization with locked/unlocked states |
| `FeedlineLossSparkline.tsx` | `src/components/shack/` | Mini per-band loss chart for feedline cards           |
| `SWRInputGrid.tsx`          | `src/components/shack/` | Per-band SWR input fields for antenna form            |
| `EquipmentTimeline.tsx`     | `src/components/shack/` | Vertical timeline of station changes                  |
| `ShackPhotoGallery.tsx`     | `src/components/shack/` | Photo upload, gallery, and tagging                    |
| `RecommendationCards.tsx`   | `src/components/shack/` | Equipment upgrade suggestion cards                    |
| `RFExposureCalc.tsx`        | `src/components/shack/` | RF exposure evaluation table                          |
| `PowerBudgetCard.tsx`       | `src/components/shack/` | Current draw analysis card                            |
| `ChallengesBadges.tsx`      | `src/components/shack/` | Challenge progress and earned badges                  |
| `PresetComparison.tsx`      | `src/components/shack/` | Side-by-side preset performance comparison            |

Extracted hooks:

| Hook                             | Location     | Purpose                                               |
| -------------------------------- | ------------ | ----------------------------------------------------- |
| `useAccessoryForm.ts`            | `src/hooks/` | Form state/validation extracted from AccessoryManager |
| `useEquipmentDatabase.ts`        | `src/hooks/` | Supabase/cached/static radio database access          |
| `useWhatIfPerformance.ts`        | `src/hooks/` | What-if variant of useStationPerformance              |
| `useEquipmentRecommendations.ts` | `src/hooks/` | Recommendation engine logic                           |
| `useRFExposure.ts`               | `src/hooks/` | RF exposure calculation                               |
| `usePowerBudget.ts`              | `src/hooks/` | Power budget calculation                              |
| `useChallenges.ts`               | `src/hooks/` | Challenge evaluation                                  |

---

## 10. Bug Fixes

All 10 known issues are addressed in V2. Here is the fix approach for each:

### Bug 1: `window.confirm()` instead of styled modal

**Fix**: Create `ConfirmDialog` component (Section 4.6.2). Replace all four `window.confirm()` calls.

**Files modified**:

- `src/components/ui/ConfirmDialog.tsx` (new)
- `src/components/shack/AntennaManager.tsx` (line 151)
- `src/components/shack/FeedlineManager.tsx` (line 113)
- `src/components/shack/AccessoryManager.tsx` (line 193)
- `src/components/shack/PresetBuilder.tsx` (line 219)

**Approach**: Each manager component gains a `confirmDelete` state (`{ isOpen: boolean; targetId: string | null; targetName: string }`). The delete button sets this state. The `ConfirmDialog` renders the styled modal and calls `removeX(targetId)` on confirm.

### Bug 2: No SWR input UI

**Fix**: Add `SWRInputGrid` component (Section 4.4.1). Integrate into `AntennaManager` form.

**Files modified**:

- `src/components/shack/SWRInputGrid.tsx` (new)
- `src/components/shack/AntennaManager.tsx` (add SWR section below band selector)

**Approach**: The form state gains `swrByBand: Record<string, string>` (string for input flexibility). On save, parse to numbers and include in the `UserAntenna` payload. The `useStationPerformance` hook already reads `antenna.swrByBand` at line 132.

### Bug 3: Feedline loss annotation shows average

**Fix**: Replace the averaged feedline loss in `ShackPage.tsx:198-208` with the loss range or the loss for the currently-best band.

**Files modified**:

- `src/pages/ShackPage.tsx` (lines 198-208)
- `src/components/shack/SignalChainDiagram.tsx` (add band selector, Section 4.9.2)

**Approach**: The `SignalChainDiagram` gains an optional `selectedBand` prop. When set, it shows the loss for that specific band. The `ShackPage` Overview computes and passes the best band's frequency by default. The signal chain diagram's feedline annotation changes from the averaged value to the selected band's loss.

### Bug 4: Two confusing type dropdowns in antenna form

**Fix**: Merge into single dropdown with auto-mapping (Section 4.4.2).

**Files modified**:

- `src/components/shack/AntennaManager.tsx` (replace dual dropdowns with single + advanced toggle)
- `src/lib/data/antennas.ts` (add `ANTENNA_TYPE_TO_PATTERN_MAP`)

**Approach**: A new constant `ANTENNA_TYPE_TO_PATTERN_MAP: Record<UserAntennaType, AntennaType>` maps each user-facing antenna type to its closest gain pattern. The form uses one dropdown for `antennaType` and auto-sets `gainPatternType`. An "Advanced: Override gain pattern" collapsible section exposes the second dropdown for power users.

### Bug 5: Preset create button enabled with only feedlines

**Fix**: Change `hasEquipment` condition (Section 4.7.3).

**Files modified**:

- `src/components/shack/PresetBuilder.tsx` (line 196-197)

**Approach**: One-line fix: `const hasEquipment = radios.length > 0 && antennas.length > 0;`

### Bug 6: No drag-to-reorder

**Fix**: Add DnD support (Section 4.7.2).

**Files modified**:

- All manager components
- `src/stores/shackStore.ts` (add order arrays and reorder actions)
- `package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)

### Bug 7: No bulk band operations

**Fix**: Add "Select All" / "Clear All" buttons (Section 4.4.4).

**Files modified**:

- `src/components/shack/AntennaManager.tsx` (above band pills)
- `src/components/shack/AccessoryCategoryFields.tsx` (above band pills in amplifier and filter sections)

**Approach**: Two small buttons above the band pill grid: "All" and "Clear". "All" adds every band from `ALL_BANDS` to the set. "Clear" empties the set.

### Bug 8: No duplicate action

**Fix**: Add duplicate buttons and store actions (Section 4.7.1).

**Files modified**:

- `src/stores/shackStore.ts` (add `duplicateAntenna`, `duplicateFeedline`, `duplicateAccessory`, `duplicatePreset`)
- All manager components (add "Duplicate" button next to Edit/Delete)

**Approach**: Each `duplicateX` action reads the existing item, strips `id` and `addedAt`, appends " (Copy)" to the name, and calls the corresponding `addX` action. Returns the new ID for immediate editing.

### Bug 9: Category change in edit mode

**Fix**: Remove the `{!editingId && ...}` gate (Section 4.6.3).

**Files modified**:

- `src/components/shack/AccessoryManager.tsx` (line 484)

**Approach**: Show the category selector always. When the category changes during edit, reset the category-specific form fields to defaults. Show a brief warning if the user has entered data in category-specific fields.

### Bug 10: AccessoryManager.tsx extraction

**Fix**: Extract form logic to `useAccessoryForm` hook (Section 4.6.1).

**Files modified**:

- `src/hooks/useAccessoryForm.ts` (new, ~200 lines)
- `src/components/shack/AccessoryManager.tsx` (refactored, ~300 lines)

**Approach**: The hook encapsulates: `form` state, `setForm` updater, `validate()`, `formFromAccessory()`, `buildPayload()`, and `resetForm()`. The component handles only rendering, modal state, and user interactions.

---

## 11. Migration

### 11.1 Local store migration (V2 -> V3)

The `shackStore` version increments from 2 to 3. The migrate function:

```typescript
migrate: (persisted: unknown, version: number) => {
  const state = persisted as Record<string, unknown>;
  if (version < 2) {
    // V1 -> V2 migration (existing)
    if (!("antennas" in state)) state.antennas = [];
    if (!("feedlines" in state)) state.feedlines = [];
    if (!("accessories" in state)) state.accessories = [];
    if (!("stationPresets" in state)) state.stationPresets = [];
    if (!("activePresetId" in state)) state.activePresetId = null;
  }
  if (version < 3) {
    // V2 -> V3 migration
    if (!("antennaOrder" in state)) state.antennaOrder = [];
    if (!("feedlineOrder" in state)) state.feedlineOrder = [];
    if (!("accessoryOrder" in state)) state.accessoryOrder = [];
    if (!("presetOrder" in state)) state.presetOrder = [];
    if (!("equipmentHistory" in state)) state.equipmentHistory = [];
    if (!("earnedChallenges" in state)) state.earnedChallenges = {};
  }
  return state as never;
};
```

### 11.2 Phased rollout

V2 features are delivered in tiers to minimize risk:

| Tier                      | Features                                                              | Dependencies            | Risk                                  |
| ------------------------- | --------------------------------------------------------------------- | ----------------------- | ------------------------------------- |
| **T1: Bug fixes**         | Bugs 1-5, 7, 9, 10                                                    | None                    | Low -- isolated fixes                 |
| **T2: UX enhancements**   | Bugs 6, 8 + duplicate/reorder                                         | `@dnd-kit` library      | Low -- additive features              |
| **T3: Enhanced displays** | SWR input, feedline sparklines, per-band signal chain, band unlocking | T1 complete             | Medium -- touches multiple components |
| **T4: What-if simulator** | What-if mode, preset comparison, recommendations                      | T3 complete             | Medium -- new interaction model       |
| **T5: Cloud database**    | Supabase equipment table, migration, search, community contributions  | Supabase infrastructure | High -- backend dependency            |
| **T6: Social features**   | Equipment detail pages, reviews, shareable profiles, photos           | T5 complete             | Medium -- new pages                   |
| **T7: Calculators**       | RF exposure, power budget, equipment timeline, challenges             | T3 complete             | Low -- self-contained features        |

### 11.3 Rollback strategy

- **T1-T4**: Pure frontend changes. Rollback is a git revert.
- **T5**: The static bundled data remains in the codebase. If Supabase is unreachable or data is corrupted, the app seamlessly falls back to static data. Users experience no disruption.
- **T6**: Feature-flagged behind `VITE_ENABLE_SHACK_SOCIAL`. Disable the flag to hide social features without affecting core functionality.
- **T7**: Self-contained calculators with no dependencies on other V2 features. Can be individually reverted.

---

## 12. Success Metrics

### 12.1 Engagement metrics

| Metric                                        | Current (V1)                    | Target (V2, 90 days post-launch) |
| --------------------------------------------- | ------------------------------- | -------------------------------- |
| Average time on Shack page per session        | ~2 min (estimated)              | 6+ min                           |
| % of active users who visit Shack page        | ~15% (estimated)                | 40%                              |
| Equipment items per user (mean)               | ~3 (radio + antenna + feedline) | 6+                               |
| Station presets per user (mean)               | ~1                              | 2.5+                             |
| What-if simulator usage (% of Shack visitors) | N/A                             | 30%                              |
| Public shack profiles created                 | N/A                             | 10% of registered users          |
| Community equipment suggestions               | N/A                             | 20+ per month                    |
| Photos uploaded                               | N/A                             | 2+ per active shack user         |

### 12.2 Quality metrics

| Metric                                       | Target                                            |
| -------------------------------------------- | ------------------------------------------------- |
| Bug reports related to Shack page            | 0 from the known 10 bugs (all resolved)           |
| Feedline loss accuracy vs. published specs   | Within 0.5 dB across all types and HF frequencies |
| Page load time (Shack page, median mobile)   | < 2 seconds                                       |
| Equipment database search latency (Supabase) | < 200ms P95                                       |
| What-if recalculation latency                | < 100ms (perceived instant)                       |
| Photo upload time (1 MB compressed)          | < 3 seconds on 3G                                 |

### 12.3 Data health metrics

| Metric                                 | Target                                    |
| -------------------------------------- | ----------------------------------------- |
| Equipment database entries             | 300+ (up from 224) within 6 months        |
| Community contribution acceptance rate | > 80% (indicates good submission quality) |
| Equipment entries with photos          | > 50% of top-100 most-added radios        |
| Equipment entries with reviews         | > 30% of top-100 most-added radios        |

### 12.4 How to measure

- **Time on page**: Tracked via `performance.now()` deltas on Shack route mount/unmount, stored in a lightweight analytics events table in Supabase (no PII, just aggregated durations and counts).
- **Feature usage**: Event logging for key actions (what-if toggle, preset create, photo upload, share link copy) stored as anonymous events.
- **Data health**: Supabase SQL queries run as a weekly monitoring job.
- **Quality**: TypeScript compiler (`tsc --noEmit`), lint, and build must pass. Feedline loss validation against ARRL Antenna Book published values as a unit test suite.

---

_This PRD is a living document. As implementation progresses through the tiers defined in Section 11.2, specific sections will be updated to reflect design decisions, technical tradeoffs, and user feedback._

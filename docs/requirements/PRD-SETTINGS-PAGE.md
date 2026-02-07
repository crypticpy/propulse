# PRD: Settings Page (`/settings`)

**Document Version:** 1.0
**Date:** 2026-02-07
**Status:** Draft
**Owner:** Product/Engineering
**Audience:** Frontend, Backend (Supabase), QA

Related docs:

- `PRD-PROFILE-PAGE.md` (planned) -- Operator identity, awards, social features
- `PRD-SHACK-PAGE.md` (planned) -- Equipment management, station modeling
- `docs/requirements/MOBILE-DESIGN-PLAN.md` -- Mobile layout patterns

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals / Success Criteria](#3-goals--success-criteria)
4. [Non-Goals](#4-non-goals)
5. [Feature Specification](#5-feature-specification)
   - 5.1 [Page Layout](#51-page-layout)
   - 5.2 [Preferences Section](#52-preferences-section)
   - 5.3 [Appearance Section](#53-appearance-section)
   - 5.4 [Notifications Section](#54-notifications-section)
   - 5.5 [Connections Section](#55-connections-section)
   - 5.6 [Data & Account Section](#56-data--account-section)
6. [Data Architecture](#6-data-architecture)
7. [URL Structure & Navigation](#7-url-structure--navigation)
8. [Settings Modal Retirement Plan](#8-settings-modal-retirement-plan)
9. [Mobile Experience](#9-mobile-experience)
10. [Supabase Requirements](#10-supabase-requirements)
11. [Accessibility](#11-accessibility)
12. [Migration & Backward Compatibility](#12-migration--backward-compatibility)
13. [Open Questions](#13-open-questions)

---

## 1. Executive Summary

Propulse's settings are currently packed into a single `SettingsModal.tsx` (1,367 lines) containing 10 tabs: Profile, Locations, License, Equipment, Cluster, CAT, Appearance, Preferences, Notifications, and Backup. This modal is independently instantiated in three layout files (`Header.tsx`, `Layout.tsx`, `MobileLayout.tsx`), meaning three copies of the same state management and rendering logic exist in the component tree simultaneously.

The project is splitting user-facing configuration into three dedicated route pages with clear separation of concerns:

| Route       | Responsibility                                                                                            | Principle             |
| ----------- | --------------------------------------------------------------------------------------------------------- | --------------------- |
| `/profile`  | Operator identity -- callsign, name, grid, license, locations, awards, social                             | "Who you are"         |
| `/shack`    | Equipment management -- radios, antennas, station modeling, specs comparison                              | "What you have"       |
| `/settings` | Application configuration -- display preferences, appearance, notifications, connections, data management | "How the app behaves" |

**This PRD covers `/settings` only.** The settings page retains the "plumbing" -- things an operator sets once and rarely changes. Identity fields (callsign, name, grid, license, locations) migrate to `/profile`. Equipment (radios, antennas, custom radio definitions) migrates to `/shack`.

The transition from modal to page unlocks deep-linking, eliminates triple-instantiation, provides room for growth as Supabase account management features arrive, and delivers a better mobile experience by replacing the cramped accordion pattern with full-width scrollable sections.

---

## 2. Problem Statement

### 2.1 Structural Issues

**Ten tabs in one modal.** The current modal attempts to cover identity, equipment, connections, preferences, notifications, appearance, and backup in a single overlay. This violates separation of concerns -- notification toggle switches sit adjacent to radio firmware tracking; DX Cluster node configuration shares a container with callsign entry.

**Three independent instances.** `SettingsModal` is rendered in `Header.tsx` (line 322), `Layout.tsx` (line 132), and `MobileLayout.tsx` (line 144). Each instance manages its own `isOpen` state, meaning the modal can technically be opened by one trigger and not close another. More practically, each instance includes the full component tree (including `useBridge` hook with WebSocket setup, local form state for profile fields, and file import state) even when the modal is closed, contributing to unnecessary memory allocation and component lifecycle overhead.

**No deep-linking.** A user cannot bookmark or share a URL to a specific settings section. Support workflows ("go to Settings > Connections > DX Cluster") require verbal navigation rather than a clickable link.

**Modal-within-modal patterns.** The Equipment tab opens a "full radio manager" via `DetailModal` (a second modal at z-index 500), creating nested scroll containers and focus-trap conflicts.

### 2.2 Mobile Experience Issues

**Scrolling within scrolling.** The modal has a fixed max-height of `calc(100dvh - 2rem)` with internal overflow-y scroll. On mobile, this creates a scrollable area inside the page's own scrollable viewport, leading to ambiguous scroll capture and accidental backdrop dismissals.

**Accordion is cramped.** Mobile uses an accordion pattern where each of the 10 sections is a collapsible panel. With only one section expanded at a time, the user constantly expands/collapses to cross-reference settings (for example, checking Bridge status in the CAT tab while adjusting Cluster connection settings).

**Touch targets.** Several controls (Kp threshold slider, band chips, time format toggle buttons) are designed for desktop pointer interaction. On mobile, the 32x32px touch targets fall below the 44x44px recommended minimum for comfortable touch interaction.

### 2.3 Data Model Issues

**Monolithic store.** `userStore.ts` (1,608 lines, persisted under `propulse-user` v14) holds station identity, operator preferences, equipment, targets, service credentials, notification settings, spot clustering config, compass rose config, spot age config, watch alert config, UI interaction config, band presets, forecast display config, antenna type, noise environment, and colorblind mode -- all in a single flat `UserPreferences` interface with 25+ fields plus nested sub-objects.

**Fragmented persistence.** Theme data persists separately in `propulse-theme` (manual `localStorage.getItem`/`setItem` in `themeStore.ts`). DX Cluster settings persist under `propulse-cluster-settings` (manual `localStorage` in `ClusterSettings.tsx`). Rig state in `rigStore.ts` is intentionally transient (not persisted). This fragmentation makes backup/restore incomplete -- the current `settingsBackup.ts` captures userStore data but not theme or cluster preferences.

---

## 3. Goals / Success Criteria

### 3.1 Architectural Goals

- **Clean separation of concerns.** Settings page contains only app behavior configuration. No identity fields (callsign, grid, name, license, locations). No equipment fields (radios, antennas, custom radio definitions).
- **Single instance.** One `<SettingsPage>` component, rendered by the router. Zero modal instances for settings.
- **Deep-linkable sections.** Every settings section is addressable via URL fragment or route segment. Support staff can send operators directly to `/settings/connections` or `/settings/notifications`.
- **Immediate application.** Settings changes take effect the moment the user interacts with a control. No "Save" button except where batch operations are required (import/export, account deletion). This matches the existing behavior of toggles like colorblind mode and notification switches, and extends it to preferences that currently require a "Save Display Preferences" button (time format, text scale).

### 3.2 UX Goals

- **Desktop: sidebar + content.** Left sidebar (fixed 200px) with section navigation; main content area fills remaining width. Sidebar is sticky; content scrolls. Active section highlighted in sidebar tracks scroll position via intersection observer.
- **Mobile: stacked sections.** No sidebar. Full-width sections stacked vertically with collapsible headers. Floating mini-nav (pill bar) at top for quick section jumps. Bottom padding accounts for the mobile navigation bar.
- **Scannable layout.** Each preference is a self-contained row with label, current value, brief description, and control. Group related preferences under named sub-headers. No preference requires scrolling to understand what it does.

### 3.3 Technical Goals

- **Store decomposition.** Split the monolithic `userStore` into focused stores: `settingsStore` (app preferences), `profileStore` (identity), `shackStore` (equipment). Each store has its own persistence key and migration version.
- **Backup completeness.** Export/import covers all settings sources: user preferences, theme config, and cluster connection config.
- **Supabase readiness.** Settings data model is structured for cloud sync from day one. Settings that should roam across devices (preferences, appearance, notification config) are tagged for Supabase sync. Settings that are device-specific (bridge host/port, CAT backend) remain in localStorage only.

### 3.4 Measurable Success Criteria

| Metric                                         | Target                                   |
| ---------------------------------------------- | ---------------------------------------- |
| SettingsModal.tsx deleted                      | 0 lines remain                           |
| Independent modal instances                    | 0 (was 3)                                |
| Settings page bundle size                      | < 40KB gzipped (code-split, lazy-loaded) |
| Time to first meaningful paint (settings page) | < 200ms on 4G mobile                     |
| All settings sections deep-linkable            | 5/5 sections have unique URLs            |
| Mobile touch targets                           | >= 44x44px for all interactive elements  |
| Settings round-trip (export then import)       | 100% data fidelity                       |

---

## 4. Non-Goals

- **Profile page implementation.** Callsign, name, grid, license, locations, awards, social features, and QSL service credentials are out of scope. They will be covered by `PRD-PROFILE-PAGE.md`.
- **Shack page implementation.** Radio management, antenna management, custom radio definitions, spectrum/performance comparison, and detailed station modeling are out of scope. They will be covered by `PRD-SHACK-PAGE.md`.
- **Light theme.** The theme selector will include a "Light" option as a disabled placeholder. Actual light theme implementation is deferred.
- **Push notifications.** The notifications section configures in-app alert preferences. Browser push notification registration, service worker notification handling, and notification permission flows are out of scope for this PRD.
- **Real-time collaborative settings.** Multi-device conflict resolution for simultaneous edits is deferred. Initial Supabase sync uses last-write-wins at the field level.
- **Settings search.** A search-within-settings feature (type "noise" to jump to noise environment) is desirable but deferred to a follow-up iteration.
- **Undo/redo for settings.** Settings changes are immediate and do not support undo. The "Reset to default" affordance per field provides recovery.

---

## 5. Feature Specification

### 5.1 Page Layout

#### 5.1.1 Desktop Layout

```
+------------------+--------------------------------------------------+
|  Settings        |  Section Content                                 |
|  ────────────    |                                                  |
|  ● Preferences   |  [Active section content rendered here]          |
|    Appearance    |                                                  |
|    Notifications |  - Subsection headers                            |
|    Connections   |  - Individual preference rows                    |
|    Data &        |  - Controls (toggles, sliders, selectors)        |
|      Account     |                                                  |
|                  |                                                  |
+------------------+--------------------------------------------------+
```

**Sidebar (left, 200px fixed width):**

- Page title "Settings" in `font-orbitron font-bold text-gradient-orange` (consistent with existing header treatment).
- Five navigation items, each with an icon (16x16 SVG) and label.
- Active item: `bg-plasma-orange/15 text-plasma-orange border-l-2 border-plasma-orange` with `font-medium`.
- Inactive items: `text-gray-400 hover:text-white hover:bg-white/5` with `font-normal`.
- Sidebar is `position: sticky; top: 0; height: 100vh; overflow-y: auto` so it stays visible while content scrolls.
- At the bottom of the sidebar: app version string (e.g., "v2.4.0") in `text-xs text-gray-600` as a subtle anchor.

**Content area (fills remaining width):**

- `max-width: 720px` to prevent overly wide form layouts on ultrawide monitors.
- `padding: 2rem` on all sides.
- Sections flow vertically, separated by `border-t border-white/10` with `mt-12 pt-8` spacing.
- Each section starts with an `<h2>` header matching the sidebar label.
- Smooth scroll behavior: clicking a sidebar nav item scrolls the content to the target section using `scrollIntoView({ behavior: 'smooth', block: 'start' })`.
- Active sidebar item updates as the user scrolls via `IntersectionObserver` on section header elements, with `rootMargin: '-20% 0px -80% 0px'` to trigger near the top of the viewport.

**Back navigation:**

- A "Back" link/button above the page title that navigates to the previous page (using `router.back()` with fallback to `/`).
- Keyboard shortcut: `Escape` navigates back, consistent with modal close behavior.

#### 5.1.2 Mobile Layout

```
+--------------------------------------------------+
|  ← Settings                                      |
|  [Preferences] [Appearance] [Alerts] [...]  →    |
+--------------------------------------------------+
|                                                   |
|  ▼ Preferences                                    |
|  ──────────────────────────────────               |
|  Display settings...                              |
|  Map & Globe settings...                          |
|                                                   |
|  ▼ Appearance                                     |
|  ──────────────────────────────────               |
|  Accent color grid...                             |
|                                                   |
|  ► Notifications  (collapsed)                     |
|  ► Connections    (collapsed)                     |
|  ► Data & Account (collapsed)                     |
|                                                   |
|                    [bottom nav padding]            |
+--------------------------------------------------+
```

**Header:**

- Back arrow + "Settings" title in the standard mobile header bar.
- Below the header: a horizontally scrollable pill bar with section names. Tapping a pill scrolls to that section and expands it. The active pill uses `bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50`.

**Sections:**

- All sections are rendered in the DOM (not lazy) for smooth scroll targeting.
- Each section has a collapsible header: tapping toggles expand/collapse with a 200ms slide animation.
- On initial load, the first section (Preferences) is expanded; others are collapsed.
- If the user navigates to `/settings/notifications`, that section auto-expands and scrolls into view.
- Full-width form controls. Toggles are 48x48px touch targets. Sliders have 48px-tall hit areas.
- Bottom padding of `pb-24` to account for the mobile bottom navigation bar.

#### 5.1.3 Shared Component Architecture

```
src/
  pages/
    SettingsPage.tsx            -- Route component, layout shell, section registry
  components/
    settings/
      SettingsSidebar.tsx       -- Desktop sidebar nav (200px)
      SettingsMobileNav.tsx     -- Mobile pill bar
      SettingsSection.tsx       -- Reusable section wrapper (id, title, icon, collapsible)

      PreferencesSection.tsx    -- Display, Color & Accessibility, Map & Globe, Propagation, Bands, Interaction
      AppearanceSection.tsx     -- Accent colors, theme, custom colors
      NotificationsSection.tsx  -- Propagation alerts, Audio, Watch alerts
      ConnectionsSection.tsx    -- Bridge/CAT, DX Cluster
      DataAccountSection.tsx    -- Export/Import, Supabase account, About

      -- Shared sub-components (reused across sections):
      SettingRow.tsx            -- Label + description + control layout
      SettingToggle.tsx         -- Toggle switch with label and description
      SettingSlider.tsx         -- Slider with label, value display, and range
      SettingSelect.tsx         -- Dropdown with label and description
      SettingChips.tsx          -- Chip group selector (bands, modes)
      SettingResetButton.tsx    -- "Reset to default" icon button per field
```

**SettingRow** is the atomic layout unit. Every preference renders as:

```
+------------------------------------------------------------------+
| [Icon]  Label                               [Control]  [Reset]   |
|         Brief description of what this does                      |
+------------------------------------------------------------------+
```

- Icon: optional, 16x16, `text-gray-500`.
- Label: `text-sm font-medium text-gray-200`.
- Description: `text-xs text-gray-500`, wraps to second line.
- Control: right-aligned on desktop (flex `justify-between`), full-width below label on mobile.
- Reset: small circular button (`w-6 h-6`) with a reset arrow icon, visible on hover (desktop) or always visible (mobile), calls the field's default value setter.

---

### 5.2 Preferences Section

The Preferences section is the largest, containing all user-adjustable behavior settings that are not related to identity, equipment, appearance, notifications, or connections. Settings are organized into six sub-groups.

#### 5.2.1 Display

| Setting      | Control                                        | Current Store Path                      | Default       | Description                                                                                                                                                                              |
| ------------ | ---------------------------------------------- | --------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time format  | Segmented toggle: `12h` / `24h`                | `preferences.timeFormat`                | `"12h"`       | Controls UTC time display throughout the app. Most amateur radio operators prefer 24h; casual users may prefer 12h.                                                                      |
| Text scale   | Segmented toggle: `Small` / `Normal` / `Large` | `preferences.textScale`                 | `"md"`        | Scales text in panels and data displays. Small = 90%, Normal = 100%, Large = 115%. Designed for operators who need larger text for readability.                                          |
| Visual style | Segmented toggle: `Realistic` / `High-Viz`     | `preferences.uiInteraction.visualStyle` | `"realistic"` | Realistic uses the default clean aesthetic. High-Viz uses bolder colors and larger markers inspired by OpenHamClock, optimized for readability at a distance or in bright ambient light. |

**Behavior:** All three settings apply immediately on toggle. No save button. The text scale change triggers a CSS custom property update that cascades through `rem`-based sizing. Visual style triggers a re-render of globe/map components.

**Implementation note:** Time format and text scale currently require a "Save Display Preferences" button in `SettingsModal.tsx` (lines 556-559). The new settings page eliminates this by calling `updatePreferences()` directly on toggle interaction, matching the pattern already used by colorblind mode and noise environment selectors.

#### 5.2.2 Color & Accessibility

| Setting         | Control                                                 | Current Store Path           | Default  | Description                                                                                                                             |
| --------------- | ------------------------------------------------------- | ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Colorblind mode | Dropdown: None / Protanopia / Deuteranopia / Tritanopia | `preferences.colorBlindMode` | `"none"` | Adjusts status colors (good/fair/poor/closed) across all panels. Each mode uses optimized color palettes and optional shape indicators. |
| High contrast   | Toggle switch                                           | (new field)                  | `false`  | Increases border contrast and text brightness for low-vision users. Applies `contrast-more` CSS modifier across panel components.       |

**Colorblind mode includes a live preview strip** showing four status dots (Good, Fair, Poor, Closed) in the selected mode's palette, exactly as currently implemented in `SettingsModal.tsx` (lines 877-905). The preview updates immediately on dropdown change.

**Description text** below the dropdown dynamically shows the selected mode's description using the existing `COLOR_BLIND_MODE_DESCRIPTIONS` map.

#### 5.2.3 Map & Globe

This sub-group consolidates all PropSphere visualization preferences that are currently scattered across multiple nested preference objects.

| Setting            | Control                                     | Current Store Path                                  | Default  | Description                                                                                                                               |
| ------------------ | ------------------------------------------- | --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Spot clustering    | Toggle switch                               | `preferences.spotClustering.enabled`                | `true`   | Groups nearby DX spots into cluster markers on the globe to reduce visual clutter.                                                        |
| Cluster grid size  | Slider: 5-15 degrees, step 1                | `preferences.spotClustering.gridSize`               | `5`      | Size of the grid cells used for clustering. Smaller = more clusters, larger = fewer. Only visible when clustering is enabled.             |
| Min cluster size   | Slider: 2-10 spots, step 1                  | `preferences.spotClustering.minClusterSize`         | `3`      | Minimum number of spots required to form a cluster. Below this count, spots render individually. Only visible when clustering is enabled. |
| Compass rose       | Toggle switch                               | `preferences.compassRose.enabled`                   | `false`  | Displays a compass rose overlay at the operator's QTH location on the globe, showing cardinal directions and optional beam heading wedge. |
| Beam width         | Segmented toggle: 30 / 45 / 60 / 90 degrees | `preferences.compassRose.beamWidth`                 | `45`     | Width of the beam heading wedge in the compass rose. Only visible when compass rose is enabled.                                           |
| Show beam wedge    | Toggle switch                               | `preferences.compassRose.showBeamWidth`             | `true`   | Toggles the directional wedge overlay within the compass rose. Only visible when compass rose is enabled.                                 |
| Spot age decay     | Toggle switch                               | `preferences.spotAge.enabled`                       | `true`   | Older spots fade in opacity on the globe, making fresh spots more prominent.                                                              |
| Max spot age       | Slider: 5-120 minutes, step 5               | `preferences.spotAge.maxAgeMinutes`                 | `30`     | Spots older than this are fully faded. Only visible when spot age is enabled.                                                             |
| Show age column    | Toggle switch                               | `preferences.spotAge.showAgeColumn`                 | `true`   | Displays a "Age" column in the DX Cluster spot list showing minutes since each spot was reported.                                         |
| DX callsign labels | Toggle switch                               | `preferences.uiInteraction.showSpotCallsignLabels`  | `true`   | Shows callsign text labels next to spot markers on the globe. Disabling reduces visual clutter for high-density views.                    |
| Spotter labels     | Toggle switch                               | `preferences.uiInteraction.showSpotterLabels`       | `false`  | Shows the spotter's callsign in addition to the DX station's callsign.                                                                    |
| Spot color mode    | Segmented toggle: `By Mode` / `By Band`     | `preferences.uiInteraction.spotColorMode`           | `"mode"` | By Mode colors spots by operating mode (FT8=blue, CW=yellow, SSB=green). By Band colors spots by frequency band (20m, 40m, etc.).         |
| Spot hit radius    | Slider: 0.5x-2.0x, step 0.1                 | `preferences.uiInteraction.spotHitRadiusMultiplier` | `1.0`    | Multiplier for the hover/click detection radius around spot markers. Increase for touch devices or dense spot areas.                      |

**Conditional visibility:** Cluster grid size and min cluster size are only shown when spot clustering is enabled. They animate in/out with a 150ms height transition. Same pattern for compass rose sub-settings (beam width, show beam wedge) and spot age sub-settings (max age slider).

**All controls apply immediately.** Globe re-renders reactively via Zustand subscriptions.

#### 5.2.4 Propagation

| Setting               | Control                                                           | Current Store Path                           | Default         | Description                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Noise environment     | Dropdown: Quiet Rural / Rural / Suburban-Residential / Urban-City | `preferences.noiseEnvironment`               | `"residential"` | Affects SNR predictions for band conditions and propagation models. Based on ITU-R P.372 man-made noise levels. Rural environments see better HF performance; urban environments suffer more interference on lower bands. |
| Antenna type (quick)  | Dropdown: list from `ANTENNA_TYPES` array                         | `preferences.antennaType`                    | `"isotropic"`   | Used for quick propagation estimates. Affects gain calculations based on path takeoff angle. Detailed antenna modeling (height, orientation, stacking) lives in the Shack page.                                           |
| Forecast band mode    | Segmented toggle: `Common` / `All` / `Custom`                     | `preferences.forecastDisplay.bandMode`       | `"common"`      | Controls which bands appear in the 24h propagation forecast heatmap. Common = 5 key bands, All = 8 HF bands, Custom = user-selected subset.                                                                               |
| Forecast custom bands | Chip selector (all HF bands)                                      | `preferences.forecastDisplay.customBands`    | all 8 HF bands  | Only visible when band mode is "Custom". Tap chips to include/exclude bands from the forecast display.                                                                                                                    |
| Show SNR values       | Toggle switch                                                     | `preferences.forecastDisplay.showSnrValues`  | `false`         | Overlays numeric SNR values on each heatmap cell in the propagation forecast.                                                                                                                                             |
| Detailed footer       | Toggle switch                                                     | `preferences.forecastDisplay.detailedFooter` | `true`          | When enabled, the forecast shows recommendations, greyline timing, and propagation tips below the heatmap. When disabled, shows a compact single-line summary.                                                            |
| Hours to show         | Segmented toggle: `13h` / `24h`                                   | `preferences.forecastDisplay.hoursToShow`    | `13`            | Number of hours displayed in the forecast heatmap. 13h shows a half-day view centered on current time; 24h shows the full day.                                                                                            |

**Antenna type** includes a description line below the dropdown showing the selected antenna's peak gain, optimal elevation angle, and brief description (from the `ANTENNA_TYPES` data array), exactly as currently rendered in `SettingsModal.tsx` (lines 708-721).

**A note appears below the antenna selector:** "For detailed antenna modeling including height, orientation, and stacking configuration, visit your Shack page." (Links to `/shack`.)

#### 5.2.5 Bands

| Setting       | Control                                            | Current Store Path         | Default                               | Description                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------- | -------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Favored bands | Three-state chip grid (all 13 bands)               | `preferences.favoredBands` | `primary: ["20m", "40m"], hidden: []` | Click cycles each band through three states: Normal (gray) -> Favored (orange star, shown prominently) -> Hidden (dimmed, deprioritized in displays) -> Normal.                                                |
| Band presets  | List of saved presets (max 5) with add/edit/delete | `preferences.bandPresets`  | `[]`                                  | Named filter combinations (e.g., "Contest Bands", "WARC Only", "HF Low"). Each preset stores a name and array of band strings. Applying a preset sets the band filter across spot lists and forecast displays. |

**Favored bands picker** reuses the existing `FavoredBandsPicker` component with no functional changes, just the updated layout wrapper.

**Band presets** display as a compact list. Each row shows the preset name, band count, and action buttons (apply, edit, delete). "Add preset" opens an inline form with a name input and band chip selector. Limit of 5 presets with a clear message when the limit is reached.

#### 5.2.6 Interaction

| Setting               | Control                        | Current Store Path                                   | Default | Description                                                                                                                                                                        |
| --------------------- | ------------------------------ | ---------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hold duration         | Slider: 1500-5000ms, step 250  | `preferences.uiInteraction.holdDurationMs`           | `2500`  | How long you must press-and-hold on the globe to trigger the context menu. Shorter = faster access but more accidental triggers. Longer = fewer false positives but slower access. |
| Flyout auto-dismiss   | Toggle switch                  | `preferences.uiInteraction.flyoutAutoDismissEnabled` | `true`  | When enabled, flyout menus (right-click/long-press context menus) automatically close after the configured timeout.                                                                |
| Flyout dismiss timing | Slider: 1000-10000ms, step 500 | `preferences.uiInteraction.flyoutAutoDismissMs`      | `2500`  | Duration before flyout menus auto-dismiss. Only visible when auto-dismiss is enabled.                                                                                              |

**Slider labels** show the current value formatted as seconds (e.g., "2.5s") rather than raw milliseconds, with the raw value shown in a `text-xs text-gray-600` annotation for precision.

---

### 5.3 Appearance Section

The Appearance section controls visual theming and is intentionally kept compact. It consumes data from `themeStore` rather than `userStore`.

#### 5.3.1 Accent Color

**Control:** Grid of 8 accent color swatches, 4 columns on desktop, 4 columns on mobile.

Each swatch is a `48x48px` (mobile) or `40x40px` (desktop) button containing a dual-color circle (left half = primary, right half = secondary) with the preset name below. The active swatch shows a white checkmark overlay and a `ring-2 ring-white/20` highlight.

The 8 presets are sourced from the existing `ACCENT_PRESETS` array in `src/lib/themes/index.ts`:

1. Plasma Orange (default)
2. Solar Gold
3. Aurora Green
4. Nebula Blue
5. Deep Violet
6. Signal Red
7. Arctic Cyan
8. Moonlight Silver

**Behavior:** Selecting a preset calls `useThemeStore().setAccent(presetId)` which immediately updates CSS custom properties via `applyThemeToDocument()`. The change is visible app-wide within a single animation frame.

#### 5.3.2 Theme

**Control:** Segmented toggle with two options:

- **Dark** (active, selectable)
- **Light** (disabled, shows "Coming soon" tooltip on hover)

Current implementation only supports dark theme (`themeId: "dark"`). The light theme option exists as a visible-but-disabled placeholder so users know it is planned.

#### 5.3.3 Custom Colors (Advanced)

**Control:** Collapsed by default behind a "Custom colors" disclosure button (`<details>`/`<summary>` or equivalent).

When expanded:

- **Primary color** input: hex color input with a small swatch preview. Accepts `#rrggbb` format.
- **Secondary color** input: same format.
- **Apply** button that calls `useThemeStore().setCustomColors(primary, secondary)`.
- **Reset to preset** button that clears custom colors and reverts to the selected preset.

**Validation:** Hex input is validated on blur. Invalid values revert to the current color with an inline error message.

#### 5.3.4 Live Preview Card

Below the accent controls, a small preview card demonstrates how the selected accent looks on key UI elements:

```
+------------------------------------------------------------------+
|  Preview                                                          |
|  ┌─────────────────────────────────────────────────────────────┐ |
|  │  Panel Title                          [Active] [Inactive]   │ |
|  │  Sample text with accent-colored highlights                 │ |
|  │  ████████████░░░░░░░░  Progress bar                        │ |
|  │  ● Active dot  ○ Inactive dot  ▶ Button                    │ |
|  └─────────────────────────────────────────────────────────────┘ |
+------------------------------------------------------------------+
```

The preview uses the same Tailwind accent utilities (`text-plasma-orange`, `bg-plasma-orange/20`, `border-plasma-orange/50`) as the rest of the app, so it updates in real-time when the accent changes.

---

### 5.4 Notifications Section

The Notifications section consolidates propagation alerts, audio controls, and watch system alert configuration. It reuses and wraps the existing `NotificationSettings` and `WatchAlertSettings` components with updated layout.

#### 5.4.1 Propagation Alerts

| Setting             | Control                      | Current Store Path                                | Default | Description                                                                                                                                                                                                                      |
| ------------------- | ---------------------------- | ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greyline alerts     | Toggle switch                | `preferences.notifications.greylineAlerts`        | `false` | Notify at sunrise and sunset times at the operator's location, when propagation conditions change along the greyline path.                                                                                                       |
| Storm alerts        | Toggle switch                | `preferences.notifications.stormAlerts`           | `false` | Alert when the Kp geomagnetic index exceeds the configured threshold, indicating ionospheric disturbance that may degrade HF propagation.                                                                                        |
| Kp threshold        | Slider: 1-9, step 1          | `preferences.notifications.stormAlertKpThreshold` | `5`     | Kp level that triggers a storm alert. Only visible when storm alerts are enabled. Slider labels show severity: 1 (Quiet) through 5 (Storm) through 9 (Extreme). Color-coded: green (1-3), yellow (4-5), orange (6-7), red (8-9). |
| Flare alerts        | Toggle switch                | `preferences.notifications.flareAlerts`           | `false` | Notify about significant solar flare activity (M-class and above) that may cause radio blackouts or enhanced propagation.                                                                                                        |
| Band opening alerts | Toggle switch                | `preferences.notifications.bandOpeningAlerts`     | `false` | Alert when selected bands show propagation openings based on real-time ionospheric data.                                                                                                                                         |
| Monitored bands     | Chip selector (all 13 bands) | `preferences.notifications.bandOpeningBands`      | `[]`    | Which bands to monitor for opening alerts. Only visible when band opening alerts are enabled. Shows a warning if no bands are selected: "Select at least one band to monitor."                                                   |

**Layout:** Each alert type renders as a card (`bg-nebula-blue rounded-lg border border-white/10 p-3`) containing the toggle switch at the top and any sub-controls (slider, chips) indented below. This matches the existing `NotificationSettings` component layout.

#### 5.4.2 Audio

| Setting           | Control                     | Current Store Path                          | Default                | Description                                                                                      |
| ----------------- | --------------------------- | ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Sound enabled     | Toggle switch               | `preferences.notifications.soundEnabled`    | `true`                 | Master toggle for all notification sounds. When disabled, all alerts are visual only.            |
| Quiet hours start | Time picker (UTC hour 0-23) | `preferences.notifications.quietHoursStart` | `undefined` (disabled) | Start of quiet hours period during which no audio alerts play. Undefined = quiet hours disabled. |
| Quiet hours end   | Time picker (UTC hour 0-23) | `preferences.notifications.quietHoursEnd`   | `undefined` (disabled) | End of quiet hours period.                                                                       |

**Quiet hours** renders as a pair of hour selectors (dropdown or number input with 0-23 range) on the same row. A toggle enables/disables quiet hours. When disabled, the time pickers are grayed out. When enabled, a visual bar shows the quiet period on a 24h timeline strip.

**Info note** (preserved from current implementation): "Push notifications coming soon. Currently, alerts display within the app when conditions change."

#### 5.4.3 Watch Alerts

The watch alert system provides audio notifications when watched callsigns, grids, or DXCC entities appear in the DX Cluster spot feed.

| Setting              | Control                                   | Current Store Path                        | Default       | Description                                                                                                                                                                                            |
| -------------------- | ----------------------------------------- | ----------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Watch alerts enabled | Toggle switch                             | `preferences.watchAlerts.enabled`         | `true`        | Master enable for the watch alert audio system. When disabled, all watch alert audio is silenced.                                                                                                      |
| Mute                 | Toggle switch                             | `preferences.watchAlerts.muted`           | `false`       | Temporarily silence watch alerts without disabling the system. Useful for quick silencing during a QSO. Different from "enabled" -- muted can be toggled quickly and does not reset per-type settings. |
| Volume               | Slider: 0-100%, step 5                    | `preferences.watchAlerts.volume`          | `50`          | Alert sound volume. The slider shows the current percentage. A "Test" button to the right of the slider plays a brief test tone at the current volume level.                                           |
| Cooldown             | Dropdown: 1 / 2 / 3 / 5 / 10 / 15 minutes | `preferences.watchAlerts.cooldownSeconds` | `300` (5 min) | Minimum time between re-alerting for the same spotted station. Prevents alert fatigue when a station is spotted repeatedly on the cluster.                                                             |
| Callsign alerts      | Toggle switch + test button               | `preferences.watchAlerts.callsignAlerts`  | `true`        | Play audio when a watched callsign is spotted. Test button plays the callsign alert sound.                                                                                                             |
| Grid alerts          | Toggle switch + test button               | `preferences.watchAlerts.gridAlerts`      | `true`        | Play audio when a station in a watched grid square is spotted. Test button plays the grid alert sound.                                                                                                 |
| Entity alerts        | Toggle switch + test button               | `preferences.watchAlerts.entityAlerts`    | `true`        | Play audio when a station from a watched DXCC entity is spotted. Test button plays the entity alert sound.                                                                                             |

**Test buttons** call the existing `playTestSound()` and `playAlertSound()` functions from `watchAudioService.ts`. On first interaction, `initAudioContext()` is called to satisfy browser autoplay policies.

**Audio availability check:** If `isAudioAvailable()` returns false (no Web Audio API), the entire Watch Alerts sub-section shows an info banner: "Audio alerts are not available in this browser. Try Chrome, Firefox, or Edge for audio support."

---

### 5.5 Connections Section

The Connections section manages external service integrations: the ProPulse Bridge (for CAT rig control) and DX Cluster (for live spot feeds). These are the most complex settings panels in terms of state management, as they involve real-time connection status and live data display.

#### 5.5.1 Bridge / CAT Control

Migrated from `CATSettings.tsx` (563 lines). The Bridge subsection manages the WebSocket connection to the ProPulse Bridge desktop application, which provides CAT (Computer Aided Transceiver) control via hamlib or flrig.

| Setting            | Control                                              | Current Store Path             | Default       | Description                                                                                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------- | ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bridge enabled     | Toggle switch with status dot                        | `preferences.bridgeEnabled`    | `false`       | Enables the WebSocket connection to the ProPulse Bridge application. When enabled, the app attempts to connect to the bridge on the configured host/port. Status dot: green (connected), red (disconnected/error), yellow (connecting).                                                                    |
| Backend            | Segmented selector: Auto / Hamlib / Flrig / Disabled | `rigStore.backend` (transient) | `"none"`      | Selects the rig control backend. **Auto**: Bridge auto-detects available backends. **Hamlib (rigctld)**: Direct hamlib daemon connection. **Flrig**: Flrig XML-RPC interface. **Disabled**: Bridge connected but rig control inactive.                                                                     |
| Hamlib host        | Text input                                           | localStorage (bridge config)   | `"localhost"` | Hostname or IP address for the rigctld daemon. Only visible when backend is Hamlib or Auto.                                                                                                                                                                                                                |
| Hamlib port        | Number input                                         | localStorage (bridge config)   | `4532`        | TCP port for the rigctld daemon. Only visible when backend is Hamlib or Auto.                                                                                                                                                                                                                              |
| Flrig host         | Text input                                           | localStorage (bridge config)   | `"localhost"` | Hostname or IP for the flrig XML-RPC server. Only visible when backend is Flrig or Auto.                                                                                                                                                                                                                   |
| Flrig port         | Number input                                         | localStorage (bridge config)   | `12345`       | TCP port for the flrig XML-RPC server. Only visible when backend is Flrig or Auto.                                                                                                                                                                                                                         |
| Test connection    | Button                                               | (action)                       | --            | Sends a test command to the configured backend and displays the result (success with rig model, or error with message). Shows a brief loading spinner during the test.                                                                                                                                     |
| PTT safety lockout | Toggle switch with warning                           | `rigStore` (transient)         | `true`        | When enabled, prevents the app from keying the transmitter via CAT control. Safety measure to prevent accidental transmissions. Turning this OFF shows a confirmation dialog: "Disabling PTT safety allows the app to key your transmitter. Ensure your station is properly configured before proceeding." |

**Live rig status panel** (visible only when bridge is connected and a rig is detected):

```
+------------------------------------------------------------------+
|  Rig Status                                          [Connected]  |
|  ┌─────────────────────────────────────────────────────────────┐ |
|  │  Model: IC-7300           VFO: A                            │ |
|  │  Freq:  14.074.000 MHz    Mode: USB                        │ |
|  │  Band:  20m               Split: Off                       │ |
|  │  S-Meter: ████████░░░░  S7  (-12 dB)                      │ |
|  │  Power:   100W                                              │ |
|  └─────────────────────────────────────────────────────────────┘ |
+------------------------------------------------------------------+
```

The S-meter bar uses the existing `sMeterToPercent()` and `sMeterColor()` functions from `CATSettings.tsx`. The bar is color-coded: green below S9, yellow at S9, red above S9+20. Frequency is formatted using the existing `formatFrequency()` utility from `types/bridge.ts`.

**Connection status indicator** is a colored dot next to the "Bridge enabled" label:

- Disconnected: `bg-gray-500` (gray dot)
- Connecting: `bg-caution-yellow animate-pulse` (yellow pulsing dot)
- Connected: `bg-signal-green` (green dot)
- Error: `bg-alert-red` (red dot)

#### 5.5.2 DX Cluster

Migrated from `ClusterSettings.tsx` (560 lines). The DX Cluster subsection manages the telnet-over-bridge connection to a DX Cluster node for receiving live spot feeds.

| Setting              | Control                                             | Current Store Path                         | Default                      | Description                                                                                                                                                                    |
| -------------------- | --------------------------------------------------- | ------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cluster node         | Dropdown: 5 well-known nodes + "Custom"             | `propulse-cluster-settings` (localStorage) | VE7CC (index 0)              | Select which DX Cluster node to connect to. Well-known nodes: VE7CC (NA), NC7J (NA), HB9DRV (EU), K3LR (NA), K3LR Alt (NA). Selecting "Custom" reveals host/port input fields. |
| Custom host          | Text input                                          | `propulse-cluster-settings`                | `""`                         | Hostname for custom cluster node. Only visible when "Custom" is selected.                                                                                                      |
| Custom port          | Number input                                        | `propulse-cluster-settings`                | `7300`                       | TCP port for custom cluster node. Only visible when "Custom" is selected.                                                                                                      |
| Login callsign       | Text input (pre-filled from profile)                | `propulse-cluster-settings`                | `""` (or station callsign)   | Callsign used to authenticate with the cluster node. Pre-populated from the operator's profile callsign if available.                                                          |
| Password             | Password input (optional)                           | `propulse-cluster-settings`                | `""`                         | Optional password for cluster nodes that require authentication. Most public nodes do not require a password. Input is masked with a show/hide toggle.                         |
| Band filter          | Chip selector (all 13 bands)                        | `propulse-cluster-settings`                | `[]` (no filter = all bands) | Filter incoming spots to only show selected bands. Empty selection = no filter (show all bands).                                                                               |
| Mode filter          | Chip selector (CW / SSB / FT8 / FT4 / RTTY / Other) | `propulse-cluster-settings`                | `[]` (no filter = all modes) | Filter incoming spots to only show selected modes. Empty selection = no filter (show all modes).                                                                               |
| Connect / Disconnect | Button                                              | (action)                                   | --                           | Initiates or terminates the cluster connection via the bridge. Button label changes based on state. Shows connection status and error messages inline.                         |

**Connection status indicator:**

- Disconnected: gray dot + "Not connected"
- Connecting: yellow pulsing dot + "Connecting..."
- Connected: green dot + "Connected to [node label]"
- Error: red dot + error message

**Spot source display** (below the cluster settings): A read-only line showing the current spot data source. Values: "Bridge (live telnet)" when bridge cluster is connected, "REST API" when using the fallback HTTP spot endpoint, "Demo data" when in demo mode. This helps operators understand where their spots are coming from.

**Future note:** Cluster credentials may move to Supabase encrypted storage in a future iteration. For now they remain in localStorage under `propulse-cluster-settings`, which is the existing behavior.

---

### 5.6 Data & Account Section

The Data & Account section handles data portability, local storage management, Supabase account operations, and app information.

#### 5.6.1 Export / Import

**Export all settings:**

- A prominent button: "Export Settings as JSON".
- Clicking triggers `downloadSettingsBackup()` which generates a timestamped JSON file (e.g., `propulse-backup-2026-02-07.json`) and initiates a browser download.
- The export now includes data from all three storage locations: `propulse-user` (userStore), `propulse-theme` (themeStore), and `propulse-cluster-settings` (cluster config). This is an improvement over the current implementation which only captures userStore data.
- Success/error feedback appears inline below the button.

**Import settings:**

- A secondary button: "Import Settings from File".
- Clicking opens a file picker filtered to `.json` files.
- After file selection, the import flow is three steps:
  1. **Parse & validate:** Read the JSON, validate schema version and structure using `validateBackup()`.
  2. **Preview:** Display a summary of what the backup contains (station data, X radios, Y targets, notification prefs, etc.) using `getBackupSummary()`. Show any warnings (version mismatch, missing sections).
  3. **Confirm:** Two buttons: "Confirm Import" (applies the backup via `importSettings()`) and "Cancel" (discards).
- After successful import, a success message lists which sections were imported.
- The page content refreshes to reflect imported values (stores update triggers re-render).

**Export logbook as ADIF:**

- A secondary button: "Export Logbook as ADIF".
- Exports QSO log data in standard ADIF 3.1.4 format for import into other logging software.
- Only visible if the user has logged at least one QSO. Otherwise shows: "No QSOs logged yet."

**Clear local data:**

- A destructive action button styled in red: "Clear All Local Data".
- Clicking opens a confirmation dialog with the message: "This will delete all locally stored settings, preferences, logbook entries, and cached data. Data synced to your Supabase account will not be affected. This action cannot be undone."
- Confirmation requires typing "DELETE" in a text input (defense against accidental clicks).
- On confirmation: clears `localStorage`, clears `IndexedDB` databases, resets all Zustand stores to defaults, and navigates to `/` (home).

#### 5.6.2 Supabase Account

This subsection appears only when Supabase integration is configured (the Supabase client is initialized). It is the primary account management interface.

**Signed-in state:**

```
+------------------------------------------------------------------+
|  Account                                                          |
|  ┌─────────────────────────────────────────────────────────────┐ |
|  │  Signed in as: N5XXX (operator@email.com)                  │ |
|  │  Member since: January 2026                                 │ |
|  │                                                              │ |
|  │  Sync Status                                                │ |
|  │  Last sync: 2 minutes ago                    [Sync Now]     │ |
|  │  Pending changes: 0                                         │ |
|  │                                                              │ |
|  │  Devices                                                     │ |
|  │  ● This device (Chrome, macOS) — active now                 │ |
|  │  ○ iPad (Safari) — last seen 3 hours ago                    │ |
|  │                                                              │ |
|  │  [Sign Out]              [Delete Account]                   │ |
|  └─────────────────────────────────────────────────────────────┘ |
+------------------------------------------------------------------+
```

| Element               | Behavior                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-in display     | Shows callsign and email from Supabase auth session.                                                                                   |
| Last sync time        | Relative timestamp (e.g., "2 minutes ago") of the most recent successful sync.                                                         |
| Pending changes count | Number of local changes not yet pushed to Supabase. 0 = fully synced.                                                                  |
| Sync Now button       | Forces an immediate sync. Shows a spinner during sync. Disabled when there are no pending changes.                                     |
| Device list           | Shows all devices that have synced with this account. Each device shows browser, OS, and last-seen time. "This device" is highlighted. |
| Sign Out              | Clears the Supabase session token. Local data is preserved. Navigates to `/`.                                                          |
| Delete Account        | Initiates account deletion with double confirmation.                                                                                   |

**Delete account flow:**

1. Click "Delete Account" (red text, no fill).
2. First confirmation dialog: "Deleting your account will permanently remove all cloud-synced data including your profile, preferences, logbook, and watch lists. Local data on this device will be preserved. Are you sure?"
3. Second confirmation: "Type your callsign to confirm deletion: [input field]". The input must match the account's callsign exactly.
4. On confirmation: calls Supabase account deletion API, clears session, shows success message, navigates to `/`.

**Signed-out state:**

- Shows: "Sign in to sync your settings across devices."
- "Sign In" button navigates to the auth flow (separate from this PRD).

#### 5.6.3 About

| Element              | Value                                                | Source                                                       |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| App version          | e.g., "Propulse v2.4.0"                              | `import.meta.env.VITE_APP_VERSION` or `package.json` version |
| Build info           | e.g., "Build abc1234 (2026-02-07)"                   | `import.meta.env.VITE_GIT_SHA` and `VITE_BUILD_DATE`         |
| Changelog link       | "View changelog" (opens in new tab)                  | Link to GitHub releases or `/changelog` route                |
| Keyboard shortcuts   | "View keyboard shortcuts" or "Press ? for shortcuts" | Opens the existing `ShortcutsHelpModal`                      |
| Data attributions    | Collapsible list of data sources                     | NOAA/SWPC, ITU, QRZ, HamQTH, etc.                            |
| Open source licenses | "View open source licenses"                          | Link to `/licenses` or third-party attribution page          |

The About section is intentionally lightweight -- just enough to satisfy "where does this data come from?" and "what version am I running?" questions that operators commonly ask during support interactions.

---

## 6. Data Architecture

### 6.1 Storage Taxonomy

Every setting belongs to one of three storage tiers based on its sync and persistence requirements:

| Tier             | Storage                           | Sync to Supabase | Rationale                                                                                                                                                              |
| ---------------- | --------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Roaming**      | Zustand + localStorage + Supabase | Yes              | User preferences that should follow the operator across devices: time format, text scale, colorblind mode, notification preferences, favored bands, accent color, etc. |
| **Device-local** | Zustand + localStorage only       | No               | Settings tied to a specific machine's hardware or network: Bridge host/port, CAT backend selection, cluster node credentials (until encrypted storage is available).   |
| **Transient**    | Zustand only (no persistence)     | No               | Real-time state that is meaningless across sessions: rig connection status, current frequency/mode, S-meter reading, cluster connection status.                        |

#### Detailed field classification:

**Roaming (syncs to Supabase):**

- `timeFormat`, `textScale`, `colorBlindMode`, `highContrast`
- `uiInteraction.*` (all fields)
- `spotClustering.*`, `compassRose.*`, `spotAge.*`
- `noiseEnvironment`, `antennaType`
- `forecastDisplay.*`
- `favoredBands.*`, `bandPresets[]`
- `notifications.*` (all alert preferences)
- `watchAlerts.*` (all watch alert preferences)
- `themeId`, `accentId`, `customPrimary`, `customSecondary`

**Device-local (localStorage only):**

- `bridgeEnabled`
- Bridge host/port configuration (hamlib host, hamlib port, flrig host, flrig port)
- Cluster node selection, custom host/port, login callsign, password
- Cluster band/mode filters (these are arguably roaming, but the cluster connection is device-specific)

**Transient (memory only):**

- `rigStore.*` (frequency, mode, band, vfo, split, ptt, sMeter, power, connected, backend, rigModel)
- Cluster connection status

### 6.2 Store Decomposition

The monolithic `userStore` is split into focused stores. Each store has its own `localStorage` persistence key and migration version.

| New Store            | Persistence Key             | Version     | Contents                                                                                                                                                                                                     |
| -------------------- | --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settingsStore`      | `propulse-settings`         | `1`         | All roaming + device-local settings that belong on the Settings page. Includes display prefs, map/globe prefs, notification prefs, watch alert prefs, interaction prefs, forecast display prefs, band prefs. |
| `profileStore`       | `propulse-profile`          | `1`         | Station identity (callsign, grid, name, locations, license), ITU region, service credentials. Consumed by the Profile page.                                                                                  |
| `shackStore`         | `propulse-shack`            | `1`         | Radio equipment (radios[], customRadios[], activeRadioId, preferTestedSpecs). Consumed by the Shack page.                                                                                                    |
| `themeStore`         | `propulse-theme`            | (no change) | Theme ID, accent ID, custom colors. Already separate.                                                                                                                                                        |
| `clusterConfigStore` | `propulse-cluster-settings` | `1`         | Cluster node selection, credentials, band/mode filters. Currently raw localStorage; migrated to a proper Zustand store with persistence middleware.                                                          |
| `rigStore`           | (none -- transient)         | --          | No change. Remains a non-persisted Zustand store.                                                                                                                                                            |

**Old store retirement:** `propulse-user` (v14) remains readable for migration purposes. On first load after the split:

1. Read `propulse-user` from localStorage.
2. Distribute fields to the appropriate new stores.
3. Write each new store to its persistence key.
4. Mark migration complete by writing `propulse-user-migrated: true` to localStorage.
5. Do NOT delete `propulse-user` immediately (keep for rollback safety during the transition period).
6. After a configurable grace period (e.g., 30 days or 2 app versions), delete `propulse-user`.

### 6.3 Supabase Table Schema

```sql
-- User preferences (roaming settings)
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display
  time_format TEXT NOT NULL DEFAULT '12h' CHECK (time_format IN ('12h', '24h')),
  text_scale TEXT NOT NULL DEFAULT 'md' CHECK (text_scale IN ('sm', 'md', 'lg')),
  color_blind_mode TEXT NOT NULL DEFAULT 'none',
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  visual_style TEXT NOT NULL DEFAULT 'realistic' CHECK (visual_style IN ('realistic', 'high-viz')),

  -- Appearance
  theme_id TEXT NOT NULL DEFAULT 'dark',
  accent_id TEXT NOT NULL DEFAULT 'plasma',
  custom_primary TEXT,
  custom_secondary TEXT,

  -- Propagation
  noise_environment TEXT NOT NULL DEFAULT 'residential',
  antenna_type TEXT NOT NULL DEFAULT 'isotropic',

  -- Complex nested preferences stored as JSONB
  spot_clustering JSONB NOT NULL DEFAULT '{"enabled":true,"gridSize":5,"minClusterSize":3}',
  compass_rose JSONB NOT NULL DEFAULT '{"enabled":false,"beamWidth":45,"showBeamWidth":true}',
  spot_age JSONB NOT NULL DEFAULT '{"enabled":true,"maxAgeMinutes":30,"showAgeColumn":true}',
  ui_interaction JSONB NOT NULL DEFAULT '{}',
  forecast_display JSONB NOT NULL DEFAULT '{}',
  notifications JSONB NOT NULL DEFAULT '{}',
  watch_alerts JSONB NOT NULL DEFAULT '{}',
  favored_bands JSONB NOT NULL DEFAULT '{"primary":["20m","40m"],"hidden":[]}',
  band_presets JSONB NOT NULL DEFAULT '[]',

  -- Sync metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_id TEXT, -- which device last wrote this row

  UNIQUE(user_id)
);

-- Row-level security: users can only read/write their own preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### 6.4 Migration Strategy

The migration from `propulse-user` (v14) to the new store split happens in a single synchronous pass on app startup, before any component renders.

**Migration function (`migrateFromLegacyStore`):**

```
1. Check if `propulse-user-migrated` exists in localStorage.
   - If yes: migration already complete, skip.
   - If no: proceed.

2. Read `propulse-user` from localStorage, parse JSON.

3. Extract settings fields -> write to `propulse-settings`:
   - timeFormat, textScale, colorBlindMode
   - uiInteraction, spotClustering, compassRose, spotAge
   - noiseEnvironment, antennaType
   - forecastDisplay, favoredBands, bandPresets
   - notifications, watchAlerts
   - bridgeEnabled

4. Extract profile fields -> write to `propulse-profile`:
   - station (callsign, grid, lat, lon, locations, etc.)
   - ituRegion, licenseClass, license
   - serviceCredentials
   - savedTargets

5. Extract equipment fields -> write to `propulse-shack`:
   - radios[], customRadios[], activeRadioId, preferTestedSpecs

6. Read `propulse-theme` (already separate, no migration needed).

7. Read `propulse-cluster-settings` -> write to `propulse-cluster-settings` (v1 format):
   - Wrap in Zustand persist format if not already.

8. Write `propulse-user-migrated: "v1"` to localStorage.

9. Log migration summary to console for debugging.
```

**Rollback safety:** If the new app version detects `propulse-user` exists but `propulse-user-migrated` does not, it re-runs migration. If a user downgrades to an older app version, the old version still reads `propulse-user` which has not been deleted.

---

## 7. URL Structure & Navigation

### 7.1 Routes

| URL                       | Behavior                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings`               | Renders the full settings page with all sections. On desktop, scrolls to the top (Preferences section visible). On mobile, all sections rendered with Preferences expanded. |
| `/settings/preferences`   | Scrolls to / expands the Preferences section.                                                                                                                               |
| `/settings/appearance`    | Scrolls to / expands the Appearance section.                                                                                                                                |
| `/settings/notifications` | Scrolls to / expands the Notifications section.                                                                                                                             |
| `/settings/connections`   | Scrolls to / expands the Connections section.                                                                                                                               |
| `/settings/data`          | Scrolls to / expands the Data & Account section.                                                                                                                            |

**Implementation:** The settings page is a single route component (`/settings`) that reads the URL path suffix to determine which section to auto-scroll to on mount. This avoids needing separate route entries for each section while maintaining deep-link capability. The router configuration adds a single entry:

```tsx
<Route path="/settings/*" element={<SettingsPage />} />
```

The `SettingsPage` component reads `useLocation().pathname`, extracts the section slug (e.g., `"notifications"` from `/settings/notifications`), and scrolls to the corresponding section's DOM element on mount.

**URL updates during scroll:** As the user scrolls through sections, the URL updates via `history.replaceState()` (not `pushState`, to avoid polluting browser history) to reflect the currently visible section. This enables "copy current URL" to capture the active section.

### 7.2 Navigation Integration Points

**Header gear icon:**

- Currently: `onClick={() => setShowSettings(true)}` (opens modal).
- After migration: `onClick={() => navigate('/settings')}` (navigates to settings page).

**Command palette:**

- Currently: "Open Settings" action calls `onOpenSettings?.()` which opens the modal.
- After migration: "Open Settings" action calls `navigate('/settings')`.
- Add section-specific actions:
  - "Settings: Preferences" -> `navigate('/settings/preferences')`
  - "Settings: Appearance" -> `navigate('/settings/appearance')`
  - "Settings: Notifications" -> `navigate('/settings/notifications')`
  - "Settings: Connections" -> `navigate('/settings/connections')`
  - "Settings: Data & Account" -> `navigate('/settings/data')`

**Keyboard shortcuts:**

- `Cmd+,` (macOS) / `Ctrl+,` (Windows/Linux): navigates to `/settings`. This is the standard platform convention for opening application settings.
- `Escape` on the settings page: navigates back to the previous page.

**Mobile bottom nav:**

- The gear icon in the mobile bottom navigation bar navigates to `/settings` instead of opening a modal.

**Cross-page links:**

- Profile page: "Manage app preferences" links to `/settings/preferences`.
- Shack page: "Configure antenna for propagation estimates" links to `/settings/preferences` (scrolls to Propagation sub-section).
- Settings page: "Edit your callsign and profile" links to `/profile`. "Manage your radios and equipment" links to `/shack`.

---

## 8. Settings Modal Retirement Plan

The migration from modal to page is executed in phases to minimize risk and allow incremental testing.

### Phase 1: Build the Settings Page

- Implement `SettingsPage.tsx` and all section components.
- Add the `/settings/*` route to `App.tsx`.
- All five sections functional with immediate-apply behavior.
- Settings page reads from the existing `userStore` + `themeStore` + cluster localStorage (no store split yet).
- Both the modal and the page coexist. The page is accessible via direct URL navigation.

### Phase 2: Redirect Trigger Points

- Update `Header.tsx` (line 322): replace `<SettingsModal>` with `navigate('/settings')` on gear icon click. Remove the `showSettings` state and `SettingsModal` import.
- Update `Layout.tsx` (line 132): replace `<SettingsModal>` with navigation. Remove the `showSettings` state and `SettingsModal` import.
- Update `MobileLayout.tsx` (line 144): replace `<SettingsModal>` with navigation. Remove the `showSettings` state and `SettingsModal` import.
- Update `CommandPalette.tsx` (line 383): change `onOpenSettings?.()` to `navigate('/settings')`. Remove `onOpenSettings` prop from all consumers.
- Add `Cmd+,` keyboard shortcut handler.

### Phase 3: Move Profile Tabs

- Extract Profile, Locations, and License tabs to the `/profile` page (separate PRD).
- Remove `renderTabContent` cases for `"profile"`, `"locations"`, and `"license"` from `SettingsModal.tsx`.

### Phase 4: Move Equipment Tab

- Extract Equipment tab to the `/shack` page (separate PRD).
- Remove `renderTabContent` case for `"equipment"` from `SettingsModal.tsx`.

### Phase 5: Delete the Modal

- Delete `src/components/settings/SettingsModal.tsx` (1,367 lines).
- Remove all `SettingsModal` imports across the codebase.
- Remove the `SettingsModalProps` interface and `SettingsTab` type.
- Verify no remaining references via `grep -r "SettingsModal" src/`.

### Phase 6: Store Decomposition

- Implement `settingsStore`, `profileStore`, `shackStore`, and `clusterConfigStore`.
- Implement the migration function from `propulse-user` (v14) to the new stores.
- Update all consumers to import from the appropriate new store.
- Verify backup/restore works with the new store layout.

### Phase 7: Cleanup

- Remove the `propulse-user` migration compatibility code after the grace period.
- Remove any dead code from `userStore.ts` that was only consumed by the modal.
- Update the `settingsBackup.ts` utilities to export/import from the new stores.

---

## 9. Mobile Experience

### 9.1 Layout

The mobile settings page uses a single-column stacked layout with no sidebar. Sections are full-width and stacked vertically.

**Header bar:**

- Left: back arrow button (navigates to previous page).
- Center: "Settings" title.
- Standard mobile header height (56px).

**Section jump bar** (below header, sticky):

- Horizontally scrollable row of pill buttons, one per section.
- Active pill: `bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50 rounded-full px-3 py-1.5`.
- Inactive pill: `bg-white/5 text-gray-400 border border-white/10 rounded-full px-3 py-1.5`.
- Tapping a pill scrolls to that section and expands it (if collapsed).
- The active pill scrolls into view horizontally when the user scrolls vertically past a section boundary.

**Sections:**

- Each section has a collapsible header: full-width button with section title, icon, and expand/collapse chevron.
- Expanded state: section content slides in with a 200ms ease-out animation.
- Multiple sections can be expanded simultaneously (unlike the current accordion which forces single-expand).
- On initial load or URL navigation to a specific section, that section is expanded; the rest are collapsed.

### 9.2 Touch Optimization

- All toggle switches: minimum 48x48px touch target (using padding if the visual element is smaller).
- All sliders: 48px-tall interactive area (the visible track can be thinner, but the touch target extends above and below).
- Band chip buttons: minimum 40x40px (currently some are smaller at `px-2 py-1`).
- Segmented toggles: each segment minimum 44px tall, with clear active/inactive states.
- Dropdown selects: native `<select>` elements on mobile (which trigger the OS picker) rather than custom dropdowns that may have scroll/focus issues.

### 9.3 Swipe & Gestures

- No horizontal swipe navigation between sections (conflicts with back-swipe gesture on iOS).
- Pull-to-refresh disabled on the settings page (settings are local, nothing to refresh).
- Scroll-to-top on double-tap of the header title (standard iOS convention).

### 9.4 Bottom Padding

All section content includes `pb-24` (96px) bottom padding to ensure the last settings are accessible above the mobile bottom navigation bar (which is `h-16` / 64px).

---

## 10. Supabase Requirements

### 10.1 Sync Architecture

Settings sync follows a "local-first with cloud backup" model:

1. **All changes write to localStorage first.** The app never blocks on network for settings changes.
2. **A sync debounce** batches rapid changes (e.g., dragging a slider) into a single Supabase write. Debounce window: 2 seconds after the last change.
3. **On sync:** the entire `user_preferences` row is upserted (not individual fields). This simplifies conflict resolution at the cost of slightly more bandwidth.
4. **On app load:** read from localStorage immediately (instant render), then fetch from Supabase in the background. If the Supabase version is newer (based on `updated_at`), merge it into localStorage.

### 10.2 Conflict Resolution

**Strategy: last-write-wins at the row level.**

When the app loads and detects a conflict (local `updated_at` differs from remote `updated_at`):

- If remote is newer: overwrite local with remote values.
- If local is newer: push local to remote (this happens naturally on next sync).
- If timestamps are equal: no action needed.

**Why not field-level merge:** Field-level merge is more correct but significantly more complex (requires tracking per-field timestamps, handling partial syncs, and resolving semantic conflicts like "one device enabled storm alerts and changed threshold, another device disabled storm alerts"). Last-write-wins is acceptable because:

- Settings change infrequently.
- Most operators use one primary device.
- The worst case (a setting reverts to a previous value) is annoying but not data-destructive.

**Future consideration:** If field-level merge becomes necessary, the JSONB storage format supports it. Each JSONB field could include a per-key `_updatedAt` metadata field for fine-grained conflict resolution.

### 10.3 Offline Capability

- All settings are fully functional without network connectivity.
- The settings page renders entirely from localStorage/Zustand state.
- No Supabase calls are required to view or change settings.
- When connectivity returns, pending changes sync automatically.
- A "Pending changes: N" indicator in the Data & Account section shows unsent changes.
- The sync debounce timer resets on connectivity loss and fires on reconnection.

### 10.4 Initial Supabase Onboarding

When a user signs in to Supabase for the first time (no existing `user_preferences` row):

1. Create the row with the user's current local settings as initial values.
2. This ensures existing users who sign up for cloud sync do not lose their preferences.

When a user signs in on a new device (existing `user_preferences` row exists):

1. Fetch the remote preferences.
2. Apply them to the new device's localStorage.
3. Device-local settings (bridge config, cluster config) remain at their defaults on the new device.

---

## 11. Accessibility

### 11.1 Keyboard Navigation

- **Tab order** follows visual layout: sidebar nav items, then section content controls, top-to-bottom.
- **Arrow keys** navigate within segmented toggles and chip selectors.
- **Enter/Space** activates toggle switches, buttons, and selects the focused option in segmented toggles.
- **Escape** navigates back from the settings page (same as clicking the back button).
- **Sidebar navigation** items are focusable and activate on Enter/Space.

### 11.2 ARIA Attributes

| Element              | ARIA                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| Toggle switches      | `role="switch"`, `aria-checked`, `aria-label` with descriptive text              |
| Sliders              | `role="slider"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label` |
| Segmented toggles    | `role="radiogroup"` on container, `role="radio"` on each option, `aria-checked`  |
| Chip selectors       | `role="group"` on container, each chip is `role="checkbox"` with `aria-checked`  |
| Collapsible sections | `aria-expanded` on header button, `aria-controls` referencing content ID         |
| Sidebar nav          | `role="navigation"`, `aria-label="Settings sections"`                            |
| Live rig status      | `aria-live="polite"` on the status panel, `aria-label` on the S-meter bar        |
| Status dots          | `aria-label` describing the connection state (e.g., "Connected", "Disconnected") |
| Color swatches       | `aria-label` with preset name and "selected" state, `aria-pressed`               |

### 11.3 Screen Reader Announcements

- When a setting is changed, the new value is announced. For toggle switches, this happens natively via `aria-checked`. For sliders, the new value is announced via `aria-valuenow`.
- Section navigation (via sidebar or pills) announces the section heading when the section scrolls into view.
- Connection test results are announced via an `aria-live="assertive"` region.

### 11.4 Color Contrast

- All text meets WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text) against the dark background.
- Interactive controls have distinct focus indicators: `ring-2 ring-plasma-orange/50 ring-offset-2 ring-offset-void-black`.
- The colorblind mode preview demonstrates actual contrast before the user commits to a mode.
- The high contrast toggle (new) increases border and text brightness for users who need stronger visual separation.

### 11.5 Reduced Motion

- When `prefers-reduced-motion: reduce` is detected:
  - Section expand/collapse transitions are instant (no slide animation).
  - Smooth scroll is replaced with instant scroll.
  - Pulsing connection status dots use a static color instead of animation.

---

## 12. Migration & Backward Compatibility

### 12.1 Data Migration

**userStore v14 -> settings/profile/shack store split (v15):**

The migration runs on app startup, before the React tree mounts. It is synchronous to avoid race conditions with component initialization.

```
Step 1: Detect migration need
  - Read localStorage key `propulse-user`
  - Read localStorage key `propulse-user-migrated`
  - If `propulse-user` exists AND `propulse-user-migrated` is absent: run migration

Step 2: Parse legacy data
  - Parse `propulse-user` JSON
  - Extract `state.preferences` (the UserPreferences object)
  - Extract `state.station` (the UserStation object)
  - Extract `state.savedTargets` (SavedTarget[])

Step 3: Distribute to new stores
  settingsStore <- {
    timeFormat, textScale, colorBlindMode,
    uiInteraction, spotClustering, compassRose, spotAge,
    noiseEnvironment, antennaType, forecastDisplay,
    favoredBands, bandPresets, notifications, watchAlerts,
    bridgeEnabled
  }

  profileStore <- {
    station (callsign, grid, lat, lon, locations, etc.),
    ituRegion, licenseClass, license,
    savedTargets, serviceCredentials
  }

  shackStore <- {
    radios, customRadios, activeRadioId, preferTestedSpecs
  }

Step 4: Write new stores to localStorage
  - Each store uses Zustand's persist middleware which writes automatically on setState

Step 5: Mark migration complete
  - Write `propulse-user-migrated: "v15"` to localStorage
  - Console log: "Migration from propulse-user v14 to split stores complete"
```

### 12.2 Version Bump Strategy

- `settingsStore` starts at version 1. Future schema changes increment this version with their own migration functions.
- `profileStore` starts at version 1.
- `shackStore` starts at version 1.
- `themeStore` remains at its current version (no changes).
- `clusterConfigStore` starts at version 1 (migration from raw localStorage to Zustand persist format).

### 12.3 No Data Loss Guarantees

- The old `propulse-user` key is NOT deleted during migration. It remains as a read-only backup.
- If a user opens an older version of the app (before the split), it reads `propulse-user` and works normally.
- If a user opens a newer version (after the split), it reads from the new stores and ignores `propulse-user`.
- The `propulse-user` key is deleted only after a configured grace period (2 app version bumps or 30 days, whichever comes first) to allow safe rollback.

### 12.4 Transition Period

During the transition period (Phase 1-2 of the retirement plan), the settings modal and settings page may coexist:

- The modal reads from `userStore` (old).
- The page reads from `userStore` (old, in Phase 1) or the new stores (Phase 6+).
- There is no dual-write concern because only one path is active at a time (modal triggers are replaced with navigation in Phase 2 before the store split in Phase 6).

### 12.5 Backup Format Compatibility

The settings backup JSON format is versioned. The new backup format (v2) includes:

- `version: 2`
- `settings: { ... }` (from settingsStore)
- `profile: { ... }` (from profileStore)
- `shack: { ... }` (from shackStore)
- `theme: { ... }` (from themeStore)
- `cluster: { ... }` (from clusterConfigStore)

The import function supports both v1 (legacy single-store) and v2 (split-store) formats. When importing a v1 backup into the new system, the distribution logic from section 12.1 is reused to split the data into the correct stores.

---

## 13. Open Questions

| #   | Question                                                                                                                                             | Impact                                                               | Proposed Resolution                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Should cluster credentials (callsign, password) move to Supabase encrypted storage?                                                                  | Security: credentials currently in plaintext localStorage.           | Defer to Supabase auth integration PRD. For now, keep in localStorage with a "credentials are stored locally" notice.                                                                                                          |
| 2   | Should the antenna type selector on Settings be a "quick pick" that links to detailed modeling in Shack, or should it be the single source of truth? | UX consistency: two places to set antenna type could confuse.        | Settings antenna type is the "quick pick" for propagation estimates. Shack has detailed antenna modeling (height, orientation, stacking) that can override the quick pick. Settings shows a link to Shack for detailed config. |
| 3   | Should settings search be in v1 or deferred?                                                                                                         | UX: with 30+ settings, search would be valuable.                     | Defer to v2. The section navigation and clear grouping should be sufficient for v1.                                                                                                                                            |
| 4   | What happens to saved targets during the store split?                                                                                                | Data integrity: targets are in userStore today.                      | Move to profileStore (they are location-related, not app-config). Verify backup/restore handles this correctly.                                                                                                                |
| 5   | Should the settings page be code-split (lazy loaded) or included in the main bundle?                                                                 | Performance: settings is not frequently visited.                     | Code-split via `React.lazy()`. The page loads on first navigation with a brief skeleton placeholder.                                                                                                                           |
| 6   | How do we handle the `onOpenSettings` prop chain through Layout -> CommandPalette after migration?                                                   | Refactoring: the prop currently threads through multiple components. | Replace prop with direct `useNavigate()` in CommandPalette. Remove the prop from Layout, MobileLayout, and Header.                                                                                                             |
| 7   | Should "Reset all settings to defaults" be a single button, or should reset be per-section?                                                          | UX: nuclear reset vs. granular control.                              | Both. Per-field reset icons (already specified in 5.1.3). Per-section "Reset section to defaults" at the bottom of each section. Global "Reset all" in Data & Account (with confirmation).                                     |

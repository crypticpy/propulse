# PRD: Settings & Preferences V2 -- Fix Broken Preferences & Enhance Settings

**Status:** Draft
**Author:** Engineering
**Date:** 2026-02-07
**Store Version:** Current `propulse-settings` v2 -> Target v3

---

## 1. Overview

### 1.1 Problem Statement

A comprehensive audit of the Settings page revealed **14 broken or disconnected preferences**. Users configure these settings in the UI, the values persist correctly in `settingsStore`, but the configured values are never consumed by the rendering or logic layer. This means users are interacting with inert controls -- the settings toggle/slider moves, the value is stored, but the application behavior does not change.

### 1.2 Goals

1. **Wire every stored preference to its consumer(s)** so that changing a setting produces the expected behavioral change.
2. **Achieve feature parity between FlatMapView and GlobeView** for preferences that currently only work on the 3D globe.
3. **Complete the notification system** so greyline alerts, band opening alerts, sound gating, and quiet hours all function end-to-end.
4. **Fix the Text Scale hook** to read from `settingsStore` directly instead of the bridge `userStore`.
5. **Wire the color-blind accessibility system** that is fully implemented but has zero consumers.

### 1.3 Scope

- Fix 14 broken preferences (6 critical, 4 moderate, 4 low)
- No new Settings UI controls needed (all controls already exist and persist correctly)
- Store version bump from v2 to v3 with backward-compatible migration
- Approximate file change footprint: 45-55 files

### 1.4 Non-Goals

- Redesigning the Settings page layout or navigation
- Adding new preference categories
- Implementing a test framework (quality verified via `tsc --noEmit` + build + manual testing)

---

## 2. Audit Results

| #   | Preference                        | Severity | Store Field                                           | UI Control                  | Consumer Status              | Root Cause                                                                                                                                                                               |
| --- | --------------------------------- | -------- | ----------------------------------------------------- | --------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Time Format (12h/24h)             | CRITICAL | `settingsStore.timeFormat`                            | Radio toggle in Preferences | **ZERO consumers**           | ~39 components call `toLocaleTimeString()` independently; `TimeDisplay` has `hour12` prop but callers hardcode `false`                                                                   |
| 2   | Color Vision Mode                 | CRITICAL | `settingsStore.colorBlindMode`                        | Dropdown in Appearance      | **ZERO consumers**           | Complete library at `colorblind.ts` with `getColorBlindColor()`, `getStatusColorStyles()`, `getStatusIcon()` -- but no component imports any of these                                    |
| 3   | Text Scale (sm/md/lg)             | CRITICAL | `settingsStore.textScale`                             | Radio toggle in Appearance  | **Wrong data source**        | `useTextScale.ts` reads from `useUserStore` (bridge) instead of `useSettingsStore`; CSS tokens at `design-tokens.css` lines 176-192 work if `data-text-scale` attribute is set correctly |
| 4   | Spot Age maxAgeMinutes            | CRITICAL | `settingsStore.spotAge.maxAgeMinutes`                 | Slider (default 30)         | **Hardcoded thresholds**     | `getSpotAgeInfo()` in `LiveSpotArcs.tsx` uses hardcoded 2/5/10/15 min buckets; never receives `maxAgeMinutes` parameter                                                                  |
| 5   | Spotter Labels Toggle             | CRITICAL | `settingsStore.uiInteraction.showSpotterLabels`       | Toggle in Preferences       | **ZERO consumers**           | `LiveSpotArcs.tsx` renders DX callsign labels; no code path for spotter labels exists                                                                                                    |
| 6   | Hold Duration                     | CRITICAL | `settingsStore.uiInteraction.holdDurationMs`          | Slider 1500-5000ms          | **Hardcoded value**          | `FlatMapView.tsx` line 3230 hardcodes `holdDurationMs: 500`; `GlobeView` also does not pass it                                                                                           |
| 7   | Compass Rose beamWidth (flat map) | MODERATE | `settingsStore.compassRose.beamWidth`                 | Slider                      | **Globe only**               | `GlobeView.tsx` passes `beamWidth` to `<CompassRose3D>`; `FlatMapView.tsx` `drawCompassRose()` has no beam width parameter at all                                                        |
| 8   | Spot Clustering (flat map)        | MODERATE | `settingsStore.spotClustering`                        | Toggle + grid size          | **Globe only**               | `LiveSpotArcs.tsx` uses `useSpotClustering` hook; `FlatMapView.tsx` renders all spots individually with no clustering logic                                                              |
| 9   | Spot Age decay (flat map)         | MODERATE | `settingsStore.spotAge.enabled`                       | Toggle                      | **Globe only**               | `FlatMapView.drawSpotArc()` sets `opacity = 1` unconditionally (line 938); no age-based decay                                                                                            |
| 10  | Spot Hit Radius (flat map)        | MODERATE | `settingsStore.uiInteraction.spotHitRadiusMultiplier` | Slider 0.5-2.0x             | **Globe only**               | `LiveSpotArcs.tsx` passes `hitRadius * multiplier`; `FlatMapView` click detection uses fixed pixel radius                                                                                |
| 11  | Greyline Alerts toggle            | LOW      | `settingsStore.notifications.greylineAlerts`          | Toggle in Notifications     | **No generator**             | Toggle persists; no sunrise/sunset alert generation system exists                                                                                                                        |
| 12  | Band Opening Alerts toggle        | LOW      | `settingsStore.notifications.bandOpeningAlerts`       | Toggle + band selector      | **Detector unused**          | `bandOpeningDetector.ts` exists with full detection logic but is never instantiated or called from any hook/component                                                                    |
| 13  | Sound Enabled toggle              | LOW      | `settingsStore.notifications.soundEnabled`            | Toggle in Notifications     | **Partially ignored**        | `useSolarAlerts` checks `stormAlerts`/`flareAlerts` toggles but never gates on `soundEnabled`; watch audio service does not check it either                                              |
| 14  | Quiet Hours                       | LOW      | `settingsStore.notifications.quietHoursStart/End`     | Time selectors              | **Display-only suppression** | `AlertStrip.tsx` hides the UI banner during quiet hours but alert generation and sounds still fire                                                                                       |

---

## 3. Fix Specifications

### Fix #1: Time Format (12h/24h) -- CRITICAL

**What the setting does:** Controls whether times throughout the application display in 12-hour format (e.g., "2:30 PM") or 24-hour format (e.g., "14:30").

**Current behavior (broken):** `settingsStore.timeFormat` is set to `"12h"` or `"24h"` via the Preferences radio toggle. However, zero components read this value. All ~39 components that format times call `toLocaleTimeString()` or `Intl.DateTimeFormat` with their own hardcoded `hour12` values. The `TimeDisplay` component accepts an `hour12` prop but every caller either omits it (defaulting to `false`) or hardcodes it.

**Target behavior (fixed):** Every time display in the application respects the user's `timeFormat` preference.

**Implementation approach:**

1. Create a `useTimeFormat()` hook:

   **New file:** `src/hooks/useTimeFormat.ts`

   ```typescript
   import { useSettingsStore } from "@/stores/settingsStore";

   export function useTimeFormat(): { hour12: boolean } {
     const timeFormat = useSettingsStore((s) => s.timeFormat);
     return { hour12: timeFormat === "12h" };
   }
   ```

2. Create a `formatTime()` utility for non-React contexts (canvas rendering, pure functions):

   **File:** `src/lib/utils/time.ts` (add to existing file)

   ```typescript
   import { useSettingsStore } from "@/stores/settingsStore";

   export function getTimeFormatPreference(): boolean {
     return useSettingsStore.getState().timeFormat === "12h";
   }

   export function formatTimeString(
     date: Date,
     options?: { utc?: boolean; showSeconds?: boolean },
   ): string {
     const hour12 = getTimeFormatPreference();
     return date.toLocaleTimeString("en-US", {
       hour: "2-digit",
       minute: "2-digit",
       ...(options?.showSeconds && { second: "2-digit" }),
       hour12,
       ...(options?.utc && { timeZone: "UTC" }),
     });
   }
   ```

3. Update `TimeDisplay.tsx` to read from the store by default:

   **File:** `src/components/ui/TimeDisplay.tsx`
   - Import `useTimeFormat` hook
   - Change `hour12` prop to be optional with a sentinel default (e.g., `undefined`)
   - When `hour12` is `undefined`, use the store value via `useTimeFormat()`
   - When `hour12` is explicitly passed, use that value (backward compat)

4. Update all 39 consumer files to either:
   - (a) Use `<TimeDisplay>` without passing `hour12` (preferred for React components), or
   - (b) Call `formatTimeString()` for canvas/non-JSX contexts

**Files to modify (complete list of time-formatting consumers):**

| File                                                  | Current Pattern               | Fix                                                  |
| ----------------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `src/components/ui/TimeDisplay.tsx`                   | `hour12` prop default `false` | Read from `useTimeFormat()` when prop is `undefined` |
| `src/components/dx/DXSpotList/SpotRow.tsx`            | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/dx/DXSpotList/utils.ts`               | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/dx/InsightsBar.tsx`                   | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/dx/ConditionMatchCard.tsx`            | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/dx/SkedScheduler.tsx`                 | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/dx/WSJTXStatusPanel.tsx`              | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/dx/LogStatsCard.tsx`                  | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/SpotDetailsFlyout.tsx`            | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/PinFlyout.tsx`                    | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/SolarSnapshot.tsx`                | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/DXNewsTicker.tsx`                 | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/TimeControl.tsx`                  | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/DateTimePicker.tsx`               | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/AddPinDialog.tsx`                 | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/RecommendationsPanel.tsx`         | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/map/PropagationForecastMini.tsx`      | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/solar/modals/BandConditionsModal.tsx` | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/solar/modals/SolarFluxChartModal.tsx` | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/solar/modals/SolarFluxModal.tsx`      | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/solar/AnimatedImagePlayer.tsx`        | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/solar/SolarFluxChart.tsx`             | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/solar/AnimationModal.tsx`             | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/solar/EventAlert.tsx`                 | `toLocaleString`              | Use `formatTimeString()`                             |
| `src/components/contest/ContestOneLineEntry.tsx`      | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/contest/MobileContestEntry.tsx`       | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/contest/ContestLiteHudPill.tsx`       | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/contest/ContestDock.tsx`              | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/contest/ContestQSOTable.tsx`          | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/contest/ContestVoiceManager.tsx`      | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/alerts/AlertBanner.tsx`               | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/alerts/AlertHistoryModal.tsx`         | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/logbook/QSOEntryForm.tsx`             | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/logbook/QSOTable.tsx`                 | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/logbook/QSLManager.tsx`               | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/logbook/LogUploadModal.tsx`           | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/pages/Logbook.tsx`                               | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/pages/ProfilePage.tsx`                           | `toLocaleTimeString`          | Use `formatTimeString()`                             |
| `src/components/layout/Header.tsx`                    | `toLocaleTimeString`          | Use `formatTimeString()`                             |

**Testing criteria:**

- Toggle timeFormat to "12h" in Settings > Preferences
- Verify all time displays show AM/PM format
- Toggle back to "24h" -- verify 24-hour format
- Check specifically: Header clock, DX spot list times, contest timer, logbook entries, spot flyouts, solar charts
- Verify canvas-rendered times (FlatMapView time labels, chart axes) also respect the preference

---

### Fix #2: Color Vision Mode -- CRITICAL

**What the setting does:** Remaps status colors (good/fair/poor/closed) from standard green/amber/red/gray to scientifically validated colorblind-safe palettes with redundant icon indicators.

**Current behavior (broken):** `settingsStore.colorBlindMode` is set via dropdown in Appearance. The complete utility library at `src/lib/themes/colorblind.ts` exports `getColorBlindColor()`, `getColorBlindBgColor()`, `getStatusIcon()`, `getStatusColorStyles()` with three full palettes (deuteranopia, protanopia, tritanopia). **Zero components import any of these functions.** The entire color-blind system is dead code.

**Target behavior (fixed):** All components that display status-colored indicators (band conditions, propagation quality, alert severity) use the colorblind-safe palette when a mode is active, and display redundant status icons.

**Implementation approach:** See Section 5 for detailed plan.

**Files to modify:** See Section 5 for complete file list.

**Testing criteria:**

- Set Color Vision Mode to "Deuteranopia" in Settings > Appearance
- Verify band condition cells use blue/orange/vermillion instead of green/amber/red
- Verify status icons (checkmark/tilde/cross) appear next to colored indicators
- Verify all three modes produce distinct, visible palettes
- Verify "Standard" mode shows original colors with no icons

---

### Fix #3: Text Scale -- CRITICAL

**What the setting does:** Scales text sizes across the application by setting a CSS custom property via a `data-text-scale` attribute on `<html>`. Three levels: `sm` (90%), `md` (100%), `lg` (115%).

**Current behavior (broken):** The `useTextScale()` hook at `src/hooks/useTextScale.ts` reads from `useUserStore((state) => state.preferences.textScale)` -- this is the bridge userStore, which reconstructs preferences from `settingsStore`. While this technically works, it creates fragile reactivity because the bridge store does not subscribe to `settingsStore` changes with granular selectors. The `data-text-scale` attribute may not update reactively when only `settingsStore.textScale` changes.

**Target behavior (fixed):** `useTextScale()` reads directly from `settingsStore`, eliminating the bridge indirection.

**File:** `src/hooks/useTextScale.ts`

**Changes:**

```typescript
// BEFORE (line 12):
import { useUserStore } from "@/stores/userStore";

// AFTER:
import { useSettingsStore } from "@/stores/settingsStore";

// BEFORE (line 20-22):
const textScale = useUserStore((state) => state.preferences.textScale ?? "md");

// AFTER:
const textScale = useSettingsStore((s) => s.textScale ?? "md");

// BEFORE (line 45-48 in useTextScalePreference):
const textScale = useUserStore((state) => state.preferences.textScale ?? "md");
const updatePreferences = useUserStore((state) => state.updatePreferences);

// AFTER:
const textScale = useSettingsStore((s) => s.textScale ?? "md");
const updatePreferences = useSettingsStore((s) => s.updatePreferences);

// BEFORE (line 50-52 in setTextScale):
const setTextScale = (scale: TextScale) => {
  updatePreferences({ textScale: scale });
};

// AFTER:
const setTextScale = (scale: TextScale) => {
  updatePreferences({ textScale: scale });
};
// (same call, but now targets settingsStore.updatePreferences instead)
```

**Testing criteria:**

- Set text scale to "Large" in Settings > Appearance
- Verify `document.documentElement.getAttribute("data-text-scale")` equals `"lg"`
- Verify text size increases across the application
- Toggle between sm/md/lg and confirm immediate, reactive updates

---

### Fix #4: Spot Age maxAgeMinutes -- CRITICAL

**What the setting does:** The `maxAgeMinutes` preference (default 30, slider range) controls the maximum age threshold for spot age visual decay. Spots older than `maxAgeMinutes` should be at maximum decay (most faded).

**Current behavior (broken):** `getSpotAgeInfo()` in `src/components/map/LiveSpotArcs.tsx` (lines 68-126) uses hardcoded thresholds: `<2 min = fresh`, `<5 min = recent`, `<10 min = aging`, `<15 min = stale`, `15+ = old`. The `maxAgeMinutes` setting (stored at `settingsStore.spotAge.maxAgeMinutes`) is never passed to or consumed by this function.

**Target behavior (fixed):** `getSpotAgeInfo()` accepts `maxAgeMinutes` as a parameter and scales its thresholds proportionally. With default `maxAgeMinutes=30`, the buckets would be: `<2 = fresh`, `<7.5 = recent`, `<15 = aging`, `<22.5 = stale`, `22.5+ = old` (evenly distributed across the max age range).

**File:** `src/components/map/LiveSpotArcs.tsx`

**Changes to `getSpotAgeInfo()`:**

```typescript
// BEFORE (line 68):
export function getSpotAgeInfo(
  spotTime: Date,
  currentTime: Date = new Date(),
): SpotAgeInfo {

// AFTER:
export function getSpotAgeInfo(
  spotTime: Date,
  currentTime: Date = new Date(),
  maxAgeMinutes: number = 30,
): SpotAgeInfo {
  const ageMinutes = (currentTime.getTime() - spotTime.getTime()) / 60000;

  // Scale thresholds proportionally to maxAgeMinutes
  // Buckets: fresh (0-7%), recent (7-25%), aging (25-50%), stale (50-75%), old (75%+)
  const freshThreshold = maxAgeMinutes * 0.07;   // ~2 min at 30
  const recentThreshold = maxAgeMinutes * 0.25;  // ~7.5 min at 30
  const agingThreshold = maxAgeMinutes * 0.5;    // ~15 min at 30
  const staleThreshold = maxAgeMinutes * 0.75;   // ~22.5 min at 30

  if (ageMinutes < freshThreshold) {
    return { ageMinutes, ageCategory: "fresh", opacity: 1.0, scale: 1.0, saturation: 1.0 };
  }
  if (ageMinutes < recentThreshold) {
    return { ageMinutes, ageCategory: "recent", opacity: 0.9, scale: 0.9, saturation: 0.95 };
  }
  if (ageMinutes < agingThreshold) {
    return { ageMinutes, ageCategory: "aging", opacity: 0.75, scale: 0.75, saturation: 0.7 };
  }
  if (ageMinutes < staleThreshold) {
    return { ageMinutes, ageCategory: "stale", opacity: 0.6, scale: 0.6, saturation: 0.5 };
  }
  return { ageMinutes, ageCategory: "old", opacity: 0.4, scale: 0.5, saturation: 0.3 };
}
```

**Callers to update:**

All callers of `getSpotAgeInfo()` must now pass `maxAgeMinutes` from the store:

- `src/components/map/LiveSpotArcs.tsx` (internal calls) -- access `useSpotAgePrefs()` already imported; pass `spotAgePrefs.maxAgeMinutes`
- `src/components/map/FlatMapView.tsx` (once age decay is added per Fix #9) -- pass from preferences

**Testing criteria:**

- Set maxAgeMinutes to 10 in Settings > Preferences
- Verify a 6-minute-old spot is now in "aging" category (not "recent" as it would be with 30-min scale)
- Set maxAgeMinutes to 60
- Verify a 12-minute-old spot is now "recent" (not "aging")

---

### Fix #5: Spotter Labels Toggle -- CRITICAL

**What the setting does:** When enabled, shows the spotter (reporting station) callsign label in addition to the DX (target) station callsign label on globe/map spot markers.

**Current behavior (broken):** `settingsStore.uiInteraction.showSpotterLabels` is set via toggle in Preferences. The `SpotLabel` component and `LiveSpotArcs` only render labels at the DX endpoint. No code path renders labels at the spotter endpoint.

**Target behavior (fixed):** When `showSpotterLabels` is true, a smaller/dimmer label is rendered at the spotter endpoint of each arc, showing the reporting station's callsign.

**Files to modify:**

1. `src/components/map/LiveSpotArcs.tsx` -- Add spotter label rendering:

   In the render section where `<SpotLabel>` is rendered for each spot's DX callsign, add a conditional second `<SpotLabel>` at the spotter position:

   ```tsx
   {
     uiPrefs.showSpotterLabels && (
       <SpotLabel
         lat={resolved.spotterLat}
         lon={resolved.spotterLon}
         text={spot.spotter || ""}
         color={color}
         opacity={0.6} // dimmer than DX label
         fontSize={0.7} // smaller than DX label
       />
     );
   }
   ```

   The `SpotLabel` component may need a `fontSize` or `scale` prop added if it doesn't already support size variation.

2. `src/components/map/SpotLabel.tsx` -- Ensure it supports `opacity` and `fontSize`/`scale` props for visual hierarchy (spotter labels should be visually subordinate to DX labels).

3. `src/components/map/FlatMapView.tsx` -- In `drawCallsignLabels()`, add spotter label drawing when the preference is enabled. Read `showSpotterLabels` from `preferences.uiInteraction`.

**Testing criteria:**

- Enable "Spotter Labels" in Settings > Preferences
- Verify spotter callsigns appear at the source end of each arc on the globe
- Verify spotter labels are visually dimmer/smaller than DX labels
- Disable the toggle -- spotter labels disappear
- Verify flat map also shows/hides spotter labels

---

### Fix #6: Hold Duration -- CRITICAL

**What the setting does:** Controls how long a user must press-and-hold on the map before the context menu triggers. Range: 1500ms to 5000ms (default 2500ms per `DEFAULT_UI_INTERACTION`).

**Current behavior (broken):**

- `FlatMapView.tsx` line 3230: `holdDurationMs: 500` (hardcoded, ignoring the preference entirely)
- `GlobeView.tsx`: The `GlobeClickHandler` also does not receive `holdDurationMs` from preferences

**Target behavior (fixed):** Both FlatMapView and GlobeView pass `uiInteraction.holdDurationMs` from settingsStore to their click handler components.

**Files to modify:**

1. **`src/components/map/FlatMapView.tsx`** (line ~3230):

   ```typescript
   // BEFORE:
   holdDurationMs: 500,

   // AFTER:
   holdDurationMs: preferences?.uiInteraction?.holdDurationMs ?? 2500,
   ```

   Note: FlatMapView already reads `preferences` from `useUserStore()` at line 2156.

2. **`src/components/map/GlobeView.tsx`** -- Find where `GlobeClickHandler` is rendered and add `holdDurationMs` prop:

   ```tsx
   <GlobeClickHandler
     holdDurationMs={uiPrefs.holdDurationMs}
     // ... other props
   />
   ```

3. **`src/components/map/GlobeClickHandler.tsx`** (if needed) -- Ensure it accepts and uses a `holdDurationMs` prop instead of using a hardcoded constant.

4. **`src/components/map/FlatMapClickHandler.tsx`** -- Already accepts `holdDurationMs` as an option (line 80+); just needs the caller to pass the preference value.

**Testing criteria:**

- Set Hold Duration to 5000ms (5 seconds) in Settings > Preferences
- Press and hold on flat map -- verify context menu takes ~5 seconds to appear
- Set Hold Duration to 1500ms -- verify menu appears after ~1.5 seconds
- Test same behavior on 3D globe
- Verify drag/pan still works (not blocked by hold detection)

---

### Fix #7: Compass Rose Beam Width (Flat Map) -- MODERATE

**What the setting does:** Draws a semi-transparent wedge (pie slice) on the compass rose showing the antenna's beam width in degrees. Already works on the 3D globe.

**Current behavior (broken):** `GlobeView.tsx` (line 642-649) passes `compassRosePrefs.beamWidth` to the `<CompassRose3D>` component. `FlatMapView.tsx` `drawCompassRose()` (line 1069) accepts only `(ctx, homeLat, homeLon, bearing, width, height)` -- no beam width parameter.

**Target behavior (fixed):** `drawCompassRose()` in FlatMapView accepts and renders a beam width wedge when `showBeamWidth` is true.

**File:** `src/components/map/FlatMapView.tsx`

**Changes:**

1. Update `drawCompassRose()` signature (line 1069):

   ```typescript
   // BEFORE:
   function drawCompassRose(
     ctx: CanvasRenderingContext2D,
     homeLat: number,
     homeLon: number,
     bearing: number | null,
     width: number,
     height: number,
   ) {

   // AFTER:
   function drawCompassRose(
     ctx: CanvasRenderingContext2D,
     homeLat: number,
     homeLon: number,
     bearing: number | null,
     width: number,
     height: number,
     beamWidth?: number,
   ) {
   ```

2. After the bearing line drawing section (after line ~1160), add beam width wedge rendering:

   ```typescript
   // Draw beam width wedge if bearing and beamWidth are both set
   if (bearing !== null && beamWidth && beamWidth > 0) {
     const halfBeam = (beamWidth / 2) * (Math.PI / 180);
     const bearingRad = (bearing - 90) * (Math.PI / 180);
     const wedgeRadius = radius - 4;

     ctx.beginPath();
     ctx.moveTo(cx, cy);
     ctx.arc(cx, cy, wedgeRadius, bearingRad - halfBeam, bearingRad + halfBeam);
     ctx.closePath();
     ctx.fillStyle = "rgba(255, 107, 53, 0.15)"; // plasma-orange with low alpha
     ctx.fill();
   }
   ```

3. Update the call site (line ~3516):

   ```typescript
   // BEFORE:
   drawCompassRose(
     ctx,
     station.lat,
     station.lon,
     compassBearing,
     renderWidth,
     renderHeight,
   );

   // AFTER:
   const compassPrefs = preferences?.compassRose;
   drawCompassRose(
     ctx,
     station.lat,
     station.lon,
     compassBearing,
     renderWidth,
     renderHeight,
     compassPrefs?.showBeamWidth ? compassPrefs?.beamWidth : undefined,
   );
   ```

**Testing criteria:**

- Enable compass rose in Settings, set beam width to 90 degrees
- Verify a 90-degree wedge appears on the flat map compass rose, centered on the bearing line
- Change beam width to 30 degrees -- wedge narrows
- Disable "Show Beam Width" toggle -- wedge disappears, bearing line remains
- Compare with globe compass rose -- should look consistent

---

### Fix #8: Spot Clustering (Flat Map) -- MODERATE

**What the setting does:** Groups nearby DX spots into cluster markers to reduce visual clutter when many spots overlap geographically. Works on the 3D globe via `useSpotClustering` hook.

**Current behavior (broken):** `FlatMapView.tsx` renders every resolved spot individually via `drawSpotArcs()`. No clustering logic is applied. The `useSpotClustering` hook and `SpotCluster` component are only used in `LiveSpotArcs.tsx` (globe).

**Target behavior (fixed):** When spot clustering is enabled, FlatMapView groups spots using the same grid-based algorithm and renders cluster markers (circle with count badge) instead of individual overlapping arcs.

**Files to modify:**

1. **`src/components/map/FlatMapView.tsx`:**
   - Import `useSpotClustering` from `@/hooks/useSpotClustering`
   - Import `useSpotClusteringPrefs` from `@/stores/settingsStore` (or read from bridge `preferences`)
   - Before rendering spots, run resolved spots through clustering:

     ```typescript
     const clusteringPrefs = preferences?.spotClustering;
     const { clusters, singles } = useSpotClustering(liveSpots, {
       enabled: clusteringPrefs?.enabled ?? false,
       gridSize: clusteringPrefs?.gridSize ?? 5,
       minClusterSize: clusteringPrefs?.minClusterSize ?? 3,
     });
     ```

   - In the render effect, replace `drawSpotArcs(ctx, resolvedSpots, ...)` with:
     - Draw arcs only for `singles` (unclustered spots)
     - Draw cluster markers for `clusters` using a new `drawClusterMarker()` function

2. **Add `drawClusterMarker()` function to FlatMapView:**

   ```typescript
   function drawClusterMarker(
     ctx: CanvasRenderingContext2D,
     lat: number,
     lon: number,
     count: number,
     color: string,
     width: number,
     height: number,
   ) {
     const { x, y } = latLonToCanvas(lat, lon, width, height);
     const radius = Math.min(8 + Math.log2(count) * 3, 20);

     // Outer ring
     ctx.beginPath();
     ctx.arc(x, y, radius, 0, Math.PI * 2);
     ctx.fillStyle = color + "40"; // 25% opacity fill
     ctx.fill();
     ctx.strokeStyle = color;
     ctx.lineWidth = 1.5;
     ctx.stroke();

     // Count badge
     ctx.font = "bold 9px sans-serif";
     ctx.textAlign = "center";
     ctx.textBaseline = "middle";
     ctx.fillStyle = "#fff";
     ctx.fillText(String(count), x, y);
   }
   ```

**Note:** The `useSpotClustering` hook operates on `LiveSpot[]` but FlatMapView works with `ResolvedSpot[]`. The clustering should be applied to `LiveSpot[]` before resolution, then resolve spots for singles only. Alternatively, adapt the clustering to work with `ResolvedSpot[]` (which already have lat/lon resolved). The latter approach is simpler for the flat map since it already resolves all spots.

**Testing criteria:**

- Enable spot clustering in Settings, set grid size to 5 degrees
- Load a busy band (20m FT8) with 100+ spots
- Verify flat map shows cluster markers with counts instead of a mess of overlapping arcs
- Disable clustering -- all individual arcs reappear
- Change grid size -- cluster sizes adjust accordingly

---

### Fix #9: Spot Age Decay (Flat Map) -- MODERATE

**What the setting does:** Gradually fades out older spots by reducing opacity, scale, and saturation based on spot age. Works on the 3D globe.

**Current behavior (broken):** `FlatMapView.tsx` `drawSpotArc()` (line 938) sets `const opacity = 1` unconditionally. No age-based opacity/saturation decay is applied.

**Target behavior (fixed):** When spot age display is enabled, `drawSpotArc()` applies opacity and saturation decay based on spot age, using `getSpotAgeInfo()`.

**File:** `src/components/map/FlatMapView.tsx`

**Changes to `drawSpotArc()`:**

```typescript
// BEFORE (line 929-936):
function drawSpotArc(
  ctx: CanvasRenderingContext2D,
  spot: ResolvedSpot,
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
) {
  const color = getSpotColor(spot, colorMode);
  const opacity = 1;

// AFTER:
function drawSpotArc(
  ctx: CanvasRenderingContext2D,
  spot: ResolvedSpot,
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
  ageDecayEnabled = false,
  maxAgeMinutes = 30,
) {
  const color = getSpotColor(spot, colorMode);
  let opacity = 1;

  if (ageDecayEnabled) {
    const spotTime = spot.time instanceof Date ? spot.time : new Date(spot.time);
    const ageInfo = getSpotAgeInfo(spotTime, new Date(), maxAgeMinutes);
    opacity = ageInfo.opacity;
  }
```

**Update `drawSpotArcs()` (the batch caller):**

```typescript
function drawSpotArcs(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
  ageDecayEnabled = false,
  maxAgeMinutes = 30,
) {
  for (const spot of spots) {
    drawSpotArc(
      ctx,
      spot,
      width,
      height,
      colorMode,
      highViz,
      ageDecayEnabled,
      maxAgeMinutes,
    );
  }
}
```

**Update call site (line ~3396):**

```typescript
const spotAgeEnabled = preferences?.spotAge?.enabled ?? false;
const maxAgeMinutes = preferences?.spotAge?.maxAgeMinutes ?? 30;

drawSpotArcs(
  ctx,
  resolvedSpots,
  renderWidth,
  renderHeight,
  spotColorMode,
  highViz,
  spotAgeEnabled,
  maxAgeMinutes,
);
```

Also import `getSpotAgeInfo` from `LiveSpotArcs` (already imported at top via `resolveSpotLocations`).

**Testing criteria:**

- Enable spot age decay in Settings > Preferences
- Verify older spots appear progressively faded on the flat map
- Toggle spot age off -- all spots return to full opacity
- Adjust maxAgeMinutes and verify the decay curve changes

---

### Fix #10: Spot Hit Radius (Flat Map) -- MODERATE

**What the setting does:** Multiplies the click/hover detection radius for spot markers, making them easier or harder to click. Range: 0.5x to 2.0x.

**Current behavior (broken):** `LiveSpotArcs.tsx` (line 670) passes `hitRadius={0.025 * uiPrefs.spotHitRadiusMultiplier}` to `SpotEndpointHitArea` for the 3D globe. `FlatMapView` click detection uses pixel-based distance checks but does not apply the multiplier.

**Target behavior (fixed):** FlatMapView spot hover/click detection applies the `spotHitRadiusMultiplier`.

**File:** `src/components/map/FlatMapView.tsx`

**Changes:**

In the map hover handler or spot detection logic (wherever the flat map determines which spot the user is hovering/clicking), find the distance threshold and multiply it:

```typescript
const hitRadiusMultiplier =
  preferences?.uiInteraction?.spotHitRadiusMultiplier ?? 1.0;
const BASE_HIT_RADIUS_PX = 10; // or whatever the current hardcoded value is
const hitRadius = BASE_HIT_RADIUS_PX * hitRadiusMultiplier;
```

Search for the spot-under-cursor detection logic in FlatMapView (likely in the hover handler or a helper function that iterates resolved spots and checks distance).

**Testing criteria:**

- Set spot hit radius to 2.0x in Settings > Preferences
- Verify hovering near (but not directly on) a spot on the flat map triggers the hover tooltip
- Set to 0.5x -- verify you must be very precise to trigger hover
- Test click-to-select behavior with both extremes

---

### Fix #11: Greyline Alerts Toggle -- LOW

**What the setting does:** When enabled, generates an alert 10-15 minutes before sunrise and sunset at the user's QTH, since the greyline terminator zone offers enhanced propagation.

**Current behavior (broken):** The toggle persists `settingsStore.notifications.greylineAlerts` but no code ever evaluates sunrise/sunset times to generate alerts.

**Target behavior (fixed):** A periodic check (every 60 seconds) evaluates whether the user's QTH is approaching sunrise or sunset, and fires an alert when within 15 minutes.

**Files to create/modify:**

1. **New file:** `src/hooks/useGreylineAlerts.ts`

   ```typescript
   import { useEffect, useRef } from "react";
   import { useUserStore } from "@/stores/userStore";
   import { useSettingsStore } from "@/stores/settingsStore";
   import { useAlertsStore } from "@/stores/alertsStore";
   import { getSunTimes } from "@/lib/utils/sun"; // existing utility

   const CHECK_INTERVAL_MS = 60_000; // 1 minute
   const ALERT_LEAD_MINUTES = 15;

   export function useGreylineAlerts() {
     const station = useUserStore((s) => s.station);
     const greylineAlerts = useSettingsStore(
       (s) => s.notifications?.greylineAlerts ?? false,
     );
     const addAlert = useAlertsStore((s) => s.addAlert);
     const lastFiredRef = useRef<string>(""); // "sunrise-YYYY-MM-DD" or "sunset-YYYY-MM-DD"

     useEffect(() => {
       if (!greylineAlerts || !station?.lat || !station?.lon) return;

       const check = () => {
         const now = new Date();
         const { sunrise, sunset } = getSunTimes(station.lat, station.lon, now);
         const todayKey = now.toISOString().slice(0, 10);

         // Check sunrise
         const minToSunrise = (sunrise.getTime() - now.getTime()) / 60_000;
         if (minToSunrise > 0 && minToSunrise <= ALERT_LEAD_MINUTES) {
           const key = `sunrise-${todayKey}`;
           if (lastFiredRef.current !== key) {
             lastFiredRef.current = key;
             addAlert({
               id: crypto.randomUUID(),
               type: "GREYLINE",
               priority: "INFO",
               title: "Greyline Approaching",
               message: `Sunrise at your QTH in ~${Math.round(minToSunrise)} minutes. Enhanced propagation expected.`,
               source: "COMPUTED",
               status: "ACTIVE",
               createdAt: now,
               affectedBands: [],
             });
           }
         }

         // Check sunset
         const minToSunset = (sunset.getTime() - now.getTime()) / 60_000;
         if (minToSunset > 0 && minToSunset <= ALERT_LEAD_MINUTES) {
           const key = `sunset-${todayKey}`;
           if (lastFiredRef.current !== key) {
             lastFiredRef.current = key;
             addAlert({
               id: crypto.randomUUID(),
               type: "GREYLINE",
               priority: "INFO",
               title: "Greyline Approaching",
               message: `Sunset at your QTH in ~${Math.round(minToSunset)} minutes. Enhanced propagation expected.`,
               source: "COMPUTED",
               status: "ACTIVE",
               createdAt: now,
               affectedBands: [],
             });
           }
         }
       };

       check();
       const interval = setInterval(check, CHECK_INTERVAL_MS);
       return () => clearInterval(interval);
     }, [greylineAlerts, station, addAlert]);
   }
   ```

2. **Mount in `src/pages/PropSphere.tsx`** (or App.tsx) -- call `useGreylineAlerts()` alongside `useSolarAlerts()`.

3. **Update `src/types/alerts.ts`** -- Add `"GREYLINE"` to the `AlertType` union.

4. **Verify `src/lib/utils/sun.ts`** exports a `getSunTimes()` function or equivalent. If not, implement using the existing subsolar point calculation.

**Testing criteria:**

- Enable greyline alerts in Settings > Notifications
- Mock or wait for a sunrise/sunset window
- Verify an "INFO" priority alert appears ~15 minutes before the event
- Verify the alert is not duplicated within the same sunrise/sunset

---

### Fix #12: Band Opening Alerts -- LOW

**What the setting does:** When enabled, monitors live spot data and fires an alert when a selected band opens to a specific region (e.g., "10m open to EU").

**Current behavior (broken):** `bandOpeningDetector.ts` has complete detection logic (`BandOpeningDetector` class with sliding window, opening/closing detection, priority assignment). It is never instantiated. The toggle and band selector in Settings persist correctly but no hook consumes the detector.

**Target behavior (fixed):** A hook instantiates the `BandOpeningDetector`, feeds it live spots, and fires alerts for newly detected openings when `bandOpeningAlerts` is true and the opened band is in the user's `bandOpeningBands` list.

**Files to create/modify:**

1. **New file:** `src/hooks/useBandOpeningAlerts.ts`

   ```typescript
   import { useEffect, useRef } from "react";
   import { useLiveSpots } from "./useLiveSpots";
   import { useSettingsStore } from "@/stores/settingsStore";
   import { useAlertsStore } from "@/stores/alertsStore";
   import {
     BandOpeningDetector,
     type BandOpening,
   } from "@/lib/services/bandOpeningDetector";

   export function useBandOpeningAlerts() {
     const notifications = useSettingsStore((s) => s.notifications);
     const addAlert = useAlertsStore((s) => s.addAlert);
     const { data: spots } = useLiveSpots();
     const detectorRef = useRef<BandOpeningDetector | null>(null);

     useEffect(() => {
       if (!notifications?.bandOpeningAlerts) return;
       if (!detectorRef.current) {
         detectorRef.current = new BandOpeningDetector();
       }
       // ... feed spots to detector, check for new openings,
       // filter by bandOpeningBands, fire alerts
     }, [spots, notifications, addAlert]);
   }
   ```

   The exact implementation depends on the `BandOpeningDetector` API (need to read more of the file for `process()` / `getOpenings()` method signatures).

2. **Mount in `src/pages/PropSphere.tsx`** alongside solar alerts.

3. **Update `src/types/alerts.ts`** -- Add `"BAND_OPENING"` to `AlertType` if not present.

**Testing criteria:**

- Enable band opening alerts, select "10m" as monitored band
- Load spots showing 10m activity to a region
- Verify an alert fires when the detector identifies a new opening
- Verify the alert does NOT fire for bands not in the user's monitored list
- Disable band opening alerts -- no more alerts fire

---

### Fix #13: Sound Enabled Toggle -- LOW

**What the setting does:** Master sound toggle that should gate ALL audio output from the notification system.

**Current behavior (broken):**

- `useSolarAlerts` checks individual toggles (`stormAlerts`, `flareAlerts`) to decide whether to generate alerts, but never checks `soundEnabled` before any audio playback.
- `watchAudioService.ts` plays sounds for watch matches but does not check `soundEnabled`.
- The setting is only displayed in the UI; it does not gate audio.

**Target behavior (fixed):** All audio playback in the notification system checks `soundEnabled` before playing.

**Files to modify:**

1. **`src/lib/services/watchAudioService.ts`** -- Before playing any sound:

   ```typescript
   import { useSettingsStore } from "@/stores/settingsStore";

   function shouldPlaySound(): boolean {
     const state = useSettingsStore.getState();
     return state.notifications?.soundEnabled !== false;
   }

   // In play function:
   if (!shouldPlaySound()) return;
   ```

2. **`src/hooks/useSolarAlerts.ts`** -- The solar alert system currently does not play sounds directly (it creates alert objects). If sounds are played in the `AlertToastContainer` or `AlertBanner` components, check those:

3. **`src/components/alerts/AlertToastContainer.tsx`** -- If this component plays a notification sound when a new alert arrives, gate it with `soundEnabled`.

4. **Any other audio playback sites** -- Search for `Audio` constructor, `.play()` calls, and `Web Audio API` usage and gate each with the `soundEnabled` check.

**Testing criteria:**

- Disable "Sound enabled" in Settings > Notifications
- Trigger a watch alert match -- verify no sound plays
- Trigger a solar alert -- verify no sound plays
- Re-enable sound -- verify sounds resume

---

### Fix #14: Quiet Hours -- LOW

**What the setting does:** During the configured quiet hours window (e.g., 22:00-06:00 UTC), ALL alerts and notifications should be suppressed -- not just the visual banner.

**Current behavior (broken):** `AlertStrip.tsx` (line 127-140) checks `isQuietHours()` and returns `null` (hides the banner). But alert generation in `useSolarAlerts` and any sound playback still fire during quiet hours. Only the UI display is suppressed.

**Target behavior (fixed):** During quiet hours:

1. Alert generation is suppressed (no new alerts created)
2. Sound playback is suppressed
3. UI display is suppressed (already works)

**Files to modify:**

1. **Create utility:** `src/lib/utils/quietHours.ts` (or add to existing time utils)

   ```typescript
   import { useSettingsStore } from "@/stores/settingsStore";

   export function isInQuietHours(): boolean {
     const { notifications } = useSettingsStore.getState();
     const start = notifications?.quietHoursStart;
     const end = notifications?.quietHoursEnd;
     if (start === undefined || end === undefined) return false;

     const now = new Date();
     const currentHour = now.getUTCHours();

     if (start <= end) {
       return currentHour >= start && currentHour < end;
     }
     // Wraps midnight (e.g., 22:00 - 06:00)
     return currentHour >= start || currentHour < end;
   }
   ```

2. **`src/hooks/useSolarAlerts.ts`** -- At the top of the evaluation effect (line ~308):

   ```typescript
   import { isInQuietHours } from "@/lib/utils/quietHours";

   // In the evaluation effect:
   if (isInQuietHours()) return; // Skip alert generation during quiet hours
   ```

3. **`src/lib/services/watchAudioService.ts`** -- Gate sound playback:

   ```typescript
   if (isInQuietHours()) return; // No sounds during quiet hours
   ```

4. **`src/hooks/useGreylineAlerts.ts`** (once created) -- Check quiet hours before firing.

5. **`src/hooks/useBandOpeningAlerts.ts`** (once created) -- Check quiet hours before firing.

**Testing criteria:**

- Set quiet hours to the current UTC hour range
- Trigger conditions that would normally fire an alert
- Verify no new alerts are created and no sounds play
- Wait for quiet hours to end -- verify alerts resume

---

## 4. Time Format Implementation -- Detailed Plan

### Phase 1: Create Infrastructure (1 file)

Create `src/hooks/useTimeFormat.ts`:

```typescript
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * React hook: returns { hour12: boolean } based on user's timeFormat preference.
 * Use in React components that render time.
 */
export function useTimeFormat(): { hour12: boolean } {
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  return { hour12: timeFormat === "12h" };
}
```

Add `formatTimeString()` to `src/lib/utils/time.ts` (for non-React / canvas contexts):

```typescript
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Format a Date as a time string respecting the user's 12h/24h preference.
 * Safe to call outside React (reads from store snapshot).
 */
export function formatTimeString(
  date: Date,
  options?: { utc?: boolean; showSeconds?: boolean },
): string {
  const hour12 = useSettingsStore.getState().timeFormat === "12h";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    ...(options?.showSeconds && { second: "2-digit" }),
    hour12,
    ...(options?.utc && { timeZone: "UTC" }),
  });
}
```

### Phase 2: Update TimeDisplay Component (1 file)

In `src/components/ui/TimeDisplay.tsx`:

- Import `useTimeFormat`
- Change `hour12` prop default from `false` to `undefined`
- When `hour12 === undefined`, use `useTimeFormat().hour12`

This makes all existing `<TimeDisplay>` callers automatically pick up the preference without any changes at the call site.

### Phase 3: Update Remaining Consumers (37 files)

For each file listed in Fix #1's table:

- Replace `date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })` with `formatTimeString(date)` or `formatTimeString(date, { utc: true })`
- For React components that need reactive updates, use `useTimeFormat()` hook and pass to their formatting logic
- For canvas rendering contexts and pure functions, use `formatTimeString()`

### Phase 4: Verify

Run `tsc --noEmit` to catch type errors. Then:

- Toggle 12h/24h in Settings
- Spot-check 10+ different time displays across the app
- Ensure AM/PM appears/disappears correctly

---

## 5. Color Vision Mode Implementation -- Detailed Plan

### Architecture

The `colorblind.ts` library exports:

- `getColorBlindColor(mode, status)` -> hex color string
- `getColorBlindBgColor(mode, status)` -> rgba background string
- `getStatusIcon(mode, status)` -> icon character or null
- `getStatusColorStyles(mode, status)` -> `{ textStyle?, bgStyle?, textClass, bgClass }`

The `useColorBlindMode()` hook already exists in `settingsStore.ts` (line 411).

### Consumer Identification

Components that use status colors (green/amber/red pattern) and need colorblind wiring:

| Component                                             | Current Pattern                       | Change Needed                 |
| ----------------------------------------------------- | ------------------------------------- | ----------------------------- |
| `src/components/solar/modals/BandConditionsModal.tsx` | Hardcoded green/amber/red class names | Use `getStatusColorStyles()`  |
| `src/components/map/BandConditionsPanel.tsx`          | Hardcoded status colors               | Use `getStatusColorStyles()`  |
| `src/components/map/PropagationForecastMini.tsx`      | Hardcoded heatmap colors              | Use `getColorBlindColor()`    |
| `src/components/map/SolarSnapshot.tsx`                | Status indicator colors               | Use `getStatusColorStyles()`  |
| `src/components/map/FeasibilityBadge.tsx`             | Green/amber/red badge                 | Use `getStatusColorStyles()`  |
| `src/components/dx/ConditionMatchCard.tsx`            | Condition quality colors              | Use `getStatusColorStyles()`  |
| `src/components/dx/PredictionsCard.tsx`               | Prediction confidence colors          | Use `getStatusColorStyles()`  |
| `src/components/solar/AlertStrip.tsx`                 | Alert priority colors                 | Use `getStatusColorStyles()`  |
| `src/components/alerts/AlertBanner.tsx`               | Alert severity colors                 | Use `getStatusColorStyles()`  |
| `src/components/map/LiveSpotArcs.tsx`                 | `getAgeBadgeColors()`                 | Extend with colorblind colors |
| `src/components/contest/BandReadinessStrip.tsx`       | Band readiness indicators             | Use `getStatusColorStyles()`  |
| `src/components/dx/DXSpotList/SpotRow.tsx`            | Signal quality indicators             | Use `getColorBlindColor()`    |

### Implementation Pattern

For each component:

1. Import `useColorBlindMode` from `@/stores/settingsStore`
2. Import the relevant function(s) from `@/lib/themes/colorblind`
3. Call `const colorBlindMode = useColorBlindMode();`
4. Replace hardcoded color logic:

```typescript
// BEFORE:
<span className="text-signal-green">Good</span>

// AFTER:
const { textStyle, textClass } = getStatusColorStyles(colorBlindMode, "good");
const icon = getStatusIcon(colorBlindMode, "good");
<span className={textClass} style={textStyle}>
  {icon && <span className="mr-1">{icon}</span>}
  Good
</span>
```

### Canvas Rendering

For canvas-rendered status colors (heatmaps, charts), use `getColorBlindColor()` directly:

```typescript
// BEFORE:
ctx.fillStyle = "#22c55e"; // green for good

// AFTER:
const mode = useSettingsStore.getState().colorBlindMode;
ctx.fillStyle = getColorBlindColor(mode, "good");
```

---

## 6. Text Scale Fix -- Implementation

See Fix #3 above for the exact code changes.

**Summary:** Replace `useUserStore` import with `useSettingsStore` in both `useTextScale()` and `useTextScalePreference()` functions in `src/hooks/useTextScale.ts`.

This is a 1-file change affecting 3 lines of import/usage.

---

## 7. FlatMapView Feature Parity

The FlatMapView (2D equirectangular canvas map) is missing 5 features that the GlobeView (3D Three.js globe) already implements:

| Feature                    | GlobeView Location                                      | FlatMapView Status               | Fix Spec |
| -------------------------- | ------------------------------------------------------- | -------------------------------- | -------- |
| Beam width on compass rose | `GlobeView.tsx` line 642-649, `CompassRose3D` component | Missing from `drawCompassRose()` | Fix #7   |
| Spot clustering            | `LiveSpotArcs.tsx` + `useSpotClustering` hook           | Not implemented                  | Fix #8   |
| Spot age decay             | `LiveSpotArcs.tsx` applies `ageInfo.opacity` per spot   | `opacity = 1` hardcoded          | Fix #9   |
| Spot hit radius multiplier | `LiveSpotArcs.tsx` line 670                             | Not applied                      | Fix #10  |
| Spotter labels             | (Not implemented on globe either)                       | Not implemented                  | Fix #5   |
| Hold duration from prefs   | (Not passed on globe either)                            | Hardcoded 500ms                  | Fix #6   |

### FlatMapView Refactoring Notes

`FlatMapView.tsx` is a large file (~3600 lines). The preference-related changes touch:

- **Imports section** (top): Add `getSpotAgeInfo` import, add `useSpotClustering` import
- **Preferences section** (~line 2156-2172): Add reads for `spotAge`, `spotClustering`, `spotHitRadiusMultiplier`
- **Drawing functions** (lines 929-1160): Update `drawSpotArc`, `drawSpotArcs`, `drawCompassRose` signatures
- **Render effect** (lines 3386-3524): Update call sites to pass new parameters
- **Click handler** (line 3230): Fix `holdDurationMs`

FlatMapView reads preferences from the bridge `useUserStore()` (line 2156: `const { station, preferences } = useUserStore()`). The bridge reconstructs the `preferences` object from `settingsStore`, so reading `preferences?.spotAge?.maxAgeMinutes` etc. will work. No need to add a separate `useSettingsStore` import to FlatMapView.

---

## 8. Notification System Completion

### Current State

The notification system has three layers:

1. **Alert Generation** -- `useSolarAlerts` monitors NOAA data and creates `SolarAlert` objects in `alertsStore`
2. **Alert Display** -- `AlertStrip`, `AlertBanner`, `AlertToastContainer` render active alerts
3. **Alert Audio** -- `watchAudioService` plays sounds for watch matches

### Missing Pieces

| Piece                         | Status                        | Fix                                      |
| ----------------------------- | ----------------------------- | ---------------------------------------- |
| Greyline alert generation     | Not implemented               | Fix #11: New `useGreylineAlerts` hook    |
| Band opening alert generation | Detector exists, never called | Fix #12: New `useBandOpeningAlerts` hook |
| `soundEnabled` gating         | Never checked                 | Fix #13: Gate all audio playback         |
| Quiet hours in generation     | Only suppresses display       | Fix #14: Gate alert generation + audio   |

### Integration Point

All new hooks (`useGreylineAlerts`, `useBandOpeningAlerts`) should be mounted in `src/pages/PropSphere.tsx` (the main map page) alongside the existing `useSolarAlerts()` call. They should also be mounted in any other page that serves as the "main" view, or in `App.tsx` if alerts should fire regardless of which page the user is on.

### Alert Type Additions

Update `src/types/alerts.ts`:

```typescript
export type AlertType =
  | "GEOMAGNETIC_STORM"
  | "IMF_SOUTHWARD"
  | "SOLAR_FLARE"
  | "PROTON_EVENT"
  | "GREYLINE" // NEW
  | "BAND_OPENING"; // NEW
```

---

## 9. New Settings Features

Based on the audit, these settings exist in the store but are not surfaced in the Settings UI or could benefit from enhancement:

### 9.1 Settings That Could Be Added

None identified. All stored preferences already have UI controls.

### 9.2 Settings That Need Better Documentation

| Setting                | Issue                                                        | Recommendation                                                            |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Spot Age maxAgeMinutes | No tooltip explaining what "max age" means                   | Add description: "Spots older than this are displayed at maximum fade"    |
| Hold Duration          | No visual feedback during configuration                      | Add a "Try it" button that simulates a hold gesture                       |
| Spotter Labels         | Description says "on globe" but should work on flat map too  | Update description after fix: "Show spotter callsign on map spot markers" |
| Quiet Hours            | No indication that it also suppresses generation (after fix) | Update description: "Suppress all alerts and sounds during these hours"   |

### 9.3 Settings Page UX Improvements (Future)

- Add a "Reset section" button per section (currently only full reset exists)
- Add visual preview for color vision mode (show a sample status bar with the active palette)
- Add a "settings changed" indicator with undo for recent changes

---

## 10. Priority Order

### Tier 1: Quick Wins (1-2 hours total, high user impact)

| Order | Fix                           | Effort | Rationale                                                                             |
| ----- | ----------------------------- | ------ | ------------------------------------------------------------------------------------- |
| 1     | **#3 Text Scale**             | 15 min | 1-file, 3-line change; fixes accessibility feature                                    |
| 2     | **#6 Hold Duration**          | 20 min | 2 files, replace hardcoded values; users can't use context menu reliably without this |
| 3     | **#4 Spot Age maxAgeMinutes** | 30 min | 1 function refactor + caller updates; users configuring spot age see no effect        |

### Tier 2: Medium Effort, High Impact (3-4 hours total)

| Order | Fix                                | Effort | Rationale                                                             |
| ----- | ---------------------------------- | ------ | --------------------------------------------------------------------- |
| 4     | **#9 Spot Age Decay (flat map)**   | 45 min | Natural follow-on from #4; completes the spot age system for flat map |
| 5     | **#7 Compass Rose beamWidth**      | 30 min | Self-contained canvas drawing addition                                |
| 6     | **#10 Spot Hit Radius (flat map)** | 30 min | Small change to click detection logic                                 |
| 7     | **#5 Spotter Labels**              | 1 hour | Needs new rendering code in both LiveSpotArcs and FlatMapView         |

### Tier 3: Large Effort, High Impact (6-8 hours total)

| Order | Fix                      | Effort    | Rationale                                                           |
| ----- | ------------------------ | --------- | ------------------------------------------------------------------- |
| 8     | **#1 Time Format**       | 4-5 hours | Touches 39 files but is mechanical/repetitive; high user visibility |
| 9     | **#2 Color Vision Mode** | 3-4 hours | Touches 12+ files; critical for accessibility                       |

### Tier 4: Feature Development (4-6 hours total)

| Order | Fix                               | Effort    | Rationale                                                                  |
| ----- | --------------------------------- | --------- | -------------------------------------------------------------------------- |
| 10    | **#8 Spot Clustering (flat map)** | 2-3 hours | Requires new rendering logic and integration with existing clustering hook |
| 11    | **#13 Sound Enabled**             | 30 min    | Gate check at playback sites                                               |
| 12    | **#14 Quiet Hours**               | 45 min    | Gate check at generation + playback sites                                  |
| 13    | **#11 Greyline Alerts**           | 1-2 hours | New hook, sunrise/sunset calculation, alert integration                    |
| 14    | **#12 Band Opening Alerts**       | 1-2 hours | New hook, detector integration, alert wiring                               |

### Total Estimated Effort: 15-20 hours

---

## 11. Testing Plan

### 11.1 Pre-Implementation Baseline

Before any changes:

1. Run `npx tsc --noEmit` -- record zero errors as baseline
2. Run `npm run build` -- confirm clean build
3. Note current behavior of each broken preference for regression comparison

### 11.2 Per-Fix Verification

After implementing each fix:

| Fix                       | Manual Test                                                               | Automated Check          |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------ |
| #1 Time Format            | Toggle 12h/24h; verify 10+ time displays change                           | `tsc --noEmit` + `build` |
| #2 Color Vision Mode      | Set each mode; verify status colors change across 5+ components           | `tsc --noEmit` + `build` |
| #3 Text Scale             | Set sm/md/lg; verify text sizes change; check `data-text-scale` attribute | `tsc --noEmit` + `build` |
| #4 Spot Age maxAgeMinutes | Set to 10/30/60; verify age category changes for same-age spot            | `tsc --noEmit` + `build` |
| #5 Spotter Labels         | Enable; verify labels at spotter endpoints on globe + flat map            | `tsc --noEmit` + `build` |
| #6 Hold Duration          | Set to 1500/5000ms; verify hold menu timing on both views                 | `tsc --noEmit` + `build` |
| #7 Compass Beam Width     | Set beam width to 30/90/180; verify wedge on flat map compass             | `tsc --noEmit` + `build` |
| #8 Spot Clustering        | Enable with 100+ spots; verify clusters appear on flat map                | `tsc --noEmit` + `build` |
| #9 Spot Age Decay         | Enable; verify opacity gradient on flat map spots                         | `tsc --noEmit` + `build` |
| #10 Spot Hit Radius       | Set to 0.5x/2.0x; verify hover detection sensitivity on flat map          | `tsc --noEmit` + `build` |
| #11 Greyline Alerts       | Enable; mock sunrise time; verify alert fires                             | `tsc --noEmit` + `build` |
| #12 Band Opening Alerts   | Enable; load active band; verify opening alert fires                      | `tsc --noEmit` + `build` |
| #13 Sound Enabled         | Disable; trigger alert; verify no sound                                   | `tsc --noEmit` + `build` |
| #14 Quiet Hours           | Set current hour; verify no alerts generated                              | `tsc --noEmit` + `build` |

### 11.3 Integration Testing

After all fixes are implemented:

1. **Preference persistence:** Change every fixed preference, reload the page, verify values persist
2. **Cross-view consistency:** Verify features work on both globe and flat map
3. **Settings reset:** Click "Reset to defaults" -- verify all preferences revert and rendering updates
4. **Performance:** Load 500+ spots with all features enabled; verify no frame rate degradation on flat map
5. **Migration:** Clear localStorage, set store version to 2, reload -- verify migration runs cleanly

### 11.4 Regression Checks

- Verify all ~15 currently-working preferences still function
- Verify settings page navigation, section switching, mobile layout
- Verify no TypeScript errors (`tsc --noEmit`)
- Verify production build succeeds (`npm run build`)

---

## 12. Migration

### Store Version Bump

The `propulse-settings` store is currently at version 2 (line 364 of `settingsStore.ts`).

**Bump to version 3** to handle:

- No structural changes to the state shape are needed (all fields already exist)
- The migration function should ensure new default values are populated for any field that might be undefined in persisted v2 state

**Migration function update:**

```typescript
migrate: (persisted: unknown, version: number) => {
  const state = persisted as Record<string, unknown>;

  if (version < 2) {
    // v1 -> v2: Added highContrast, forecastDisplay, uiInteraction, etc.
    if (state.highContrast === undefined) state.highContrast = false;
  }

  if (version < 3) {
    // v2 -> v3: No new fields, but ensure nested objects have new defaults
    // Ensure notification preferences have all fields
    const notifications = state.notifications as Record<string, unknown> | undefined;
    if (notifications) {
      if (notifications.soundEnabled === undefined) notifications.soundEnabled = true;
      if (notifications.quietHoursStart === undefined) delete notifications.quietHoursStart;
      if (notifications.quietHoursEnd === undefined) delete notifications.quietHoursEnd;
    }
  }

  return state as unknown as SettingsState & SettingsStore;
},
```

Update the version number:

```typescript
{
  name: "propulse-settings",
  version: 3,  // was 2
  // ...
}
```

### AlertType Updates

If adding `"GREYLINE"` and `"BAND_OPENING"` alert types, ensure the `alertsStore` can handle these new types without migration issues (alerts are ephemeral and not persisted long-term, so this should be safe).

---

## Appendix A: File Change Summary

| Category               | Files   | Notes                                                                  |
| ---------------------- | ------- | ---------------------------------------------------------------------- |
| New files              | 3       | `useTimeFormat.ts`, `useGreylineAlerts.ts`, `useBandOpeningAlerts.ts`  |
| Store changes          | 1       | `settingsStore.ts` (version bump + migration)                          |
| Hook fixes             | 1       | `useTextScale.ts` (wrong store import)                                 |
| FlatMapView            | 1       | Multiple function changes (compass, clustering, age, hit radius, hold) |
| LiveSpotArcs           | 1       | `getSpotAgeInfo()` parameterization, spotter labels                    |
| Time format consumers  | 39      | Replace `toLocaleTimeString()` with `formatTimeString()`               |
| Colorblind consumers   | 12      | Import and use `getStatusColorStyles()`                                |
| Notification system    | 5       | Sound gating, quiet hours gating, new alert hooks                      |
| Type definitions       | 2       | `alerts.ts` (new AlertTypes), `time.ts` (new utility)                  |
| **Total unique files** | **~55** |                                                                        |

## Appendix B: Key File Paths

| File                                                                                      | Purpose                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/Users/aiml/Projects/propulse/src/stores/settingsStore.ts`                               | Central settings store (source of truth)                  |
| `/Users/aiml/Projects/propulse/src/stores/userStore.ts`                                   | Bridge store (backward compat shim)                       |
| `/Users/aiml/Projects/propulse/src/types/user.ts`                                         | All preference type definitions and defaults              |
| `/Users/aiml/Projects/propulse/src/lib/themes/colorblind.ts`                              | Complete colorblind utility library (currently dead code) |
| `/Users/aiml/Projects/propulse/src/hooks/useTextScale.ts`                                 | Text scale hook (reads from wrong store)                  |
| `/Users/aiml/Projects/propulse/src/components/ui/TimeDisplay.tsx`                         | Reusable time component (has hour12 prop, never used)     |
| `/Users/aiml/Projects/propulse/src/components/map/FlatMapView.tsx`                        | 2D map (missing 5 features)                               |
| `/Users/aiml/Projects/propulse/src/components/map/LiveSpotArcs.tsx`                       | 3D globe spot arcs (has features flat map lacks)          |
| `/Users/aiml/Projects/propulse/src/components/map/GlobeView.tsx`                          | 3D globe (reference implementation for parity)            |
| `/Users/aiml/Projects/propulse/src/components/map/FlatMapClickHandler.tsx`                | Flat map click/hold detection                             |
| `/Users/aiml/Projects/propulse/src/hooks/useSpotClustering.ts`                            | Spot clustering algorithm                                 |
| `/Users/aiml/Projects/propulse/src/lib/services/alertService.ts`                          | Solar alert evaluation (pure functions)                   |
| `/Users/aiml/Projects/propulse/src/lib/services/bandOpeningDetector.ts`                   | Band opening detection (exists, never used)               |
| `/Users/aiml/Projects/propulse/src/lib/services/watchAudioService.ts`                     | Watch alert audio playback                                |
| `/Users/aiml/Projects/propulse/src/hooks/useSolarAlerts.ts`                               | Solar alert monitoring hook                               |
| `/Users/aiml/Projects/propulse/src/components/solar/AlertStrip.tsx`                       | Alert display (quiet hours UI suppression)                |
| `/Users/aiml/Projects/propulse/src/styles/design-tokens.css`                              | CSS text scale system (lines 165-192)                     |
| `/Users/aiml/Projects/propulse/src/pages/PropSphere.tsx`                                  | Main map page (mount point for alert hooks)               |
| `/Users/aiml/Projects/propulse/src/pages/SettingsPage.tsx`                                | Settings page layout                                      |
| `/Users/aiml/Projects/propulse/src/components/settings/sections/PreferencesSection.tsx`   | Preferences section UI                                    |
| `/Users/aiml/Projects/propulse/src/components/settings/sections/NotificationsSection.tsx` | Notifications section UI                                  |

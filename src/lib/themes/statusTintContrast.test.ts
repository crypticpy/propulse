/**
 * Status ink (warning/danger) on a same-hue status tint (#827)
 *
 * `text-caution-amber` is `rgb(var(--su-warning-rgb))` and `bg-caution-amber/N`
 * is the same channels at `N/100` alpha (`tailwind.config.js`); `text-alert-red`
 * / `bg-alert-red/N` work the same way through `--su-danger-rgb`. A site that
 * pairs an ink with its own tint draws the ink against
 * `N/100 x tone + (1 - N/100) x surface`, not against the surface -- the same
 * same-hue defect #791/#795 fixed for `aurora-purple` and #803 fixed for the
 * user-customizable accent role. Unlike the accent, `warning`/`danger` are
 * fixed per-theme tokens (`stationPalettes`, not `--su-accent`), so this file
 * measures four palettes directly instead of sweeping an accepted gamut.
 *
 * ConfirmDialog's own reported numbers reproduce exactly under the established
 * `glass over panel` surface model this repo's other tint-contrast guards use
 * for every `src/components/ui` site (warning ink on its own /20 tint: 4.22:1
 * on Light; danger ink on its own /20 tint: 4.61:1 on Light) -- confirmed
 * against `AccessibleDialog`'s real `bg-su-panel/95` panel-over-backdrop DOM
 * independently; the two models agree closely enough that the uniform
 * surface-table convention is used here rather than a one-off literal trace,
 * matching #803's own choice for the same file.
 *
 * The treatment is the ink, not the alpha: keep the tint as the identity/fill
 * cue, draw the label in `--su-text` (the `Badge` `quiet` treatment #795
 * established, reused by #803 for the accent role). Every `src/components/ui`
 * site carrying this defect is fixed and measured individually below. The
 * remaining sites elsewhere in `src/**` are sequenced by the orchestrator; the
 * census ledgers at the bottom budget them so no *new* same-line site can land
 * in the meantime.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

/** The design system's floor for status text (`docs/designs/design-system`). */
const AA = 4.5;

const THEMES_IDS = Object.keys(stationPalettes) as ThemeId[];

type StationPalette = (typeof stationPalettes)[ThemeId];

// Anchor on this file's own location, not process.cwd() -- a vitest invocation
// from a subdirectory inherits the parent config and would shift cwd, making
// every readFileSync below throw (repo memory: no-test-job-in-ci).
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/**
 * Flatten `alpha` of `hex` over an opaque `surface` -- what the browser paints
 * for `bg-<token>/N` -- and return the resulting opaque `#rrggbb`.
 */
function compositeOnSurface(
  hex: string,
  alpha: number,
  surface: string,
): string {
  const channels = (value: string) =>
    [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
  const front = channels(hex);
  const back = channels(surface);
  return `#${front
    .map((channel, index) =>
      Math.round(channel * alpha + back[index] * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

interface SurfaceSpec {
  name: string;
  backdrop: (palette: StationPalette) => string;
}

/**
 * Every backdrop a status tint composites over in `src/components/ui`: the
 * two station backgrounds, and each under `Card`'s default `bg-su-line/10`
 * glass (`src/components/ui/Card.tsx`). Bare-surface tables certified chips
 * that failed inside the glass in #787/#788, so both layers are always
 * measured for a reusable primitive that can render in any host context.
 */
const SURFACES: SurfaceSpec[] = [
  { name: "panel", backdrop: (palette) => palette.panel },
  { name: "canvas", backdrop: (palette) => palette.canvas },
  {
    name: "glass over panel",
    backdrop: (palette) => compositeOnSurface(palette.line, 0.1, palette.panel),
  },
  {
    name: "glass over canvas",
    backdrop: (palette) =>
      compositeOnSurface(palette.line, 0.1, palette.canvas),
  },
];

/**
 * A site that structurally always renders inside its own `bg-su-line/10`
 * glass layer before the page background -- `PanelCard`'s header badges sit
 * inside `PanelCard`'s own root (`bg-su-line/10 backdrop-blur-md ... rounded-2xl`
 * in `PanelCard.tsx`), never on bare panel/canvas directly.
 */
const LINE_GLASS_SURFACES: SurfaceSpec[] = SURFACES.slice(2);

type Tint = "amber" | "red";

/** Tailwind token each tint role resolves to. */
function tintToken(tint: Tint): string {
  return tint === "amber" ? "caution-amber" : "alert-red";
}

/** `stationPalettes` role each tint's ORIGINAL same-hue ink read from. */
function paletteRole(tint: Tint): "warning" | "danger" {
  return tint === "amber" ? "warning" : "danger";
}

interface TintedSite {
  /** Repo-relative path of the call site. */
  file: string;
  /** What the tinted element carries, for the test name. */
  what: string;
  /** Exact snippet the site ships; binds the table to the source. */
  snippet: string;
  /** Which same-hue tint/ink pair this site used to carry. */
  tint: Tint;
  /** The real backdrop(s) this site renders on. */
  surfaces: SurfaceSpec[];
}

/**
 * Highest `bg-<token>/N` alpha the snippet itself encodes (rest or hover),
 * parsed from the string already proven to be a substring of the shipped
 * file. `ConfirmDialog`'s two variants each carry both a rest and a hover
 * alpha on one line; taking the max keeps the measurement honest for the
 * darker hover state too.
 */
function deriveAlpha(snippet: string, tint: Tint): number {
  const re = new RegExp(`bg-${tintToken(tint)}/(\\d+)`, "g");
  const alphas = [...snippet.matchAll(re)].map((m) => Number(m[1]));
  return Math.max(...alphas) / 100;
}

/**
 * The `src/components/ui` sites this PR moved onto the `--su-text` treatment.
 * Reverting any of them to the same-hue ink breaks its snippet assertion here
 * and the `src/components/ui` clause of the census guard below.
 */
const FIXED_SITES: TintedSite[] = [
  {
    file: "src/components/ui/ConfirmDialog.tsx",
    what: "the destructive confirm button",
    snippet: `"bg-alert-red/20 hover:bg-alert-red/30 text-su-text border border-alert-red/30",`,
    tint: "red",
    surfaces: SURFACES,
  },
  {
    file: "src/components/ui/ConfirmDialog.tsx",
    what: "the warning confirm button",
    snippet: `"bg-caution-amber/20 hover:bg-caution-amber/30 text-su-text border border-caution-amber/30",`,
    tint: "amber",
    surfaces: SURFACES,
  },
  {
    file: "src/components/ui/Badge.tsx",
    what: "the Badge `fair` variant",
    snippet: `"bg-caution-amber/20",
        "text-su-text",
        "border",
        "border-caution-amber/30",`,
    tint: "amber",
    surfaces: SURFACES,
  },
  {
    file: "src/components/ui/Badge.tsx",
    what: "the Badge `poor` variant",
    snippet: `"bg-alert-red/20",
        "text-su-text",
        "border",
        "border-alert-red/30",`,
    tint: "red",
    surfaces: SURFACES,
  },
  {
    file: "src/components/ui/Badge.tsx",
    what: "the Badge `storm` variant",
    // Not reachable from any in-app call site today, but mounted via
    // `.design-sync/previews/Badge.tsx` (`<Badge status="storm">`), which the
    // design-system alignment rule re-grades on every fix -- the same
    // correction #795 made for SpotBadge's `verified` variant.
    snippet: `"bg-alert-red/30",
        "text-su-text",
        "border",
        "border-alert-red/50",`,
    tint: "red",
    surfaces: SURFACES,
  },
  {
    file: "src/components/ui/PanelCard.tsx",
    what: "the PanelCard `warning` badge color",
    // Mounted only via `.design-sync/previews/PanelCard.tsx` (a `color:
    // "warning"` badge); no in-app `<PanelCard` call site exists.
    snippet: `warning: { bg: "bg-caution-amber/20", text: "text-su-text" },`,
    tint: "amber",
    surfaces: LINE_GLASS_SURFACES,
  },
  {
    file: "src/components/ui/PanelCard.tsx",
    what: "the PanelCard `danger` badge color",
    // Not mounted anywhere today (no in-app call site and no design-sync
    // preview passes `color: "danger"`); fixed anyway per the #795/#803
    // precedent of fixing every variant a shared primitive defines, not just
    // the ones currently exercised.
    snippet: `danger: { bg: "bg-alert-red/20", text: "text-su-text" },`,
    tint: "red",
    surfaces: LINE_GLASS_SURFACES,
  },
  {
    file: "src/components/ui/OfflineIndicator.tsx",
    what: "the offline banner",
    snippet: `"fixed top-0 left-0 right-0 z-50 bg-alert-red/20 text-su-text text-xs py-1.5 text-center font-medium border-b border-alert-red/30 backdrop-blur-sm";`,
    tint: "red",
    surfaces: SURFACES,
  },
  {
    file: "src/components/ui/SyncStatusIndicator.tsx",
    what: "the sync queue pill's failed state",
    snippet: `? "bg-alert-red/20 text-su-text border-alert-red/30"`,
    tint: "red",
    surfaces: SURFACES,
  },
];

describe("the src/components/ui status tints ship the --su-text treatment (#827)", () => {
  it.each(FIXED_SITES.map((site) => [site.what, site] as const))(
    "%s still ships the class pair this table measures",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the measured snippet:\n${site.snippet}`,
      ).toBe(true);
      // The measurement is only honest if the snippet really carries
      // --su-text and not the same-hue ink it replaced -- checked against the
      // string already proven to be a substring of the file.
      expect(
        site.snippet.includes("text-su-text"),
        `${site.what}'s measured snippet does not carry text-su-text`,
      ).toBe(true);
      const sameHueInk = `text-${tintToken(site.tint)}`;
      expect(
        site.snippet.includes(sameHueInk),
        `${site.what} draws ${sameHueInk} on its own tint again`,
      ).toBe(false);
    },
  );

  const cases = FIXED_SITES.flatMap((site) =>
    THEMES_IDS.flatMap((theme) => [[site.what, theme, site] as const]),
  );

  it.each(cases)(
    "%s clears the status-text floor in %s on every surface it renders on",
    (_what, theme, site) => {
      const palette = stationPalettes[theme];
      const alpha = deriveAlpha(site.snippet, site.tint);
      for (const surface of site.surfaces) {
        const backdrop = surface.backdrop(palette);
        const tint = compositeOnSurface(
          palette[paletteRole(site.tint)],
          alpha,
          backdrop,
        );
        expect(
          stationContrast(palette.text, tint),
          `${site.file} on ${surface.name} at alpha ${alpha}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    },
  );
});

describe("census guard: no new status ink on a status tint (#827)", () => {
  /**
   * A per-line regex guard, not a className parser: it only sees a tint and
   * status ink that sit on the SAME source line, exactly like #795's
   * aurora-purple guard and #803's accent guard. A className that wraps its
   * ink onto a second line escapes it by construction -- `Badge.tsx`'s
   * `fair`/`poor`/`storm` arrays are exactly that shape, which is why they are
   * covered by the `FIXED_SITES` table above instead of by this regex.
   *
   * The entries below are the census #827 asks for, as a debt ledger rather
   * than an exemption list (#803's style): each entry is the number of
   * same-line pairings that file carried when this guard was written, and the
   * assertion is `<=`. A file that gains a pairing fails; a file that is not
   * listed is budgeted at zero, so a brand new site fails; a file whose sites
   * get fixed simply passes with room to spare. `src/components/ui` is
   * deliberately absent from both ledgers -- see the explicit clauses below.
   */
  const AMBER_LEDGER = new Map<string, number>([
    ["src/components/alerts/AlertDetailModal.tsx", 1],
    ["src/components/alerts/StormImpactPanel.tsx", 1],
    ["src/components/alerts/SwpcAlertDetailModal.tsx", 1],
    ["src/components/atmos/AtmosHeader.tsx", 1],
    ["src/components/atmos/emcomm/ActivationBanner.tsx", 1],
    ["src/components/atmos/emcomm/ActivationModal.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/atmos/emcomm/SkywarnBadge.tsx", 1],
    ["src/components/contest/AuditQueuePanel.tsx", 1],
    ["src/components/contest/ContestCalendar.tsx", 2],
    ["src/components/contest/ContestExplorerCard.tsx", 1],
    ["src/components/contest/StationEstimate.tsx", 1],
    ["src/components/dx/DXSpotList/DXSpotList.tsx", 1],
    ["src/components/location/QuickLocationControl.tsx", 2],
    ["src/components/logbook/LogUploadModal.tsx", 1],
    ["src/components/map/BandConditionsHeader.tsx", 1],
    ["src/components/map/BandConditionsPanel.tsx", 1],
    ["src/components/map/OptimalBandsPanel.tsx", 1],
    ["src/components/map/ProToolbarRibbon.tsx", 1],
    ["src/components/map/WatchPopover.tsx", 2],
    ["src/components/map/modals/PropagationForecastModal.tsx", 1],
    ["src/components/ops/OpsConsole.tsx", 1],
    ["src/components/profile/ActivityFeed.tsx", 1],
    ["src/components/profile/LicenseCard.tsx", 1],
    ["src/components/profile/PrivilegeMatrix.tsx", 1],
    ["src/components/qso/BandMapControls.tsx", 1],
    ["src/components/qso/ConflictBadge.tsx", 1],
    ["src/components/qso/ContestQslBatch.tsx", 1],
    ["src/components/qso/DxccStatusBadge.tsx", 1],
    ["src/components/satellites/SatelliteCard.tsx", 1],
    ["src/components/satellites/SatelliteDetailModal.tsx", 3],
    ["src/components/sdr/MemoryPanel.tsx", 1],
    ["src/components/sdr/primitives/DspBadge.tsx", 1],
    ["src/components/sdr/primitives/RadioBadge.tsx", 1],
    ["src/components/sdr/skins/fate/FateBandActivity.tsx", 1],
    ["src/components/sdr/skins/fate/FateBandAdvisor.tsx", 1],
    ["src/components/sdr/skins/flexible/SlicePanelTabs.tsx", 1],
    ["src/components/settings/sections/SubscriptionSection.tsx", 1],
    ["src/components/settings/spots/LibraryConfirmDialog.tsx", 1],
    ["src/components/shack/builder/NodeConfigPanel.tsx", 1],
    ["src/components/shack/equipmentCardTypes.ts", 1],
  ]);

  const RED_LEDGER = new Map<string, number>([
    ["src/components/alerts/AlertDetailModal.tsx", 1],
    ["src/components/alerts/AlertHistoryModal.tsx", 1],
    ["src/components/alerts/SpotAlertToast.tsx", 1],
    ["src/components/alerts/StormImpactPanel.tsx", 1],
    ["src/components/alerts/SwpcAlertDetailModal.tsx", 1],
    ["src/components/atmos/AtmosHeader.tsx", 1],
    ["src/components/atmos/WeatherAlertToast.tsx", 1],
    ["src/components/atmos/emcomm/ActivationBanner.tsx", 1],
    ["src/components/atmos/emcomm/ActivationModal.tsx", 1],
    ["src/components/atmos/emcomm/EmCommQuickActions.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/cluster/ClusterConnectionForm.tsx", 1],
    ["src/components/contest/AuditQueuePanel.tsx", 1],
    ["src/components/contest/BandAdvisor.tsx", 1],
    ["src/components/contest/ContestCalendar.tsx", 1],
    ["src/components/contest/ContestEntryForm.tsx", 1],
    ["src/components/contest/ContestLiteHudPill.tsx", 1],
    ["src/components/contest/ContestOneLineEntry.tsx", 1],
    ["src/components/contest/ContestQSOTable.tsx", 1],
    ["src/components/contest/ContestRunControls.tsx", 1],
    ["src/components/contest/ContestSpotsPanel.tsx", 1],
    ["src/components/contest/ContestTimer.tsx", 1],
    ["src/components/contest/ContestVoiceControls.tsx", 1],
    ["src/components/contest/EndContestModal.tsx", 1],
    ["src/components/contest/RigStatusBar.tsx", 1],
    ["src/components/dx/DXConsole.tsx", 1],
    ["src/components/dx/DXSpotList/DXSpotList.tsx", 1],
    ["src/components/dx/SkedScheduler.tsx", 1],
    ["src/components/dx/WSJTXStatusPanel.tsx", 1],
    ["src/components/guest/CreateGuestSessionModal.tsx", 1],
    ["src/components/guest/GuestModeToggle.tsx", 1],
    ["src/components/logbook/QSOTable.tsx", 1],
    ["src/components/map/ProToolbarRibbon.tsx", 1],
    ["src/components/map/WatchPopover.tsx", 1],
    ["src/components/nets/CloseoutPhase.tsx", 1],
    ["src/components/qso/QSOBulkActions.tsx", 1],
    ["src/components/qso/QSODetailModal.tsx", 1],
    ["src/components/qso/QSOSyncStatusIndicator.tsx", 1],
    ["src/components/satellites/SatelliteCard.tsx", 1],
    ["src/components/satellites/SatelliteDetailModal.tsx", 3],
    ["src/components/sdr/EqBandPanel.tsx", 1],
    ["src/components/sdr/MemoryPanel.tsx", 1],
    ["src/components/sdr/SdrConsoleHeader.tsx", 1],
    ["src/components/sdr/Waterfall.tsx", 1],
    ["src/components/sdr/primitives/DspBadge.tsx", 1],
    ["src/components/sdr/primitives/RadioBadge.tsx", 1],
    ["src/components/sdr/shared/RadioControlsCard.tsx", 1],
    ["src/components/sdr/shared/RadioDeviceCard.tsx", 1],
    ["src/components/sdr/skins/flexible/FlexSideControls.tsx", 2],
    ["src/components/settings/CATSettings.tsx", 1],
    ["src/components/settings/LocationManager.tsx", 1],
    ["src/components/settings/ResearchParticipationSettings.tsx", 1],
    ["src/components/settings/sections/DataAccountSection.tsx", 1],
    ["src/components/settings/spots/LibraryConfirmDialog.tsx", 1],
    ["src/components/shack/BandCapabilityStrip.tsx", 1],
    ["src/components/shack/PresetBuilder.tsx", 1],
    ["src/components/shack/builder/NodeConfigPanel.tsx", 1],
    ["src/components/shack/equipmentCardTypes.ts", 1],
    ["src/hooks/useQsoBadge.ts", 1],
    ["src/pages/Contest.tsx", 2],
    ["src/pages/DisplaysPage.tsx", 1],
  ]);

  const AMBER_TINT_RE = /bg-caution-amber\/(?:1[5-9]|[2-9]\d|100)\b/;
  const AMBER_INK_RE = /text-caution-amber\b/;
  const RED_TINT_RE = /bg-alert-red\/(?:1[5-9]|[2-9]\d|100)\b/;
  const RED_INK_RE = /text-alert-red\b/;

  // Scans .ts/.tsx only and skips anything matching .test. -- a pairing
  // parked in a *.test.tsx fixture is outside this census.
  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, files);
      } else if (
        [".ts", ".tsx"].includes(extname(entry)) &&
        !entry.includes(".test.")
      ) {
        files.push(full);
      }
    }
    return files;
  }

  /** file -> count of lines matching `tint` and `ink`, across `src/**`. */
  function census(tint: RegExp, ink: RegExp): Map<string, number> {
    const counts = new Map<string, number>();
    for (const file of walk(resolve(REPO_ROOT, "src"))) {
      const relPath = relative(REPO_ROOT, file);
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (tint.test(line) && ink.test(line)) {
          counts.set(relPath, (counts.get(relPath) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  function overBudget(
    counts: Map<string, number>,
    ledger: Map<string, number>,
  ): string[] {
    const over: string[] = [];
    for (const [file, count] of counts) {
      const budget = ledger.get(file) ?? 0;
      if (count > budget) over.push(`${file}: ${count} > ${budget} budgeted`);
    }
    return over;
  }

  it("has no file over its warning-ink (caution-amber) budget", () => {
    const counts = census(AMBER_TINT_RE, AMBER_INK_RE);
    const over = overBudget(counts, AMBER_LEDGER);
    expect(
      over,
      `new same-line text-caution-amber on a >=15 caution-amber tint:\n${over.join("\n")}`,
    ).toEqual([]);
    // The ledger only ever shrinks; a fix that lands must not be able to
    // raise the total past the census this PR measured.
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      46,
    );
  });

  it("has no file over its danger-ink (alert-red) budget", () => {
    const counts = census(RED_TINT_RE, RED_INK_RE);
    const over = overBudget(counts, RED_LEDGER);
    expect(
      over,
      `new same-line text-alert-red on a >=15 alert-red tint:\n${over.join("\n")}`,
    ).toEqual([]);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      65,
    );
  });

  it("keeps src/components/ui free of same-hue caution-amber ink on a tint", () => {
    const offenders = [...census(AMBER_TINT_RE, AMBER_INK_RE).keys()].filter(
      (file) => file.startsWith("src/components/ui/"),
    );
    expect(
      offenders,
      `shared design-system components must ship the --su-text treatment:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps src/components/ui free of same-hue alert-red ink on a tint", () => {
    const offenders = [...census(RED_TINT_RE, RED_INK_RE).keys()].filter(
      (file) => file.startsWith("src/components/ui/"),
    );
    expect(
      offenders,
      `shared design-system components must ship the --su-text treatment:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

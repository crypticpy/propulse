/**
 * Accent ink on an accent tint (#803)
 *
 * `text-plasma-orange` is `rgb(var(--su-accent-rgb))` and `bg-plasma-orange/N`
 * is the same channels at `N/100` alpha (`tailwind.config.js`), so a site that
 * pairs them draws the ink against `N/100 x accent + (1 - N/100) x surface` --
 * the same same-hue defect #791/#795 fixed for `aurora-purple`, except the
 * accent is not a palette token: it is whatever the operator typed.
 *
 * What the app accepts as an accent is a **hex-format check and nothing else**
 * (`AppearanceSection.tsx`'s `isValidHex` -> `themeStore.setCustomColors` ->
 * `stationTokens`'s `/^#[0-9a-f]{6}$/i`; `lib/views/contracts.ts` re-checks the
 * same shape). The `>= 3` / `>= 4.5` comparisons in `stationTokens` do not gate
 * acceptance -- they only pick whether `--su-accent-edge` / `--su-accent-text`
 * fall back to `info`. The accepted range is therefore the whole sRGB gamut,
 * `#000000` to `#ffffff` inclusive, including an accent equal to the panel the
 * tint composites over. `THE ACCENT THE APP ACCEPTS` below asserts that against
 * the production emitter, which is what stops the gamut sweeps here from being
 * hypothetical.
 *
 * Measured consequences (production `stationContrast` over the real palettes,
 * glass surfaces composited two layers deep per #787/#788, over the shipped
 * `ACCEPTED_GAMUT` below -- 6,770 unique accents once the 72x6x19 HSL sweep is
 * deduped; it collapses hard at saturation 0):
 *
 *   - Raw accent ink on its own tint has **no safe alpha**: the minimum over the
 *     accepted range is 1.00:1 at every alpha, every theme, every surface
 *     (accent == surface). Capping `N` cannot fix this.
 *   - It is not a custom-accent-only defect either: in the Light theme all 11
 *     shipped accents (8 `ACCENT_PRESETS` + 4 per-theme defaults) miss 4.5 at
 *     every alpha >= 0.10, and the brand default `#ff6b35` reads 2.11:1 on
 *     `bg-plasma-orange/20` over the Light panel.
 *   - `--su-accent-text` does not rescue it. It guarantees 4.5 against the bare
 *     panel, and in the branch where the accent clears that gate the token *is*
 *     the raw accent, so the tint eats the margin: 3.45:1 at /20 on the dark
 *     panel over the gamut, 2.33:1 at /30 on Light glass.
 *   - `--su-text` (the `Badge` `quiet` treatment #795 established for purple)
 *     does hold, with a real cap: **>= 5.18:1 for every accepted accent at
 *     alpha <= 0.20**, first failing at 4.37:1 at alpha 0.25 (dark, glass over
 *     panel, accent `#ffffff`).
 *
 * So the treatment is the ink, not the alpha: keep the accent tint as the fill,
 * draw the label in `--su-text`, and keep the tint at or below `/20`. The sites
 * inside `src/components/ui` (this agent's file scope on #803) carry that
 * treatment and are measured individually below. The remaining 209 sites in 137
 * files are sequenced by the orchestrator; the census ledger at the bottom
 * budgets them so no *new* same-line site can land in the meantime.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT_HEX,
  stationContrast,
  stationPalettes,
  stationTokens,
} from "@/lib/themes/stationTokens";
import { ACCENT_PRESETS, THEMES, type ThemeId } from "@/lib/themes";

/** The design system's floor for status text (`docs/designs/design-system`). */
const AA = 4.5;

/** The alpha ceiling `--su-text` ink is measured to survive on an accent tint. */
const TINT_CAP = 0.2;

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
 * Every backdrop an accent tint composites over in this app: the two station
 * backgrounds, and each of them under `Card`'s default `bg-su-line/10` glass
 * (`src/components/ui/Card.tsx`). Bare-surface tables certified chips that
 * failed inside the glass in #787/#788, so both layers are always measured.
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
 * A sample of the accepted range: 72 hues x 6 saturations x 19 lightnesses,
 * plus both poles and every palette hex (so the "accent equal to the surface"
 * case is always in the sample). Every entry matches the acceptance regex, and
 * `THE ACCENT THE APP ACCEPTS` proves the app really does keep them verbatim.
 */
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value =
      lightness - chroma * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const ACCEPTED_GAMUT: string[] = (() => {
  const accents = new Set<string>(["#ffffff", "#000000", DEFAULT_ACCENT_HEX]);
  for (let hue = 0; hue < 360; hue += 5) {
    for (const saturation of [0, 0.2, 0.35, 0.6, 0.85, 1]) {
      for (let lightness = 0.05; lightness <= 0.96; lightness += 0.05) {
        accents.add(hslToHex(hue, saturation, lightness));
      }
    }
  }
  for (const theme of THEMES_IDS) {
    for (const value of Object.values(stationPalettes[theme]))
      accents.add(value);
  }
  return [...accents];
})();

/** The accents the app ships: the eight presets plus each theme's default. */
const SHIPPED_ACCENTS = [
  ...new Set([
    ...ACCENT_PRESETS.map((accent) => accent.primary),
    ...THEMES.map((theme) => theme.colors.accentPrimary),
  ]),
];

/** Worst `stationContrast(ink, accent tint)` over a set of accents. */
function worstOnTint(
  ink: string,
  accents: string[],
  alpha: number,
  backdrop: string,
): { ratio: number; accent: string } {
  let ratio = Infinity;
  let accent = "";
  for (const candidate of accents) {
    const measured = stationContrast(
      ink,
      compositeOnSurface(candidate, alpha, backdrop),
    );
    if (measured < ratio) {
      ratio = measured;
      accent = candidate;
    }
  }
  return { ratio, accent };
}

const SWEEP = THEMES_IDS.flatMap((theme) =>
  SURFACES.map((surface) => [theme, surface.name, surface] as const),
);

describe("the accent the app accepts (#803)", () => {
  // The sweeps below are only meaningful if these accents can really reach
  // --su-accent. `stationTokens` is the production emitter every path funnels
  // into (AppearanceSection -> themeStore.setCustomColors ->
  // applyThemeToDocument -> stationTokens; StationProvider calls it directly).
  it.each([
    ["#ffffff", "white -- the worst case for --su-text ink on a dark palette"],
    ["#000000", "black -- the worst case for --su-text ink on Light"],
    ["#191e2e", "the dark panel itself, i.e. an invisible tint"],
    ["#F3F4EF", "the Light panel, uppercase (the regex is case-insensitive)"],
  ])("keeps %s verbatim (%s)", (accent) => {
    for (const theme of THEMES_IDS) {
      expect(
        (stationTokens(theme, accent) as Record<string, string>)["--su-accent"],
      ).toBe(accent);
    }
  });

  it("has no contrast gate: only malformed values fall back", () => {
    for (const malformed of ["", "red", "#fff", "#12345g", "rgb(1,2,3)"]) {
      expect(
        (stationTokens("dark", malformed) as Record<string, string>)[
          "--su-accent"
        ],
        `${malformed} should fall back to the brand orange`,
      ).toBe(DEFAULT_ACCENT_HEX);
    }
    // ...and a well-formed accent that is illegible against the panel is still
    // accepted as the accent; only the *derived* ink token falls back.
    const tokens = stationTokens("dark", "#191e2e") as Record<string, string>;
    expect(tokens["--su-accent"]).toBe("#191e2e");
    expect(tokens["--su-accent-text"]).toBe(stationPalettes.dark.info);
  });
});

describe("raw accent ink on an accent tint has no safe alpha (#803)", () => {
  it.each(SWEEP)(
    "%s / %s: some accepted accent is illegible on its own /10 tint",
    (theme, _name, surface) => {
      const backdrop = surface.backdrop(stationPalettes[theme]);
      let worst = Infinity;
      let worstAccent = "";
      for (const accent of ACCEPTED_GAMUT) {
        const ratio = stationContrast(
          accent,
          compositeOnSurface(accent, 0.1, backdrop),
        );
        if (ratio < worst) {
          worst = ratio;
          worstAccent = accent;
        }
      }
      // 1.10:1 is the largest of the sixteen minima (high-contrast canvas);
      // the rest are 1.00-1.06. Nothing here is close to 4.5, and this is the
      // *lowest* tint alpha in use -- so no cap on N makes this pairing legible.
      expect(worst, `worst accepted accent ${worstAccent}`).toBeLessThan(1.11);
    },
  );

  it("fails for the brand default on the shipped Light theme, no custom accent involved", () => {
    const light = stationPalettes.light;
    const ratio = stationContrast(
      DEFAULT_ACCENT_HEX,
      compositeOnSurface(DEFAULT_ACCENT_HEX, 0.2, light.panel),
    );
    expect(ratio).toBeLessThan(AA);
    expect(ratio).toBeCloseTo(2.11, 2);
  });

  it("is not rescued by --su-accent-text either", () => {
    // #3b82f6 (the Ocean Blue preset) clears 4.5 against the dark panel, so
    // --su-accent-text resolves to the accent itself and the tint eats it.
    const ink = (stationTokens("dark", "#3b82f6") as Record<string, string>)[
      "--su-accent-text"
    ];
    expect(ink).toBe("#3b82f6");
    expect(
      stationContrast(
        ink,
        compositeOnSurface("#3b82f6", 0.2, stationPalettes.dark.panel),
      ),
    ).toBeLessThan(AA);
  });
});

describe("--su-text ink clears the floor on an accent tint up to /20 (#803)", () => {
  const cases = SWEEP.flatMap((entry) =>
    [0.1, 0.15, TINT_CAP].map((alpha) => [...entry, alpha] as const),
  );

  it.each(cases)(
    "%s / %s at alpha %s: every accepted accent clears 4.5",
    (theme, _name, surface, alpha) => {
      const palette = stationPalettes[theme];
      const { ratio, accent } = worstOnTint(
        palette.text,
        ACCEPTED_GAMUT,
        alpha,
        surface.backdrop(palette),
      );
      expect(
        ratio,
        `${theme} ${surface.name} /${alpha * 100}: worst accent ${accent}`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it("still clears at /30 for every accent the app ships", () => {
    for (const theme of THEMES_IDS) {
      const palette = stationPalettes[theme];
      for (const surface of SURFACES) {
        const { ratio, accent } = worstOnTint(
          palette.text,
          SHIPPED_ACCENTS,
          0.3,
          surface.backdrop(palette),
        );
        expect(
          ratio,
          `${theme} ${surface.name} /30: worst shipped accent ${accent}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("does not clear above /20 over the whole accepted range -- the cap is real", () => {
    // Dark, Card glass over panel, accent #ffffff: 4.37:1 at /25, 3.70:1 at
    // /30. This is what makes TINT_CAP a measurement rather than a preference.
    const backdrop = compositeOnSurface(
      stationPalettes.dark.line,
      0.1,
      stationPalettes.dark.panel,
    );
    expect(
      stationContrast(
        stationPalettes.dark.text,
        compositeOnSurface("#ffffff", 0.25, backdrop),
      ),
    ).toBeLessThan(AA);
  });
});

interface TintedSite {
  /** Repo-relative path of the call site. */
  file: string;
  /** What the tinted element carries, for the test name. */
  what: string;
  /** Exact snippet the site ships; binds the table to the source. */
  snippet: string;
}

/**
 * Highest `bg-plasma-orange/N` alpha the snippet itself encodes (rest or
 * hover) -- parsed from the string that is already proven to be a substring
 * of the shipped file, instead of a hand-written field that could drift from
 * it silently. The snippet must include every `bg-plasma-orange/N` class the
 * site ships (rest and hover), even when the hover class sits on a different
 * source line than `text-su-text`, or this under-counts the real alpha.
 */
function deriveAlpha(snippet: string): number {
  const alphas = [...snippet.matchAll(/bg-plasma-orange\/(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  return Math.max(...alphas) / 100;
}

/**
 * The `src/components/ui` sites this PR moved onto the `--su-text` treatment.
 * Each ships an accent tint at or below `TINT_CAP` with a neutral label; the
 * three that had a `hover:bg-plasma-orange/30` step came down to `/15` -> `/20`
 * so the hovered state stays inside the measured cap and still reads as a step.
 * Reverting any of them to `text-plasma-orange` breaks its snippet assertion
 * here and the `src/components/ui` clause of the census guard below.
 */
const FIXED_SITES: TintedSite[] = [
  {
    file: "src/components/ui/SyncStatusIndicator.tsx",
    what: "the sync queue pill",
    snippet: `: "bg-plasma-orange/20 text-su-text border-plasma-orange/30";`,
  },
  {
    file: "src/components/ui/SyncStatusIndicator.tsx",
    what: 'the "Retry All" button',
    snippet: `rounded bg-plasma-orange/15 text-su-text
                             hover:bg-plasma-orange/20 transition-colors font-medium"`,
  },
  {
    file: "src/components/ui/ConfirmDialog.tsx",
    what: "the default confirm button",
    snippet: `"bg-plasma-orange/15 hover:bg-plasma-orange/20 text-su-text border border-plasma-orange/30",`,
  },
  {
    file: "src/components/ui/ImageCropDialog.tsx",
    what: "the crop save button",
    snippet: `bg-plasma-orange/15 hover:bg-plasma-orange/20 text-su-text`,
  },
  {
    file: "src/components/ui/ReferencePanel.tsx",
    what: "the selected band chip",
    snippet: `? "bg-plasma-orange/20 border-plasma-orange/60 text-su-text"`,
  },
  {
    file: "src/components/ui/ShareModal.tsx",
    what: "the copy-link button",
    snippet: `: "bg-plasma-orange/15 text-su-text border border-plasma-orange/50 hover:bg-plasma-orange/20"`,
  },
  {
    file: "src/components/ui/ShortcutsHelpModal.tsx",
    what: "the selected shortcuts tab",
    snippet: `? "bg-plasma-orange/15 text-su-text border border-plasma-orange/40 font-semibold"`,
  },
  {
    file: "src/components/ui/UndoToast.tsx",
    what: "the redo button",
    snippet: `bg-plasma-orange/15 text-su-text
                    hover:bg-plasma-orange/20`,
  },
  {
    file: "src/components/ui/UpgradePrompt.tsx",
    what: 'the "Pro" chip',
    snippet: `rounded bg-plasma-orange/15 text-su-text font-semibold`,
  },
];

describe("the src/components/ui accent tints ship the --su-text treatment (#803)", () => {
  it.each(FIXED_SITES.map((site) => [site.what, site] as const))(
    "%s still ships the class pair this table measures",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains the measured snippet:\n${site.snippet}`,
      ).toBe(true);
      // The measurement is only honest if the snippet really carries the ink
      // the table claims -- checked against the string just proven to be a
      // substring of the file, not against another field of this object.
      expect(
        site.snippet.includes("text-su-text"),
        `${site.what}'s measured snippet does not carry text-su-text`,
      ).toBe(true);
      expect(
        site.snippet.includes("text-plasma-orange"),
        `${site.what} draws accent ink on its own tint again`,
      ).toBe(false);
      expect(
        deriveAlpha(site.snippet),
        `${site.what} ships a tint above the measured cap`,
      ).toBeLessThanOrEqual(TINT_CAP);
    },
  );

  it.each(
    FIXED_SITES.flatMap((site) =>
      THEMES_IDS.map((theme) => [site.what, theme, site] as const),
    ),
  )(
    "%s clears the floor in %s for every accepted accent",
    (_what, theme, site) => {
      const palette = stationPalettes[theme];
      for (const surface of SURFACES) {
        const { ratio, accent } = worstOnTint(
          palette.text,
          ACCEPTED_GAMUT,
          deriveAlpha(site.snippet),
          surface.backdrop(palette),
        );
        expect(
          ratio,
          `${site.file} on ${surface.name}: worst accent ${accent}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    },
  );
});

describe("census guard: no new accent ink on an accent tint (#803)", () => {
  /**
   * A per-line regex guard, not a className parser: it only sees a tint and
   * accent ink that sit on the SAME source line, exactly like #795's
   * `aurora-purple` guard. A className that wraps its ink onto a second line
   * escapes it by construction -- the `FIXED_SITES` table above is what covers
   * those.
   *
   * The 209 sites below are the census #803 asks for, as a debt ledger rather
   * than an exemption list: each entry is the number of same-line pairings that
   * file carried at `32cf480c`, and the assertion is `<=`. A file that gains a
   * pairing fails; a file that is not listed is budgeted at zero, so a brand
   * new site fails; a file whose sites get fixed simply passes with room to
   * spare, so the sequenced follow-up PRs (the 137 files outside this agent's
   * scope on #803) never have to touch this table to land. `src/components/ui`
   * is deliberately absent -- see the explicit clause below.
   */
  const LEDGER = new Map<string, number>([
    ["src/App.tsx", 1],
    ["src/components/ErrorBoundary.tsx", 1],
    ["src/components/activation/ActivationPanel.tsx", 2],
    ["src/components/activity/NearbyActivityExplorer.tsx", 2],
    ["src/components/alerts/StormImpactPanel.tsx", 1],
    ["src/components/alerts/SwpcAlertDetailModal.tsx", 1],
    ["src/components/atmos/AtmosHeader.tsx", 1],
    ["src/components/atmos/ViewSwitcher.tsx", 1],
    ["src/components/atmos/emcomm/ActivationBanner.tsx", 1],
    ["src/components/atmos/emcomm/ActivationModal.tsx", 1],
    ["src/components/atmos/emcomm/EmCommSidebarPanel.tsx", 1],
    ["src/components/atmos/emcomm/FrequencyQuickTune.tsx", 1],
    ["src/components/atmos/emcomm/ICS213Form.tsx", 1],
    ["src/components/auth/AuthRequiredPlaceholder.tsx", 1],
    ["src/components/cluster/ClusterConnectionForm.tsx", 3],
    ["src/components/contest/BandAdvisor.tsx", 1],
    ["src/components/contest/ContestBandMap.tsx", 1],
    ["src/components/contest/ContestCalendar.tsx", 3],
    ["src/components/contest/ContestDock.tsx", 1],
    ["src/components/contest/ContestRateSheet.tsx", 2],
    ["src/components/contest/ContestScoreShare.tsx", 1],
    ["src/components/contest/ContestSpotsPanel.tsx", 1],
    ["src/components/contest/ContestVoiceControls.tsx", 1],
    ["src/components/contest/MobileContestEntry.tsx", 1],
    ["src/components/contest/MultiplierMatrix.tsx", 1],
    ["src/components/contest/NeededMultsPanel.tsx", 2],
    ["src/components/contest/PendingDraftReplaceBanner.tsx", 1],
    ["src/components/contest/StationEstimate.tsx", 1],
    ["src/components/dx/BandVerdictPanel.tsx", 3],
    ["src/components/dx/ConditionMatchCard.tsx", 1],
    ["src/components/dx/DXConsole.tsx", 1],
    ["src/components/dx/DXSpotList/FilterControls.tsx", 2],
    ["src/components/dx/SkedScheduler.tsx", 1],
    ["src/components/dx/WSJTXStatusPanel.tsx", 1],
    ["src/components/dx/WorkStationPanel.tsx", 1],
    ["src/components/export/ExportModal.tsx", 1],
    ["src/components/guest/CreateGuestSessionModal.tsx", 2],
    ["src/components/help/HelpCategoryCard.tsx", 1],
    ["src/components/kiosk/KioskChrome.tsx", 1],
    ["src/components/kiosk/LaunchWallSection.tsx", 1],
    ["src/components/kiosk/WallClockDisplay.tsx", 1],
    ["src/components/layout/Header.tsx", 6],
    ["src/components/layout/MobileHeader.tsx", 2],
    ["src/components/location/QuickLocationDialog.tsx", 1],
    ["src/components/logbook/AwardsTracker.tsx", 1],
    ["src/components/logbook/LogUploadModal.tsx", 2],
    ["src/components/logbook/QSLManager.tsx", 1],
    ["src/components/logbook/QSOTable.tsx", 1],
    ["src/components/map/BandConditionsPanel.tsx", 1],
    ["src/components/map/GlobeUnavailable.tsx", 1],
    ["src/components/map/MapToolbarSecondaryControls.tsx", 2],
    ["src/components/map/PathAnalysis.tsx", 9],
    ["src/components/map/ProToolbarRibbon.tsx", 1],
    ["src/components/map/PropagationForecastMini.tsx", 3],
    ["src/components/map/ReplayIndicator.tsx", 1],
    ["src/components/map/TimeControl.tsx", 3],
    ["src/components/mobile/MobileDXWizard.tsx", 2],
    ["src/components/nets/CallsignInput.tsx", 1],
    ["src/components/nets/ManagerRoster.tsx", 1],
    ["src/components/nets/NetFilterControls.tsx", 3],
    ["src/components/nets/NetForm.tsx", 1],
    ["src/components/nets/NetMilestoneCard.tsx", 1],
    ["src/components/nets/PhaseIndicator.tsx", 1],
    ["src/components/nets/PreambleEditor.tsx", 1],
    ["src/components/nets/SpeakerStage.tsx", 1],
    ["src/components/nets/SubscribeButton.tsx", 1],
    ["src/components/nets/TuneToNetButton.tsx", 1],
    ["src/components/onboarding/RadioSetupWizard.tsx", 4],
    ["src/components/onboarding/WelcomeOverlay.tsx", 3],
    ["src/components/operating/BandModeModalContent.tsx", 1],
    ["src/components/operating/BandModeSelector.tsx", 1],
    ["src/components/ops/OpsConsole.tsx", 2],
    ["src/components/ops/OpsLoggerStrip.tsx", 1],
    ["src/components/ops/TurnBeamControl.tsx", 1],
    ["src/components/profile/ActivityFeed.tsx", 1],
    ["src/components/profile/FriendList.tsx", 1],
    ["src/components/profile/LicenseCard.tsx", 1],
    ["src/components/profile/LicenseHistory.tsx", 1],
    ["src/components/profile/ProfileTabBar.tsx", 1],
    ["src/components/profile/QRCodeModal.tsx", 2],
    ["src/components/profile/VisibilitySettings.tsx", 1],
    ["src/components/profile/VisitorProfileCard.tsx", 1],
    ["src/components/qso/ConflictResolutionModal.tsx", 1],
    ["src/components/qso/FilterChips.tsx", 1],
    ["src/components/qso/FrequencyInput.tsx", 1],
    ["src/components/qso/QSOSyncStatusIndicator.tsx", 2],
    ["src/components/radio/RadioPickerModal.tsx", 4],
    ["src/components/satellites/SatelliteFilterControls.tsx", 4],
    ["src/components/sdr/EqBandPanel.tsx", 1],
    ["src/components/sdr/MemoryPanel.tsx", 1],
    ["src/components/sdr/SdrSettingsModal.tsx", 2],
    ["src/components/sdr/Waterfall.tsx", 1],
    ["src/components/sdr/primitives/DspBadge.tsx", 1],
    ["src/components/sdr/shared/RadioControlsCard.tsx", 1],
    ["src/components/sdr/skins/SkinSwitcher.tsx", 1],
    ["src/components/sdr/skins/fate/FateBandActivity.tsx", 1],
    ["src/components/sdr/skins/fate/FateBandAdvisor.tsx", 1],
    ["src/components/sdr/skins/flexible/FlexSideControls.tsx", 2],
    ["src/components/sdr/skins/flexible/SlicePanelTabs.tsx", 1],
    ["src/components/settings/BandPresetManager.tsx", 1],
    ["src/components/settings/CATSettings.tsx", 1],
    ["src/components/settings/FavoredBandsPicker.tsx", 1],
    ["src/components/settings/LicenseSection.tsx", 1],
    ["src/components/settings/LocationInput.tsx", 3],
    ["src/components/settings/LocationManager.tsx", 3],
    ["src/components/settings/NotificationSettings.tsx", 2],
    ["src/components/settings/RadioManager.tsx", 1],
    ["src/components/settings/ResearchParticipationSettings.tsx", 1],
    ["src/components/settings/WatchAlertSettings.tsx", 2],
    ["src/components/settings/sections/AppearanceSection.tsx", 1],
    ["src/components/settings/sections/CredentialsSection.tsx", 2],
    ["src/components/settings/sections/DataAccountSection.tsx", 6],
    ["src/components/settings/sections/PreferencesSection.tsx", 1],
    ["src/components/settings/sections/SubscriptionSection.tsx", 1],
    ["src/components/shack/AccessoryManager.tsx", 1],
    ["src/components/shack/AntennaManager.tsx", 1],
    ["src/components/shack/FeedlineManager.tsx", 1],
    ["src/components/shack/InlineComponentManager.tsx", 1],
    ["src/components/shack/PresetBuilder.tsx", 4],
    ["src/components/shack/builder/ChainSelector.tsx", 1],
    ["src/components/shack/builder/NodeConfigPanel.tsx", 1],
    ["src/components/shack/equipmentCardTypes.ts", 1],
    ["src/components/solar/modals/SolarSummaryModal.tsx", 1],
    ["src/pages/AwardsPage.tsx", 1],
    ["src/pages/BandPlanner.tsx", 1],
    ["src/pages/BridgeInfoPage.tsx", 1],
    ["src/pages/ContestExplorerPage.tsx", 2],
    ["src/pages/DXWizard.tsx", 2],
    ["src/pages/DisplaysPage.tsx", 1],
    ["src/pages/FeaturesPage.tsx", 1],
    ["src/pages/KioskPage.tsx", 3],
    ["src/pages/NetAnalyticsPage.tsx", 1],
    ["src/pages/NetControllerPage.tsx", 3],
    ["src/pages/NetDetailPage.tsx", 1],
    ["src/pages/PairClaimPage.tsx", 1],
    ["src/pages/PropSphere.tsx", 1],
    ["src/pages/SettingsPage.tsx", 1],
  ]);

  /**
   * `text-su-text` on an accent tint is measured safe to `/20` over the whole
   * accepted range; above that only the accents the app ships clear the floor
   * (>= 5.19:1), while a near-white or near-black custom accent drops to
   * 3.70-4.21:1. These two `/30` sites predate #803 and sit in
   * `src/components/alerts`, outside this agent's file scope; they go into the
   * same sequenced follow-up as the 209 above.
   */
  const ABOVE_CAP_LEDGER = new Map<string, number>([
    ["src/components/alerts/AlertRuleBuilder.tsx", 1],
    ["src/components/alerts/ContestAlertProfiles.tsx", 1],
  ]);

  const TINT_RE = /bg-plasma-orange\/(?:1[5-9]|[2-9]\d|100)\b/;
  const ACCENT_INK_RE = /text-plasma-orange\b/;
  const ABOVE_CAP_TINT_RE = /bg-plasma-orange\/(?:2[5-9]|[3-9]\d|100)\b/;
  const NEUTRAL_INK_RE = /text-su-text\b/;

  // Scans .ts/.tsx only and skips anything matching .test. -- a pairing
  // parked in a *.test.tsx fixture or a .css file is outside this census.
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

  it("has no file over its accent-ink budget", () => {
    const counts = census(TINT_RE, ACCENT_INK_RE);
    const over: string[] = [];
    for (const [file, count] of counts) {
      const budget = LEDGER.get(file) ?? 0;
      if (count > budget) over.push(`${file}: ${count} > ${budget} budgeted`);
    }
    expect(
      over,
      `new same-line text-plasma-orange on a >=15 plasma-orange tint:\n${over.join("\n")}`,
    ).toEqual([]);
    // The ledger only ever shrinks; a fix that lands must not be able to raise
    // the total past the census this PR measured.
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      209,
    );
  });

  it("keeps src/components/ui free of accent ink on an accent tint", () => {
    const offenders = [...census(TINT_RE, ACCENT_INK_RE).keys()].filter(
      (file) => file.startsWith("src/components/ui/"),
    );
    expect(
      offenders,
      `shared design-system components must ship the --su-text treatment:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("has no new --su-text label on a tint above the measured /20 cap", () => {
    const counts = census(ABOVE_CAP_TINT_RE, NEUTRAL_INK_RE);
    const over: string[] = [];
    for (const [file, count] of counts) {
      const budget = ABOVE_CAP_LEDGER.get(file) ?? 0;
      if (count > budget) over.push(`${file}: ${count} > ${budget} budgeted`);
    }
    expect(
      over,
      `same-line text-su-text on a plasma-orange tint above /${TINT_CAP * 100}:\n${over.join("\n")}`,
    ).toEqual([]);
  });
});

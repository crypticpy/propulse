/**
 * #844 batch 16: map spot card, band conditions panel, propagation forecast modal.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-16 sites only so it can land independently
 * of other #844 batches.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT_HEX,
  stationContrast,
  stationPalettes,
  stationTokens,
} from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

const AA = 4.5;
const TINT_CAP = 0.2;
const THEMES_IDS = Object.keys(stationPalettes) as ThemeId[];
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

type StatusToken =
  | "signal-green"
  | "caution-amber"
  | "alert-red"
  | "plasma-orange"
  | "good";

type StationPalette = (typeof stationPalettes)[ThemeId];

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

const SURFACES = [
  { name: "panel", backdrop: (palette: StationPalette) => palette.panel },
  { name: "canvas", backdrop: (palette: StationPalette) => palette.canvas },
  {
    name: "glass over panel",
    backdrop: (palette: StationPalette) =>
      compositeOnSurface(palette.line, 0.1, palette.panel),
  },
  {
    name: "glass over canvas",
    backdrop: (palette: StationPalette) =>
      compositeOnSurface(palette.line, 0.1, palette.canvas),
  },
] as const;

interface Batch16Site {
  file: string;
  what: string;
  snippet: string;
  token: StatusToken;
}

function statusTintHex(
  palette: StationPalette,
  theme: ThemeId,
  token: StatusToken,
): string {
  switch (token) {
    case "signal-green":
    case "good":
      return palette.success;
    case "caution-amber":
      return palette.warning;
    case "alert-red":
      return palette.danger;
    case "plasma-orange":
      return (stationTokens(theme, DEFAULT_ACCENT_HEX) as Record<string, string>)[
        "--su-accent"
      ];
  }
}

function deriveStatusAlpha(text: string, token: StatusToken): number {
  const re = new RegExp(`bg-${token}/(\\d+)`, "g");
  const alphas = [...text.matchAll(re)].map((m) => Number(m[1]));
  return Math.max(...alphas) / 100;
}

function assertNoSameHueInkOnTint(
  text: string,
  what: string,
  token: StatusToken,
): void {
  const tintRe = new RegExp(`bg-${token}/`);
  const sameHueInk = `text-${token}`;
  for (const line of text.split("\n")) {
    if (!tintRe.test(line) || !line.includes("text-su-text")) {
      continue;
    }
    expect(
      line.includes(sameHueInk),
      `${what}: same-line same-hue ink on ${token} tint:\n${line}`,
    ).toBe(false);
  }
}

const BATCH16_SITES: Batch16Site[] = [
  {
    file: "src/components/map/SelectedSpotCard.tsx",
    what: "the active target action button",
    snippet: `"border-signal-green/35 bg-signal-green/10 text-su-text"`,
    token: "signal-green",
  },
  {
    file: "src/components/map/SelectedSpotCard.tsx",
    what: "the approximate grid badge",
    snippet: `border-caution-amber/30 bg-caution-amber/10 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/map/SelectedSpotCard.tsx",
    what: "the optimal-band path status badge",
    snippet: "text-su-text ${getPathStatusBgColor(optimalSignal.status)}",
    token: "signal-green",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "the hot ladder badge class",
    snippet: `hot: "text-su-text bg-plasma-orange/15"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "the verified ladder badge class",
    snippet: `verified: "text-su-text bg-signal-green/15"`,
    token: "signal-green",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "the stirring ladder badge class",
    snippet: `stirring: "text-su-text bg-caution-amber/15"`,
    token: "caution-amber",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "the forecast ladder badge class",
    snippet: `forecast: "text-su-text bg-signal-green/10"`,
    token: "signal-green",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "the collapsed poor aggregate badge",
    snippet: `text: "text-su-text",\n      bg: "bg-alert-red/10"`,
    token: "alert-red",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "the path-model status pill",
    snippet: ": `text-su-text ${getPathStatusBgColor(condition.status)}`",
    token: "signal-green",
  },
  {
    file: "src/components/map/modals/PropagationForecastModal.tsx",
    what: "the excellent band grouping chip",
    snippet: `bg-signal-green/20 text-su-text rounded`,
    token: "signal-green",
  },
  {
    file: "src/components/map/modals/PropagationForecastModal.tsx",
    what: "the good band grouping chip",
    snippet: `bg-good/20 text-su-text rounded`,
    token: "good",
  },
  {
    file: "src/components/map/modals/PropagationForecastModal.tsx",
    what: "the fair band grouping chip",
    snippet: `bg-caution-amber/20 text-su-text rounded`,
    token: "caution-amber",
  },
  {
    file: "src/components/map/modals/PropagationForecastModal.tsx",
    what: "the best-window peak status badge",
    snippet: "rounded-full text-su-text ${getPathStatusBgColor(window.peakStatus)}",
    token: "signal-green",
  },
];

describe("#844 batch 16 status-tint sites ship --su-text ink", () => {
  it.each(BATCH16_SITES.map((site) => [site.what, site] as const))(
    "%s still ships the measured snippet",
    (_what, site) => {
      const source = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      expect(
        source.includes(site.snippet),
        `${site.file} no longer contains:\n${site.snippet}`,
      ).toBe(true);
      assertNoSameHueInkOnTint(source, site.what, site.token);
      const alpha = deriveStatusAlpha(site.snippet, site.token);
      if (Number.isFinite(alpha) && alpha > 0) {
        expect(alpha, `${site.what} tint above cap`).toBeLessThanOrEqual(
          TINT_CAP,
        );
      }
    },
  );

  it.each(
    BATCH16_SITES.flatMap((site) =>
      THEMES_IDS.map((theme) => [site.what, theme, site] as const),
    ),
  )(
    "%s clears AA in %s for --su-text on its status tint",
    (_what, theme, site) => {
      const alpha = deriveStatusAlpha(site.snippet, site.token);
      if (!Number.isFinite(alpha) || alpha <= 0) {
        return;
      }
      const palette = stationPalettes[theme];
      const tintHex = statusTintHex(palette, theme, site.token);
      for (const surface of SURFACES) {
        const ratio = stationContrast(
          palette.text,
          compositeOnSurface(tintHex, alpha, surface.backdrop(palette)),
        );
        expect(
          ratio,
          `${site.file} on ${surface.name} at alpha ${alpha}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    },
  );
});

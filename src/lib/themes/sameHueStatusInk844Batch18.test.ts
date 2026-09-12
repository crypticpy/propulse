/**
 * #844 batch 18: SDR flexible-skin same-hue status tint leftovers.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-18 sites only so it can land independently
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
  | "cosmic-cyan";

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

interface Batch18Site {
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
      return palette.success;
    case "caution-amber":
      return palette.warning;
    case "alert-red":
      return palette.danger;
    case "plasma-orange":
      return (stationTokens(theme, DEFAULT_ACCENT_HEX) as Record<string, string>)[
        "--su-accent"
      ];
    case "cosmic-cyan":
      return palette.info;
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

const BATCH18_SITES: Batch18Site[] = [
  {
    file: "src/components/sdr/EqBandPanel.tsx",
    what: "the notch active filter type pill",
    snippet: `"bg-plasma-orange/20 border-plasma-orange/40 text-su-text"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/sdr/EqBandPanel.tsx",
    what: "the default active filter type pill",
    snippet: `"bg-cosmic-cyan/20 border-cosmic-cyan/40 text-su-text"`,
    token: "cosmic-cyan",
  },
  {
    file: "src/components/sdr/EqBandPanel.tsx",
    what: "the enable band button",
    snippet: `"bg-signal-green/15 border-signal-green/30 text-su-text hover:bg-signal-green/20"`,
    token: "signal-green",
  },
  {
    file: "src/components/sdr/EqBandPanel.tsx",
    what: "the remove band button",
    snippet: `bg-alert-red/10 border-alert-red/25 text-su-text`,
    token: "alert-red",
  },
  {
    file: "src/components/sdr/skins/flexible/FlexSideControls.tsx",
    what: "the FT8 decoder ON toggle",
    snippet: `"bg-signal-green/20 border-signal-green/40 text-su-text ring-1 ring-signal-green/20"`,
    token: "signal-green",
  },
  {
    file: "src/components/sdr/skins/flexible/FlexSideControls.tsx",
    what: "the active FT8 mode pill",
    snippet: `"bg-cosmic-cyan/20 text-su-text border-cosmic-cyan/40 ring-1 ring-cosmic-cyan/20"`,
    token: "cosmic-cyan",
  },
  {
    file: "src/components/sdr/skins/flexible/FlexSideControls.tsx",
    what: "the decoder error alert",
    snippet: `bg-alert-red/10 border border-alert-red/20 px-2 py-1.5 text-xs leading-tight text-su-text`,
    token: "alert-red",
  },
  {
    file: "src/components/sdr/skins/flexible/FlexSideControls.tsx",
    what: "the recording active button",
    snippet: `"bg-alert-red/20 border-alert-red/40 text-su-text ring-1 ring-alert-red/20"`,
    token: "alert-red",
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelAud.tsx",
    what: "the audio toggle chip",
    snippet: `"bg-signal-green/15 border-signal-green/30 text-su-text"`,
    token: "signal-green",
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelDsp.tsx",
    what: "the active DSP toggle button",
    snippet: `"bg-signal-green/20 border-signal-green/30 text-su-text shadow-[0_0_6px_rgba(0,255,136,0.15)]"`,
    token: "signal-green",
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelDsp.tsx",
    what: "the active AGC speed pill",
    snippet: `"bg-cosmic-cyan/20 border-cosmic-cyan/40 text-su-text"`,
    token: "cosmic-cyan",
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelTabs.tsx",
    what: "the active slice panel tab",
    snippet: `"bg-cosmic-cyan/15 text-su-text border-t-2 border-cosmic-cyan -mt-px"`,
    token: "cosmic-cyan",
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelTabs.tsx",
    what: "the RIT enabled toggle",
    snippet: `"bg-plasma-orange/20 border-plasma-orange/30 text-su-text"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelTabs.tsx",
    what: "the XIT enabled toggle",
    snippet: `"bg-cosmic-cyan/20 border-cosmic-cyan/30 text-su-text"`,
    token: "cosmic-cyan",
  },
  {
    file: "src/components/sdr/skins/flexible/SlicePanelTabs.tsx",
    what: "the SPLIT ON toggle",
    snippet: `"bg-caution-amber/20 border-caution-amber/30 text-su-text"`,
    token: "caution-amber",
  },
];

describe("#844 batch 18 status-tint sites ship --su-text ink", () => {
  it.each(BATCH18_SITES.map((site) => [site.what, site] as const))(
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
    BATCH18_SITES.flatMap((site) =>
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

/**
 * #844 batch 4: Atmos header, weather toast, and emcomm status-tint sites.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-4 sites only so it can land independently
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
  | "nebula-blue";

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

interface Batch4Site {
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
    case "nebula-blue":
      return palette.panel;
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

const BATCH4_SITES: Batch4Site[] = [
  {
    file: "src/components/atmos/AtmosHeader.tsx",
    what: "the monitoring activation-level EMRG badge",
    snippet: `monitoring: "bg-nebula-blue/20 text-su-text"`,
    token: "nebula-blue",
  },
  {
    file: "src/components/atmos/AtmosHeader.tsx",
    what: "the full activation-level EMRG badge",
    snippet: `full: "bg-alert-red/20 text-su-text"`,
    token: "alert-red",
  },
  {
    file: "src/components/atmos/emcomm/ActivationBanner.tsx",
    what: "the standby level pill",
    snippet: `pill: "bg-caution-amber/20 text-su-text"`,
    token: "caution-amber",
  },
  {
    file: "src/components/atmos/emcomm/ActivationBanner.tsx",
    what: "the full activation level pill",
    snippet: `pill: "bg-alert-red/20 text-su-text"`,
    token: "alert-red",
  },
  {
    file: "src/components/atmos/emcomm/ActivationModal.tsx",
    what: "the monitoring activation level chip",
    snippet: `color: "bg-nebula-blue/20 text-su-text border-nebula-blue/30"`,
    token: "nebula-blue",
  },
  {
    file: "src/components/atmos/emcomm/ActivationModal.tsx",
    what: "the partial activation level chip",
    snippet: `color: "bg-plasma-orange/20 text-su-text border-plasma-orange/30"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/atmos/emcomm/EmCommQuickActions.tsx",
    what: "the 14.300 emergency tune button",
    snippet: `bg-alert-red/20 text-su-text hover:bg-alert-red/20 border border-alert-red/30`,
    token: "alert-red",
  },
  {
    file: "src/components/atmos/emcomm/ICS213Form.tsx",
    what: "the selected Immediate priority chip",
    snippet: `? "bg-alert-red/20 text-su-text border border-alert-red/40"`,
    token: "alert-red",
  },
  {
    file: "src/components/atmos/emcomm/ICS213Form.tsx",
    what: "the selected Priority priority chip",
    snippet: `? "bg-caution-amber/20 text-su-text border border-caution-amber/40"`,
    token: "caution-amber",
  },
  {
    file: "src/components/atmos/emcomm/ICS213Form.tsx",
    what: "the selected Routine priority chip",
    snippet: `: "bg-signal-green/20 text-su-text border border-signal-green/40"`,
    token: "signal-green",
  },
  {
    file: "src/components/atmos/emcomm/ICS213Form.tsx",
    what: "the Save & Export TXT button",
    snippet: `bg-plasma-orange/20 text-su-text hover:bg-plasma-orange/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/atmos/emcomm/ICS213Form.tsx",
    what: "the Save & Export HTML button",
    snippet: `bg-nebula-blue/20 text-su-text hover:bg-nebula-blue/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"`,
    token: "nebula-blue",
  },
];

describe("#844 batch 4 status-tint sites ship --su-text ink", () => {
  it.each(BATCH4_SITES.map((site) => [site.what, site] as const))(
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
    BATCH4_SITES.flatMap((site) =>
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

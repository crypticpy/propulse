/**
 * #844 batch 14: export, awards, emcomm, alerts, dx verdict, operating toast,
 * and quick-location status tints.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-14 sites only so it can land independently
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

interface Batch14Site {
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

const BATCH14_SITES: Batch14Site[] = [
  {
    file: "src/components/export/ExportModal.tsx",
    what: "the copy-success action button",
    snippet: `"bg-signal-green/20 border border-signal-green/50 text-su-text"`,
    token: "signal-green",
  },
  {
    file: "src/components/export/ExportModal.tsx",
    what: "the export action button",
    snippet: `bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                       text-su-text hover:bg-plasma-orange/20`,
    token: "plasma-orange",
  },
  {
    file: "src/components/export/ExportModal.tsx",
    what: "the selected format label",
    snippet: `isSelected ? "text-su-text" : "text-su-muted"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/awards/ContestContributions.tsx",
    what: "the new DXCC entity chip",
    snippet: `bg-alert-red/10 text-su-text border border-alert-red/20`,
    token: "alert-red",
  },
  {
    file: "src/components/awards/ContestContributions.tsx",
    what: "the new band slot chip",
    snippet: `bg-signal-green/10 text-su-text border border-signal-green/20`,
    token: "signal-green",
  },
  {
    file: "src/components/awards/ContestContributions.tsx",
    what: "the new WAS state chip",
    snippet: `bg-nebula-blue/10 text-su-text border border-nebula-blue/20`,
    token: "nebula-blue",
  },
  {
    file: "src/components/awards/ContestContributions.tsx",
    what: "the new WAZ zone chip",
    snippet: `bg-plasma-orange/10 text-su-text border border-plasma-orange/20`,
    token: "plasma-orange",
  },
  {
    file: "src/components/atmos/emcomm/SitRepForm.tsx",
    what: "the save SitRep button",
    snippet: `bg-signal-green/20 hover:bg-signal-green/20 text-su-text border border-signal-green/30`,
    token: "signal-green",
  },
  {
    file: "src/components/atmos/emcomm/SkywarnBadge.tsx",
    what: "the SKYWARN possible badge",
    snippet: `color: "bg-caution-amber/20 text-su-text"`,
    token: "caution-amber",
  },
  {
    file: "src/components/alerts/AlertHistory.tsx",
    what: "the muted callsign chip",
    snippet: `bg-caution-amber/10 text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/dx/BandVerdictDetailsDialog.tsx",
    what: "the fading status badge",
    snippet: `border-caution-amber/30 bg-caution-amber/10 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/dx/BandVerdictDetailsDialog.tsx",
    what: "the surprise status badge",
    snippet: `border-plasma-orange/30 bg-plasma-orange/10 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-su-text`,
    token: "plasma-orange",
  },
  {
    file: "src/components/dx/BandVerdictDetailsDialog.tsx",
    what: "the stale canonical badge",
    snippet: `border-caution-amber/30 bg-caution-amber/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/dx/BandVerdictPanel.tsx",
    what: "the hot ladder chip class",
    snippet: `hot: "bg-plasma-orange/20 border-plasma-orange text-su-text"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/dx/BandVerdictPanel.tsx",
    what: "the verified ladder chip class",
    snippet: `verified: "bg-signal-green/20 border-signal-green text-su-text"`,
    token: "signal-green",
  },
  {
    file: "src/components/dx/BandVerdictPanel.tsx",
    what: "the surprise inline badge",
    snippet: `rounded bg-plasma-orange/20 px-1 text-xs uppercase tracking-wide text-su-text`,
    token: "plasma-orange",
  },
  {
    file: "src/components/dx/BandVerdictPanel.tsx",
    what: "the crowded inline badge",
    snippet: `rounded bg-plasma-orange/20 px-1 text-xs uppercase tracking-wide text-su-text`,
    token: "plasma-orange",
  },
  {
    file: "src/components/dx/BandVerdictPanel.tsx",
    what: "the active DX mode toggle",
    snippet: `"border-nebula-blue bg-nebula-blue/10 text-su-text"`,
    token: "nebula-blue",
  },
  {
    file: "src/components/operating/BandSuggestToast.tsx",
    what: "the band-switch action button",
    snippet: `bg-signal-green/20 text-su-text text-xs font-medium hover:bg-signal-green/20`,
    token: "signal-green",
  },
  {
    file: "src/components/location/QuickLocationDialog.tsx",
    what: "the missing home QTH warning",
    snippet: `border-caution-amber/30 bg-caution-amber/10 p-4 text-sm text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/location/QuickLocationDialog.tsx",
    what: "the location validation error alert",
    snippet: `border-alert-red/30 bg-alert-red/10 px-3 py-2 text-sm text-su-text`,
    token: "alert-red",
  },
  {
    file: "src/components/location/QuickLocationDialog.tsx",
    what: 'the "Use Home QTH" button',
    snippet: `border-signal-green/30 bg-signal-green/10 px-4 py-2 text-sm font-medium text-su-text transition-colors hover:bg-signal-green/20`,
    token: "signal-green",
  },
  {
    file: "src/components/location/QuickLocationDialog.tsx",
    what: 'the "Use This Location" button',
    snippet: `border-plasma-orange/50 bg-plasma-orange/20 px-4 py-2 text-sm font-semibold text-su-text transition-colors hover:bg-plasma-orange/20`,
    token: "plasma-orange",
  },
];

describe("#844 batch 14 status-tint sites ship --su-text ink", () => {
  it.each(BATCH14_SITES.map((site) => [site.what, site] as const))(
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
    BATCH14_SITES.flatMap((site) =>
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

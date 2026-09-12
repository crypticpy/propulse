/**
 * #844 batch 21: pulse-blocked contest/DX/QSO/atmos/SDR same-hue status tint leftovers.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-21 sites only so it can land independently
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
  | "amber-500";

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

interface Batch21Site {
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
    case "amber-500":
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

const BATCH21_SITES: Batch21Site[] = [
  {
    file: "src/components/qso/ConflictBadge.tsx",
    what: "the sync-conflict count badge",
    snippet:
      "bg-caution-amber/20 px-2.5 py-0.5 text-xs font-semibold text-su-text transition-colors hover:bg-caution-amber/20",
    token: "caution-amber",
  },
  {
    file: "src/components/dx/DXSpotList/DXSpotList.tsx",
    what: "the alert-match-count badge",
    snippet:
      "bg-alert-red/20 text-su-text border border-alert-red/30",
    token: "alert-red",
  },
  {
    file: "src/components/dx/DXSpotList/DXSpotList.tsx",
    what: "the NEW MULT row badge",
    snippet:
      "bg-caution-amber/20 text-su-text text-xs font-bold leading-none uppercase tracking-wider",
    token: "caution-amber",
  },
  {
    file: "src/components/contest/ContestTimer.tsx",
    what: "the critical off-time warning banner",
    snippet: "bg-alert-red/20 border border-alert-red/50 text-su-text",
    token: "alert-red",
  },
  {
    file: "src/components/contest/ContestTimer.tsx",
    what: "the non-critical off-time warning banner",
    snippet: "bg-caution-amber/15 border border-caution-amber/40 text-su-text",
    token: "caution-amber",
  },
  {
    file: "src/components/contest/ContestOneLineEntry.tsx",
    what: "the inline DUPE badge",
    snippet: "bg-alert-red/20 text-su-text border-2 border-alert-red/50",
    token: "alert-red",
  },
  {
    file: "src/components/contest/ContestOneLineEntry.tsx",
    what: "the inline NEW MULT badge",
    snippet: "bg-signal-green/20 text-su-text border-2 border-signal-green/50",
    token: "signal-green",
  },
  {
    file: "src/components/contest/DupeIndicator.tsx",
    what: "the full DUPE badge",
    snippet: `bg-alert-red/20 border-2 border-alert-red/60 rounded
        text-su-text font-bold text-sm uppercase tracking-wider`,
    token: "alert-red",
  },
  {
    file: "src/components/atmos/WeatherAlertToast.tsx",
    what: "the CRITICAL toast badge",
    snippet:
      "text-su-text bg-alert-red/20 flex-shrink-0",
    token: "alert-red",
  },
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    what: "the FOX row badge",
    snippet: "bg-amber-500/20 text-su-text text-xs font-bold px-1 rounded leading-normal",
    token: "amber-500",
  },
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    what: "the DXCC row badge",
    snippet: "bg-caution-amber/20 text-su-text text-xs px-1 rounded font-bold leading-normal",
    token: "caution-amber",
  },
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    what: "the active CQ filter pill",
    snippet: "bg-signal-green/15 text-su-text",
    token: "signal-green",
  },
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    what: "the DXpedition detected banner",
    snippet:
      "bg-amber-500/10 border-b border-amber-400/20 px-3 py-1 text-xs text-su-text font-mono shrink-0 flex items-center gap-1.5",
    token: "amber-500",
  },
];

describe("#844 batch 21 status-tint sites ship --su-text ink", () => {
  it.each(BATCH21_SITES.map((site) => [site.what, site] as const))(
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
    BATCH21_SITES.flatMap((site) =>
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

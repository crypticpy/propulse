/**
 * #844 batch 3: alerts, guest, and cluster status-tint sites.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-3 sites only so it can land independently
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
  | "plasma-orange";

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
  { name: "guest status wash", backdrop: (palette: StationPalette) => compositeOnSurface(palette.success, 0.15, palette.panel) },
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

interface Batch3Site {
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

const BATCH3_SITES: Batch3Site[] = [
  {
    file: "src/components/guest/CreateGuestSessionModal.tsx",
    what: "the generate-code action",
    snippet: `bg-plasma-orange/15 border border-plasma-orange/50 rounded-lg
                         text-su-text hover:bg-plasma-orange/20`,
    token: "plasma-orange",
  },
  {
    file: "src/components/guest/CreateGuestSessionModal.tsx",
    what: "the end-session action",
    snippet: `bg-alert-red/15 border border-alert-red/50 rounded-lg
                           text-su-text hover:bg-alert-red/20`,
    token: "alert-red",
  },
  {
    file: "src/components/alerts/StormImpactPanel.tsx",
    what: "the minimal StormImpactPanel badge",
    snippet: `badge: "bg-signal-green/20 text-su-text border-signal-green/40"`,
    token: "signal-green",
  },
  {
    file: "src/components/alerts/StormImpactPanel.tsx",
    what: "the moderate StormImpactPanel badge",
    snippet: `badge: "bg-caution-amber/20 text-su-text border-caution-amber/40"`,
    token: "caution-amber",
  },
  {
    file: "src/components/alerts/StormImpactPanel.tsx",
    what: "the extreme StormImpactPanel badge",
    snippet: `badge: "bg-alert-red/20 text-su-text border-alert-red/40"`,
    token: "alert-red",
  },
  {
    file: "src/components/alerts/SwpcAlertDetailModal.tsx",
    what: "the minor SwpcAlertDetailModal badge",
    snippet: `badge: "bg-signal-green/20 text-su-text border-signal-green/40"`,
    token: "signal-green",
  },
  {
    file: "src/components/alerts/SwpcAlertDetailModal.tsx",
    what: "the moderate SwpcAlertDetailModal badge",
    snippet: `badge: "bg-caution-amber/20 text-su-text border-caution-amber/40"`,
    token: "caution-amber",
  },
  {
    file: "src/components/alerts/SwpcAlertDetailModal.tsx",
    what: "the extreme SwpcAlertDetailModal badge",
    snippet: `badge: "bg-alert-red/20 text-su-text border-alert-red/40"`,
    token: "alert-red",
  },
  {
    file: "src/components/alerts/AlertDetailModal.tsx",
    what: "the CRITICAL priority badge",
    snippet: `classes: "bg-alert-red/20 text-su-text border-alert-red/40"`,
    token: "alert-red",
  },
  {
    file: "src/components/alerts/AlertDetailModal.tsx",
    what: "the non-critical affected-band pill",
    snippet: `: "bg-caution-amber/10 text-su-text border-caution-amber/30"`,
    token: "caution-amber",
  },
  {
    file: "src/components/alerts/AlertDetailModal.tsx",
    what: "the WARNING priority badge",
    snippet: `classes: "bg-caution-amber/20 text-su-text border-caution-amber/40"`,
    token: "caution-amber",
  },
  {
    file: "src/components/alerts/AlertDetailModal.tsx",
    what: "the CRITICAL affected-band pill",
    snippet: `? "bg-alert-red/10 text-su-text border-alert-red/30"`,
    token: "alert-red",
  },
  {
    file: "src/components/alerts/AlertHistoryModal.tsx",
    what: "the confirm-clear dismissed button",
    snippet: `? "bg-alert-red/20 text-su-text border border-alert-red/50"`,
    token: "alert-red",
  },
  {
    file: "src/components/alerts/SpotAlertToast.tsx",
    what: 'the "NEW DXCC" critical badge',
    snippet: `bg-alert-red/20 text-su-text"`,
    token: "alert-red",
  },
  {
    file: "src/components/alerts/StormImpactPanel.tsx",
    what: "the severe storm severity badge",
    snippet: `badge: "bg-plasma-orange/20 text-su-text border-plasma-orange/40"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/alerts/SwpcAlertDetailModal.tsx",
    what: "the major SWPC severity badge",
    snippet: `badge: "bg-plasma-orange/20 text-su-text border-plasma-orange/40"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/guest/CreateGuestSessionModal.tsx",
    what: "the selected duration chip",
    snippet: `? "bg-plasma-orange/20 text-su-text border border-plasma-orange/50"`,
    token: "plasma-orange",
  },
  {
    file: "src/components/guest/CreateGuestSessionModal.tsx",
    what: 'the "Copied!" copy-code button',
    snippet: `? "bg-signal-green/20 text-su-text border border-signal-green/50"`,
    token: "signal-green",
  },
  {
    file: "src/components/guest/GuestModeToggle.tsx",
    what: "the End guest-session button",
    snippet: `bg-alert-red/15 text-su-text border border-alert-red/30 hover:bg-alert-red/20 transition-colors"`,
    token: "alert-red",
  },
  {
    file: "src/components/cluster/ClusterConnectionForm.tsx",
    what: "the Disconnect cluster button",
    snippet: `bg-alert-red/15 border border-alert-red/50 text-su-text hover:bg-alert-red/20"`,
    token: "alert-red",
  },
];

describe("#844 batch 3 status-tint sites ship --su-text ink", () => {
  it.each(BATCH3_SITES.map((site) => [site.what, site] as const))(
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
    BATCH3_SITES.flatMap((site) =>
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

/**
 * #844 batch 11: QSO log status chips, banners, and sync controls.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-11 sites only so it can land independently
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

interface Batch11Site {
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

const BATCH11_SITES: Batch11Site[] = [
  {
    file: "src/components/qso/BandMapControls.tsx",
    what: "the active contest filter chip",
    snippet: `? "bg-caution-amber/20 text-su-text"`,
    token: "caution-amber",
  },
  {
    file: "src/components/qso/BandMapControls.tsx",
    what: "the active sub-bands toggle chip",
    snippet: `? "bg-nebula-blue/20 text-su-text"`,
    token: "nebula-blue",
  },
  {
    file: "src/components/qso/ConflictResolutionModal.tsx",
    what: 'the "Keep Theirs" resolution button',
    snippet: `border-plasma-orange/30 bg-plasma-orange/20 px-4 py-2 text-sm font-medium text-su-text transition-colors hover:bg-plasma-orange/20`,
    token: "plasma-orange",
  },
  {
    file: "src/components/qso/ConflictResolutionModal.tsx",
    what: 'the "Save Merged" resolution button',
    snippet: `border-signal-green/30 bg-signal-green/20 px-4 py-2 text-sm font-medium text-su-text transition-colors hover:bg-signal-green/20`,
    token: "signal-green",
  },
  {
    file: "src/components/qso/ContestQslBatch.tsx",
    what: 'the "Coming Soon" service badge',
    snippet: `rounded-full bg-caution-amber/20 text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/qso/ContestQslBatch.tsx",
    what: "the batch upload error log panel",
    snippet: `border border-alert-red/20 bg-alert-red/5 overflow-hidden text-su-text`,
    token: "alert-red",
  },
  {
    file: "src/components/qso/DupeWarningBadge.tsx",
    what: "the duplicate contact warning banner",
    snippet: `bg-caution-amber/10 border border-caution-amber/20 rounded-lg text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/qso/DupeWarningBadge.tsx",
    what: "the worked-band summary chips",
    snippet: `bg-caution-amber/10 text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/qso/DxccStatusBadge.tsx",
    what: "the new-entity status pill text token",
    snippet: `bg: "bg-alert-red/15",\n    text: "text-su-text",`,
    token: "alert-red",
  },
  {
    file: "src/components/qso/DxccStatusBadge.tsx",
    what: "the contest multiplier badge",
    snippet: `bg-caution-amber/15 text-su-text border border-caution-amber/30`,
    token: "caution-amber",
  },
  {
    file: "src/components/qso/QSOBulkActions.tsx",
    what: 'the bulk "Delete" button',
    snippet: `bg-alert-red/20 text-su-text hover:bg-alert-red/20 border border-alert-red/30`,
    token: "alert-red",
  },
  {
    file: "src/components/qso/QSODetailModal.tsx",
    what: 'the detail modal "Delete" button',
    snippet: `bg-alert-red/20 text-su-text hover:bg-alert-red/20 border border-alert-red/30`,
    token: "alert-red",
  },
  {
    file: "src/components/qso/QSOLogCards.tsx",
    what: "the card multiplier badge",
    snippet: `text-su-text bg-signal-green/10 px-1 rounded`,
    token: "signal-green",
  },
  {
    file: "src/components/qso/QSOSuccessToast.tsx",
    what: "the logged confirmation toast icon",
    snippet: `className="text-su-text shrink-0"`,
    token: "signal-green",
  },
  {
    file: "src/components/qso/QSOSyncStatusIndicator.tsx",
    what: "the synced status pill",
    snippet: `pillColor = "bg-signal-green/20 text-su-text border-signal-green/30";`,
    token: "signal-green",
  },
  {
    file: "src/components/qso/QSOSyncStatusIndicator.tsx",
    what: "the sync error detail banner",
    snippet: `bg-alert-red/10 border border-alert-red/20`,
    token: "alert-red",
  },
  {
    file: "src/components/qso/QSOSyncStatusIndicator.tsx",
    what: 'the expanded panel "Sync Now" button',
    snippet: `bg-plasma-orange/20 text-su-text hover:bg-plasma-orange/20`,
    token: "plasma-orange",
  },
  {
    file: "src/components/qso/QslStatusIcons.tsx",
    what: "the confirmed QSL service badge",
    snippet: `bg-signal-green/20 text-su-text border border-signal-green/40`,
    token: "signal-green",
  },
  {
    file: "src/components/qso/QslSyncPanel.tsx",
    what: "the credential lock warning banner",
    snippet: `bg-caution-amber/10 border border-caution-amber/20 rounded-lg text-su-text`,
    token: "caution-amber",
  },
  {
    file: "src/components/qso/QslSyncPanel.tsx",
    what: "the LoTW tab error status banner",
    snippet: `? "bg-alert-red/10 border border-alert-red/20 text-su-text"`,
    token: "alert-red",
  },
];

describe("#844 batch 11 status-tint sites ship --su-text ink", () => {
  it.each(BATCH11_SITES.map((site) => [site.what, site] as const))(
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
    BATCH11_SITES.flatMap((site) =>
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

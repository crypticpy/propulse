/**
 * #844 batch 6: satellite card and detail modal status-tint sites.
 *
 * Same contract as the `STATUS_FIXED_SITES` table in
 * `accentTintContrast.test.ts` (batch 1, PR #1163): keep the status wash at
 * or below `/20`, draw labels in `--su-text`, never same-hue ink on the tint.
 * This sibling file certifies batch-6 sites only so it can land independently
 * of other #844 batches.
 */

import ts from "typescript";
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

interface Batch6Site {
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

const BATCH6_SITES: Batch6Site[] = [
  {
    file: "src/components/satellites/SatelliteCard.tsx",
    what: "the fresh TLE age badge",
    snippet: `"bg-signal-green/15 text-su-text border-signal-green/30"`,
    token: "signal-green",
  },
  {
    file: "src/components/satellites/SatelliteCard.tsx",
    what: "the aging TLE age badge",
    snippet: `"bg-caution-amber/15 text-su-text border-caution-amber/30"`,
    token: "caution-amber",
  },
  {
    file: "src/components/satellites/SatelliteCard.tsx",
    what: "the stale TLE age badge",
    snippet: `"bg-alert-red/15 text-su-text border-alert-red/30"`,
    token: "alert-red",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the active description status badge",
    snippet: `active: "text-su-text bg-signal-green/15 border-signal-green/30"`,
    token: "signal-green",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the semi-active description status badge",
    snippet: `"text-su-text bg-caution-amber/15 border-caution-amber/30"`,
    token: "caution-amber",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the inactive description status badge",
    snippet: `inactive: "text-su-text bg-alert-red/15 border-alert-red/30"`,
    token: "alert-red",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the AMSAT active status badge",
    snippet: `badge: "bg-signal-green/15 text-su-text border-signal-green/30"`,
    token: "signal-green",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the AMSAT semi-active status badge",
    snippet: `badge: "bg-caution-amber/15 text-su-text border-caution-amber/30"`,
    token: "caution-amber",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the AMSAT inactive status badge",
    snippet: `badge: "bg-alert-red/15 text-su-text border-alert-red/30"`,
    token: "alert-red",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the fresh TLE age badge",
    snippet: `"bg-signal-green/15 text-su-text border-signal-green/30"`,
    token: "signal-green",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the aging TLE age badge",
    snippet: `"bg-caution-amber/15 text-su-text border-caution-amber/30"`,
    token: "caution-amber",
  },
  {
    file: "src/components/satellites/SatelliteDetailModal.tsx",
    what: "the stale TLE age badge",
    snippet: `"bg-alert-red/15 text-su-text border-alert-red/30"`,
    token: "alert-red",
  },
];

describe("#844 batch 6 status-tint sites ship --su-text ink", () => {
  it.each(BATCH6_SITES.map((site) => [site.what, site] as const))(
    "%s still ships the measured snippet",
    (_what, site) => {
      const fullSource = readFileSync(resolve(REPO_ROOT, site.file), "utf8");
      const source = site.what.includes("TLE age") ? tleHelperSource(fullSource) : fullSource;
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
    BATCH6_SITES.flatMap((site) =>
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


function tleHelperSource(source: string): string {
  const ast = ts.createSourceFile("badge.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helper = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "getTleAgeBadge");
  if (!helper) throw new Error("getTleAgeBadge helper missing");
  return helper.getText(ast);
}

it("does not let unchanged AMSAT badges mask a reverted TLE helper", () => {
  const path = "src/components/satellites/SatelliteDetailModal.tsx";
  const source = readFileSync(resolve(REPO_ROOT, path), "utf8");
  const helper = tleHelperSource(source);
  for (const site of BATCH6_SITES.filter((entry) => entry.file === path && entry.what.includes("TLE age"))) {
    const regressed = source.replace(helper, helper.replace(site.snippet, site.snippet.replace("text-su-text", `text-${site.token}`)));
    expect(regressed.includes(site.snippet)).toBe(true);
    expect(tleHelperSource(regressed).includes(site.snippet)).toBe(false);
  }
});

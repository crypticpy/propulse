/**
 * SDR sub-text-xs guard — batch 9 rest (#808)
 *
 * Census on `origin/main` at `87c597b0`: `src/components/sdr/` holds 251
 * sub-floor `text-[Npx]` sites (N<12) across 44 files. This batch raises
 * 14 user-read sites in the 14 files below; seven tabular/decorative axis
 * and canvas-overlay sites stay sub-floor and are allowlisted by content.
 *
 * Skips the 14 files on PR #1177 (`subTextSizeFloor.sdr.test.ts`) and the
 * 14 on PR #1180 (`subTextSizeFloor.sdr-tail.test.ts`). Two files
 * (`FlexFreqAxis.tsx`, `RotaryKnob.tsx`) remain for follow-up slices.
 *
 * Sibling to the other SDR floor tests — does not edit them while those PRs
 * are open.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/sdr/skins/flexible/FlexTimeAxis.tsx",
  "src/components/sdr/skins/flexible/FlexDbScale.tsx",
  "src/components/sdr/overlays/BandPlanOverlay.tsx",
  "src/components/sdr/PassbandDetail.tsx",
  "src/components/sdr/skins/fate/FateWaterfallStrip.tsx",
  "src/components/sdr/skins/fate/FateSkin.tsx",
  "src/components/sdr/skins/ClassicSkin.tsx",
  "src/components/sdr/primitives/GainSlider.tsx",
  "src/components/sdr/primitives/DspBadge.tsx",
  "src/components/sdr/Ft8DecodeList.tsx",
  "src/components/sdr/skins/SkinSwitcher.tsx",
  "src/components/sdr/Ft8BandPresetBar.tsx",
  "src/components/sdr/EqBandContextMenu.tsx",
  "src/components/sdr/BandScope.tsx",
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/sdr/skins/flexible/FlexTimeAxis.tsx",
    match:
      "font-mono text-[9px] text-su-muted text-right pr-1 leading-none whitespace-nowrap",
    reason:
      "decorative time-axis tick labels beside the waterfall — tabular scale chrome, not interactive UI copy.",
  },
  {
    file: "src/components/sdr/skins/flexible/FlexDbScale.tsx",
    match:
      "font-mono text-[9px] text-su-muted text-right pr-1 leading-none whitespace-nowrap",
    reason:
      "decorative dB scale beside the spectrum — tabular mono scale labels aligned to tick positions.",
  },
  {
    file: "src/components/sdr/overlays/BandPlanOverlay.tsx",
    match:
      "absolute top-0.5 left-1 text-[8px] font-semibold uppercase tracking-wider",
    reason:
      "band-plan segment labels on the overlay canvas — decorative color-coded chrome when segments are wide enough.",
  },
  {
    file: "src/components/sdr/overlays/BandPlanOverlay.tsx",
    match:
      "absolute top-1 left-0 -translate-x-1/2 text-[7px] font-mono text-caution-amber/50 whitespace-nowrap",
    reason:
      "band-edge frequency markers on the overlay — tabular mono scale labels at edge positions.",
  },
  {
    file: "src/components/sdr/PassbandDetail.tsx",
    match:
      "absolute top-1 left-2 text-[8px] text-su-muted/80 uppercase tracking-wider pointer-events-none select-none",
    reason:
      "non-interactive zoom/FFT hint overlay on the passband canvas — decorative chrome, not body copy.",
  },
  {
    file: "src/components/sdr/skins/fate/FateWaterfallStrip.tsx",
    match:
      "absolute top-1 left-2 text-[9px] text-su-text/80 uppercase tracking-wider pointer-events-none select-none",
    reason:
      "non-interactive waterfall title overlay on the canvas — decorative chrome, not body copy.",
  },
  {
    file: "src/components/sdr/BandScope.tsx",
    match:
      "absolute left-2 right-2 bottom-1 flex justify-between text-[10px] text-su-muted font-mono pointer-events-none",
    reason:
      "decorative frequency axis under the band scope — tabular scale labels, not interactive UI copy.",
  },
];

interface SubFloorSite {
  file: string;
  line: number;
  text: string;
}

function findSubFloorSites(file: string): SubFloorSite[] {
  const absPath = resolve(REPO_ROOT, file);
  const lines = readFileSync(absPath, "utf8").split("\n");
  const sites: SubFloorSite[] = [];
  lines.forEach((line, index) => {
    for (const re of [SIZE_RE, INLINE_SIZE_RE]) {
      for (const match of line.matchAll(re)) {
        if (Number(match[1]) < 12) {
          sites.push({ file, line: index + 1, text: line });
        }
      }
    }
  });
  return sites;
}

describe("sub-text-xs sizing stays at the floor in SDR (#808 batch 9 rest)", () => {
  it("has no un-allowlisted sub-floor text-[Npx] or inline fontSize in the fixed files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        const allowed = ALLOWLIST.some(
          (entry) => entry.file === file && site.text.includes(entry.match),
        );
        if (!allowed) {
          violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
        }
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-9 rest files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry still matches a real sub-floor site in the fixed files", () => {
    for (const entry of ALLOWLIST) {
      const stillPresent = findSubFloorSites(entry.file).some((site) =>
        site.text.includes(entry.match),
      );
      expect(
        stillPresent,
        `${entry.file}: allowlisted content "${entry.match}" is no longer at a sub-floor text-[Npx] site — remove the stale entry`,
      ).toBe(true);
    }
  });
});

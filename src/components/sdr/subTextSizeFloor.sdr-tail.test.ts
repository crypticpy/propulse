/**
 * SDR sub-text-xs guard — batch 7 tail (#808)
 *
 * Leftover panels deferred from PR #1177 (batch 4) under the ≤15-file cap.
 * Raises user-read labels, buttons, and decode chrome to `text-xs`; four
 * tabular/decorative sites stay sub-floor and are allowlisted by content.
 *
 * Sibling to `subTextSizeFloor.sdr.test.ts` on #1177 — does not edit that
 * file while the parent PR is open. ~22 files (~78 sub-floor sites before
 * #1177 lands) remain for follow-up SDR slices under #808.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/sdr/Ft8DecoderPanel.tsx",
  "src/components/sdr/skins/FlexibleSkin.tsx",
  "src/components/sdr/skins/flexible/SlicePanelDsp.tsx",
  "src/components/sdr/SdrSettingsModal.tsx",
  "src/components/sdr/EqBandPanel.tsx",
  "src/components/sdr/skins/flexible/SlicePanelFilter.tsx",
  "src/components/sdr/shared/RadioControlsCard.tsx",
  "src/components/sdr/primitives/SmeterBar.tsx",
  "src/components/sdr/overlays/SpotTagOverlay.tsx",
  "src/components/sdr/DevicePicker.tsx",
  "src/components/sdr/Waterfall.tsx",
  "src/components/sdr/skins/flexible/SidebarAccordion.tsx",
  "src/components/sdr/skins/fate/FateAudioMeter.tsx",
  "src/components/sdr/primitives/RadioBadge.tsx",
];

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/sdr/skins/flexible/SlicePanelFilter.tsx",
    match: "flex items-center justify-between text-[9px] text-su-muted font-mono",
    reason:
      "tabular Hz/BW readout under filter presets — decorative mono scale beside tabular values, not standalone body copy.",
  },
  {
    file: "src/components/sdr/primitives/SmeterBar.tsx",
    match: "text-[7px] text-su-muted font-mono -translate-x-1/2",
    reason:
      "S-unit tick labels above the bar — decorative scale markers aligned to tick positions.",
  },
  {
    file: "src/components/sdr/primitives/SmeterBar.tsx",
    match: 'readoutText: "text-[8px]"',
    reason:
      "compact smeter readout in a fixed 44px column — tabular mono pill that overflows at text-xs.",
  },
  {
    file: "src/components/sdr/Waterfall.tsx",
    match:
      "absolute left-2 right-2 bottom-1 pointer-events-none flex justify-between text-[10px] text-su-muted font-mono",
    reason:
      "decorative frequency axis under the waterfall canvas — tabular scale labels, not interactive UI copy.",
  },
  {
    file: "src/components/sdr/skins/fate/FateAudioMeter.tsx",
    match: "text-[8px] font-mono tabular-nums leading-none shrink-0",
    reason:
      "compact dBFS readout in a 28px slot beside the level bar — tabular mono that overflows at text-xs.",
  },
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

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

describe("sub-text-xs sizing stays at the floor in SDR (#808 batch 7 tail)", () => {
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
      `sub-floor sizing in batch-7 tail files:\n${violations.join("\n")}`,
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

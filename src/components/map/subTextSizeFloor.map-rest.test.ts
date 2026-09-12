/**
 * Map sub-text-xs guard — batch 22 rest (#808)
 *
 * Census on `origin/main`: `src/components/map/` holds sub-floor `text-[Npx]`
 * sites (N<12) across files outside hamclock/, ProToolbarRibbon.tsx,
 * WatchPopover.tsx, and layers/SatMatchPanel.tsx (concurrent PRs). This batch
 * raises 85 user-read sites in the 14 HUD/label files below.
 *
 * Skips hamclock/* (#1174), ProToolbarRibbon.tsx, WatchPopover.tsx,
 * layers/SatMatchPanel.tsx (#844), and 3D canvas overlay chrome
 * (NVISOverlay3D, BeaconNetworkOverlay3D, etc.) for follow-up slices.
 * Skips phone / W-D #901.
 *
 * Sibling to `subTextSizeFloor.test.ts` (#1172) — does not edit it.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/map/PinFlyout.tsx",
  "src/components/map/OptimalBandsPanel.tsx",
  "src/components/map/ContestRatePanel.tsx",
  "src/components/map/ReachMapControl.tsx",
  "src/components/map/PathPointCard.tsx",
  "src/components/map/ISSSkyTracker.tsx",
  "src/components/map/SolarSnapshot.tsx",
  "src/components/map/PropagationForecast.tsx",
  "src/components/map/Ft8SpotterHUD.tsx",
  "src/components/map/DXNewsTicker.tsx",
  "src/components/map/ActivationDetailPanel.tsx",
  "src/components/map/RecommendationsPanel.tsx",
  "src/components/map/QuickGridInput.tsx",
  "src/components/map/ProfilePopover.tsx",
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE =
  /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

interface AllowlistEntry {
  file: string;
  match: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [];

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
    if (hasAlternateFloorSize(line)) sites.push({ file, line: index + 1, text: line });
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

describe("sub-text-xs sizing stays at the floor in map (#808 batch 22 rest)", () => {
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
      `sub-floor sizing in batch-22 rest files:\n${violations.join("\n")}`,
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

function hasAlternateFloorSize(line: string): boolean {
  const values = [
    ...line.matchAll(
      /text-\[(?:length:)?([^\]]+)\]|fontSize:\s*["']([^"']+)["']/g,
    ),
  ];
  return values.some((match) => {
    const value = match[1] ?? match[2];
    // A literal rem lower bound remains safe even when the custom value is smaller.
    if (/^max\(0\.75rem, var\(--dx-ticker-(?:font|badge)-size, 0\.75rem\)\)$/.test(value)) return false;
    if (/[a-z][a-z0-9-]*\s*\(/i.test(value)) return true;
    const size = /^(\d*\.?\d+)(px|rem|em|pt)$/.exec(value);
    if (!size) return false;
    const factor = { px: 1, rem: 16, em: 16, pt: 4 / 3 }[size[2]]!;
    return Number(size[1]) * factor <= 12;
  });
}
it("detects equivalent alternate and fixed-floor font sizes", () => {
  for (const token of [
    'fontSize: "var(--dx-ticker-font-size, 11px)"',
    "text-[12px]",
    "text-[.6rem]",
    "text-[9pt]",
    "text-[length:0.7em]",
    "text-[calc(0.75rem-2px)]",
    'fontSize: "0.6rem"',
  ])
    expect(hasAlternateFloorSize(token), token).toBe(true);
  for (const token of [
    'fontSize: "max(0.75rem, var(--dx-ticker-font-size, 0.75rem))"',
    "text-xs",
    "text-[1rem]",
    "text-[#abcdef]",
    "text-[14px]",
  ])
    expect(hasAlternateFloorSize(token), token).toBe(false);
});


it("keeps a pin flyout inside a resized viewport with stale pointer coordinates", async () => {
  const { createElement } = await import("react");
  const { render, act } = await import("@testing-library/react");
  const { PinFlyout } = await import("./PinFlyout");
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 900);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ width: 240, height: 325 } as DOMRect);
  const view = render(createElement(PinFlyout, {
    visible: true, position: { x: 370, y: 880 }, spots: [],
    pin: { id: "fixture", grid: "FN31", lat: 41, lon: -73, createdAt: "2026-09-12T00:00:00Z" },
    onSetTarget: () => {}, onClose: () => {}, onEditPin: () => {},
  }));
  try {
    const flyout = view.getByRole("dialog");
    expect(flyout.style.top).toBe("540px");
    vi.stubGlobal("innerHeight", 600);
    vi.stubGlobal("innerWidth", 300);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(flyout.style.top).toBe("265px");
    expect(flyout.style.left).toBe("50px");
  } finally {
    view.unmount(); measure.mockRestore(); vi.unstubAllGlobals();
  }
});

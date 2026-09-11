/**
 * ObservedActivityChip (#1047, plan tests 26-31).
 *
 * Test 27 is the issue's acceptance criterion made executable: whatever the
 * copy becomes, a covered silence may never be worded as a closed band. The
 * geometry and token guards (29, 30) scan the source so a reverted fix names
 * its own file and line rather than failing somewhere downstream.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservedActivityChip } from "./ObservedActivityChip";
import type { PathActivityRecord } from "@/lib/propagation/radioEvidence/types";
import type { ObservedPathActivity } from "@/hooks/useObservedPathActivity";

const hookMocks = vi.hoisted(() => ({ useObservedPathActivity: vi.fn() }));

vi.mock("@/hooks/useObservedPathActivity", () => hookMocks);
vi.mock("@/hooks/useActiveBandMode", () => ({
  useActiveBand: () => "20m",
}));

const SOURCE_PATH = resolve(
  fileURLToPath(import.meta.url),
  "../ObservedActivityChip.tsx",
);

/**
 * The component's source with comment bodies blanked and line numbers kept.
 *
 * A scanner that reads prose reports the wrong thing: the issue number `#1047`
 * in the header looks exactly like a hex colour, and a comment explaining why
 * a class is forbidden looks exactly like the class. Guards scan code.
 */
function codeLines(): string[] {
  const blanked = readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
  return blanked.split("\n");
}

const BASE = {
  band: "20m",
  txField: "FN",
  rxField: "IO",
  issuedAt: "2026-09-11T18:00:00.000Z",
  windowStartAt: "2026-09-11T12:00:00.000Z",
  intervalSeconds: 21600,
  modeClasses: ["cw", "digital", "phone"] as const,
  aggregationLagSeconds: 0,
  requestedHourCount: 6,
  readableHourCount: 6,
  unreadableSpans: [],
};

const VERIFIED_OPEN: PathActivityRecord = {
  ...BASE,
  state: "verified_open",
  count: 12,
  uniqueTx: 2,
  uniqueRx: 5,
  modeCounts: { cw: 3, digital: 9, phone: 0 },
  backfilledCount: 0,
  backfilledShare: 0,
  fieldAttribution: "direct",
  latestQualifiedHourEnd: "2026-09-11T17:00:00.000Z",
  ageSeconds: 3600,
  ageKind: "report",
  countIsLowerBound: false,
};

const NO_REPORTS: PathActivityRecord = {
  ...BASE,
  state: "no_reports",
  count: 0,
  latestCoveredHourEnd: "2026-09-11T17:00:00.000Z",
  ageSeconds: 3600,
  ageKind: "coverage",
};

function unknownWith(
  reason: PathActivityRecord["state"] extends never
    ? never
    : | "no_receiver_coverage"
      | "aggregate_hour_not_readable"
      | "window_not_aggregated"
      | "aggregate_read_failed",
): PathActivityRecord {
  return { ...BASE, state: "unknown", reason };
}

function mountWith(
  record: PathActivityRecord | null,
  extra: Partial<ObservedPathActivity> = {},
) {
  hookMocks.useObservedPathActivity.mockReturnValue({
    record,
    isLoading: false,
    isError: false,
    issuedAt: BASE.issuedAt,
    ...extra,
  });
  return render(<ObservedActivityChip txGrid="FN31pr" rxGrid="IO91wm" />);
}

afterEach(() => {
  document.documentElement.removeAttribute("data-text-scale");
  vi.clearAllMocks();
});

describe("verified_open", () => {
  it("leads with the state word and the age, count secondary (test 26)", () => {
    mountWith(VERIFIED_OPEN);

    const group = screen.getByRole("group", { name: /observed activity/i });
    expect(within(group).getByText(/heard open/i)).toBeTruthy();
    expect(within(group).getByText(/1 h ago/i)).toBeTruthy();

    const text = group.textContent ?? "";
    // Order, not styling: the verdict is read before the number that supports
    // it, and the number never becomes the label of the region.
    expect(text.indexOf("Heard open")).toBeLessThan(text.indexOf("12"));
    expect(group.getAttribute("aria-label")).toBeNull();
    expect(
      screen.getByRole("group", { name: /observed activity/i }).textContent,
    ).toMatch(/12 reports/);
  });

  it("says in words that a partial window makes the count a floor", () => {
    mountWith({
      ...VERIFIED_OPEN,
      countIsLowerBound: true,
      readableHourCount: 5,
      unreadableSpans: [
        {
          startAt: "2026-09-11T15:00:00.000Z",
          endAt: "2026-09-11T16:00:00.000Z",
        },
      ],
    });

    const group = screen.getByRole("group", { name: /observed activity/i });
    expect(within(group).getByText(/at least 12 reports/i)).toBeTruthy();
    expect(within(group).getByText(/partial window/i)).toBeTruthy();
    expect(group.textContent).not.toMatch(/closed|dead|no propagation/i);
  });

  it("flags a wholly backfilled count instead of dropping it", () => {
    mountWith({
      ...VERIFIED_OPEN,
      backfilledCount: 12,
      backfilledShare: 1,
      fieldAttribution: "callsign_backfill",
    });

    expect(screen.getByText(/grid from callsign/i)).toBeTruthy();
    expect(screen.getByText(/12 reports/)).toBeTruthy();
  });
});

describe("no_reports", () => {
  it("says no reports with a coverage age and never says closed (test 27)", () => {
    mountWith(NO_REPORTS);

    const group = screen.getByRole("group", { name: /observed activity/i });
    expect(within(group).getByText(/no reports/i)).toBeTruthy();
    expect(within(group).getByText(/coverage/i)).toBeTruthy();
    expect(within(group).getByText(/1 h ago/i)).toBeTruthy();
    expect(group.textContent).not.toMatch(/closed|dead|no propagation/i);
  });
});

describe("unknown", () => {
  const cases = [
    ["no_receiver_coverage", /nobody was listening/i],
    ["aggregate_hour_not_readable", /gap/i],
    ["window_not_aggregated", /not aggregated yet/i],
    ["aggregate_read_failed", /could not be read/i],
  ] as const;

  it.each(cases)("explains %s and shows no count (test 28)", (reason, copy) => {
    mountWith(unknownWith(reason));

    const group = screen.getByRole("group", { name: /observed activity/i });
    expect(within(group).getByText(/unknown/i)).toBeTruthy();
    expect(within(group).getByText(copy)).toBeTruthy();
    expect(group.textContent).not.toMatch(/reports?\b.*\d/);
    expect(group.textContent).not.toMatch(/closed|dead|no propagation/i);
  });

  it("renders a waiting word rather than a bare spinner", () => {
    mountWith(null, { isLoading: true });

    expect(screen.getByText(/checking reports/i)).toBeTruthy();
  });
});

describe("text scales and geometry", () => {
  it.each(["sm", "md", "lg", "xl"] as const)(
    "renders every state at text scale %s (test 29)",
    (scale) => {
      document.documentElement.setAttribute("data-text-scale", scale);
      for (const record of [
        VERIFIED_OPEN,
        NO_REPORTS,
        unknownWith("no_receiver_coverage"),
      ]) {
        const view = mountWith(record);
        expect(
          within(
            screen.getAllByRole("group", { name: /observed activity/i })[0],
          ).getByText(/heard open|no reports|unknown/i),
        ).toBeTruthy();
        view.unmount();
      }
    },
  );

  it("pins no geometry in pixels (test 29)", () => {
    const offenders = codeLines().flatMap((line, index) => {
      const patterns = [
        /\b[hw]-\[\d+px\]/,
        /\bmin-[hw]-\[\d+px\]/,
        /\bmax-[hw]-\[\d+px\]/,
        /\btext-\[\d+px\]/,
        /min(?:Height|Width)\s*:/,
      ];
      return patterns.some((pattern) => pattern.test(line))
        ? [`ObservedActivityChip.tsx:${index + 1}: ${line.trim()}`]
        : [];
    });
    expect(offenders).toEqual([]);
  });

  it("paints only through station tokens (test 30)", () => {
    const offenders = codeLines().flatMap((line, index) => {
      const patterns = [
        /\b(?:bg|text|border|ring|fill|stroke|divide)-white\b/,
        /\b(?:bg|text|border|ring|fill|stroke|divide)-(?:gray|slate|zinc|neutral|stone)-\d/,
        /#[0-9a-fA-F]{3,8}\b/,
      ];
      return patterns.some((pattern) => pattern.test(line))
        ? [`ObservedActivityChip.tsx:${index + 1}: ${line.trim()}`]
        : [];
    });
    expect(offenders).toEqual([]);
  });
});

describe("status is never colour alone (test 31)", () => {
  it.each([
    [VERIFIED_OPEN, /heard open/i],
    [NO_REPORTS, /no reports/i],
    [unknownWith("no_receiver_coverage"), /unknown/i],
    [unknownWith("aggregate_hour_not_readable"), /unknown/i],
    [unknownWith("window_not_aggregated"), /unknown/i],
    [unknownWith("aggregate_read_failed"), /unknown/i],
  ])("renders a word for every state", (record, word) => {
    mountWith(record as PathActivityRecord);

    expect(screen.getByText(word)).toBeTruthy();
  });
});

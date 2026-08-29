import { describe, expect, it } from "vitest";
import {
  formatDateRange,
  partitionActive,
  type DxpeditionEntry,
} from "@/hooks/useDxpeditions";

function entry(overrides: Partial<DxpeditionEntry> = {}): DxpeditionEntry {
  return {
    callsign: "3D2AG",
    entity: "Rotuma",
    startDate: "2026-09-03",
    endDate: "2026-09-14",
    bands: "160-6m",
    modes: "CW SSB FT8",
    qslInfo: "LoTW",
    info: "3D2AG Rotuma 160-6m CW SSB FT8",
    source: "NG3K ADXO",
    ...overrides,
  };
}

describe("formatDateRange", () => {
  it("formats a same-month range compactly", () => {
    expect(formatDateRange("2026-09-03", "2026-09-14")).toBe("Sep 3–14");
  });

  it("formats a cross-month range with both month labels", () => {
    expect(formatDateRange("2026-08-28", "2026-09-05")).toBe("Aug 28–Sep 5");
  });

  it("formats a cross-year range with both years", () => {
    expect(formatDateRange("2026-12-30", "2027-01-04")).toBe(
      "Dec 30, 2026–Jan 4, 2027",
    );
  });

  it("formats a single-day operation", () => {
    expect(formatDateRange("2026-09-03", "2026-09-03")).toBe("Sep 3–3");
  });
});

describe("partitionActive", () => {
  it("sorts entries active-now first, preserving relative order within each group", () => {
    const upcoming = entry({ callsign: "UPCOMING", startDate: "2026-09-10", endDate: "2026-09-20" });
    const active = entry({ callsign: "ACTIVE", startDate: "2026-08-30", endDate: "2026-09-10" });
    const past = entry({ callsign: "PAST", startDate: "2026-08-01", endDate: "2026-08-05" });

    const result = partitionActive([upcoming, active, past], "2026-09-05");

    expect(result.map((r) => r.entry.callsign)).toEqual([
      "ACTIVE",
      "UPCOMING",
      "PAST",
    ]);
    expect(result.map((r) => r.isActive)).toEqual([true, false, false]);
  });

  it("treats the start and end dates themselves as active", () => {
    const startsToday = entry({ startDate: "2026-09-05", endDate: "2026-09-10" });
    const endsToday = entry({ startDate: "2026-09-01", endDate: "2026-09-05" });

    const result = partitionActive([startsToday, endsToday], "2026-09-05");

    expect(result.every((r) => r.isActive)).toBe(true);
  });

  it("returns an empty array for empty input", () => {
    expect(partitionActive([], "2026-09-05")).toEqual([]);
  });
});

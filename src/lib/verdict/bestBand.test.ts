import { describe, expect, it } from "vitest";
import type { CanonicalLadderRow } from "@/hooks/useBandLadder";
import { canonicalForBand } from "./bestBand";

const NOW = Date.parse("2026-09-07T12:00:00Z");

function row(overrides: Partial<CanonicalLadderRow> = {}): CanonicalLadderRow {
  return {
    band: "20m",
    scopeType: "regional",
    scopeKey: "NA",
    state: "hot",
    stableSince: new Date(NOW - 60_000).toISOString(),
    surprise: false,
    openedAt: null,
    inputs: {},
    updatedAt: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

function byKey(rows: CanonicalLadderRow[]): Map<string, CanonicalLadderRow> {
  const map = new Map<string, CanonicalLadderRow>();
  for (const r of rows) {
    map.set(`${r.scopeType}|${r.scopeKey}|${r.band}`, r);
  }
  return map;
}

describe("canonicalForBand", () => {
  it("marks a recently-ticked row current, not stale", () => {
    const result = canonicalForBand(
      byKey([row({ updatedAt: new Date(NOW - 60_000).toISOString() })]),
      { type: "regional", continent: "NA" },
      "20m",
      NOW,
    );
    expect(result?.state).toBe("hot");
    expect(result?.stale).toBe(false);
  });

  it("marks a row past the 30-minute gate as stale, without dropping it", () => {
    const result = canonicalForBand(
      byKey([row({ updatedAt: new Date(NOW - 45 * 60_000).toISOString() })]),
      { type: "regional", continent: "NA" },
      "20m",
      NOW,
    );
    expect(result).not.toBeUndefined();
    expect(result?.state).toBe("hot");
    expect(result?.stale).toBe(true);
  });

  it("tolerates a small amount of clock skew ahead of now", () => {
    const result = canonicalForBand(
      byKey([row({ updatedAt: new Date(NOW + 30_000).toISOString() })]),
      { type: "regional", continent: "NA" },
      "20m",
      NOW,
    );
    expect(result?.stale).toBe(false);
  });

  it("treats a timestamp far ahead of now (beyond skew tolerance) as stale", () => {
    const result = canonicalForBand(
      byKey([row({ updatedAt: new Date(NOW + 6 * 60_000).toISOString() })]),
      { type: "regional", continent: "NA" },
      "20m",
      NOW,
    );
    expect(result?.stale).toBe(true);
  });

  it("resolves the global scope key and returns undefined for a DX scope", () => {
    const rows = byKey([
      row({ scopeType: "global", scopeKey: "", band: "40m" }),
    ]);
    expect(
      canonicalForBand(rows, { type: "global", continent: null }, "40m", NOW)
        ?.band,
    ).toBe("40m");
    expect(
      canonicalForBand(rows, { type: "dx", continent: null }, "40m", NOW),
    ).toBeUndefined();
  });

  it("returns undefined when there is no row for the band or no ladder data at all", () => {
    expect(
      canonicalForBand(
        byKey([row({ band: "20m" })]),
        { type: "regional", continent: "NA" },
        "40m",
        NOW,
      ),
    ).toBeUndefined();
    expect(
      canonicalForBand(
        undefined,
        { type: "regional", continent: "NA" },
        "20m",
        NOW,
      ),
    ).toBeUndefined();
  });
});

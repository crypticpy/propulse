import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { canonicalKey } from "@/hooks/useBandLadder";
import type { CanonicalLadderRow } from "@/hooks/useBandLadder";
import { useHomeBandActivity } from "./useHomeBandActivity";

const mocks = vi.hoisted(() => ({
  ladder: vi.fn(),
  activity: vi.fn(),
  location: { lat: 30.3, lon: -97.7, grid: "EM10" } as {
    lat: number;
    lon: number;
    grid: string;
  } | null,
}));

vi.mock("@/hooks/useBandActivity", () => ({
  useBandActivity: (...args: unknown[]) => mocks.activity(...args),
}));
vi.mock("@/hooks/useBandLadder", () => ({
  canonicalKey: (scopeType: string, scopeKey: string, band: string) =>
    `${scopeType}|${scopeKey}|${band}`,
  useBandLadder: () => mocks.ladder(),
}));
vi.mock("./useHomeLocation", () => ({
  useHomeLocation: () => ({ location: mocks.location, guest: false }),
}));

const NOW = Date.parse("2026-09-07T12:00:00Z");

function row(
  band: string,
  scopeType: "global" | "regional",
  scopeKey: string,
  state: string,
  updatedAt = new Date(NOW - 60_000).toISOString(),
): CanonicalLadderRow {
  return {
    band,
    scopeType,
    scopeKey,
    state: state as CanonicalLadderRow["state"],
    stableSince: updatedAt,
    surprise: false,
    openedAt: null,
    inputs: {},
    updatedAt,
  };
}

function ladderData(rows: CanonicalLadderRow[]) {
  return new Map(
    rows.map((entry) => [
      canonicalKey(entry.scopeType, entry.scopeKey, entry.band),
      entry,
    ]),
  );
}

it("reads the verdict for the continent the counts are scoped to", () => {
  mocks.activity.mockReturnValue({ data: undefined, isError: false });
  mocks.ladder.mockReturnValue({
    data: ladderData([
      row("20m", "regional", "NA", "verified"),
      row("20m", "global", "", "hot"),
    ]),
  });
  const { result } = renderHook(() => useHomeBandActivity(NOW));
  expect(result.current.scopeLabel).toBe("Regional · North America");
  expect(result.current.verdictByBand.get("20m")).toBe("verified");
  expect(mocks.activity).toHaveBeenCalledWith(
    { type: "regional", continent: "NA" },
    true,
  );
});

it("falls back to the global row for a band the continent has not scored", () => {
  mocks.activity.mockReturnValue({ data: undefined, isError: false });
  mocks.ladder.mockReturnValue({
    data: ladderData([
      row("20m", "regional", "NA", "verified"),
      row("40m", "global", "", "stirring"),
    ]),
  });
  const { result } = renderHook(() => useHomeBandActivity(NOW));
  expect(result.current.verdictByBand.get("40m")).toBe("stirring");
});

it("drops verdicts whose scored rows have stopped ticking", () => {
  mocks.activity.mockReturnValue({ data: undefined, isError: false });
  mocks.ladder.mockReturnValue({
    data: ladderData([
      row(
        "20m",
        "regional",
        "NA",
        "hot",
        new Date(NOW - 45 * 60_000).toISOString(),
      ),
    ]),
  });
  const { result } = renderHook(() => useHomeBandActivity(NOW));
  expect(result.current.verdictByBand.has("20m")).toBe(false);
});

it("returns no verdicts at all when the ladder feed has not landed", () => {
  mocks.activity.mockReturnValue({ data: undefined, isError: false });
  mocks.ladder.mockReturnValue({ data: undefined });
  const { result } = renderHook(() => useHomeBandActivity(NOW));
  expect(result.current.verdictByBand.size).toBe(0);
});

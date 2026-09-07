import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WSJTXDecode } from "@/stores/wsjtxStore";
import type { LiveSpot } from "@/types/livespot";

const mocks = vi.hoisted(() => ({
  wsjtx: { connected: false, decodes: [] as WSJTXDecode[], status: null },
  displayDensity: 100,
  psk: {
    data: undefined as LiveSpot[] | undefined,
    dataUpdatedAt: 0,
    isError: true,
    isLoading: false,
    refetch: vi.fn(),
  },
  rbn: {
    data: undefined as LiveSpot[] | undefined,
    dataUpdatedAt: 0,
    isError: true,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) =>
    options.queryKey[1] === "pskreporter" ? mocks.psk : mocks.rbn,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: { displayDensity: number }) => unknown) =>
    selector({ displayDensity: mocks.displayDensity }),
}));
vi.mock("@/stores/wsjtxStore", () => ({
  useWSJTXStore: (
    selector: (state: {
      connected: boolean;
      decodes: unknown[];
      status: null;
    }) => unknown,
  ) => selector(mocks.wsjtx),
}));

import { useLiveSpots } from "./useLiveSpots";

function spot(id: string, overrides: Partial<LiveSpot> = {}): LiveSpot {
  return {
    id,
    dx: "SAME1",
    spotter: "N0CALL",
    frequency: 14_074,
    band: "20m",
    mode: "FT8",
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    source: "PSKReporter",
    ...overrides,
  };
}

describe("useLiveSpots feed readiness", () => {
  beforeEach(() => {
    mocks.wsjtx.connected = false; mocks.wsjtx.decodes = [];
    mocks.displayDensity = 100;
    mocks.psk.data = undefined;
    mocks.psk.dataUpdatedAt = 0;
    mocks.psk.isError = true;
    mocks.psk.isLoading = false;
    mocks.rbn.data = undefined;
    mocks.rbn.dataUpdatedAt = 0;
    mocks.rbn.isError = true;
    mocks.rbn.isLoading = false;
  });

  it("does not mark an initially errored feed ready until every requested source succeeds", () => {
    const { result, rerender } = renderHook(() => useLiveSpots());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(result.current.isFeedReady).toBe(false);

    mocks.psk.dataUpdatedAt = 100;
    mocks.psk.isError = false;
    rerender();
    expect(result.current.isFeedReady).toBe(false);

    mocks.rbn.dataUpdatedAt = 200;
    mocks.rbn.isError = false;
    rerender();
    expect(result.current.isFeedReady).toBe(true);
  });

  it("requires success only from requested remote sources", () => {
    mocks.rbn.dataUpdatedAt = 200;
    mocks.rbn.isError = false;

    const { result } = renderHook(() =>
      useLiveSpots({ sources: ["RBN"] }),
    );

    expect(result.current.isFeedReady).toBe(true);
  });

  it("applies profile eligibility before cross-source deduplication", () => {
    mocks.psk.dataUpdatedAt = 100;
    mocks.psk.isError = false;
    mocks.psk.data = [spot("preferred-but-ineligible", { mode: "FT8" })];
    mocks.rbn.dataUpdatedAt = 200;
    mocks.rbn.isError = false;
    mocks.rbn.data = [
      spot("eligible-alternative", {
        mode: "CW",
        source: "RBN",
      }),
    ];

    const { result } = renderHook(() =>
      useLiveSpots({
        spotFilters: { bands: ["20m"], modes: ["CW"] },
      }),
    );

    expect(result.current.spots.map(({ id }) => id)).toEqual([
      "eligible-alternative",
    ]);
  });

  it("retains receiver evidence even when the visual feed deduplicates it", () => {
    mocks.psk.dataUpdatedAt = 100;
    mocks.psk.isError = false;
    mocks.psk.data = [spot("receiver-one")];
    mocks.rbn.dataUpdatedAt = 200;
    mocks.rbn.isError = false;
    mocks.rbn.data = [spot("receiver-two", { source: "RBN" })];

    const { result } = renderHook(() => useLiveSpots());

    expect(result.current.spots).toHaveLength(1);
    expect(result.current.evidenceSpots.map(({ id }) => id)).toEqual([
      "receiver-one",
      "receiver-two",
    ]);
  });

  it("changes feed scope when density changes the effective fetch limit", () => {
    const { result, rerender } = renderHook(() =>
      useLiveSpots({ grid: "EM10aa", sources: ["RBN"] }),
    );
    const initialScope = result.current.feedScopeKey;

    mocks.displayDensity = 200;
    rerender();

    expect(result.current.feedScopeKey).not.toBe(initialScope);
    expect(result.current.feedScopeKey).toContain('"spotLimit":200');
  });

  it("keeps an explicit evidence request budget independent of display density", () => {
    const { result, rerender } = renderHook(() =>
      useLiveSpots({ fetchLimit: 200 }),
    );
    const initialScope = result.current.feedScopeKey;

    mocks.displayDensity = 10;
    rerender();

    expect(result.current.feedScopeKey).toBe(initialScope);
    expect(result.current.feedScopeKey).toContain('"spotLimit":200');
  });
});


it("uses captured RF frequency and status-mode labels without a current status", () => {
  const decode: WSJTXDecode = { isNew: true, time: 50_000, snr: -10, deltaTime: 0.2, deltaFrequency: 1234, mode: "~", message: "CQ N0TEST EM38", lowConfidence: false, receivedAt: Date.now(), callsign: "N0TEST", dialFrequencyHz: 7_074_000, dialMode: "FT8" };
  mocks.wsjtx.connected = true;
  mocks.wsjtx.decodes = [decode, { ...decode, callsign: "N1TEST", dialFrequencyHz: undefined }, { ...decode, callsign: "N2TEST", offAir: true }];
  const { result } = renderHook(() => useLiveSpots({ sources: ["WSJT-X"] }));
  expect(result.current.spots).toHaveLength(1);
  expect(result.current.spots[0]).toMatchObject({ frequency: 7075.234, mode: "FT8", band: "40m" });
});

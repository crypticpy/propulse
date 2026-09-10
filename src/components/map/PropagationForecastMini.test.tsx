import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropagationForecastMini } from "@/components/map/PropagationForecastMini";
import type { NowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import type { PropagationPrediction } from "@/lib/propagation/modelClient";
import type { BandId, UserStation } from "@/types/user";
import type { TargetLocation } from "@/stores/mapStore";

// #809: the NowCast chip row was `flex items-center gap-1.5 mt-1 text-xs
// overflow-hidden` — no `flex-wrap`, every child `flex-shrink-0` — so it
// clipped rather than wrapped once the chips outran the row. `displayBands`
// is user-configurable (Common/All/Custom, `ALL_BANDS_ORDERED` = 8 bands),
// so the chip count moves from 5 to 8 without any code change.
//
// The issue's original claim that this clips at a specific measured width in
// the PropSphere rail is WRONG and was corrected on #809: the Card lands in
// the grid's flexible `1fr` track, not a fixed 220px one. What these tests
// defend is the width-independent property — a flex row of non-shrinking
// children must wrap, not clip.
//
// jsdom has no layout engine, so nothing here can observe an actual clip or
// wrap. The assertion targets the only thing the component controls and a
// jsdom test can see: the row's own class list.

const SIX_BANDS: BandId[] = ["10m", "12m", "15m", "17m", "20m", "30m"];

const STATION: UserStation = {
  callsign: "N0CALL",
  homeLocationId: "home",
  activeLocationId: null,
  savedLocations: [],
  grid: "DM79",
  lat: 39.0,
  lon: -104.9,
};

const TARGET: TargetLocation = {
  lat: 51.5,
  lon: -0.1,
  grid: "IO91",
  name: "London",
};

function buildPrediction(band: string): PropagationPrediction {
  return {
    model_version: "test",
    feature_contract: "test",
    issue_time: "2026-01-01T00:00:00Z",
    valid_time: "2026-01-01T01:00:00Z",
    band,
    mode: "FT8",
    target_grid4: "IO91",
    core_probability: 0.6,
    personalized_probability: 0.6,
    confidence: 0.8,
    ood_flags: [],
    data_freshness: {},
    top_factors: [],
    assumptions: [],
    profile: "nowcast",
  };
}

function buildNowCast(): NowCastBandPredictions {
  const predictions = new Map<string, PropagationPrediction>();
  for (const band of SIX_BANDS) {
    predictions.set(band, buildPrediction(band));
  }
  return {
    enabled: true,
    visible: true,
    available: true,
    personalized: false,
    pending: false,
    capabilityError: null,
    predictions,
    stationEnvelopes: new Map(),
    errors: new Map(),
    requestedCount: SIX_BANDS.length,
    failedCount: 0,
    partial: false,
    fallbackBands: [],
    staleInputBands: [],
    nowcastBands: SIX_BANDS,
  };
}

const mocks = vi.hoisted(() => ({
  nowCast: null as unknown as NowCastBandPredictions,
}));

vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (s: { target: TargetLocation }) => unknown) =>
    selector({ target: TARGET }),
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { station: STATION, updateForecastDisplay: vi.fn() };
    return selector ? selector(state) : state;
  },
  useForecastDisplayPrefs: () => ({
    bandMode: "custom" as const,
    customBands: SIX_BANDS,
    showSnrValues: false,
    detailedFooter: false,
    hoursToShow: 13 as const,
  }),
}));

vi.mock("@/hooks/useActiveBandMode", () => ({
  useActiveBand: () => "20m",
  useActiveMode: () => "FT8",
}));

vi.mock("@/hooks/useActiveStationGain", () => ({
  useForecastStationParams: () => undefined,
}));

vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({
    data: [{ kp_index: 2 }],
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  }),
  useSolarFlux: () => ({
    data: [{ flux: 150 }],
    isLoading: false,
    isError: false,
    dataUpdatedAt: Date.now(),
  }),
  useMagnetometer: () => ({
    data: [{ bz_gsm: 1 }],
    dataUpdatedAt: Date.now(),
  }),
}));

vi.mock("@/hooks/useStationCastContext", () => ({
  useStationCastContext: () => ({}),
}));

vi.mock("@/hooks/useResearchParticipation", () => ({
  useResearchParticipation: () => ({}),
}));

vi.mock("@/hooks/useNowCastBandPredictions", () => ({
  useNowCastBandPredictions: () => mocks.nowCast,
}));

describe("PropagationForecastMini NowCast chip row (#809)", () => {
  beforeEach(() => {
    mocks.nowCast = buildNowCast();
  });

  it("carries flex-wrap and drops overflow-hidden so it wraps instead of clipping", () => {
    render(
      <PropagationForecastMini
        displayTime={new Date("2026-01-01T12:00:00Z")}
        className="h-full"
      />,
    );

    const label = screen.getByText("NowCast");
    const row = label.parentElement;

    expect(row).not.toBeNull();
    expect(row!.className).toContain("flex-wrap");
    expect(row!.className).not.toContain("overflow-hidden");
  });

  // Composition guard, NOT coverage of the fix: this stays green with the
  // `flex-wrap` change reverted, because chip count does not depend on the
  // row's class list. Its job is to prove the fixture actually reaches the
  // chip row with the full configured band set, so the assertion above is
  // reading a real production render and not an empty branch.
  it("composition guard: the fixture renders all six configured bands as chips", () => {
    render(
      <PropagationForecastMini
        displayTime={new Date("2026-01-01T12:00:00Z")}
        className="h-full"
      />,
    );

    const chips = document.querySelectorAll('[title^="NOWCAST MODEL —"]');

    expect(chips.length).toBe(SIX_BANDS.length);
    for (const band of SIX_BANDS) {
      expect(
        Array.from(chips).some((chip) => chip.textContent?.includes(band)),
      ).toBe(true);
    }
  });

  // #936: the standalone NowCast chip row was merged into the footer row
  // that already carries the best-band pill, to reclaim a row of vertical
  // space. This guards against the row split coming back — the NowCast
  // label and the best-band pill must share the same flex-wrap ancestor.
  it("renders the NowCast group inside the same footer row as the best-band pill (#936)", () => {
    render(
      <PropagationForecastMini
        displayTime={new Date("2026-01-01T12:00:00Z")}
        className="h-full"
      />,
    );

    const label = screen.getByText("NowCast");
    const bestBandArrow = screen.getByText("▶");

    const footerRow = label.closest('[class*="flex-wrap"]')?.parentElement;

    expect(footerRow).not.toBeNull();
    expect(footerRow!.className).toContain("flex-wrap");
    expect(footerRow!.contains(bestBandArrow)).toBe(true);
  });
});

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { NowCastBandPanel } from "@/components/propagation/NowCastBandPanel";
import type { NowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import type { PropagationPrediction } from "@/lib/propagation/modelClient";

function buildState(
  overrides: Partial<NowCastBandPredictions>,
): NowCastBandPredictions {
  return {
    enabled: true,
    visible: true,
    available: true,
    personalized: false,
    pending: false,
    capabilityError: null,
    predictions: new Map(),
    stationEnvelopes: new Map(),
    errors: new Map(),
    requestedCount: 0,
    failedCount: 0,
    partial: false,
    fallbackBands: [],
    staleInputBands: [],
    nowcastBands: [],
    ...overrides,
  };
}

const RECONNECTING_MESSAGE =
  "Model service is reconnecting. The established planner remains active.";
const CAPABILITY_OFF_MESSAGE =
  "Model capability unavailable. The established planner remains active.";

describe("NowCastBandPanel capability messaging", () => {
  it("shows the reconnecting notice when the capabilities query itself errored", () => {
    render(
      <NowCastBandPanel
        state={buildState({
          available: false,
          capabilityError: new Error("Missing or invalid authorization header"),
        })}
        bands={["20m"]}
      />,
    );

    expect(screen.getByText(RECONNECTING_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(CAPABILITY_OFF_MESSAGE)).toBeNull();
  });

  it("shows the capability-unavailable notice when the capabilities response reports it off", () => {
    render(
      <NowCastBandPanel
        state={buildState({
          available: false,
          capabilityError: null,
        })}
        bands={["20m"]}
      />,
    );

    expect(screen.getByText(CAPABILITY_OFF_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(RECONNECTING_MESSAGE)).toBeNull();
  });

  it("shows neither notice while the capability is available", () => {
    render(
      <NowCastBandPanel
        state={buildState({ available: true, capabilityError: null })}
        bands={["20m"]}
      />,
    );

    expect(screen.queryByText(RECONNECTING_MESSAGE)).toBeNull();
    expect(screen.queryByText(CAPABILITY_OFF_MESSAGE)).toBeNull();
  });

  it("shows neither notice while pending, even with a capability error queued", () => {
    render(
      <NowCastBandPanel
        state={buildState({
          available: false,
          pending: true,
          capabilityError: new Error("Missing or invalid authorization header"),
        })}
        bands={["20m"]}
      />,
    );

    expect(screen.queryByText(RECONNECTING_MESSAGE)).toBeNull();
    expect(screen.queryByText(CAPABILITY_OFF_MESSAGE)).toBeNull();
  });
});

function buildPrediction(
  dataFreshness: Record<string, number>,
): PropagationPrediction {
  return {
    model_version: "nowcast-test",
    feature_contract: "core-v1",
    issue_time: "2026-09-10T18:00:00Z",
    valid_time: "2026-09-10T18:00:00Z",
    band: "20m",
    mode: "WSPR",
    target_grid4: "IO91",
    core_probability: 0.42,
    personalized_probability: 0.42,
    confidence: 0.8,
    ood_flags: [],
    data_freshness: dataFreshness,
    top_factors: [],
    assumptions: [],
    profile: "nowcast",
  };
}

/** All fast sources fresh, one slow source an hour old. */
const MIXED_FRESHNESS = {
  space_weather: 3_600,
  kp: 300,
  magnetic_field: 420,
  solar_wind: 240,
  dst: 3_600,
  f107: 7_200,
};

function renderFooter(dataFreshness: Record<string, number>, compact: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <NowCastBandPanel
      state={buildState({
        predictions: new Map([["20m", buildPrediction(dataFreshness)]]),
        nowcastBands: ["20m"],
        requestedCount: 1,
      })}
      bands={["20m"]}
      compact={compact}
    />,
    { wrapper },
  );
}

describe("NowCastBandPanel space-weather ages", () => {
  it("names the freshest fast source on the wall, not the hourly aggregate", () => {
    renderFooter(MIXED_FRESHNESS, true);

    expect(screen.getByText("Solar wind 4m old")).toBeTruthy();
    expect(screen.queryByText(/Space weather/)).toBeNull();
    expect(screen.queryByText(/Oldest input/)).toBeNull();
    expect(screen.queryByText(/Slow inputs/)).toBeNull();
  });

  it("shows one fast age and one slow age in the report modal", () => {
    renderFooter(MIXED_FRESHNESS, false);

    expect(screen.getByText("Fast inputs: IMF 7m old")).toBeTruthy();
    expect(screen.getByText("Slow inputs: F10.7 2.0h old")).toBeTruthy();
    expect(screen.queryByText(/Space weather/)).toBeNull();
  });

  it("falls back to an honest aggregate label when per-source ages are absent", () => {
    renderFooter({ space_weather: 3_600 }, true);
    expect(screen.getByText("Oldest input 60m old")).toBeTruthy();

    renderFooter({ space_weather: 3_600 }, false);
    expect(screen.getAllByText("Oldest input 60m old")).toHaveLength(2);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NowCastBandPanel } from "@/components/propagation/NowCastBandPanel";
import type { NowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";

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

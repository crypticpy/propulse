import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SolarForecastPanel } from "./SolarForecastPanel";
import type { useSolarModel, SolarResourceView } from "@/hooks/useSolarModel";
import type {
  FlareProbabilityForecast,
  KpPoint,
  SolarFluxForecastProduct,
  SolarFluxOutlookProduct,
} from "@/lib/solar/dataTypes";
import type { SolarWidgetState } from "@/lib/solar/contracts";

vi.mock("@/hooks/useActiveBandMode", () => ({ useActiveMode: () => "CW" }));
vi.mock("@/hooks/useStationCastContext", () => ({
  useStationCastContext: () => ({ location: null, chain: null }),
}));
vi.mock("@/stores/mapStore", () => ({ useMapStore: () => null }));

type Model = ReturnType<typeof useSolarModel>;

function view<T>(sourceId: string, data: T | undefined, state: SolarWidgetState = "fresh"): SolarResourceView<T> {
  return {
    sourceId,
    query: { refetch: async () => ({}) },
    resource: undefined,
    data,
    state,
    refresh: async () => {},
  } as unknown as SolarResourceView<T>;
}

const TODAY = "2026-09-07";

function buildProps({
  kpData,
  predictedKp,
}: {
  kpData: KpPoint[];
  predictedKp: KpPoint[];
}) {
  const resources = {
    kp: view<KpPoint[]>("noaa-k-index", kpData),
    probabilities: view<FlareProbabilityForecast>("noaa-probabilities", undefined),
    forecast: view<SolarFluxForecastProduct>("noaa-flux-forecast", {
      issued_at: `${TODAY}T00:00:00Z`,
      forecast: [{ date: `${TODAY}T00:00:00Z`, predicted_flux: 110, predicted_planetary_a: 8 }],
    }),
    outlook: view<SolarFluxOutlookProduct>("noaa-flux-outlook", undefined),
  } as unknown as Model["resources"];
  const current = { predictedKp } as unknown as Model["current"];
  return { resources, current };
}

const kpPoint = (hour: number, kp: number, kind: KpPoint["kind"]): KpPoint => ({
  time_tag: `${TODAY}T${String(hour).padStart(2, "0")}:00:00Z`,
  kp,
  kind,
  noaa_scale: null,
  a_running: null,
});

describe("SolarForecastPanel three-day cards", () => {
  it("draws today's card from the observed/estimated Kp series, not only the (tomorrow-only) predicted series", () => {
    const { resources, current } = buildProps({
      kpData: [
        kpPoint(0, 2, "observed"),
        kpPoint(3, 3, "observed"),
        // The official predicted series only starts tomorrow, as in production.
        kpPoint(24, 4, "predicted"),
      ],
      predictedKp: [kpPoint(24, 4, "predicted")],
    });
    render(<MemoryRouter><SolarForecastPanel resources={resources} current={current} /></MemoryRouter>);
    expect(screen.queryByText("No Kp forecast intervals available for this UTC day.")).toBeNull();
    const figcaption = screen.getByText("Kp through the UTC day: observed, estimated, and predicted", { selector: "figcaption" });
    const chart = figcaption.closest("figure")?.querySelector("svg");
    expect(chart).toBeTruthy();
    expect(chart?.querySelectorAll("rect")).toHaveLength(2);
  });

  it("still shows the empty-day message when the Kp series has no intervals for that UTC day", () => {
    const { resources, current } = buildProps({ kpData: [], predictedKp: [] });
    render(<MemoryRouter><SolarForecastPanel resources={resources} current={current} /></MemoryRouter>);
    expect(screen.getByText("No Kp forecast intervals available for this UTC day.")).toBeTruthy();
  });
});

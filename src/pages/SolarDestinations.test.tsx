import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProfileStore } from "@/stores/profileStore";
import { useOperatingStore } from "@/stores/operatingStore";
import { useRigStore } from "@/stores/rigStore";
import { DXWizard } from "./DXWizard";
import { BandPlanner } from "./BandPlanner";
import { buildWizardRecommendation } from "@/lib/dxwizard";
import { getEnhancedBandConditions, getForecastForPath } from "@/lib/utils/bands";

const view = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => view.mobile }));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [{ kp_index: 2 }], dataUpdatedAt: Date.now(), refetch: vi.fn() }),
  useSolarFlux: () => ({ data: [{ flux: 150 }], dataUpdatedAt: Date.now(), refetch: vi.fn() }),
  useMagnetometer: () => ({ data: [{ bz_gsm: 2 }], dataUpdatedAt: Date.now(), refetch: vi.fn() }),
}));
vi.mock("@/hooks/useStationCastContext", () => ({ useStationCastContext: () => ({ location: { name: "Field kit", grid: "CM87ss", lat: 37.77, lon: -122.42 }, chain: { name: "Field kit" }, deriveEnvelope: () => null }) }));
vi.mock("@/hooks/useActiveStationGain", () => ({
  useActiveStationGain: () => ({ antennaType: "dipole", txPowerWatts: 50, systemLossDb: 1 }),
  useForecastStationParams: () => ({ txPowerWatts: 50, mode: "FT8", antennaGainDbi: 1 }),
}));
vi.mock("@/hooks/useNowCastBandPredictions", () => ({ useNowCastBandPredictions: () => ({ visible: false }) }));
vi.mock("@/hooks/useResearchParticipation", () => ({ useResearchParticipation: () => ({ state: null }) }));
vi.mock("@/lib/utils/bands", async (original) => ({ ...await original<typeof import("@/lib/utils/bands")>(), getEnhancedBandConditions: vi.fn(() => []), getForecastForPath: vi.fn(() => []) }));

vi.mock("@/lib/dxwizard", async (original) => {
  const actual = await original<typeof import("@/lib/dxwizard")>();
  return { ...actual, buildWizardRecommendation: vi.fn(actual.buildWizardRecommendation) };
});

const handoff = { version: 1, mode: "CW", target: { lat: 35.68, lon: 139.76, name: "Tokyo" }, at: "2026-09-05T12:00:00.000Z" };
function mount(component: React.ReactNode, route: string, context = handoff) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[{ pathname: route, state: { solarHandoff: context } }]}>{component}</MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  useProfileStore.setState({ station: { callsign: "W1TEST", grid: "FN31pr", lat: 41.5, lon: -72.5 } as NonNullable<ReturnType<typeof useProfileStore.getState>["station"]> });
  useOperatingStore.setState({ activeMode: "FT8", manualMode: "FT8", contestLocked: false, contestSessionId: null, _contestBand: null, _contestMode: null, _catConnected: false, _wsjtxConnected: false });
  useRigStore.setState({ pendingMode: null, pendingFrequency: null });
});
for (const mobile of [false, true]) {
  describe(mobile ? "mobile receiving pages" : "desktop receiving pages", () => {
    it("hydrates exact target, active station, mode and time in DX analysis", () => {
      view.mobile = mobile;
      mount(<DXWizard />, "/dx");
      const call = vi.mocked(getEnhancedBandConditions).mock.calls.at(-1)!;
      expect(call.slice(0, 4)).toEqual([37.77, -122.42, 35.68, 139.76]);
      expect(call[6]?.toISOString()).toBe(handoff.at);
      expect(call[8]).toBe("CW");
      expect(vi.mocked(buildWizardRecommendation).mock.calls.at(-1)![0].congestionContext?.currentHourUtc).toBe(12);
      expect(screen.getByDisplayValue("PM95vq")).not.toBeNull();
      expect(useRigStore.getState()).toMatchObject({ pendingFrequency: null, pendingMode: null });
    });
    it.each(["FT4", "RTTY"])("preserves %s in the wizard UI and recommendation inputs", (mode) => {
      view.mobile = mobile;
      mount(<DXWizard />, "/dx", { ...handoff, mode });
      expect(vi.mocked(buildWizardRecommendation).mock.calls.at(-1)![0].mode).toBe(mode);
      expect(screen.queryByText(/modeled with FT8 sensitivity/)).toBeNull();
    });
    it.each(["CAT", "WSJT-X", "contest"])("retains editable planning intent with %s precedence", (source) => {
      view.mobile = mobile;
      useOperatingStore.setState({ activeMode: "SSB", manualMode: "SSB", catOverridden: false });
      const operating = useOperatingStore.getState();
      if (source === "CAT") operating.updateFromCAT("20m", "SSB", 14_150_000);
      else if (source === "WSJT-X") operating.updateFromWSJTX("20m", "SSB", 14_150_000);
      else {
        operating.setContestSession("solar-handoff-test");
        operating.updateFromContest("20m", "SSB");
        operating.setContestLocked(true);
      }
      mount(<BandPlanner />, "/planner");
      expect(vi.mocked(getForecastForPath).mock.calls.at(-1)![7]?.mode).toBe("CW");
      const select = screen.getByRole("combobox", { name: "Planning mode" });
      expect((select as HTMLSelectElement).value).toBe("CW");
      fireEvent.change(select, { target: { value: "FT8" } });
      expect(vi.mocked(getForecastForPath).mock.calls.at(-1)![7]?.mode).toBe("FT8");
      expect(useOperatingStore.getState()).toMatchObject({ activeMode: "SSB", manualMode: "SSB", catOverridden: false });
      expect(useRigStore.getState()).toMatchObject({ pendingMode: null, pendingFrequency: null });
    });
    it("hydrates the selected UTC day and mode into the planner computation", () => {
      view.mobile = mobile;
      mount(<BandPlanner />, "/planner");
      const call = vi.mocked(getForecastForPath).mock.calls.at(-1)!;
      expect(call.slice(0, 4)).toEqual([37.77, -122.42, 35.68, 139.76]);
      expect(call[6]?.toISOString()).toBe(handoff.at);
      expect(call[7]?.mode).toBe("CW");
      expect(screen.getByDisplayValue("PM95vq")).not.toBeNull();
      expect(screen.getByText(/Planning.*current solar inputs/)).not.toBeNull();
      act(() => useOperatingStore.getState().setManualMode("SSB"));
      const updated = vi.mocked(getForecastForPath).mock.calls.at(-1)!;
      expect(updated[7]?.mode).toBe("SSB");
      expect(updated[6]?.toISOString()).toBe(handoff.at);
      expect(useRigStore.getState()).toMatchObject({ pendingFrequency: null, pendingMode: null });
    });
  });
}

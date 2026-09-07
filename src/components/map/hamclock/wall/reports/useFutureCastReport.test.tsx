import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import fixture from "../../../../../../ml/fixtures/propagation_capabilities_v1.json";
import type { PathPredictionRequest } from "@/lib/propagation/modelClient";
import { useFutureCastReport } from "./useFutureCastReport";
const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), path: vi.fn() }));
vi.mock("@/lib/propagation/modelClient", async original => ({
  ...await original<typeof import("@/lib/propagation/modelClient")>(),
  propagationModelEnabled: true, propagationModelMode: "released", propagationModelClient: mocks,
}));
const input = { origin: { grid: "EM38", lat: 38.5, lon: -93 }, target: { grid: "PM95", lat: 35.68, lon: 139.65 }, mode: "FT8", deriveEnvelope: () => null };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, ...renderHook(() => useFutureCastReport(input), { wrapper }) };
}
const allowed = () => ({ ...fixture, service_execution_enabled: true, model_loaded: true, runtime_activation_valid: true,
  modes: { ...fixture.modes, core_nowcast: { internal_available: true, released_eligible: true }, futurecast: { internal_available: true, released_eligible: true, released_horizons_hours: [3, 6] } } });
beforeEach(() => {
  mocks.capabilities.mockReset(); mocks.path.mockReset();
  mocks.path.mockImplementation(async (request: PathPredictionRequest) => ({
    model_version: "fixture", feature_contract: "fixture", profile: "nowcast", issue_time: request.issue_time,
    valid_time: request.valid_time, band: request.band, mode: request.mode, target_grid4: request.features.target_grid4,
    core_probability: 0.7, personalized_probability: 0.8, confidence: 0.9, ood_flags: [], top_factors: ["solar_flux"], assumptions: [], data_freshness: {},
  }));
});
it("requests only released horizons and removes cached evidence when capability is revoked", async () => {
  mocks.capabilities.mockResolvedValue(allowed());
  const hook = setup();
  await waitFor(() => expect(hook.result.current.evidence.get("20m:3")?.prediction).toBeTruthy());
  expect(mocks.path).toHaveBeenCalledTimes(12);
  expect(hook.result.current.active).toEqual([3, 6]);
  act(() => hook.client.setQueryData(["propagation-v4", "capabilities"], { ...allowed(), runtime_activation_valid: false }));
  await waitFor(() => expect(hook.result.current.active).toEqual([]));
  expect(hook.result.current.evidence.size).toBe(0);
  hook.unmount(); hook.client.clear();
});
it("does not request a horizon when the core prerequisite is unavailable", async () => {
  mocks.capabilities.mockResolvedValue({ ...allowed(), modes: { ...allowed().modes, core_nowcast: { internal_available: false, released_eligible: false } } });
  const hook = setup();
  await waitFor(() => expect(hook.result.current.offReason).toBe("CORE MODEL CAPABILITY UNAVAILABLE"));
  expect(hook.result.current.active).toEqual([]); expect(mocks.path).not.toHaveBeenCalled();
  hook.unmount(); hook.client.clear();
});

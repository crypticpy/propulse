import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

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

import { useMapStore } from "@/stores/mapStore";
import { useOperatingStore } from "@/stores/operatingStore";
import { useRigStore } from "@/stores/rigStore";
import { applySolarMapHandoff, useApplySolarMapHandoff } from "./useSolarHandoff";

function MapReceiver() {
  useApplySolarMapHandoff();
  return null;
}

beforeEach(() => {
  useOperatingStore.setState({ contestLocked: false, _catConnected: false, _wsjtxConnected: false, contestSessionId: null });
  useRigStore.setState({ pendingFrequency: null, pendingMode: null });
});
describe("map receiving-side handoff", () => {
  it("consumes each history entry while preserving edits across responsive remounts", async () => {
    const handoff = { version: 1, mode: "CW", at: "2026-09-05T12:00:00.000Z" };
    let location: ReturnType<typeof useLocation>;
    let navigate: ReturnType<typeof useNavigate>;
    function LocationProbe() {
      location = useLocation();
      navigate = useNavigate();
      return null;
    }
    const tree = (layout: string) => (
      <MemoryRouter initialEntries={[{ pathname: "/map", search: "?v=g", hash: "#path", state: { solarHandoff: handoff, unrelated: "keep" } }]}>
        <LocationProbe />
        <MapReceiver key={layout} />
      </MemoryRouter>
    );
    const view = render(tree("desktop"));
    await waitFor(() => expect(location.state).toEqual({ unrelated: "keep" }));
    expect(location!).toMatchObject({ pathname: "/map", search: "?v=g", hash: "#path" });
    expect(useOperatingStore.getState().activeMode).toBe("CW");
    const target = { lat: 51.5, lon: -0.12, grid: "IO91wm", name: "London" };
    act(() => {
      useMapStore.getState().setTarget(target);
      useMapStore.getState().setAbsoluteTime("2026-09-06T18:00:00.000Z");
      useOperatingStore.getState().setManualMode("FT8");
    });
    view.rerender(tree("mobile"));
    expect(useMapStore.getState()).toMatchObject({ target, absoluteTime: "2026-09-06T18:00:00.000Z" });
    expect(useOperatingStore.getState().activeMode).toBe("FT8");
    act(() => navigate("/map", { state: { solarHandoff: handoff } }));
    await waitFor(() => expect(location.state).toEqual({}));
    expect(useOperatingStore.getState().activeMode).toBe("CW");
    expect(useMapStore.getState().absoluteTime).toBe(handoff.at);
    expect(useRigStore.getState()).toMatchObject({ pendingFrequency: null, pendingMode: null });
    view.unmount();
  });
  it("hydrates target, mode and time while retaining map presentation and radio state", () => {
    useMapStore.setState({ viewMode: "azimuthal", layoutMode: "hamclock", timeOffset: 6 });
    const layers = useMapStore.getState().layers;
    const target = { lat: 35.68, lon: 139.76, grid: "PM95vq", name: "Tokyo" };
    const at = "2026-09-05T12:00:00.000Z";
    applySolarMapHandoff({ version: 1, mode: "CW", target, at });
    expect(useMapStore.getState()).toMatchObject({ viewMode: "azimuthal", layoutMode: "hamclock", target, absoluteTime: at });
    expect(useMapStore.getState().layers).toBe(layers);
    expect(useOperatingStore.getState().activeMode).toBe("CW");
    expect(useRigStore.getState()).toMatchObject({ pendingFrequency: null, pendingMode: null });
  });
  it("a live handoff clears a past map simulation without inventing a target", () => {
    useMapStore.setState({ target: null, absoluteTime: "2026-09-01T00:00:00Z", timeOffset: 4 });
    applySolarMapHandoff({ version: 1, mode: "FT8" });
    expect(useMapStore.getState()).toMatchObject({ target: null, timeOffset: 0, absoluteTime: null });
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockView } from "./HamClockView";

const { mapState, hamclockState, setViewMode, setActivePreset } = vi.hoisted(
  () => {
    const setViewMode = vi.fn();
    const setActivePreset = vi.fn();
    const mapState = {
      layoutMode: "hamclock",
      setLayoutMode: vi.fn(),
      viewMode: "flat" as "flat" | "globe" | "azimuthal",
      setViewMode,
      activePresetId: null as string | null,
      setActivePreset,
      target: null,
      layers: {
      muf: false,
      aurora: false,
      drap: false,
      weather: false,
      radar: false,
      goesCloud: false,
      ducting: false,
      sporadicE: false,
      greyline: false,
      issTracker: false,
    },
    toggleLayer: vi.fn(),
    spotFilters: { bands: [] as string[] },
    setSpotFilters: vi.fn(),
  };
  const hamclockState = {
    hamclockMode: "traffic",
    setFiltersBeforeBands: vi.fn(),
    bandFocus: [] as string[],
    filtersBeforeBands: null,
    preferredViewMode: "flat" as "flat" | "globe" | "azimuthal",
  };
    return { mapState, hamclockState, setViewMode, setActivePreset };
  },
);

vi.mock("@/stores/mapStore", () => ({
  useMapStore: Object.assign(
    (selector: (state: typeof mapState) => unknown) => selector(mapState),
    {
      getState: () => mapState,
      setState: vi.fn(),
    },
  ),
}));

vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: Object.assign(
    (selector: (state: typeof hamclockState) => unknown) =>
      selector(hamclockState),
    {
      getState: () => hamclockState,
    },
  ),
}));

vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: () => null }));

vi.mock("./FlatMapView", () => ({ FlatMapView: () => <div>Flat map</div> }));
vi.mock("./GlobeView", () => ({ GlobeView: () => <div>Globe map</div> }));
vi.mock("./AzimuthalView", () => ({
  AzimuthalView: () => <div>Azimuthal map</div>,
}));
vi.mock("@/components/map/WatchStatusPill", () => ({
  WatchStatusPill: () => <div />,
}));
vi.mock("./hamclock/wall/HamClockWall", () => ({
  // The wall shell's own tests (`HamClockWall.test.tsx`) cover its internals
  // (tiles, rails, header controls); here we only need to prove the shared
  // settings dialog's state and mount survive a density flip, and that both
  // densities hand the same map stage to the one shell (wall spec §3/§15,
  // HW-24/HW-25) instead of each density building its own tree.
  HamClockWall: ({
    onOpenSettings,
    children,
  }: {
    onOpenSettings: () => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="wall-shell">
      {children}
      <button onClick={onOpenSettings}>Open settings</button>
    </div>
  ),
}));

describe("HamClockView", () => {
  beforeEach(() => {
    setViewMode.mockReset();
    setViewMode.mockImplementation((mode: typeof mapState.viewMode) => {
      mapState.viewMode = mode;
      mapState.activePresetId = null;
    });
    setActivePreset.mockReset();
    setActivePreset.mockImplementation((id: string) => {
      mapState.activePresetId = id;
    });
    mapState.viewMode = "flat";
    mapState.activePresetId = null;
    mapState.layers = {
      muf: false,
      aurora: false,
      drap: false,
      weather: false,
      radar: false,
      goesCloud: false,
      ducting: false,
      sporadicE: false,
      greyline: false,
      issTracker: false,
    };
    hamclockState.preferredViewMode = "flat";
    hamclockState.hamclockMode = "traffic";
  });

  it("renders the same wall shell and map stage at both densities", () => {
    for (const density of ["wall", "desk"] as const) {
      useHamClockDisplayStore.getState().setDensity(density);
      const { unmount } = render(
        <MemoryRouter initialEntries={["/map"]}>
          <HamClockView displayTime={new Date(0)} />
        </MemoryRouter>,
      );

      expect(screen.getByTestId("wall-shell")).not.toBeNull();
      expect(screen.getByText("Flat map")).not.toBeNull();
      unmount();
    }
  });

  it("does not reopen the settings dialog after it was closed, across a density flip (single shared state, B5 fix)", () => {
    // Regression for the bug where wall and desk each owned their own
    // `settingsOpen` state and their own `HamClockSettingsDialog` mount:
    // opening settings at desk, flipping to wall, closing there, then
    // flipping back to desk resurrected the stale `true` desk state and
    // reopened the dialog uninvited.
    useHamClockDisplayStore.getState().setDensity("desk");
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("dialog")).not.toBeNull();

    // Flip to wall density while the dialog is open — the one shared state
    // means the dialog keeps rendering through the flip instead of
    // vanishing into an unrelated, freshly-mounted local state.
    act(() => {
      useHamClockDisplayStore.getState().setDensity("wall");
    });
    expect(screen.getByRole("dialog")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // Flip back to desk: the dialog must stay closed, not resurrect a stale
    // `true` from an abandoned per-branch state.
    act(() => {
      useHamClockDisplayStore.getState().setDensity("desk");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches off a flat wall and explains when DRAP cannot draw", () => {
    mapState.layers = { ...mapState.layers, drap: true };
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    expect(setViewMode).toHaveBeenCalledWith("globe");
    const chip = screen.getByRole("status");
    expect(chip.className).toContain("hc-chip");
    expect(chip.textContent).toBe(
      "Switched to 3D globe because the flat map cannot draw D-RAP Absorption",
    );
  });

  it("keeps a user-chosen flat wall when radar can drape", () => {
    mapState.layers = { ...mapState.layers, radar: true };
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    expect(setViewMode).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not show a chip when the preferred projection already draws the set", () => {
    hamclockState.preferredViewMode = "globe";
    mapState.viewMode = "globe";
    mapState.layers = { ...mapState.layers, drap: true };
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    expect(setViewMode).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not flip a flat Satellites wall just because ISS is on", () => {
    mapState.layers = { ...mapState.layers, issTracker: true };
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).not.toHaveBeenCalled();
  });

  it("does not yank azimuthal off wall defaults like greyline and MUF", () => {
    hamclockState.preferredViewMode = "azimuthal";
    mapState.viewMode = "azimuthal";
    mapState.layers = {
      ...mapState.layers,
      greyline: true,
      muf: true,
    };
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    expect(setViewMode).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not clobber an external viewMode when nothing is blocking", () => {
    hamclockState.preferredViewMode = "globe";
    mapState.viewMode = "flat";
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).not.toHaveBeenCalled();
  });

  it("restores the pre-switch projection when DRAP turns off", () => {
    mapState.layers = { ...mapState.layers, drap: true };
    const { rerender } = render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).toHaveBeenCalledWith("globe");
    setViewMode.mockClear();

    mapState.layers = { ...mapState.layers, drap: false };
    rerender(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).toHaveBeenCalledWith("flat");
  });

  it("does not thrash viewMode across rerenders when nothing is blocking", () => {
    hamclockState.preferredViewMode = "globe";
    mapState.viewMode = "flat";
    const ui = (
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>
    );
    const { rerender } = render(ui);
    rerender(ui);
    rerender(ui);
    expect(setViewMode).not.toHaveBeenCalled();
  });

  it("yields to a settings projection change while forced and does not restore a stale stash", () => {
    mapState.layers = { ...mapState.layers, drap: true };
    const { rerender } = render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).toHaveBeenCalledWith("globe");
    setViewMode.mockClear();

    hamclockState.preferredViewMode = "azimuthal";
    mapState.viewMode = "azimuthal";
    rerender(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(1)} />
      </MemoryRouter>,
    );
    expect(setViewMode).not.toHaveBeenCalled();

    mapState.layers = { ...mapState.layers, drap: false };
    rerender(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(2)} />
      </MemoryRouter>,
    );
    expect(setViewMode).not.toHaveBeenCalled();
    expect(mapState.viewMode).toBe("azimuthal");
  });

  it("yields to an external flat escape while a hero-critical layer is still on", () => {
    mapState.layers = { ...mapState.layers, drap: true };
    const { rerender } = render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).toHaveBeenCalledWith("globe");
    setViewMode.mockClear();

    mapState.viewMode = "flat";
    rerender(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(1)} />
      </MemoryRouter>,
    );
    expect(setViewMode).not.toHaveBeenCalled();
    expect(mapState.viewMode).toBe("flat");
  });

  it("reapplies the captured region preset when the force is released", () => {
    mapState.activePresetId = "kiosk-scene";
    mapState.layers = { ...mapState.layers, drap: true };
    const { rerender } = render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).toHaveBeenCalledWith("globe");
    expect(mapState.activePresetId).toBeNull();
    setViewMode.mockClear();
    setActivePreset.mockClear();

    mapState.layers = { ...mapState.layers, drap: false };
    rerender(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(1)} />
      </MemoryRouter>,
    );
    expect(setViewMode).toHaveBeenCalledWith("flat");
    expect(setActivePreset).toHaveBeenCalledWith("kiosk-scene");
    expect(mapState.activePresetId).toBe("kiosk-scene");
  });

  it("restores preferred projection on unmount while still forced", () => {
    mapState.layers = { ...mapState.layers, drap: true };
    const { unmount } = render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );
    expect(setViewMode).toHaveBeenCalledWith("globe");
    setViewMode.mockClear();
    unmount();
    expect(setViewMode).toHaveBeenCalledWith("flat");
    expect(mapState.viewMode).toBe("flat");
  });
});

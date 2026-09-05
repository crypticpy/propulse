import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockView } from "./HamClockView";

vi.mock("@/stores/mapStore", () => ({
  useMapStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        layoutMode: "hamclock",
        setLayoutMode: vi.fn(),
        viewMode: "flat",
        setViewMode: vi.fn(),
        target: null,
        layers: {
          muf: false,
          aurora: false,
          drap: false,
          weather: false,
        },
        toggleLayer: vi.fn(),
        spotFilters: { bands: [] },
        setSpotFilters: vi.fn(),
      }),
    {
      getState: () => ({
        setLayoutMode: vi.fn(),
        layers: {
          muf: false,
          aurora: false,
          drap: false,
          weather: false,
        },
        spotFilters: { bands: [] },
        setSpotFilters: vi.fn(),
      }),
      setState: vi.fn(),
    },
  ),
}));

vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        hamclockMode: "traffic",
        setFiltersBeforeBands: vi.fn(),
        bandFocus: [],
        filtersBeforeBands: null,
      }),
    {
      getState: () => ({
        hamclockMode: "traffic",
        bandFocus: [],
        filtersBeforeBands: null,
      }),
    },
  ),
}));

vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: () => null }));

vi.mock("./FlatMapView", () => ({ FlatMapView: () => <div>Flat map</div> }));
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
});

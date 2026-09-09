import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { useViewFollowRadioControl } from "@/hooks/useHamClockRadioFollow";
import {
  useViewEffectiveSpots,
  useViewSpotFilterPatch,
} from "@/hooks/useViewClusterSpots";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { createViewConfiguration } from "@/lib/views/defaults";
import { createMemoryWorkingStorage, type ScopedViewRuntime } from "@/lib/views/runtime";
import { KioskTab } from "./KioskTab";

vi.mock("@/hooks/useOperatingMonitor", () => ({ useOperatingMonitor: vi.fn() }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// Exposes the bound runtime's `config.context.followRadio` — the field
// `useViewEffectiveSpots` reads — so tests can assert the toggle actually
// drives the view runtime, not a legacy store nothing reads any more.
function FollowRadioProbe() {
  const { followRadio } = useViewFollowRadioControl();
  return <div data-testid="follow-radio-state">{String(followRadio)}</div>;
}

// Exposes the effective (radio-overlaid when following) band set — the same
// read `HamClockSpotsSidebar`'s band chips used before that component lost
// its production render site (SP-09 round 3 N1). KioskTab has no band-chip
// control of its own, so this probe plus `patchBands` below stand in for
// one, driving the same `useViewSpotFilterPatch` a chip would call.
let capturedRuntime: ScopedViewRuntime | null = null;
function EffectiveBandsProbe() {
  capturedRuntime = useViewRuntime();
  const effective = useViewEffectiveSpots();
  const patchBands = useViewSpotFilterPatch();
  const { setFollowRadio } = useViewFollowRadioControl();
  return (
    <div>
      <div data-testid="effective-bands">
        {effective.filters.bands.join(",") || "none"}
      </div>
      <button
        type="button"
        onClick={() => {
          // Mirrors HamClockSpotsSidebar's handleToggleBand: start from the
          // effective (radio-overlaid) band set, add one band, then clear
          // follow so the manual choice sticks.
          const next = [...effective.filters.bands, "20m"];
          setFollowRadio(false);
          patchBands({ bands: next });
        }}
      >
        Add 20m band
      </button>
    </div>
  );
}

function renderTab({ followRadioSeed = false, withBandsProbe = false } = {}) {
  const seed = createViewConfiguration("hamclock");
  seed.context.followRadio = followRadioSeed;
  return render(
    <MemoryRouter initialEntries={["/map"]}>
      <ViewProvider ownerId="test-owner" slot="hamclock" seed={seed} storage={createMemoryWorkingStorage()}>
        <KioskTab />
        <FollowRadioProbe />
        {withBandsProbe && <EffectiveBandsProbe />}
      </ViewProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("KioskTab", () => {
  beforeEach(() => {
    capturedRuntime = null;
    useKioskStore.setState({ active: false, activeSceneId: null });
    useHamClockDisplayStore.getState().resetDisplay();
    vi.mocked(useOperatingMonitor).mockReturnValue(null);
    localStorage.clear();
    useOperatingStateStore.setState({ followScreens: true });
    useOperatingStateStore.getState().reset();
  });

  it("reads and writes the shared 'Follow my other screens' switch (#712)", () => {
    renderTab();
    const toggle = screen.getByRole("switch", { name: "Follow my other screens" });
    expect(toggle.textContent).toBe("ON");

    fireEvent.click(toggle);
    expect(useOperatingStateStore.getState().followScreens).toBe(false);
    expect(toggle.textContent).toBe("OFF");
  });

  it("says no scene is pinning the wall when kiosk mode is inactive", () => {
    renderTab();
    expect(
      screen.getByText("No kiosk scene is pinning the wall."),
    ).toBeTruthy();
  });

  it("says no scene is pinning the wall when the active scene is not the hamclock layout", () => {
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [{ id: "s1", name: "Globe", route: "/map", map: { layoutMode: "normal" } }],
    });
    renderTab();
    expect(
      screen.getByText("No kiosk scene is pinning the wall."),
    ).toBeTruthy();
  });

  it("says no scene is pinning the wall when kiosk playback is stopped, even with a resumable activeSceneId", () => {
    // stop() intentionally keeps activeSceneId around so playback can resume
    // — that must not read as "pinning the wall" while stopped.
    useKioskStore.setState({
      active: false,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Wall demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "spots" },
          },
        },
      ],
    });
    renderTab();
    expect(
      screen.getByText("No kiosk scene is pinning the wall."),
    ).toBeTruthy();
  });

  it("summarizes the pinned page when the active scene pins HamClock to one page", () => {
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Wall demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "spots" },
          },
        },
      ],
    });
    renderTab();
    expect(
      screen.getByText('"Wall demo" pins the wall to Spots & Activity.'),
    ).toBeTruthy();
  });

  it("summarizes both pages when the two rails are pinned differently", () => {
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Split demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "solar" },
          },
        },
      ],
    });
    renderTab();
    expect(
      screen.getByText(
        '"Split demo" pins the wall to Spots & Activity (left) / Solar & Space Wx (right).',
      ),
    ).toBeTruthy();
  });

  it("navigates to /kiosk from OPEN KIOSK EDITOR", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "OPEN KIOSK EDITOR" }));
    expect(screen.getByTestId("location").textContent).toBe("/kiosk");
  });

  it("stops kiosk playback before opening the editor, so its rotation timer can't navigate away mid-edit", () => {
    const stop = vi.fn(() => useKioskStore.setState({ active: false }));
    useKioskStore.setState({
      active: true,
      activeSceneId: "s1",
      scenes: [
        {
          id: "s1",
          name: "Wall demo",
          route: "/map",
          map: {
            layoutMode: "hamclock",
            hamclock: { leftPage: "spots", rightPage: "spots" },
          },
        },
      ],
      stop,
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "OPEN KIOSK EDITOR" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location").textContent).toBe("/kiosk");
  });

  it("does not call stop when kiosk playback was already inactive", () => {
    const stop = vi.fn();
    useKioskStore.setState({ active: false, activeSceneId: null, stop });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "OPEN KIOSK EDITOR" }));
    expect(stop).not.toHaveBeenCalled();
  });

  it("keeps Follow radio off and disabled with no live radio", () => {
    renderTab();
    const toggle = screen.getByRole("switch", { name: "Follow radio" });
    expect(toggle.textContent).toBe("OFF");
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Needs a live CAT or WSJT-X radio")).toBeTruthy();
  });

  it("turns Follow radio on when a live radio is present", () => {
    vi.mocked(useOperatingMonitor).mockReturnValue({
      sender: "test",
      band: "20m",
      mode: "FT8",
      frequency: 14.074,
      live: true,
      receivedAt: Date.now(),
    });
    renderTab();
    const toggle = screen.getByRole("switch", { name: "Follow radio" });
    expect(screen.getByText("Locks spots to 20m FT8")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByTestId("follow-radio-state").textContent).toBe("true");
    expect(toggle.textContent).toBe("ON");
  });

  it("lets the operator turn Follow radio off after the radio drops", () => {
    renderTab({ followRadioSeed: true });
    const toggle = screen.getByRole("switch", { name: "Follow radio" });
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Paused · no live radio")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByTestId("follow-radio-state").textContent).toBe("false");
  });

  // Moved from HamClockSpotsSidebar.test.tsx (SP-09 round 3 N1):
  // HamClockSpotsSidebar has had no production render site since 85648e06c,
  // but its test file was the repo's only coverage of
  // `useViewFollowRadioControl`'s read/write round trip against the field
  // renderers actually read (`useViewEffectiveSpots`). KioskTab's Follow
  // radio toggle is the live production control for that same runtime field.
  it("drives the effective spot set from the 'Follow radio' toggle, not hamclockDisplayStore", () => {
    vi.mocked(useOperatingMonitor).mockReturnValue({
      sender: "test",
      band: "17m",
      mode: "FT8",
      frequency: 18.1,
      live: true,
      receivedAt: Date.now(),
    });
    renderTab({ withBandsProbe: true });
    const toggle = screen.getByRole("switch", { name: "Follow radio" });

    // Off by default: the runtime's own configured (empty) band filter is
    // what reaches the renderers, not the live radio's band.
    expect(capturedRuntime!.getSnapshot().config.context.followRadio).toBe(false);
    expect(screen.getByTestId("effective-bands").textContent).toBe("none");

    fireEvent.click(toggle);

    expect(capturedRuntime!.getSnapshot().config.context.followRadio).toBe(true);
    expect(screen.getByTestId("effective-bands").textContent).toBe("17m");
  });

  // Moved from HamClockSpotsSidebar.test.tsx (SP-09 round 3 N1), adapted to
  // KioskTab's actual surface: KioskTab has no band-chip control of its own
  // (that UI lives only in the dead sidebar, left untouched), so this drives
  // the same `useViewSpotFilterPatch`/`useViewFollowRadioControl` pair a chip
  // would call, via `EffectiveBandsProbe`'s "Add 20m band" button, to prove
  // the underlying rule survives: a manual band edit starts from the
  // *effective* (radio-overlaid) band set and clears follow radio.
  it("patches the view's own band filter starting from the radio-overlaid band set, clearing follow radio", () => {
    vi.mocked(useOperatingMonitor).mockReturnValue({
      sender: "test",
      band: "17m",
      mode: "FT8",
      frequency: 18.1,
      live: true,
      receivedAt: Date.now(),
    });
    renderTab({ withBandsProbe: true });
    fireEvent.click(screen.getByRole("switch", { name: "Follow radio" }));
    expect(capturedRuntime!.getSnapshot().config.context.followRadio).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add 20m band" }));

    expect(capturedRuntime!.getSnapshot().config.context.followRadio).toBe(false);
    expect(capturedRuntime!.getSnapshot().config.spots.filters.bands).toEqual([
      "17m",
      "20m",
    ]);
    expect(screen.getByTestId("effective-bands").textContent).toBe("17m,20m");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import type { SatelliteInfoExtended } from "@/types/satellite";
import SatelliteDetailModal from "./SatelliteDetailModal";

// SatelliteLogButton (rendered inside SatelliteDetailContent) calls
// useNavigate(), so every render needs a router in the tree.
function renderModal() {
  return render(
    <MemoryRouter>
      <SatelliteDetailModal />
    </MemoryRouter>,
  );
}

const { useSatellitesMock } = vi.hoisted(() => ({
  useSatellitesMock: vi.fn(),
}));

// The only hooks in this tree that fetch: useSatellites (TanStack Query TLE
// fetch + a 5s position timer) and useSatelliteTransponders (SatNOGS proxy
// fetch, called unconditionally by SatelliteDetailContent). Mocking both
// keeps this file's assertions about dialog semantics decoupled from
// network/timer behaviour that belongs to those hooks' own tests.
vi.mock("@/hooks/useSatellites", () => ({
  useSatellites: useSatellitesMock,
}));
vi.mock("@/hooks/useSatelliteTransponders", () => ({
  useSatelliteTransponders: () => ({
    transponders: [],
    isLoading: false,
    error: null,
    isAvailable: false,
  }),
}));

// NORAD ID / name deliberately absent from the static transponder DB
// (src/lib/data/satelliteTransponders.ts), so getTransponder() returns null,
// TransponderInfo never renders, and this file stays focused on dialog
// semantics rather than transponder rendering.
const FAKE_SATELLITE: SatelliteInfoExtended = {
  name: "TEST-SAT-1",
  line1:
    "1 99999U 00000A   26001.00000000  .00000000  00000-0  00000-0 0  9990",
  line2:
    "2 99999  00.0000 000.0000 0000000 000.0000 000.0000 15.00000000000010",
  noradId: 99999,
  position: { lat: 10, lon: 20, alt: 500, velocity: 7.5 },
  isVisible: false,
  category: "other",
  tleAge: "fresh",
  isCustom: false,
};

function openModal() {
  useSatellitesMock.mockReturnValue({
    selectedSatellite: FAKE_SATELLITE,
    nextPasses: [],
  });
  useMapStore.setState({ satelliteModalId: FAKE_SATELLITE.noradId });
}

describe("SatelliteDetailModal", () => {
  afterEach(() => {
    useMapStore.setState({ satelliteModalId: null });
    useSatellitesMock.mockReset();
  });

  it("renders nothing, and never calls the satellite data hook, when satelliteModalId is null (#805 early-return audit)", () => {
    useSatellitesMock.mockReturnValue({ selectedSatellite: null, nextPasses: [] });
    const { container } = renderModal();

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useSatellitesMock).not.toHaveBeenCalled();
  });

  it("renders role=dialog, aria-modal=true, with the satellite name as the accessible name, when satelliteModalId is set", async () => {
    openModal();
    renderModal();

    const dialog = await screen.findByRole("dialog", {
      name: FAKE_SATELLITE.name,
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // labelledBy must actually point at the visible heading (not merely
    // produce a name that happens to match it — see PR #828 S2).
    const heading = screen.getByRole("heading", { name: FAKE_SATELLITE.name });
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(
      screen.getAllByRole("heading", { name: FAKE_SATELLITE.name }),
    ).toHaveLength(1);
  });

  it("keeps the dialog mounted with an 'unavailable' body, and closes on Escape without leaking to fullscreen, when satelliteModalId is set but the satellite hasn't resolved (#828 B1)", async () => {
    useSatellitesMock.mockReturnValue({ selectedSatellite: null, nextPasses: [] });
    useMapStore.setState({ satelliteModalId: FAKE_SATELLITE.noradId });
    renderModal();

    const dialog = await screen.findByRole("dialog", {
      name: "Satellite unavailable",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const user = userEvent.setup();
    await user.keyboard("{Escape}");

    expect(useMapStore.getState().satelliteModalId).toBeNull();
  });

  it("closes on Escape via capture-phase, before a bubble-phase document listener sees it", async () => {
    openModal();
    renderModal();
    await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

    const bubbleListener = vi.fn();
    document.addEventListener("keydown", bubbleListener);
    const user = userEvent.setup();
    try {
      await user.keyboard("{Escape}");
    } finally {
      document.removeEventListener("keydown", bubbleListener);
    }

    expect(useMapStore.getState().satelliteModalId).toBeNull();
    expect(bubbleListener).not.toHaveBeenCalled();
  });

  it("has an AT-exposed backdrop dismiss button that closes the dialog on activation", async () => {
    openModal();
    renderModal();
    await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

    const backdrop = screen.getByRole("button", { name: "Dismiss dialog" });
    const user = userEvent.setup();
    await user.click(backdrop);

    expect(useMapStore.getState().satelliteModalId).toBeNull();
  });

  it("moves initial focus inside the dialog", async () => {
    openModal();
    renderModal();
    const dialog = await screen.findByRole("dialog", {
      name: FAKE_SATELLITE.name,
    });

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  describe("Map orbit controls (#994)", () => {
    afterEach(() => {
      useMapStore.setState({ satelliteTracks: {} });
    });

    it("shows 'Map orbit' when untracked and creates a default track on click", async () => {
      openModal();
      renderModal();
      await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

      const toggle = screen.getByRole("button", { name: "Map orbit" });
      expect(toggle.getAttribute("aria-pressed")).toBe("false");

      const user = userEvent.setup();
      await user.click(toggle);

      expect(useMapStore.getState().satelliteTracks).toEqual({
        [String(FAKE_SATELLITE.noradId)]: {
          orbitsAhead: 1,
          showPast: false,
          showFootprint: false,
        },
      });
    });

    it("shows 'Clear orbit' when tracked and removes the track on click", async () => {
      openModal();
      useMapStore.setState({
        satelliteTracks: {
          [String(FAKE_SATELLITE.noradId)]: {
            orbitsAhead: 1,
            showPast: false,
            showFootprint: false,
          },
        },
      });
      renderModal();
      await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

      const toggle = screen.getByRole("button", { name: "Clear orbit" });
      expect(toggle.getAttribute("aria-pressed")).toBe("true");

      const user = userEvent.setup();
      await user.click(toggle);

      expect(useMapStore.getState().satelliteTracks).toEqual({});
    });

    it("only shows the orbits-ahead / past / footprint controls once tracked", async () => {
      openModal();
      renderModal();
      await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

      expect(screen.queryByRole("radio", { name: "2 orbits" })).toBeNull();
      expect(
        screen.queryByRole("switch", { name: /Show past 45 minutes/ }),
      ).toBeNull();

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Map orbit" }));

      expect(
        await screen.findByRole("radio", { name: "2 orbits" }),
      ).not.toBeNull();
      expect(
        screen.getByRole("switch", { name: /Show past 45 minutes/ }),
      ).not.toBeNull();
      expect(
        screen.getByRole("switch", { name: /Footprint/ }),
      ).not.toBeNull();
    });

    it("the orbits-ahead segmented control updates orbitsAhead in the store", async () => {
      openModal();
      useMapStore.setState({
        satelliteTracks: {
          [String(FAKE_SATELLITE.noradId)]: {
            orbitsAhead: 1,
            showPast: false,
            showFootprint: false,
          },
        },
      });
      renderModal();
      await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

      const user = userEvent.setup();
      await user.click(screen.getByRole("radio", { name: "3 orbits" }));

      expect(
        useMapStore.getState().satelliteTracks[String(FAKE_SATELLITE.noradId)]
          .orbitsAhead,
      ).toBe(3);
    });

    it("the 'Show past 45 minutes' toggle updates showPast in the store", async () => {
      openModal();
      useMapStore.setState({
        satelliteTracks: {
          [String(FAKE_SATELLITE.noradId)]: {
            orbitsAhead: 1,
            showPast: false,
            showFootprint: false,
          },
        },
      });
      renderModal();
      await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

      const user = userEvent.setup();
      await user.click(
        screen.getByRole("switch", { name: /Show past 45 minutes/ }),
      );

      expect(
        useMapStore.getState().satelliteTracks[String(FAKE_SATELLITE.noradId)]
          .showPast,
      ).toBe(true);
    });

    it("the 'Footprint' toggle updates showFootprint in the store", async () => {
      openModal();
      useMapStore.setState({
        satelliteTracks: {
          [String(FAKE_SATELLITE.noradId)]: {
            orbitsAhead: 1,
            showPast: false,
            showFootprint: false,
          },
        },
      });
      renderModal();
      await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

      const user = userEvent.setup();
      await user.click(screen.getByRole("switch", { name: /Footprint/ }));

      expect(
        useMapStore.getState().satelliteTracks[String(FAKE_SATELLITE.noradId)]
          .showFootprint,
      ).toBe(true);
    });

    it("shows 'Clear all orbits' only once 2+ tracks exist, and it clears every track", async () => {
      openModal();
      useMapStore.setState({
        satelliteTracks: {
          [String(FAKE_SATELLITE.noradId)]: {
            orbitsAhead: 1,
            showPast: false,
            showFootprint: false,
          },
        },
      });
      renderModal();
      await screen.findByRole("dialog", { name: FAKE_SATELLITE.name });

      expect(screen.queryByText(/Clear all orbits/)).toBeNull();

      useMapStore.getState().setSatelliteTrack(99998, {});

      const clearAll = await screen.findByRole("button", {
        name: /Clear all orbits/,
      });
      const user = userEvent.setup();
      await user.click(clearAll);

      expect(useMapStore.getState().satelliteTracks).toEqual({});
    });
  });
});

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

  it("has a keyboard-reachable backdrop button that closes the dialog on activation", async () => {
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
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useActivationSpotStore } from "@/stores/activationSpotStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRigStore } from "@/stores/rigStore";
import { useQSOEntry } from "@/hooks/useQSOEntry";
import type { MappableActivationSpot } from "@/lib/map/activationMarkers";
import { ActivationDetailPanel } from "./ActivationDetailPanel";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  clipboard: vi.fn(),
  activationFeed: vi.fn(),
  callsignIngestion: vi.fn(),
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({
    id: "current",
    name: "Current",
    type: "portable",
    grid: "EM10",
    lat: 30,
    lon: -98,
    createdAt: "2026-08-31T12:00:00.000Z",
  }),
}));

vi.mock("@/hooks/useActivationSpots", () => ({
  useActivationSpots: () => mocks.activationFeed(),
}));

vi.mock("@/hooks/useCallsignIngestion", async () => {
  const { useState } = await vi.importActual<typeof import("react")>("react");
  return {
    useCallsignIngestion: (callsign: string) => {
      // Model the real hook's debounced state: without a keyed operator-context
      // remount, a rapid station switch would keep returning the prior profile.
      const [queriedCallsign] = useState(callsign);
      return mocks.callsignIngestion(queriedCallsign);
    },
  };
});

const SPOT = {
  id: "pota-1",
  program: "POTA" as const,
  callsign: "K5ABC",
  reference: "US-1234",
  referenceName: "Test Park",
  frequencyKHz: 14074,
  mode: "FT8",
  comments: "QRP",
  spotter: "W1AW",
  spottedAt: "2026-08-31T13:59:00.000Z",
  latitude: 30.25,
  longitude: -97.75,
  grid: "EM10df",
};

function activationFeed(
  spots: MappableActivationSpot[] = [SPOT],
  status: "ok" | "unavailable" | "invalid" = "ok",
) {
  return {
    spots,
    spotsByProgram: { POTA: spots, SOTA: [], WWFF: [] },
    sources: [
      {
        program: "POTA" as const,
        status,
        source: "Parks on the Air",
        sourceUrl: "https://pota.app/",
        count: spots.length,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };
}

function PreparedLogHarness() {
  const { form } = useQSOEntry();
  return <span>{`${form.frequency} kHz ${form.mode}`}</span>;
}

describe("ActivationDetailPanel", () => {
  beforeEach(() => {
    useActivationSpotStore.setState({ selectedSpot: SPOT });
    useQSOStore.setState({ formDefaults: {} });
    useQSOStore.getState().resetForm();
    useRigStore.setState({
      connected: false,
      frequency: 14_074_000,
      mode: "USB",
    });
    mocks.lookup.mockReset().mockResolvedValue(undefined);
    useQSOStore.setState({ lookupCallsign: mocks.lookup });
    mocks.activationFeed
      .mockReset()
      .mockImplementation(() =>
        activationFeed(
          useActivationSpotStore.getState().selectedSpot
            ? [useActivationSpotStore.getState().selectedSpot!]
            : [],
        ),
      );
    mocks.callsignIngestion.mockReset().mockImplementation((callsign) =>
      callsign === "K5ABC"
        ? {
            result: {
              name: "Jane Operator",
              qth: "Austin",
              country: "United States",
              grid: "EM10aa",
              licenseClass: "Extra",
              sources: ["qrz", "hamqth", "callook"],
            },
            loading: false,
            error: null,
          }
        : { result: null, loading: true, error: null },
    );
    mocks.clipboard.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.clipboard },
    });
  });

  it("shows the reported station, path, and enriched operator context", () => {
    render(
      <MemoryRouter>
        <ActivationDetailPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog", { name: /K5ABC/i })).toBeTruthy();
    expect(screen.getByText("14.074 MHz")).toBeTruthy();
    expect(screen.getByText("Test Park")).toBeTruthy();
    expect(screen.getByText("Jane Operator")).toBeTruthy();
    expect(screen.getByText("Extra")).toBeTruthy();
    expect(screen.getByText("QRZ + HamQTH + Callook")).toBeTruthy();
    expect(screen.getByText(/propagation panels updated/i)).toBeTruthy();
  });

  it("synchronizes an open card with the current activation feed", async () => {
    const view = render(
      <MemoryRouter>
        <ActivationDetailPanel />
      </MemoryRouter>,
    );

    mocks.activationFeed.mockReturnValue(
      activationFeed([
        {
          ...SPOT,
          id: "pota-2",
          frequencyKHz: 14100,
          mode: "SSB",
          spottedAt: "2026-08-31T14:00:00.000Z",
        },
      ]),
    );
    view.rerender(
      <MemoryRouter>
        <ActivationDetailPanel />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("14.1 MHz")).toBeTruthy());
    expect(useActivationSpotStore.getState().selectedSpot).toEqual(
      expect.objectContaining({ id: "pota-2", frequencyKHz: 14100, mode: "SSB" }),
    );

    mocks.activationFeed.mockReturnValue(activationFeed([], "unavailable"));
    view.rerender(
      <MemoryRouter>
        <ActivationDetailPanel />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog", { name: /K5ABC/i })).toBeTruthy();
    expect(useActivationSpotStore.getState().selectedSpot).toEqual(
      expect.objectContaining({ id: "pota-2", frequencyKHz: 14100 }),
    );

    mocks.activationFeed.mockReturnValue(activationFeed([]));
    view.rerender(
      <MemoryRouter>
        <ActivationDetailPanel />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).toBeNull(),
    );
    expect(useActivationSpotStore.getState().selectedSpot).toBeNull();
  });

  it("drops the prior operator profile immediately when stations switch", async () => {
    render(
      <MemoryRouter>
        <ActivationDetailPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText("Jane Operator")).toBeTruthy();

    act(() => {
      useActivationSpotStore.getState().selectSpot({
        ...SPOT,
        id: "pota-3",
        callsign: "K7XYZ",
        reference: "US-5678",
        referenceName: "Another Park",
      });
    });

    expect(screen.getByRole("dialog", { name: /K7XYZ/i })).toBeTruthy();
    expect(screen.queryByText("Jane Operator")).toBeNull();
    await waitFor(() =>
      expect(mocks.callsignIngestion).toHaveBeenCalledWith("K7XYZ"),
    );
  });

  it("copies the full report and prepares a reviewable QSO draft", async () => {
    useQSOStore.setState((state) => ({
      form: {
        ...state.form,
        name: "Previous Operator",
        qth: "Previous QTH",
        grid: "FN31pr",
        notes: "Previous notes",
        contestId: "OLD-CONTEST",
        srx: "999",
      },
    }));
    render(
      <MemoryRouter initialEntries={["/propsphere"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ActivationDetailPanel />
                <span>Map route</span>
              </>
            }
          />
          <Route path="/log" element={<span>Log route</span>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledOnce());
    expect(mocks.clipboard.mock.calls[0][0]).toContain("14.074 MHz FT8");

    fireEvent.click(screen.getByRole("button", { name: "Prepare QSO" }));

    const form = useQSOStore.getState().form;
    expect(form).toEqual(
      expect.objectContaining({
        callsign: "K5ABC",
        frequency: 14074,
        band: "20m",
        mode: "FT8",
        grid: "EM10df",
        name: "",
        qth: "",
        sig: "POTA",
        sigInfo: "US-1234",
        contestId: "",
        srx: "",
      }),
    );
    expect(mocks.lookup).toHaveBeenCalledWith("K5ABC", {
      preserveGrid: true,
    });
    expect(useActivationSpotStore.getState().selectedSpot).toBeNull();
    expect(await screen.findByText("Log route")).toBeTruthy();
  });

  it("clears a sticky band when the activation frequency is not mapped", () => {
    useActivationSpotStore.setState({
      selectedSpot: {
        ...SPOT,
        id: "pota-222mhz",
        frequencyKHz: 222100,
      },
    });
    useQSOStore.setState({ formDefaults: { band: "20m" } });
    useQSOStore.getState().resetForm();

    render(
      <MemoryRouter>
        <ActivationDetailPanel />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Prepare QSO" }));

    expect(useQSOStore.getState().form).toEqual(
      expect.objectContaining({
        callsign: "K5ABC",
        frequency: 222100,
        band: "",
      }),
    );
  });

  it("preserves the prepared draft when connected CAT initializes on navigation", async () => {
    useRigStore.setState({
      connected: true,
      frequency: 7_074_000,
      mode: "USB",
    });
    render(
      <MemoryRouter initialEntries={["/propsphere"]}>
        <Routes>
          <Route path="/propsphere" element={<ActivationDetailPanel />} />
          <Route path="/log" element={<PreparedLogHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Prepare QSO" }));

    expect(await screen.findByText("14074 kHz FT8")).toBeTruthy();
    expect(useQSOStore.getState().form).toEqual(
      expect.objectContaining({
        callsign: "K5ABC",
        frequency: 14074,
        band: "20m",
        mode: "FT8",
      }),
    );
  });
});


it.each(["FT8", "UNKNOWN"])("tunes the refreshed activation frequency in %s without changing the QSO draft", (mode) => {
  const rig = useRigStore.getState();
  const settings = useSettingsStore.getState();
  const selected = useActivationSpotStore.getState().selectedSpot;
  try {
    useSettingsStore.setState({ bridgeEnabled: true });
    useRigStore.setState({ catEnabled: true, connected: true, bridgeConnected: true, pendingFrequency: null, pendingMode: null });
    useActivationSpotStore.setState({ selectedSpot: SPOT });
    mocks.activationFeed.mockReturnValue(activationFeed([{ ...SPOT, frequencyKHz: 7074.125, mode }]));
    mocks.callsignIngestion.mockReturnValue({ result: null, loading: false, error: null });
    const draft = useQSOStore.getState().form;
    render(<MemoryRouter><ActivationDetailPanel /></MemoryRouter>);
    expect(useRigStore.getState().pendingFrequency).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: mode === "UNKNOWN" ? "Tune 7.074125 MHz (mode unchanged)" : "Tune 7.074125 MHz FT8" }));
    expect(useRigStore.getState().pendingFrequency).toBe(7074125);
    expect(useRigStore.getState().pendingMode).toBe(mode === "UNKNOWN" ? null : "USB");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(useQSOStore.getState().form).toBe(draft);
  } finally {
    useRigStore.setState(rig);
    useSettingsStore.setState(settings);
    useActivationSpotStore.setState({ selectedSpot: selected });
  }
});

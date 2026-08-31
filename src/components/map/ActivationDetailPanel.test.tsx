import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useActivationSpotStore } from "@/stores/activationSpotStore";
import { useQSOStore } from "@/stores/qsoStore";
import { ActivationDetailPanel } from "./ActivationDetailPanel";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  clipboard: vi.fn(),
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

vi.mock("@/hooks/useCallsignIngestion", () => ({
  useCallsignIngestion: () => ({
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
  }),
}));

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

describe("ActivationDetailPanel", () => {
  beforeEach(() => {
    useActivationSpotStore.setState({ selectedSpot: SPOT });
    useQSOStore.getState().resetForm();
    mocks.lookup.mockReset().mockResolvedValue(undefined);
    useQSOStore.setState({ lookupCallsign: mocks.lookup });
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

  it("copies the full report and prepares a reviewable QSO draft", async () => {
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
        sig: "POTA",
        sigInfo: "US-1234",
      }),
    );
    expect(mocks.lookup).toHaveBeenCalledWith("K5ABC");
    expect(useActivationSpotStore.getState().selectedSpot).toBeNull();
    expect(await screen.findByText("Log route")).toBeTruthy();
  });
});

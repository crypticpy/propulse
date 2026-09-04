import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QSO_FORM } from "@/types/qso";
import type { DXSpot } from "@/types/dxcluster";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { OpsLoggerStrip } from "./OpsLoggerStrip";

function pendingSpot(): DXSpot {
  return {
    id: "spot-2",
    spotter: "W1AW",
    dx: "FO0AAA",
    frequency: 21074,
    mode: "FT8",
    comment: "CQ",
    time: new Date("2026-09-04T12:00:00Z"),
    band: "15m",
  };
}

describe("OpsLoggerStrip", () => {
  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useOpsPostureStore.setState({ posture: "contact" });
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "K1ABC", frequency: 14074, mode: "FT8" },
    });
  });

  it("asks before replacing a dirty draft", async () => {
    const user = userEvent.setup();
    useOpsPostureStore.getState().setPendingReplace(pendingSpot());

    render(
      <MemoryRouter>
        <OpsLoggerStrip />
      </MemoryRouter>,
    );

    expect(screen.getByText("FO0AAA")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(useOpsPostureStore.getState().pendingReplace).toBeNull();
    expect(useQSOStore.getState().form.callsign).toBe("K1ABC");
  });

  it("exposes callsign, frequency, mode, RST, and Log", () => {
    render(
      <MemoryRouter>
        <OpsLoggerStrip />
      </MemoryRouter>,
    );

    expect(screen.getByRole("textbox", { name: "Callsign" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Frequency in kHz" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Mode" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "RST sent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log" })).toBeTruthy();
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { StateStrip } from "./StateStrip";

describe("StateStrip", () => {
  beforeEach(() => {
    localStorage.clear();
    useOperatingStateStore.setState({ followScreens: true });
    useOperatingStateStore.getState().reset();
  });

  it("reads session, band and target from the shared cursor", () => {
    render(<StateStrip />);
    expect(screen.getAllByText("—")).toHaveLength(3);

    act(() => {
      useOperatingStateStore.getState().setSessionId("CQWW-2026");
      useOperatingStateStore.getState().setBand("20m");
      useOperatingStateStore.getState().setTarget({
        callsign: "PY2ABC",
        grid: "GG66",
        lat: null,
        lon: null,
        spotId: null,
      });
    });

    expect(screen.getByText("CQWW-2026")).toBeTruthy();
    expect(screen.getByText("20M")).toBeTruthy();
    expect(screen.getByText("PY2ABC")).toBeTruthy();
  });

  it("carries the spelled-out Follow my other screens switch", () => {
    render(<StateStrip />);

    const toggle = screen.getByRole("switch", { name: "Follow my other screens" });
    expect(toggle.textContent).toBe("ON");

    fireEvent.click(toggle);
    expect(useOperatingStateStore.getState().followScreens).toBe(false);
    expect(screen.getByRole("switch", { name: "Follow my other screens" }).textContent).toBe("OFF");
  });
});

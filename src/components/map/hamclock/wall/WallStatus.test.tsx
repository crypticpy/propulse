import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDXStore } from "@/stores/dxStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { WallStatus } from "./WallStatus";

const mocks = vi.hoisted(() => ({
  verdicts: vi.fn(() => ({ ready: true })),
}));
vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));

function indicator(prefix: string): HTMLElement {
  const strip = screen.getByRole("status", { name: "Wall health" });
  return within(strip).getByText((text) => text.startsWith(prefix));
}

describe("WallStatus", () => {
  beforeEach(() => {
    useSettingsStore.setState({ bridgeEnabled: false });
    useRigStore.setState({
      bridgeConnected: false,
      catEnabled: false,
      connected: false,
    });
    useDXStore.setState({ spots: [], spotSource: "rest" });
    mocks.verdicts.mockReturnValue({ ready: true });
  });

  it("reads OFF for the bridge and rig when the bridge is disabled", () => {
    render(<WallStatus />);
    expect(indicator("BRIDGE").textContent).toBe("BRIDGE OFF");
    expect(indicator("BRIDGE").dataset.tone).toBe("idle");
    expect(indicator("RIG").textContent).toBe("RIG OFF");
    expect(indicator("NET").textContent).toBe("NET ONLINE");
    expect(indicator("CLUSTER").textContent).toBe("CLUSTER 0 · REST");
    expect(indicator("MODEL").textContent).toBe("MODEL LIVE");
  });

  it("warns while the bridge transport and the CAT session are still coming up, then reads LINKED and ATTACHED", () => {
    useSettingsStore.setState({ bridgeEnabled: true });
    useRigStore.setState({ catEnabled: true });
    render(<WallStatus />);
    expect(indicator("BRIDGE").textContent).toBe("BRIDGE SEEKING");
    expect(indicator("BRIDGE").dataset.tone).toBe("warn");
    expect(indicator("RIG").textContent).toBe("RIG WAITING");

    act(() => {
      useRigStore.setState({ bridgeConnected: true, connected: true });
    });
    expect(indicator("BRIDGE").textContent).toBe("BRIDGE LINKED");
    expect(indicator("BRIDGE").dataset.tone).toBe("good");
    expect(indicator("RIG").textContent).toBe("RIG ATTACHED");
    expect(indicator("RIG").dataset.tone).toBe("good");
  });

  it("follows the browser offline event", () => {
    render(<WallStatus />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(indicator("NET").textContent).toBe("NET OFFLINE");
    expect(indicator("NET").dataset.tone).toBe("warn");
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(indicator("NET").textContent).toBe("NET ONLINE");
  });
});

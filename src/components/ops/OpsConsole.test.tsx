import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { OpsConsole } from "./OpsConsole";

// The dock's panels are heavy (globe-adjacent lists, contest engine, WSJT-X);
// this suite is about the tab handler only, so they are stubbed out.
vi.mock("@/components/dx", () => ({
  DXConsole: () => <div data-testid="dx-console" />,
  DXSpotList: () => <div data-testid="dx-spot-list" />,
}));
vi.mock("@/components/dx/WSJTXStatusPanel", () => ({
  WSJTXStatusPanel: () => <div data-testid="wsjtx-status" />,
}));
vi.mock("@/components/contest/ContestDock", () => ({
  ContestDock: () => <div data-testid="contest-dock" />,
}));
vi.mock("@/components/ops/OpsLoggerStrip", () => ({
  OpsLoggerStrip: () => <div data-testid="ops-logger-strip" />,
}));
vi.mock("@/components/workspace/widgets/HeatMapStrip", () => ({
  HeatMapStrip: () => <div data-testid="heat-map-strip" />,
}));

describe("OpsConsole dock tabs", () => {
  beforeEach(() => {
    useMapOperationalStore.setState({
      manualScope: null,
      workspaceOpen: false,
      selectedReport: null,
    });
    useOpsPostureStore.getState().reset();
    useContestUIStore.setState({ dockTabBySessionId: {} });
  });

  // #884, owner decision B: a tab click is a "show me this panel" gesture, not
  // a durable statement of operating intent. Only the explicit scope <select>
  // may write `manualScope`, which `useMapOperationalStore` persists.
  it("leaves manualScope null when a dock tab is clicked", async () => {
    const user = userEvent.setup();
    render(<OpsConsole displayTime={new Date()} onCollapse={() => {}} />);

    for (const label of ["Log", "Contest", "Observe"]) {
      await user.click(screen.getByRole("button", { name: label }));
      expect(useMapOperationalStore.getState().manualScope).toBeNull();
    }
  });

  it("still opens the workspace and takes the desk on the Log tab", async () => {
    const user = userEvent.setup();
    render(<OpsConsole displayTime={new Date()} onCollapse={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Log" }));

    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(useOpsPostureStore.getState().posture).toBe("desk");
    expect(useContestUIStore.getState().dockTabBySessionId["no-session"]).toBe(
      "log",
    );
  });
});

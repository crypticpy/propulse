import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useRigStore } from "@/stores/rigStore";
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
    useRigStore.setState({ connected: false });
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

  // #884 round 2 (Codex, OpsConsole.tsx:367): with `setManualScope` gone from
  // the handler, the click's own posture move was the only input the
  // scope-to-tab effect saw, so it re-ran against an unchanged automatic
  // scope and put the dock straight back on Observe.
  it("keeps a tab the operator clicked against the automatic scope", async () => {
    const user = userEvent.setup();
    render(<OpsConsole displayTime={new Date()} onCollapse={() => {}} />);

    // Log takes the desk; Contest then calls exitContact, moving the posture.
    await user.click(screen.getByRole("button", { name: "Log" }));
    await user.click(screen.getByRole("button", { name: "Contest" }));

    expect(useContestUIStore.getState().dockTabBySessionId["no-session"]).toBe(
      "contest",
    );
    expect(screen.queryByTestId("contest-dock")).not.toBeNull();
  });

  // Second event for the case above: an explicit tab click is not a veto. A
  // real change of operating state (here CAT coming up, which moves the
  // automatic scope to Log) still reconciles the dock.
  it("hands the dock back when the automatic scope actually changes", async () => {
    const user = userEvent.setup();
    render(<OpsConsole displayTime={new Date()} onCollapse={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Contest" }));
    expect(useContestUIStore.getState().dockTabBySessionId["no-session"]).toBe(
      "contest",
    );

    await act(async () => {
      useRigStore.setState({ connected: true });
    });

    expect(useContestUIStore.getState().dockTabBySessionId["no-session"]).toBe(
      "log",
    );
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

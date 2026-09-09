import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { DisplayTab } from "./DisplayTab";

const originalWorkspaceState = useWorkspaceStore.getState();

describe("DisplayTab", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState(originalWorkspaceState, true);
    useOperatingStateStore.getState().reset();
    // `reset()` deliberately leaves `followScreens` alone; pin the ON precondition.
    useOperatingStateStore.setState({ followScreens: true });
  });

  it("mounts the SHARING follow-screens toggle in the layout section", () => {
    render(<DisplayTab />);

    fireEvent.click(screen.getByRole("radio", { name: "LAYOUT" }));

    expect(screen.getByText("SHARING")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Follow my other screens" });
    expect(toggle.textContent).toBe("ON");

    fireEvent.click(toggle);
    expect(useOperatingStateStore.getState().followScreens).toBe(false);
    expect(screen.getByRole("switch", { name: "Follow my other screens" }).textContent).toBe("OFF");
  });
});

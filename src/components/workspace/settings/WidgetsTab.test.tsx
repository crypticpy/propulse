import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { WidgetsTab } from "./WidgetsTab";

const originalState = useWorkspaceStore.getState();

describe("WidgetsTab", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState(originalState, true);
  });

  it("labels the top rail as 'Top rail' rather than 'Bottom rail' (#916)", () => {
    render(<WidgetsTab />);

    fireEvent.click(screen.getByRole("radio", { name: "RAILS" }));

    // Before the fix, `railOrientation` mapped every horizontal rail (top
    // and bottom) to the literal text "Bottom rail", so a workstation's top
    // rail row read "Top rail — Bottom rail, 6 slot budget".
    expect(screen.getByText(/^Top rail, \d+ slot budget$/)).toBeTruthy();
    expect(screen.getByText(/^Bottom rail, \d+ slot budget$/)).toBeTruthy();
    expect(screen.queryByText(/^Top rail — Bottom rail/)).toBeNull();
  });
});

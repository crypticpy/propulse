import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_ID, useWorkspaceStore } from "@/stores/workspaceStore";
import { RecipesTab } from "./RecipesTab";

const originalState = useWorkspaceStore.getState();

describe("RecipesTab", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState(originalState, true);
  });

  it("previews the tablet recipe widgets when the effective canvas type is tablet, even though the workspace's own stored canvasType is not (#696)", () => {
    // The workspace's *stored* canvasType stays "phone" (disables previews
    // entirely today), while `canvasTypeOverride` — the shared resolution
    // `useEffectiveCanvasType()`/`WidgetsTab.tsx`/`DisplayTab.tsx` already
    // use — reports "tablet". Before #696, RecipesTab read
    // `workspace.canvasType` directly and would still show "Not available
    // on this canvas." here; after #696 it must follow the override.
    useWorkspaceStore.setState((state) => ({
      workspaces: state.workspaces.map((ws) => (ws.id === DEFAULT_WORKSPACE_ID ? { ...ws, canvasType: "phone" } : ws)),
    }));
    useWorkspaceStore.getState().setCanvasTypeOverride("tablet");

    render(<RecipesTab />);

    // Recipe C (Solar watch): tablet layout is xray + solarWind + forecastMatrix.
    expect(screen.getByText("Solar watch")).toBeTruthy();
    expect(screen.getByText("X-ray flux · Solar wind · 24h band forecast")).toBeTruthy();

    // Recipe D (Club session): tablet layout is recentContacts + cluster + bandActivity.
    expect(screen.getByText("Club session")).toBeTruthy();
    expect(screen.getByText("Recent contacts · DX cluster · Band activity")).toBeTruthy();

    // "ADD AS A NEW PAGE" must be enabled — the phone-disable rule keys off
    // the effective type ("tablet"), not the workspace's stored "phone".
    const addButtons = screen.getAllByText("ADD AS A NEW PAGE") as HTMLButtonElement[];
    expect(addButtons.every((button) => !button.disabled)).toBe(true);
  });
});

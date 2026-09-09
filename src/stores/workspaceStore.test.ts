import { beforeEach, describe, expect, it } from "vitest";
import { canvasRulesFor, defaultRailStates } from "@/lib/workspace/canvasRules";
import { WIDGET_REGISTRY } from "@/lib/workspace/registry";
import { DEFAULT_PAGE_ID, DEFAULT_WORKSPACE_ID, useWorkspaceStore, type Workspace, type WorkspacePage } from "./workspaceStore";

const originalState = useWorkspaceStore.getState();

// `useActiveWorkspace` / `useActivePage` are React hooks and cannot be
// called outside a component render; these plain equivalents read the same
// derivation directly off the store for use in a non-React test.
function activeWorkspace(): Workspace {
  const state = useWorkspaceStore.getState();
  return state.workspaces.find((ws) => ws.id === state.activeWorkspaceId) ?? state.workspaces[0];
}
function activePage(): WorkspacePage {
  const workspace = activeWorkspace();
  return workspace.pages.find((p) => p.id === workspace.activePageId) ?? workspace.pages[0];
}

/**
 * Weight-1 registry ids eligible for a workstation rail (declares "work" or
 * "glance") that are not hero-eligible (`canSpace: false`) — used to fill
 * every rail slot deterministically without touching the space. Computed
 * from the real registry so the test tracks it instead of hardcoding ids
 * that could be renamed.
 */
const ONE_WEIGHT_RAIL_IDS = Object.values(WIDGET_REGISTRY)
  .filter(
    (entry) =>
      entry.weight === 1 &&
      !entry.canSpace &&
      entry.status !== "planned" &&
      (entry.densities.includes("work") || entry.densities.includes("glance")),
  )
  .map((entry) => entry.id);

describe("workspaceStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState(originalState, true);
  });

  it("seeds one default workstation workspace with one empty page", () => {
    const state = useWorkspaceStore.getState();
    expect(state.workspaces).toHaveLength(1);
    const workspace = state.workspaces[0];
    expect(workspace.id).toBe(DEFAULT_WORKSPACE_ID);
    expect(workspace.name).toBe("My workstation");
    expect(workspace.canvasType).toBe("workstation");
    expect(workspace.pages).toEqual([{ id: DEFAULT_PAGE_ID, title: "Page 1", widgetIds: [] }]);
    expect(workspace.activePageId).toBe(DEFAULT_PAGE_ID);
    expect(workspace.rails).toEqual(defaultRailStates(canvasRulesFor("workstation")));
  });

  it("useActiveWorkspace / useActivePage resolve the default workspace and page", () => {
    expect(activeWorkspace().id).toBe(DEFAULT_WORKSPACE_ID);
    expect(activePage().id).toBe(DEFAULT_PAGE_ID);
  });

  describe("addWidget", () => {
    it("docks a hero-eligible widget into the space and stores it", () => {
      const result = useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "mapHero");
      expect(result).toEqual({ ok: true });
      expect(activePage().widgetIds).toEqual(["mapHero"]);
    });

    it("docks a rail-eligible widget into a rail and stores it", () => {
      const result = useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "bestBand");
      expect(result).toEqual({ ok: true });
      expect(activePage().widgetIds).toEqual(["bestBand"]);
    });

    it("returns the refusal and does not store the widget for an unknown id", () => {
      const result = useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "not-a-real-widget");
      expect(result).toEqual({
        ok: false,
        reason: '"not-a-real-widget" is not in the widget registry.',
      });
      expect(activePage().widgetIds).toEqual([]);
    });

    it("refuses once every eligible rail is full, without evicting or spilling", () => {
      // Every weight-1, rail-eligible, non-hero registry entry — enough to
      // exactly fill workstation's left(5) + right(6) + bottom(6) = 17 slots.
      const oneWeightIds = ONE_WEIGHT_RAIL_IDS.slice(0, 17);
      expect(oneWeightIds).toHaveLength(17);

      for (const id of oneWeightIds) {
        expect(useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, id)).toEqual({ ok: true });
      }
      expect(activePage().widgetIds).toEqual(oneWeightIds);

      const overflowId = ONE_WEIGHT_RAIL_IDS[17];
      const result = useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, overflowId);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toMatch(/full/i);
      // Refused: not stored, nothing else changed.
      expect(activePage().widgetIds).toEqual(oneWeightIds);
    });

    it("returns a refusal for a page id that belongs to no workspace", () => {
      const result = useWorkspaceStore.getState().addWidget("not-a-page", "bestBand");
      expect(result).toEqual({ ok: false, reason: '"not-a-page" is not a page in any workspace.' });
    });
  });

  it("removeWidget drops the id from the page", () => {
    useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "bestBand");
    useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "sun");
    useWorkspaceStore.getState().removeWidget(DEFAULT_PAGE_ID, "bestBand");
    expect(activePage().widgetIds).toEqual(["sun"]);
  });

  describe("rails", () => {
    it("setRailCollapsed toggles one side only", () => {
      useWorkspaceStore.getState().setRailCollapsed("left", true);
      const rails = activeWorkspace().rails;
      expect(rails.find((r) => r.side === "left")?.collapsed).toBe(true);
      expect(rails.find((r) => r.side === "right")?.collapsed).toBe(false);
      expect(rails.find((r) => r.side === "bottom")?.collapsed).toBe(false);
    });

    it("setRailWidth applies the canvas's opposite-collapses policy via applyRailWidth", () => {
      useWorkspaceStore.getState().setRailWidth("left", "wide");
      const rails = activeWorkspace().rails;
      expect(rails.find((r) => r.side === "left")).toEqual({ side: "left", collapsed: false, width: "wide" });
      expect(rails.find((r) => r.side === "right")?.collapsed).toBe(true);
      expect(rails.find((r) => r.side === "bottom")?.collapsed).toBe(false);
    });
  });

  it("setActivePage updates the active workspace's activePageId", () => {
    useWorkspaceStore.getState().setActivePage("some-other-page");
    expect(activeWorkspace().activePageId).toBe("some-other-page");
  });
});

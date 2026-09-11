import { beforeEach, describe, expect, it } from "vitest";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { canvasRulesFor, defaultRailStates } from "@/lib/workspace/canvasRules";
import { PRESETS } from "@/lib/widgets/heatmap";
import { RECIPE_CHASE_DX } from "@/lib/workspace/recipes";
import { WIDGET_REGISTRY } from "@/lib/workspace/registry";
import {
  DEFAULT_PAGE_ID,
  DEFAULT_WORKSPACE_ID,
  migrateWorkspaceState,
  useWorkspaceStore,
  type Workspace,
  type WorkspacePage,
} from "./workspaceStore";

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

const WORKSTATION_RAIL_BUDGET = canvasRulesFor("workstation").rails.reduce(
  (n, rail) => n + rail.weightBudget,
  0,
);

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
    expect(workspace.display.heatMap.presetId).toBe(PRESETS[0].id);
    expect(workspace.display.heatMap.thresholds).toEqual(PRESETS[0].scale.thresholds);
    expect(workspace.display.heatMap.colors).toEqual(PRESETS[0].bucketColors);
    expect(workspace.display.headlineRule).toBe("ladder");
    expect(workspace.display.visibleBands.length).toBeGreaterThan(0);
    expect(workspace.autoPage).toEqual({ enabled: false, dwellSeconds: 30 });
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
      // exactly fill the workstation's declared rail budgets.
      const oneWeightIds = ONE_WEIGHT_RAIL_IDS.slice(0, WORKSTATION_RAIL_BUDGET);
      expect(oneWeightIds).toHaveLength(WORKSTATION_RAIL_BUDGET);
      expect(ONE_WEIGHT_RAIL_IDS.length).toBeGreaterThan(WORKSTATION_RAIL_BUDGET);

      for (const id of oneWeightIds) {
        expect(useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, id)).toEqual({ ok: true });
      }
      expect(activePage().widgetIds).toEqual(oneWeightIds);

      const overflowId = ONE_WEIGHT_RAIL_IDS[WORKSTATION_RAIL_BUDGET];
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
      expect(rails.find((r) => r.side === "top")?.collapsed).toBe(false);
    });

    it("setRailWidth applies the canvas's opposite-collapses policy via applyRailWidth", () => {
      useWorkspaceStore.getState().setRailWidth("left", "wide");
      const rails = activeWorkspace().rails;
      expect(rails.find((r) => r.side === "left")).toEqual({ side: "left", collapsed: false, width: "wide" });
      expect(rails.find((r) => r.side === "right")?.collapsed).toBe(true);
      expect(rails.find((r) => r.side === "bottom")?.collapsed).toBe(false);
      expect(rails.find((r) => r.side === "top")?.collapsed).toBe(false);
    });

    it("setRailWidth uncollapses the rail it targets, even if it was already collapsed (PR #676 review)", () => {
      // Wide the left rail (collapses the right rail per the policy above),
      // then pick a width for the now-collapsed right rail: it must reopen
      // rather than staying hidden.
      useWorkspaceStore.getState().setRailWidth("left", "wide");
      expect(activeWorkspace().rails.find((r) => r.side === "right")?.collapsed).toBe(true);

      useWorkspaceStore.getState().setRailWidth("right", "normal");
      const rails = activeWorkspace().rails;
      expect(rails.find((r) => r.side === "right")).toEqual({ side: "right", collapsed: false, width: "normal" });
      // Right going normal (not wide) uncollapses the opposite (left) per policy.
      expect(rails.find((r) => r.side === "left")?.collapsed).toBe(false);
    });
  });

  it("setActivePage updates the active workspace's activePageId", () => {
    useWorkspaceStore.getState().setActivePage("some-other-page");
    expect(activeWorkspace().activePageId).toBe("some-other-page");
  });

  describe("setWidgetOrder", () => {
    it("replaces the page's widget id order wholesale", () => {
      useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "bestBand");
      useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "sun");
      useWorkspaceStore.getState().setWidgetOrder(DEFAULT_PAGE_ID, ["sun", "bestBand"]);
      expect(activePage().widgetIds).toEqual(["sun", "bestBand"]);
    });

    it("moving a hero-eligible widget to the front makes autoDock place it in the space", () => {
      // Two hero-eligible widgets; whichever is first in the list wins the space.
      useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "cluster");
      expect(activePage().widgetIds).toEqual(["cluster"]);
      useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "mapHero");
      // mapHero was added second, so cluster (added first) kept the space and
      // mapHero fell back to a rail — reordering promotes it instead.
      useWorkspaceStore.getState().setWidgetOrder(DEFAULT_PAGE_ID, ["mapHero", "cluster"]);
      expect(activePage().widgetIds).toEqual(["mapHero", "cluster"]);
    });

    it("refuses a reorder that would push the page over its rail budget (PR #676 review)", () => {
      // mapHero (weight 3) is hero first; cluster (weight 2) falls back to a
      // rail. Fill the remaining rail slots so the rails are exactly full
      // with cluster's weight already counted.
      useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "mapHero");
      useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "cluster");
      const remaining = WORKSTATION_RAIL_BUDGET - WIDGET_REGISTRY.cluster.weight;
      const oneWeightIds = ONE_WEIGHT_RAIL_IDS.slice(0, remaining);
      expect(oneWeightIds).toHaveLength(remaining);
      for (const id of oneWeightIds) {
        expect(useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, id)).toEqual({ ok: true });
      }
      const before = activePage().widgetIds;
      expect(before).toEqual(["mapHero", "cluster", ...oneWeightIds]);

      // Promoting cluster to hero demotes mapHero back into the rails, where
      // it now needs 3 slots the already-full rails don't have. Without this
      // check the reorder would persist and a widget would silently vanish
      // on the next render.
      const result = useWorkspaceStore
        .getState()
        .setWidgetOrder(DEFAULT_PAGE_ID, ["cluster", "mapHero", ...oneWeightIds]);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toMatch(/full/i);
      // Refused: the previous order is left untouched.
      expect(activePage().widgetIds).toEqual(before);
    });
  });

  describe("page CRUD and reorder", () => {
    it("addPage appends a new empty page, named by position, and makes it active", () => {
      const result = useWorkspaceStore.getState().addPage();
      expect(result.ok).toBe(true);
      const workspace = activeWorkspace();
      expect(workspace.pages).toHaveLength(2);
      expect(workspace.pages[1]).toEqual({
        id: result.ok ? result.pageId : "",
        title: "Page 2",
        widgetIds: [],
      });
      expect(workspace.activePageId).toBe(result.ok ? result.pageId : "");
    });

    it("addPage honors an explicit title", () => {
      useWorkspaceStore.getState().addPage("Solar watch");
      expect(activeWorkspace().pages[1].title).toBe("Solar watch");
    });

    it("removePage refuses to remove the workspace's only page", () => {
      const result = useWorkspaceStore.getState().removePage(DEFAULT_PAGE_ID);
      expect(result).toEqual({
        ok: false,
        reason: "This is the only page. Add another page before removing this one.",
      });
      expect(activeWorkspace().pages).toHaveLength(1);
    });

    it("removePage removes a non-only page and reassigns activePageId if it was active", () => {
      const added = useWorkspaceStore.getState().addPage("Second");
      expect(added.ok).toBe(true);
      const secondId = added.ok ? added.pageId : "";
      expect(activeWorkspace().activePageId).toBe(secondId);

      const result = useWorkspaceStore.getState().removePage(secondId);
      expect(result).toEqual({ ok: true });
      expect(activeWorkspace().pages).toHaveLength(1);
      expect(activeWorkspace().activePageId).toBe(DEFAULT_PAGE_ID);
    });

    it("renamePage sets a trimmed title and ignores a blank one", () => {
      useWorkspaceStore.getState().renamePage(DEFAULT_PAGE_ID, "  Home  ");
      expect(activePage().title).toBe("Home");
      useWorkspaceStore.getState().renamePage(DEFAULT_PAGE_ID, "   ");
      expect(activePage().title).toBe("Home");
    });

    it("movePage reorders within the workspace and is a no-op at the boundary", () => {
      const added = useWorkspaceStore.getState().addPage("Second");
      const secondId = added.ok ? added.pageId : "";
      expect(activeWorkspace().pages.map((p) => p.id)).toEqual([DEFAULT_PAGE_ID, secondId]);

      useWorkspaceStore.getState().movePage(secondId, "up");
      expect(activeWorkspace().pages.map((p) => p.id)).toEqual([secondId, DEFAULT_PAGE_ID]);

      // Already first: moving up again is a no-op.
      useWorkspaceStore.getState().movePage(secondId, "up");
      expect(activeWorkspace().pages.map((p) => p.id)).toEqual([secondId, DEFAULT_PAGE_ID]);
    });
  });

  describe("addRecipePage", () => {
    it("seeds a new page from a recipe's workstation layout and makes it active", () => {
      const result = useWorkspaceStore.getState().addRecipePage(RECIPE_CHASE_DX.id);
      expect(result.ok).toBe(true);
      const workspace = activeWorkspace();
      expect(workspace.pages).toHaveLength(2);
      const newPage = workspace.pages[1];
      expect(newPage.title).toBe(RECIPE_CHASE_DX.title);
      expect(newPage.widgetIds).toEqual([...RECIPE_CHASE_DX.layouts.workstation]);
      expect(workspace.activePageId).toBe(newPage.id);
    });

    it("refuses honestly for an unknown recipe id, without creating a page", () => {
      const result = useWorkspaceStore.getState().addRecipePage("not-a-recipe");
      expect(result).toEqual({ ok: false, reason: '"not-a-recipe" is not a known recipe.' });
      expect(activeWorkspace().pages).toHaveLength(1);
    });
  });

  describe("auto-page", () => {
    it("setAutoPage sets the active workspace's dwell state", () => {
      useWorkspaceStore.getState().setAutoPage({ enabled: true, dwellSeconds: 15 });
      expect(activeWorkspace().autoPage).toEqual({ enabled: true, dwellSeconds: 15 });
    });
  });

  describe("display settings", () => {
    it("setHeatMapPreset resets thresholds and colours to the new preset's defaults", () => {
      useWorkspaceStore.getState().setHeatMapThreshold(0, 999);
      const otherPreset = PRESETS[1];
      useWorkspaceStore.getState().setHeatMapPreset(otherPreset.id);
      const heatMap = activeWorkspace().display.heatMap;
      expect(heatMap.presetId).toBe(otherPreset.id);
      expect(heatMap.thresholds).toEqual(otherPreset.scale.thresholds);
      expect(heatMap.colors).toEqual(otherPreset.bucketColors);
    });

    it("setHeatMapThreshold updates one threshold in place", () => {
      useWorkspaceStore.getState().setHeatMapThreshold(0, 42);
      expect(activeWorkspace().display.heatMap.thresholds[0]).toBe(42);
      expect(activeWorkspace().display.heatMap.thresholds.length).toBe(PRESETS[0].scale.thresholds.length);
    });

    it("setHeatMapColor updates one bucket colour in place", () => {
      useWorkspaceStore.getState().setHeatMapColor(0, "rgb(var(--su-danger-rgb))");
      expect(activeWorkspace().display.heatMap.colors[0]).toBe("rgb(var(--su-danger-rgb))");
    });

    it("setHeadlineRule and setVisibleBands update the active workspace's display settings", () => {
      useWorkspaceStore.getState().setHeadlineRule("ratio");
      expect(activeWorkspace().display.headlineRule).toBe("ratio");
      useWorkspaceStore.getState().setVisibleBands(["20m", "40m"]);
      expect(activeWorkspace().display.visibleBands).toEqual(["20m", "40m"]);
    });
  });

  describe("phoneVisibleBands (#659)", () => {
    it("defaults to every band, and is set independently of the workstation's display.visibleBands", () => {
      expect(useWorkspaceStore.getState().phoneVisibleBands).toEqual([...BAND_ORDER]);

      useWorkspaceStore.getState().setPhoneVisibleBands(["20m", "40m"]);
      expect(useWorkspaceStore.getState().phoneVisibleBands).toEqual(["20m", "40m"]);
      // The workstation's own visible-bands setting is untouched.
      expect(activeWorkspace().display.visibleBands).toEqual([...BAND_ORDER]);
    });
  });

  describe("migrateWorkspaceState", () => {
    it("adds display and autoPage defaults to a pre-#657 (version 1) persisted workspace", () => {
      const legacyWorkspace = {
        id: DEFAULT_WORKSPACE_ID,
        name: "My workstation",
        canvasType: "workstation",
        pages: [{ id: DEFAULT_PAGE_ID, title: "Page 1", widgetIds: [] }],
        activePageId: DEFAULT_PAGE_ID,
        rails: defaultRailStates(canvasRulesFor("workstation")),
      };
      const migrated = migrateWorkspaceState(
        { workspaces: [legacyWorkspace], activeWorkspaceId: DEFAULT_WORKSPACE_ID },
        1,
      ) as unknown as { workspaces: Array<Record<string, unknown>>; phoneVisibleBands: string[] };

      expect(migrated.workspaces[0].display).toBeTruthy();
      expect(migrated.workspaces[0].autoPage).toEqual({ enabled: false, dwellSeconds: 30 });
      // Everything else about the legacy workspace is preserved untouched.
      expect(migrated.workspaces[0].id).toBe(DEFAULT_WORKSPACE_ID);
      expect(migrated.workspaces[0].pages).toEqual(legacyWorkspace.pages);
      // #659: a pre-#659 (version < 3) state also gains the phone's own band visibility.
      expect(migrated.phoneVisibleBands).toEqual([...BAND_ORDER]);
    });

    it("adds phoneVisibleBands to a version-2 (pre-#659) persisted state, unchanged otherwise", () => {
      const state = { workspaces: [{ id: "x", display: "already-set" }], activeWorkspaceId: "x" };
      const migrated = migrateWorkspaceState(state, 2) as unknown as {
        workspaces: unknown;
        activeWorkspaceId: unknown;
        phoneVisibleBands: string[];
      };
      expect(migrated.workspaces).toEqual(state.workspaces);
      expect(migrated.activeWorkspaceId).toEqual(state.activeWorkspaceId);
      expect(migrated.phoneVisibleBands).toEqual([...BAND_ORDER]);
    });

    it("passes a version-3 state through unchanged", () => {
      const state = {
        workspaces: [{ id: "x", display: "already-set" }],
        activeWorkspaceId: "x",
        phoneVisibleBands: ["20m"],
      };
      expect(migrateWorkspaceState(state, 3)).toEqual(state);
    });
  });
});

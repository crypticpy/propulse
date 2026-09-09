/**
 * Workspace store (#656, extended #657) — workspaces[] -> pages[] -> placed
 * widget ids[].
 *
 * A page stores only the ordered list of widget ids the operator added
 * (`WorkspacePage.widgetIds`), never a computed slot: `autoDock` (the pure
 * lib, `src/lib/workspace/autoDock.ts`) is the single source of truth for
 * *where* a widget lands, so it is re-run at render time from that list
 * (`WorkspaceCanvas`) rather than cached here. `addWidget` runs the same
 * `autoDock` once, up front, purely to decide whether the new widget fits:
 * on success the id is appended to the page; on refusal nothing is stored
 * and the refusal sentence is returned to the caller to show in its overlay
 * (owner decision, epic #652 #3 — refuse, never evict, never spill). #657's
 * `addRecipePage` and `removePage` reuse the same refuse-honestly shape.
 *
 * `setWidgetOrder` is the one primitive MAKE HERO / MOVE TO RAIL (#657's
 * `WidgetsTab`) build on: `autoDock` always docks the *first* eligible
 * hero-capable widget into the space (`autoDock.ts` line ~198), so moving a
 * widget to the front of the list is "make hero" and moving it away from the
 * front lets an earlier widget win the space instead. When a widget is the
 * *only* hero-eligible widget on the page this is a no-op from the
 * operator's point of view — it stays hero either way — which is a property
 * of the shared, pure `autoDock` algorithm (owned by #655), not overridden
 * here.
 *
 * This PR ships exactly one workspace ("My workstation", canvasType
 * "workstation"). Page CRUD/reorder, rail-mutating actions
 * (`setRailCollapsed`, `setRailWidth`, `setActivePage`) and the new display /
 * auto-page settings are therefore all scoped to `activeWorkspaceId` rather
 * than taking a workspace id parameter; that is the one place this store
 * departs from the issue's literal action list; broadening them to take an
 * explicit workspace id is left to whichever PR introduces workspace
 * switching.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { applyRailWidth, canvasRulesFor, defaultRailStates } from "@/lib/workspace/canvasRules";
import { autoDock } from "@/lib/workspace/autoDock";
import { getRecipe } from "@/lib/workspace/recipes";
import type { CanvasType, RailSide, RailState, RailWidth } from "@/lib/workspace/types";
import { PRESETS } from "@/lib/widgets/heatmap";
import type { HeatMapMetric, HeatMapPreset } from "@/lib/widgets/heatmap";

export interface WorkspacePage {
  id: string;
  title: string;
  /** Widget ids in add order. `autoDock(widgetIds, rules)` derives slots from this at render time. */
  widgetIds: string[];
}

/** A workspace's known heat-map preset ids — every id `PRESETS` (`@/lib/widgets/heatmap`) ships. */
export type HeatMapPresetId = HeatMapPreset["id"];

/**
 * Threshold/colour overrides for one heat-map preset. Starts as an exact
 * copy of the preset's own `scale.thresholds` / `bucketColors` (`compute.ts`)
 * so the DisplayTab's sliders and swatches always have a value to show;
 * `setHeatMapPreset` resets both back to the newly chosen preset's defaults.
 */
export interface WorkspaceHeatMapSettings {
  presetId: HeatMapPresetId;
  thresholds: number[];
  colors: string[];
}

export interface WorkspaceDisplaySettings {
  heatMap: WorkspaceHeatMapSettings;
  /** Which per-cell metric a page's single "headline" cell is chosen by, independent of the full grid's colour encoding. */
  headlineRule: HeatMapMetric;
  /** Band designators (`BAND_ORDER`) shown across this workspace's widgets; defaults to every band. */
  visibleBands: string[];
}

export interface WorkspaceAutoPage {
  enabled: boolean;
  dwellSeconds: number;
}

export interface Workspace {
  id: string;
  name: string;
  canvasType: CanvasType;
  pages: WorkspacePage[];
  activePageId: string;
  rails: RailState[];
  display: WorkspaceDisplaySettings;
  autoPage: WorkspaceAutoPage;
}

export type AddWidgetResult = { ok: true } | { ok: false; reason: string };
export type AddPageResult = { ok: true; pageId: string } | { ok: false; reason: string };

function findPreset(presetId: HeatMapPresetId): HeatMapPreset {
  return PRESETS.find((preset) => preset.id === presetId) ?? PRESETS[0];
}

function defaultHeatMapSettings(presetId: HeatMapPresetId = PRESETS[0].id): WorkspaceHeatMapSettings {
  const preset = findPreset(presetId);
  return {
    presetId: preset.id,
    thresholds: [...preset.scale.thresholds],
    colors: [...preset.bucketColors],
  };
}

function defaultDisplaySettings(): WorkspaceDisplaySettings {
  return {
    heatMap: defaultHeatMapSettings(),
    headlineRule: "ladder",
    visibleBands: [...BAND_ORDER],
  };
}

function defaultAutoPage(): WorkspaceAutoPage {
  return { enabled: false, dwellSeconds: 30 };
}

/**
 * Standalone (not inline in `persist`'s config) so it can be unit-tested
 * directly, same convention as `migrateKioskState` (`kioskStore.ts`). Adds
 * `display` / `autoPage` to every pre-#657 (version 1) persisted workspace;
 * every other field is passed through untouched.
 */
export function migrateWorkspaceState(persisted: unknown, version: number): WorkspaceStoreState {
  const state = persisted as { workspaces?: Array<Record<string, unknown>> } & Record<string, unknown>;
  if (version < 2 && Array.isArray(state.workspaces)) {
    state.workspaces = state.workspaces.map((ws) => ({
      display: defaultDisplaySettings(),
      autoPage: defaultAutoPage(),
      ...ws,
    }));
  }
  return state as unknown as WorkspaceStoreState;
}

export interface WorkspaceStoreState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

export interface WorkspaceStoreActions {
  /** Runs `autoDock` for the page's widgets plus `widgetId`; stores the id on success, returns the refusal otherwise. */
  addWidget: (pageId: string, widgetId: string) => AddWidgetResult;
  removeWidget: (pageId: string, widgetId: string) => void;
  /**
   * Replaces a page's widget id order wholesale — the primitive `WidgetsTab`'s
   * MAKE HERO / MOVE TO RAIL build on (see file docblock). Reruns `autoDock`
   * over the full reordered list first and refuses (leaving the page
   * untouched) if any widget would no longer fit, same refuse-honestly shape
   * as `addWidget`.
   */
  setWidgetOrder: (pageId: string, widgetIds: string[]) => AddWidgetResult;
  /** Toggles one rail's drawer state on the active workspace. */
  setRailCollapsed: (side: RailSide, collapsed: boolean) => void;
  /** Steps one rail's width on the active workspace via `applyRailWidth` (enforces the canvas's collapse-opposite policy). */
  setRailWidth: (side: RailSide, width: RailWidth) => void;
  setActivePage: (pageId: string) => void;
  /** Appends a new empty page to the active workspace, makes it active, and returns its id. */
  addPage: (title?: string) => AddPageResult;
  /** Removes a page from the active workspace; refuses to remove the workspace's only page. */
  removePage: (pageId: string) => AddWidgetResult;
  renamePage: (pageId: string, title: string) => void;
  /** Moves a page one slot earlier/later within the active workspace's page order. */
  movePage: (pageId: string, direction: "up" | "down") => void;
  /** Seeds a new page from a recipe's layout for the active workspace's canvas type; refuses (without creating a page) if any widget would not fit. */
  addRecipePage: (recipeId: string) => AddPageResult;
  setAutoPage: (autoPage: WorkspaceAutoPage) => void;
  /** Switches the active workspace's heat-map preset, resetting thresholds/colours to that preset's defaults. */
  setHeatMapPreset: (presetId: HeatMapPresetId) => void;
  setHeatMapThreshold: (index: number, value: number) => void;
  setHeatMapColor: (index: number, color: string) => void;
  setHeadlineRule: (rule: HeatMapMetric) => void;
  setVisibleBands: (bands: string[]) => void;
}

export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions;

export const DEFAULT_WORKSPACE_ID = "workstation-default";
export const DEFAULT_PAGE_ID = "page-1";

function createDefaultWorkspace(): Workspace {
  const canvasType: CanvasType = "workstation";
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "My workstation",
    canvasType,
    pages: [{ id: DEFAULT_PAGE_ID, title: "Page 1", widgetIds: [] }],
    activePageId: DEFAULT_PAGE_ID,
    rails: defaultRailStates(canvasRulesFor(canvasType)),
    display: defaultDisplaySettings(),
    autoPage: defaultAutoPage(),
  };
}

/** The workspace that owns `pageId`, plus that page, or `undefined` if no workspace has it. */
function findWorkspaceAndPage(
  workspaces: readonly Workspace[],
  pageId: string,
): { workspace: Workspace; page: WorkspacePage } | undefined {
  for (const workspace of workspaces) {
    const page = workspace.pages.find((p) => p.id === pageId);
    if (page) return { workspace, page };
  }
  return undefined;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [createDefaultWorkspace()],
      activeWorkspaceId: DEFAULT_WORKSPACE_ID,

      addWidget: (pageId, widgetId) => {
        const found = findWorkspaceAndPage(get().workspaces, pageId);
        if (!found) {
          return { ok: false, reason: `"${pageId}" is not a page in any workspace.` };
        }
        const { workspace, page } = found;
        const rules = canvasRulesFor(workspace.canvasType);
        const nextIds = [...page.widgetIds, widgetId];
        const result = autoDock(nextIds, rules);
        const refusal = result.refusals.find((r) => r.widgetId === widgetId);
        if (refusal) return { ok: false, reason: refusal.reason };

        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== workspace.id
              ? ws
              : {
                  ...ws,
                  pages: ws.pages.map((p) => (p.id !== pageId ? p : { ...p, widgetIds: nextIds })),
                },
          ),
        }));
        return { ok: true };
      },

      removeWidget: (pageId, widgetId) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            pages: ws.pages.map((p) =>
              p.id !== pageId ? p : { ...p, widgetIds: p.widgetIds.filter((id) => id !== widgetId) },
            ),
          })),
        }));
      },

      setWidgetOrder: (pageId, widgetIds) => {
        const found = findWorkspaceAndPage(get().workspaces, pageId);
        if (!found) {
          return { ok: false, reason: `"${pageId}" is not a page in any workspace.` };
        }
        const { workspace } = found;
        const rules = canvasRulesFor(workspace.canvasType);
        const result = autoDock(widgetIds, rules);
        if (result.refusals.length > 0) {
          return { ok: false, reason: result.refusals.map((r) => r.reason).join(" ") };
        }

        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== workspace.id
              ? ws
              : { ...ws, pages: ws.pages.map((p) => (p.id !== pageId ? p : { ...p, widgetIds })) },
          ),
        }));
        return { ok: true };
      },

      setRailCollapsed: (side, collapsed) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== state.activeWorkspaceId
              ? ws
              : { ...ws, rails: ws.rails.map((r) => (r.side !== side ? r : { ...r, collapsed })) },
          ),
        }));
      },

      setRailWidth: (side, width) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => {
            if (ws.id !== state.activeWorkspaceId) return ws;
            const rules = canvasRulesFor(ws.canvasType);
            // `applyRailWidth` only sets `width` on `side` and (per the
            // canvas's opposite-collapses policy) may collapse the opposite
            // rail; it never uncollapses `side` itself. Picking a width is
            // an implicit "show this rail" action for every caller, so that
            // happens here — otherwise choosing a width for an
            // already-collapsed rail would leave both side rails hidden
            // (PR #676 review).
            const withWidth = applyRailWidth(rules, ws.rails, side, width);
            return {
              ...ws,
              rails: withWidth.map((rail) => (rail.side === side ? { ...rail, collapsed: false } : rail)),
            };
          }),
        }));
      },

      setActivePage: (pageId) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== state.activeWorkspaceId ? ws : { ...ws, activePageId: pageId },
          ),
        }));
      },

      addPage: (title) => {
        const pageId = crypto.randomUUID();
        set((state) => ({
          workspaces: state.workspaces.map((ws) => {
            if (ws.id !== state.activeWorkspaceId) return ws;
            const resolvedTitle = title?.trim() || `Page ${ws.pages.length + 1}`;
            return {
              ...ws,
              pages: [...ws.pages, { id: pageId, title: resolvedTitle, widgetIds: [] }],
              activePageId: pageId,
            };
          }),
        }));
        return { ok: true, pageId };
      },

      removePage: (pageId) => {
        const workspace = get().workspaces.find((ws) => ws.id === get().activeWorkspaceId);
        if (!workspace) return { ok: false, reason: "No active workspace." };
        if (workspace.pages.length <= 1) {
          return { ok: false, reason: "This is the only page. Add another page before removing this one." };
        }
        if (!workspace.pages.some((p) => p.id === pageId)) {
          return { ok: false, reason: `"${pageId}" is not a page in this workspace.` };
        }

        set((state) => ({
          workspaces: state.workspaces.map((ws) => {
            if (ws.id !== state.activeWorkspaceId) return ws;
            const pages = ws.pages.filter((p) => p.id !== pageId);
            const activePageId = ws.activePageId === pageId ? pages[0].id : ws.activePageId;
            return { ...ws, pages, activePageId };
          }),
        }));
        return { ok: true };
      },

      renamePage: (pageId, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            pages: ws.pages.map((p) => (p.id !== pageId ? p : { ...p, title: trimmed })),
          })),
        }));
      },

      movePage: (pageId, direction) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => {
            if (ws.id !== state.activeWorkspaceId) return ws;
            const index = ws.pages.findIndex((p) => p.id === pageId);
            const targetIndex = direction === "up" ? index - 1 : index + 1;
            if (index === -1 || targetIndex < 0 || targetIndex >= ws.pages.length) return ws;
            const pages = [...ws.pages];
            [pages[index], pages[targetIndex]] = [pages[targetIndex], pages[index]];
            return { ...ws, pages };
          }),
        }));
      },

      addRecipePage: (recipeId) => {
        const recipe = getRecipe(recipeId);
        if (!recipe) return { ok: false, reason: `"${recipeId}" is not a known recipe.` };

        const workspace = get().workspaces.find((ws) => ws.id === get().activeWorkspaceId);
        if (!workspace) return { ok: false, reason: "No active workspace." };
        if (workspace.canvasType === "phone") {
          return { ok: false, reason: "Phone recipes are not supported on this workspace yet." };
        }

        const widgetIds = [...recipe.layouts[workspace.canvasType]];
        const rules = canvasRulesFor(workspace.canvasType);
        const dock = autoDock(widgetIds, rules);
        if (dock.refusals.length > 0) {
          return { ok: false, reason: dock.refusals.map((r) => r.reason).join(" ") };
        }

        const pageId = crypto.randomUUID();
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== workspace.id
              ? ws
              : {
                  ...ws,
                  pages: [...ws.pages, { id: pageId, title: recipe.title, widgetIds }],
                  activePageId: pageId,
                },
          ),
        }));
        return { ok: true, pageId };
      },

      setAutoPage: (autoPage) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => (ws.id !== state.activeWorkspaceId ? ws : { ...ws, autoPage })),
        }));
      },

      setHeatMapPreset: (presetId) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== state.activeWorkspaceId
              ? ws
              : { ...ws, display: { ...ws.display, heatMap: defaultHeatMapSettings(presetId) } },
          ),
        }));
      },

      setHeatMapThreshold: (index, value) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => {
            if (ws.id !== state.activeWorkspaceId) return ws;
            const thresholds = [...ws.display.heatMap.thresholds];
            if (index < 0 || index >= thresholds.length) return ws;
            thresholds[index] = value;
            return { ...ws, display: { ...ws.display, heatMap: { ...ws.display.heatMap, thresholds } } };
          }),
        }));
      },

      setHeatMapColor: (index, color) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) => {
            if (ws.id !== state.activeWorkspaceId) return ws;
            const colors = [...ws.display.heatMap.colors];
            if (index < 0 || index >= colors.length) return ws;
            colors[index] = color;
            return { ...ws, display: { ...ws.display, heatMap: { ...ws.display.heatMap, colors } } };
          }),
        }));
      },

      setHeadlineRule: (rule) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== state.activeWorkspaceId ? ws : { ...ws, display: { ...ws.display, headlineRule: rule } },
          ),
        }));
      },

      setVisibleBands: (bands) => {
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id !== state.activeWorkspaceId ? ws : { ...ws, display: { ...ws.display, visibleBands: bands } },
          ),
        }));
      },
    }),
    {
      name: "propulse-workspace-store",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: migrateWorkspaceState,
    },
  ),
);

export function useActiveWorkspace(): Workspace {
  return useWorkspaceStore(
    (s) => s.workspaces.find((ws) => ws.id === s.activeWorkspaceId) ?? s.workspaces[0],
  );
}

export function useActivePage(): WorkspacePage {
  const workspace = useActiveWorkspace();
  return workspace.pages.find((p) => p.id === workspace.activePageId) ?? workspace.pages[0];
}

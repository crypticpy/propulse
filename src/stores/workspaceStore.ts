/**
 * Workspace store (#656) — workspaces[] -> pages[] -> placed widget ids[].
 *
 * A page stores only the ordered list of widget ids the operator added
 * (`WorkspacePage.widgetIds`), never a computed slot: `autoDock` (the pure
 * lib, `src/lib/workspace/autoDock.ts`) is the single source of truth for
 * *where* a widget lands, so it is re-run at render time from that list
 * (`WorkspaceCanvas`) rather than cached here. `addWidget` runs the same
 * `autoDock` once, up front, purely to decide whether the new widget fits:
 * on success the id is appended to the page; on refusal nothing is stored
 * and the refusal sentence is returned to the caller to show in its overlay
 * (owner decision, epic #652 #3 — refuse, never evict, never spill).
 *
 * This PR ships exactly one workspace ("My workstation", canvasType
 * "workstation") with one empty page — multi-workspace/page management is
 * #657. Rail-mutating actions (`setRailCollapsed`, `setRailWidth`,
 * `setActivePage`) are therefore scoped to `activeWorkspaceId` rather than
 * taking a workspace id parameter; that is the one place this store departs
 * from the issue's literal action list; broadening them to take an explicit
 * workspace id is left to whichever PR introduces workspace switching.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { applyRailWidth, canvasRulesFor, defaultRailStates } from "@/lib/workspace/canvasRules";
import { autoDock } from "@/lib/workspace/autoDock";
import type { CanvasType, RailSide, RailState, RailWidth } from "@/lib/workspace/types";

export interface WorkspacePage {
  id: string;
  title: string;
  /** Widget ids in add order. `autoDock(widgetIds, rules)` derives slots from this at render time. */
  widgetIds: string[];
}

export interface Workspace {
  id: string;
  name: string;
  canvasType: CanvasType;
  pages: WorkspacePage[];
  activePageId: string;
  rails: RailState[];
}

export type AddWidgetResult = { ok: true } | { ok: false; reason: string };

export interface WorkspaceStoreState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

export interface WorkspaceStoreActions {
  /** Runs `autoDock` for the page's widgets plus `widgetId`; stores the id on success, returns the refusal otherwise. */
  addWidget: (pageId: string, widgetId: string) => AddWidgetResult;
  removeWidget: (pageId: string, widgetId: string) => void;
  /** Toggles one rail's drawer state on the active workspace. */
  setRailCollapsed: (side: RailSide, collapsed: boolean) => void;
  /** Steps one rail's width on the active workspace via `applyRailWidth` (enforces the canvas's collapse-opposite policy). */
  setRailWidth: (side: RailSide, width: RailWidth) => void;
  setActivePage: (pageId: string) => void;
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
            return { ...ws, rails: applyRailWidth(rules, ws.rails, side, width) };
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
    }),
    {
      name: "propulse-workspace-store",
      version: 1,
      storage: createJSONStorage(() => localStorage),
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

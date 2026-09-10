import { create } from "zustand";
import type { OpsDockTab } from "@/stores/contestUIStore";
import type { MapDataScope } from "@/lib/map/operationalScope";

/**
 * The operator's explicit dock-tab choice, plus the operating scope it is
 * paired with. `scope` is `null` until the reconciler in the window that made
 * the choice observes the scope the click produced and stamps it (#884 round
 * 7); the stamped value is what crosses to a secondary window, where the tab
 * and the scope change arrive as two separate messages and the intent has to
 * wait for the second one.
 */
export interface DockTabIntent {
  tab: OpsDockTab;
  scope: MapDataScope | null;
}

export interface VoiceCommand {
  action: "start" | "stop";
  sessionId: string;
  commandId: number;
}

interface ContestUIEphemeralState {
  entryFocusRequestId: number;
  requestEntryFocus: () => void;

  /**
   * A dock tab the operator picked by clicking it (#884). The single dock-tab
   * reconciler (`useDockTabReconciler`) stands down while it is set, so the
   * click is not undone by the scope change the click itself causes. Ephemeral
   * on purpose: an intent must never outlive the session that produced it, let
   * alone a reload.
   */
  dockTabIntent: DockTabIntent | null;
  setDockTabIntent: (tab: OpsDockTab) => void;
  stampDockTabIntent: (scope: MapDataScope) => void;
  clearDockTabIntent: () => void;

  /**
   * Bumped when the operator picks a scope in `OperationalScopeControl`
   * (#884 round 6). Choosing Log takes the desk in the same event, and the
   * reconciler's Contact/Desk gate would otherwise swallow the very scope
   * change the operator just asked for. An explicit selection outranks the
   * gate for exactly the next reconciler run.
   */
  scopeReconcileRequestId: number;
  requestScopeReconcile: () => void;

  voiceCommand: VoiceCommand | null;
  issueVoiceCommand: (action: "start" | "stop", sessionId: string) => void;
  clearVoiceCommand: () => void;
}

export const useContestUIEphemeralStore = create<ContestUIEphemeralState>(
  (set) => ({
    entryFocusRequestId: 0,
    requestEntryFocus: () =>
      set((state) => ({ entryFocusRequestId: state.entryFocusRequestId + 1 })),

    dockTabIntent: null,
    setDockTabIntent: (tab) => set({ dockTabIntent: { tab, scope: null } }),
    stampDockTabIntent: (scope) =>
      set((state) =>
        state.dockTabIntent === null
          ? state
          : { dockTabIntent: { tab: state.dockTabIntent.tab, scope } },
      ),
    clearDockTabIntent: () => set({ dockTabIntent: null }),

    scopeReconcileRequestId: 0,
    requestScopeReconcile: () =>
      set((state) => ({
        scopeReconcileRequestId: state.scopeReconcileRequestId + 1,
      })),

    voiceCommand: null,
    issueVoiceCommand: (action, sessionId) =>
      set((state) => ({
        voiceCommand: {
          action,
          sessionId,
          commandId:
            typeof state.voiceCommand?.commandId === "number"
              ? state.voiceCommand.commandId + 1
              : 1,
        },
      })),
    clearVoiceCommand: () => set({ voiceCommand: null }),
  }),
);


import { create } from "zustand";
import type { OpsDockTab } from "@/stores/contestUIStore";

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
   * reconciler (`useDockTabReconciler`) consumes this on its next run and
   * stands down for that run, so the click is not undone by the scope change
   * the click itself causes. Ephemeral on purpose: an intent must never
   * outlive the session that produced it, let alone a reload.
   */
  explicitDockTab: OpsDockTab | null;
  setExplicitDockTab: (tab: OpsDockTab) => void;
  clearExplicitDockTab: () => void;

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

    explicitDockTab: null,
    setExplicitDockTab: (explicitDockTab) => set({ explicitDockTab }),
    clearExplicitDockTab: () => set({ explicitDockTab: null }),

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


/**
 * contestUIStore - Ephemeral-but-persistent contest UI state
 *
 * Kept outside component trees to survive route transitions (/contest <-> /map),
 * dock expand/collapse, and view remounts.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import type { MapDataScope } from "@/lib/map/operationalScope";

export type OpsDockTab = "dx" | "log" | "contest";

/**
 * Dock key used while no contest session is active. The dock tab is stored per
 * session, and the pre-session dock is a real dock with its own tab (#884), so
 * everything that reads or writes it has to agree on this one spelling.
 */
export const NO_SESSION_DOCK_KEY = "no-session";

/** The `dockTabBySessionId` key for a session id that may be absent. */
export function dockKeyForSession(sessionId: string | null | undefined): string {
  return sessionId ?? NO_SESSION_DOCK_KEY;
}

export interface DraftSelection {
  start: number;
  end: number;
}

export interface PendingDraftReplace {
  sessionId: string;
  nextText: string;
  source: "spot" | "voice";
}

interface ContestUIState {
  // ---------------------------------------------------------------------------
  // Ops dock state
  // ---------------------------------------------------------------------------
  dockTabBySessionId: Record<string, OpsDockTab>;
  /**
   * The operating scope under which the operator last *explicitly* chose the
   * dock tab, keyed the same way as `dockTabBySessionId` (#884 round 10).
   *
   * The explicit intent itself is ephemeral by design, so a window that opens
   * later — or the clicking window after a reload — hydrates the persisted tab
   * with no way to tell an explicit choice from a stale one, and reconciles it
   * away. This marker is what tells them apart. It is set when the reconciler
   * consumes an intent (the point where the scope has settled) and cleared by
   * `setDockTab`, which every automatic write goes through, so it can never
   * outlive one scope change or one session.
   */
  explicitDockTabScopeByDockKey: Record<string, MapDataScope>;
  markExplicitDockTab: (dockKey: string, scope: MapDataScope) => void;
  setDockTab: (sessionId: string, tab: OpsDockTab) => void;
  getDockTab: (sessionId: string | null | undefined) => OpsDockTab;

  // ---------------------------------------------------------------------------
  // Band/Mode UI selection (until CAT drives it)
  // ---------------------------------------------------------------------------
  bandBySessionId: Record<string, string>;
  modeBySessionId: Record<string, string>;
  setBand: (sessionId: string, band: string) => void;
  setMode: (sessionId: string, mode: string) => void;
  getBand: (sessionId: string | null | undefined) => string;
  getMode: (sessionId: string | null | undefined) => string;

  // ---------------------------------------------------------------------------
  // One-line draft state (shared across /contest and embedded dock)
  // ---------------------------------------------------------------------------
  draftBySessionId: Record<string, string>;
  draftSelectionBySessionId: Record<string, DraftSelection | null>;
  draftUpdatedAtBySessionId: Record<string, number>;
  draftHasFocusBySessionId: Record<string, boolean>;
  setDraft: (sessionId: string, value: string) => void;
  clearDraft: (sessionId: string) => void;
  setDraftSelection: (sessionId: string, selection: DraftSelection | null) => void;
  setDraftHasFocus: (sessionId: string, hasFocus: boolean) => void;

  // Explicit overwrite confirmation (spot/voice)
  pendingDraftReplace: PendingDraftReplace | null;
  requestDraftReplace: (pending: PendingDraftReplace) => void;
  cancelDraftReplace: () => void;
  confirmDraftReplace: () => void;

  // ---------------------------------------------------------------------------
  // Focus control
  // ---------------------------------------------------------------------------
  // Note: focus signaling lives in useContestUIEphemeralStore.

  // ---------------------------------------------------------------------------
  // Spot prefill preferences (user-level)
  // ---------------------------------------------------------------------------
  spotPrefillInRun: boolean;
  setSpotPrefillInRun: (enabled: boolean) => void;
  adoptBandFromSpot: boolean;
  setAdoptBandFromSpot: (enabled: boolean) => void;
  adoptModeFromSpot: boolean;
  setAdoptModeFromSpot: (enabled: boolean) => void;
  focusEntryOnSpotPrefill: boolean;
  setFocusEntryOnSpotPrefill: (enabled: boolean) => void;

  // ---------------------------------------------------------------------------
  // Public spotting assistance (per contest session)
  // ---------------------------------------------------------------------------
  publicAssistanceBySessionId: Record<string, boolean>;
  setPublicAssistance: (sessionId: string, enabled: boolean) => void;

  // ---------------------------------------------------------------------------
  // Lite HUD visibility per session (opt-out)
  // ---------------------------------------------------------------------------
  liteHudDismissedBySessionId: Record<string, boolean>;
  dismissLiteHud: (sessionId: string) => void;
  showLiteHud: (sessionId: string) => void;
}

const DEFAULT_BAND = "20m";
const DEFAULT_MODE = "CW";

export const useContestUIStore = create<ContestUIState>()(
  persist(
    (set, get) => ({
      dockTabBySessionId: {},
      explicitDockTabScopeByDockKey: {},
      // Any write through this setter is an automatic one unless the caller
      // marks it afterwards, so it clears the explicit marker. That keeps the
      // marker honest for writers this file has never heard of.
      setDockTab: (sessionId, tab) =>
        set((state) => {
          const explicit = { ...state.explicitDockTabScopeByDockKey };
          delete explicit[sessionId];
          return {
            dockTabBySessionId: {
              ...state.dockTabBySessionId,
              [sessionId]: tab,
            },
            explicitDockTabScopeByDockKey: explicit,
          };
        }),
      // Idempotent: re-marking the same scope must not churn the store, or
      // every window that consumes the same intent would publish a redundant
      // snapshot to the others.
      markExplicitDockTab: (dockKey, scope) =>
        set((state) =>
          state.explicitDockTabScopeByDockKey[dockKey] === scope
            ? state
            : {
                explicitDockTabScopeByDockKey: {
                  ...state.explicitDockTabScopeByDockKey,
                  [dockKey]: scope,
                },
              },
        ),
      getDockTab: (sessionId) => {
        if (!sessionId) {
          return "dx";
        }
        return get().dockTabBySessionId[sessionId] ?? "contest";
      },

      bandBySessionId: {},
      modeBySessionId: {},
      setBand: (sessionId, band) =>
        set((state) => ({
          bandBySessionId: { ...state.bandBySessionId, [sessionId]: band },
        })),
      setMode: (sessionId, mode) =>
        set((state) => ({
          modeBySessionId: { ...state.modeBySessionId, [sessionId]: mode },
        })),
      getBand: (sessionId) => {
        if (!sessionId) return DEFAULT_BAND;
        return get().bandBySessionId[sessionId] ?? DEFAULT_BAND;
      },
      getMode: (sessionId) => {
        if (!sessionId) return DEFAULT_MODE;
        return get().modeBySessionId[sessionId] ?? DEFAULT_MODE;
      },

      draftBySessionId: {},
      draftSelectionBySessionId: {},
      draftUpdatedAtBySessionId: {},
      draftHasFocusBySessionId: {},
      setDraft: (sessionId, value) =>
        set((state) => ({
          draftBySessionId: { ...state.draftBySessionId, [sessionId]: value },
          draftUpdatedAtBySessionId: {
            ...state.draftUpdatedAtBySessionId,
            [sessionId]: Date.now(),
          },
        })),
      clearDraft: (sessionId) =>
        set((state) => ({
          draftBySessionId: { ...state.draftBySessionId, [sessionId]: "" },
          draftSelectionBySessionId: {
            ...state.draftSelectionBySessionId,
            [sessionId]: { start: 0, end: 0 },
          },
          draftUpdatedAtBySessionId: {
            ...state.draftUpdatedAtBySessionId,
            [sessionId]: Date.now(),
          },
        })),
      setDraftSelection: (sessionId, selection) =>
        set((state) => ({
          draftSelectionBySessionId: {
            ...state.draftSelectionBySessionId,
            [sessionId]: selection,
          },
        })),
      setDraftHasFocus: (sessionId, hasFocus) =>
        set((state) => ({
          draftHasFocusBySessionId: {
            ...state.draftHasFocusBySessionId,
            [sessionId]: hasFocus,
          },
        })),

      pendingDraftReplace: null,
      requestDraftReplace: (pending) => set({ pendingDraftReplace: pending }),
      cancelDraftReplace: () => set({ pendingDraftReplace: null }),
      confirmDraftReplace: () => {
        const pending = get().pendingDraftReplace;
        if (!pending) {
          return;
        }
        get().setDraft(pending.sessionId, pending.nextText);
        set({ pendingDraftReplace: null });
        useContestUIEphemeralStore.getState().requestEntryFocus();
      },

      spotPrefillInRun: false,
      setSpotPrefillInRun: (enabled) => set({ spotPrefillInRun: enabled }),
      adoptBandFromSpot: true,
      setAdoptBandFromSpot: (enabled) => set({ adoptBandFromSpot: enabled }),
      adoptModeFromSpot: true,
      setAdoptModeFromSpot: (enabled) => set({ adoptModeFromSpot: enabled }),
      focusEntryOnSpotPrefill: true,
      setFocusEntryOnSpotPrefill: (enabled) =>
        set({ focusEntryOnSpotPrefill: enabled }),

      // Assistance is session-scoped so a prior assisted entry cannot silently
      // change the posture of a later non-assisted contest.
      publicAssistanceBySessionId: {},
      setPublicAssistance: (sessionId, enabled) =>
        set((state) => ({
          publicAssistanceBySessionId: {
            ...state.publicAssistanceBySessionId,
            [sessionId]: enabled,
          },
        })),

      liteHudDismissedBySessionId: {},
      dismissLiteHud: (sessionId) =>
        set((state) => ({
          liteHudDismissedBySessionId: {
            ...state.liteHudDismissedBySessionId,
            [sessionId]: true,
          },
        })),
      showLiteHud: (sessionId) =>
        set((state) => ({
          liteHudDismissedBySessionId: {
            ...state.liteHudDismissedBySessionId,
            [sessionId]: false,
          },
        })),
    }),
    {
      name: "propulse-contest-ui",
      storage: createJSONStorage(() => localStorage),
      version: 4,
      migrate: (persisted, version) => {
        if (version >= 4) {
          return persisted as ContestUIState;
        }

        const state = persisted as Partial<ContestUIState>;
        if (version === 3) {
          // v4 adds the explicit dock-tab scope marker (#884 round 10). There
          // is no way to recover which stored tabs were explicit, so every
          // dock starts unmarked and the first reconcile treats them as
          // automatic.
          return {
            ...state,
            explicitDockTabScopeByDockKey: {},
          } as ContestUIState;
        }
        return {
          dockTabBySessionId: state.dockTabBySessionId ?? {},
          explicitDockTabScopeByDockKey: {},
          bandBySessionId: state.bandBySessionId ?? {},
          modeBySessionId: state.modeBySessionId ?? {},
          draftBySessionId: state.draftBySessionId ?? {},
          // Intentionally drop selection + updatedAt on migration to avoid
          // surprising restores of highly-ephemeral UI state.
          draftSelectionBySessionId: {},
          draftUpdatedAtBySessionId: {},
          draftHasFocusBySessionId: {},

          pendingDraftReplace: null,

          spotPrefillInRun: state.spotPrefillInRun ?? false,
          adoptBandFromSpot: state.adoptBandFromSpot ?? true,
          adoptModeFromSpot: state.adoptModeFromSpot ?? true,
          focusEntryOnSpotPrefill: state.focusEntryOnSpotPrefill ?? true,

          publicAssistanceBySessionId:
            state.publicAssistanceBySessionId ?? {},

          liteHudDismissedBySessionId: state.liteHudDismissedBySessionId ?? {},
        } as ContestUIState;
      },
      partialize: (state) => ({
        dockTabBySessionId: state.dockTabBySessionId,
        explicitDockTabScopeByDockKey: state.explicitDockTabScopeByDockKey,
        bandBySessionId: state.bandBySessionId,
        modeBySessionId: state.modeBySessionId,
        draftBySessionId: state.draftBySessionId,
        spotPrefillInRun: state.spotPrefillInRun,
        adoptBandFromSpot: state.adoptBandFromSpot,
        adoptModeFromSpot: state.adoptModeFromSpot,
        focusEntryOnSpotPrefill: state.focusEntryOnSpotPrefill,
        publicAssistanceBySessionId: state.publicAssistanceBySessionId,
        liteHudDismissedBySessionId: state.liteHudDismissedBySessionId,
      }),
    },
  ),
);

/**
 * contestUIStore - Ephemeral-but-persistent contest UI state
 *
 * Kept outside component trees to survive route transitions (/contest <-> /map),
 * dock expand/collapse, and view remounts.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type OpsDockTab = "dx" | "contest";
export type VoiceStatus =
  | "idle"
  | "recording"
  | "processing"
  | "candidates"
  | "error"
  | "unavailable";

export interface DraftSelection {
  start: number;
  end: number;
}

export interface PendingDraftReplace {
  sessionId: string;
  nextText: string;
  source: "spot" | "voice";
}

export interface VoiceState {
  status: VoiceStatus;
  transcript: string;
  interimTranscript: string;
  candidates: string[];
  error: string | null;
  updatedAt: number;
}

interface ContestUIState {
  // ---------------------------------------------------------------------------
  // Ops dock state
  // ---------------------------------------------------------------------------
  dockTabBySessionId: Record<string, OpsDockTab>;
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
  entryFocusRequestId: number;
  requestEntryFocus: () => void;

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
  // Lite HUD visibility per session (opt-out)
  // ---------------------------------------------------------------------------
  liteHudDismissedBySessionId: Record<string, boolean>;
  dismissLiteHud: (sessionId: string) => void;
  showLiteHud: (sessionId: string) => void;

  // ---------------------------------------------------------------------------
  // Voice pipeline state (managed by ContestVoiceManager)
  // ---------------------------------------------------------------------------
  voiceBySessionId: Record<string, VoiceState>;
  setVoiceState: (sessionId: string, partial: Partial<VoiceState>) => void;
  resetVoiceState: (sessionId: string) => void;
  voiceCommand:
    | { action: "start" | "stop"; sessionId: string; commandId: number }
    | null;
  issueVoiceCommand: (action: "start" | "stop", sessionId: string) => void;
}

const DEFAULT_BAND = "20m";
const DEFAULT_MODE = "CW";

function initialVoiceState(): VoiceState {
  return {
    status: "idle",
    transcript: "",
    interimTranscript: "",
    candidates: [],
    error: null,
    updatedAt: Date.now(),
  };
}

export const useContestUIStore = create<ContestUIState>()(
  persist(
    (set, get) => ({
      dockTabBySessionId: {},
      setDockTab: (sessionId, tab) =>
        set((state) => ({
          dockTabBySessionId: {
            ...state.dockTabBySessionId,
            [sessionId]: tab,
          },
        })),
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
        get().requestEntryFocus();
      },

      entryFocusRequestId: 0,
      requestEntryFocus: () =>
        set((state) => ({ entryFocusRequestId: state.entryFocusRequestId + 1 })),

      spotPrefillInRun: false,
      setSpotPrefillInRun: (enabled) => set({ spotPrefillInRun: enabled }),
      adoptBandFromSpot: true,
      setAdoptBandFromSpot: (enabled) => set({ adoptBandFromSpot: enabled }),
      adoptModeFromSpot: true,
      setAdoptModeFromSpot: (enabled) => set({ adoptModeFromSpot: enabled }),
      focusEntryOnSpotPrefill: true,
      setFocusEntryOnSpotPrefill: (enabled) =>
        set({ focusEntryOnSpotPrefill: enabled }),

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

      voiceBySessionId: {},
      setVoiceState: (sessionId, partial) =>
        set((state) => ({
          voiceBySessionId: {
            ...state.voiceBySessionId,
            [sessionId]: {
              ...(state.voiceBySessionId[sessionId] ?? initialVoiceState()),
              ...partial,
              updatedAt: Date.now(),
            },
          },
        })),
      resetVoiceState: (sessionId) =>
        set((state) => ({
          voiceBySessionId: {
            ...state.voiceBySessionId,
            [sessionId]: initialVoiceState(),
          },
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
    }),
    {
      name: "propulse-contest-ui",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        dockTabBySessionId: state.dockTabBySessionId,
        bandBySessionId: state.bandBySessionId,
        modeBySessionId: state.modeBySessionId,
        draftBySessionId: state.draftBySessionId,
        draftSelectionBySessionId: state.draftSelectionBySessionId,
        draftUpdatedAtBySessionId: state.draftUpdatedAtBySessionId,
        spotPrefillInRun: state.spotPrefillInRun,
        adoptBandFromSpot: state.adoptBandFromSpot,
        adoptModeFromSpot: state.adoptModeFromSpot,
        focusEntryOnSpotPrefill: state.focusEntryOnSpotPrefill,
        liteHudDismissedBySessionId: state.liteHudDismissedBySessionId,
      }),
    },
  ),
);


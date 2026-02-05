import { create } from "zustand";

export interface VoiceCommand {
  action: "start" | "stop";
  sessionId: string;
  commandId: number;
}

interface ContestUIEphemeralState {
  entryFocusRequestId: number;
  requestEntryFocus: () => void;

  voiceCommand: VoiceCommand | null;
  issueVoiceCommand: (action: "start" | "stop", sessionId: string) => void;
  clearVoiceCommand: () => void;
}

export const useContestUIEphemeralStore = create<ContestUIEphemeralState>(
  (set) => ({
    entryFocusRequestId: 0,
    requestEntryFocus: () =>
      set((state) => ({ entryFocusRequestId: state.entryFocusRequestId + 1 })),

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


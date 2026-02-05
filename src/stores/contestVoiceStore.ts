import { create } from "zustand";

export type VoiceStatus =
  | "idle"
  | "recording"
  | "processing"
  | "candidates"
  | "error"
  | "unavailable";

export interface VoiceState {
  status: VoiceStatus;
  transcript: string;
  interimTranscript: string;
  candidates: string[];
  error: string | null;
  updatedAt: number;
}

interface ContestVoiceStoreState {
  voiceBySessionId: Record<string, VoiceState>;
  setVoiceState: (sessionId: string, partial: Partial<VoiceState>) => void;
  resetVoiceState: (sessionId: string) => void;
}

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

export const useContestVoiceStore = create<ContestVoiceStoreState>((set) => ({
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
}));


import { create } from "zustand";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";

export interface SdrStoreState {
  fftEnabled: boolean;
  audioEnabled: boolean;
  lastFftFrame: Extract<RadioBinaryFrame, { kind: "fft" }> | null;
  lastAudioFrame: Extract<RadioBinaryFrame, { kind: "audio" }> | null;

  setFftEnabled: (enabled: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setFrame: (frame: RadioBinaryFrame) => void;
  clearFrames: () => void;
}

export const useSdrStore = create<SdrStoreState>()((set) => ({
  fftEnabled: false,
  audioEnabled: false,
  lastFftFrame: null,
  lastAudioFrame: null,

  setFftEnabled: (enabled) => set({ fftEnabled: enabled }),
  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),

  setFrame: (frame) =>
    set(() => {
      if (frame.kind === "fft") return { lastFftFrame: frame };
      return { lastAudioFrame: frame };
    }),

  clearFrames: () => set({ lastFftFrame: null, lastAudioFrame: null }),
}));


import { create } from "zustand";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";

export interface SdrStoreState {
  fftEnabled: boolean;
  audioEnabled: boolean;
  lastFftFrame: Extract<RadioBinaryFrame, { kind: "fft" }> | null;

  setFftEnabled: (enabled: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setFrame: (frame: Extract<RadioBinaryFrame, { kind: "fft" }>) => void;
  clearFrames: () => void;
}

export const useSdrStore = create<SdrStoreState>()((set) => ({
  fftEnabled: false,
  audioEnabled: false,
  lastFftFrame: null,

  setFftEnabled: (enabled) => set({ fftEnabled: enabled }),
  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),

  setFrame: (frame) => set({ lastFftFrame: frame }),

  clearFrames: () => set({ lastFftFrame: null }),
}));


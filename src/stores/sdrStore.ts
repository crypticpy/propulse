import { create } from "zustand";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";

export interface SdrStoreState {
  fftEnabled: boolean;
  audioEnabled: boolean;
  lastFftFrame: Extract<RadioBinaryFrame, { kind: "fft" }> | null;
  /**
   * `Date.now()` when `lastFftFrame` landed. The binary FFT frame carries no
   * timestamp of its own, so consumers that must tell a live spectrum from a
   * stale one (the wall band-scope tile) need this alongside it.
   */
  lastFftFrameAt: number | null;

  setFftEnabled: (enabled: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setFrame: (frame: Extract<RadioBinaryFrame, { kind: "fft" }>) => void;
  clearFrames: () => void;
}

export const useSdrStore = create<SdrStoreState>()((set) => ({
  fftEnabled: false,
  audioEnabled: false,
  lastFftFrame: null,
  lastFftFrameAt: null,

  setFftEnabled: (enabled) => set({ fftEnabled: enabled }),
  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),

  setFrame: (frame) => set({ lastFftFrame: frame, lastFftFrameAt: Date.now() }),

  clearFrames: () => set({ lastFftFrame: null, lastFftFrameAt: null }),
}));


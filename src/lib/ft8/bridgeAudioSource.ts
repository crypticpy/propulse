// ---------------------------------------------------------------------------
// bridgeAudioSource — Stub audio source that will consume audio frames from
// the Propulse bridge WebSocket once bridge-side audio streaming is
// implemented. Until then, the source remains permanently "inactive".
// ---------------------------------------------------------------------------

import type { AudioSourceHandle, AudioSourceState } from "./audioSource";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a bridge audio source handle.
 *
 * Currently a stub: `start()` logs a warning and the handle stays inactive.
 * When bridge audio streaming lands, this factory will wire into the bridge
 * WebSocket binary frames (FRAME_TYPE_AUDIO).
 */
export function createBridgeAudioSource(): AudioSourceHandle {
  let state: AudioSourceState = "inactive";

  const audioHandlers: Array<
    (samples: Float32Array, sampleRate: number) => void
  > = [];
  const errorHandlers: Array<(error: Error) => void> = [];
  const stateChangeHandlers: Array<(s: AudioSourceState) => void> = [];

  function setState(next: AudioSourceState): void {
    if (next === state) return;
    state = next;
    for (const h of stateChangeHandlers) h(next);
  }

  const handle: AudioSourceHandle = {
    async start(): Promise<void> {
      console.warn(
        "[bridgeAudioSource] Bridge audio streaming is not yet available. " +
          "The audio source will remain inactive until the bridge implements " +
          "real-time audio frame forwarding.",
      );
      // Stay inactive — nothing to connect to yet.
    },

    stop(): void {
      setState("inactive");
    },

    getState(): AudioSourceState {
      return state;
    },

    onAudio(handler) {
      audioHandlers.push(handler);
      return () => {
        const idx = audioHandlers.indexOf(handler);
        if (idx >= 0) audioHandlers.splice(idx, 1);
      };
    },

    onError(handler) {
      errorHandlers.push(handler);
      return () => {
        const idx = errorHandlers.indexOf(handler);
        if (idx >= 0) errorHandlers.splice(idx, 1);
      };
    },

    onStateChange(handler) {
      stateChangeHandlers.push(handler);
      return () => {
        const idx = stateChangeHandlers.indexOf(handler);
        if (idx >= 0) stateChangeHandlers.splice(idx, 1);
      };
    },
  };

  return handle;
}

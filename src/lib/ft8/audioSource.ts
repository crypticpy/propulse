// ---------------------------------------------------------------------------
// AudioSource — Abstract interface and types for FT8 audio capture sources.
//
// Two concrete implementations exist:
//   1. getUserMediaSource  — captures audio from a loopback / mic device
//   2. bridgeAudioSource   — receives audio frames from the bridge WebSocket
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudioSourceState = "inactive" | "active" | "error";
export type AudioSourceType = "getUserMedia" | "bridge";

// ---------------------------------------------------------------------------
// Handle interface
// ---------------------------------------------------------------------------

/**
 * Unified handle for an audio capture source.
 *
 * Callers obtain a handle via a factory (`createGetUserMediaSource` or
 * `createBridgeAudioSource`) and interact with audio exclusively through
 * this interface.
 */
export interface AudioSourceHandle {
  /** Begin capturing audio. Resolves when the stream is established. */
  start(): Promise<void>;

  /** Stop capturing and release all resources (MediaStream tracks, AudioContext, etc.). */
  stop(): void;

  /** Current lifecycle state. */
  getState(): AudioSourceState;

  /**
   * Register a callback that receives PCM audio chunks.
   * @returns Unsubscribe function.
   */
  onAudio(
    handler: (samples: Float32Array, sampleRate: number) => void,
  ): () => void;

  /**
   * Register an error callback.
   * @returns Unsubscribe function.
   */
  onError(handler: (error: Error) => void): () => void;

  /**
   * Register a state-change callback.
   * @returns Unsubscribe function.
   */
  onStateChange(handler: (state: AudioSourceState) => void): () => void;
}

// ---------------------------------------------------------------------------
// getUserMediaSource — Captures audio from a system loopback or microphone
// device via the Web Audio API and delivers PCM Float32 chunks to the
// FT8 decoder pipeline.
//
// Uses ScriptProcessorNode (deprecated but universally supported) to extract
// raw samples. This is fine for our use-case: we are not doing real-time DSP,
// just buffering samples for the decoder worker.
// ---------------------------------------------------------------------------

import type { AudioSourceHandle, AudioSourceState } from "./audioSource";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ScriptProcessorNode buffer size — 4096 samples (~93 ms @ 44.1 kHz). */
const BUFFER_SIZE = 4096;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an audio source that captures from a getUserMedia device.
 *
 * @param deviceId  Optional `MediaDeviceInfo.deviceId`. When omitted or null
 *                  the browser's default audio input is used.
 */
export function createGetUserMediaSource(
  deviceId?: string | null,
): AudioSourceHandle {
  // ---- mutable state ----
  let state: AudioSourceState = "inactive";
  let audioCtx: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  // Set when stop() runs while start()'s getUserMedia is still pending, so the
  // async continuation can release the stream instead of orphaning the mic.
  let stopRequested = false;

  const audioHandlers: Array<
    (samples: Float32Array, sampleRate: number) => void
  > = [];
  const errorHandlers: Array<(error: Error) => void> = [];
  const stateChangeHandlers: Array<(s: AudioSourceState) => void> = [];

  // ---- helpers ----

  function setState(next: AudioSourceState): void {
    if (next === state) return;
    state = next;
    for (const h of stateChangeHandlers) h(next);
  }

  function emitError(err: Error): void {
    setState("error");
    for (const h of errorHandlers) h(err);
  }

  // ---- handle implementation ----

  const handle: AudioSourceHandle = {
    async start(): Promise<void> {
      if (state === "active") return;
      stopRequested = false;

      try {
        // 1. Acquire the media stream
        const constraints: MediaStreamConstraints = {
          audio: {
            // When a specific device is requested, pass it; otherwise let
            // the browser choose.
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            // Disable browser-level processing — we want the raw signal.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // If teardown ran while getUserMedia was pending, stop() could not see
        // this stream yet. Release it now rather than leaving the mic captured.
        if (stopRequested) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        mediaStream = stream;

        // 2. Build the Web Audio graph
        audioCtx = new AudioContext();
        sourceNode = audioCtx.createMediaStreamSource(mediaStream);

        // ScriptProcessorNode: mono input, mono output, bufferSize samples.
        processorNode = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);

        processorNode.onaudioprocess = (ev: AudioProcessingEvent) => {
          // Extract channel 0 input data and deliver a *copy* so the buffer
          // can be safely transferred to a Worker.
          const input = ev.inputBuffer.getChannelData(0);
          const copy = new Float32Array(input.length);
          copy.set(input);
          const sr = audioCtx!.sampleRate;
          for (const h of audioHandlers) h(copy, sr);
        };

        // Wire: source -> processor -> destination (destination is required
        // to keep the graph alive even though we don't need audible output).
        sourceNode.connect(processorNode);
        processorNode.connect(audioCtx.destination);

        setState("active");
      } catch (err) {
        emitError(err instanceof Error ? err : new Error(String(err)));
      }
    },

    stop(): void {
      // Signal any in-flight start() to abort once getUserMedia resolves.
      stopRequested = true;

      // Disconnect Web Audio nodes
      if (processorNode) {
        processorNode.onaudioprocess = null;
        processorNode.disconnect();
        processorNode = null;
      }
      if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
      }

      // Stop all MediaStream tracks (releases the device)
      if (mediaStream) {
        for (const track of mediaStream.getTracks()) track.stop();
        mediaStream = null;
      }

      // Close the AudioContext
      if (audioCtx) {
        void audioCtx.close();
        audioCtx = null;
      }

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

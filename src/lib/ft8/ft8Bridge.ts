// ---------------------------------------------------------------------------
// Ft8DecoderBridge — Main-thread class that manages the FT8/FT4 decoder
// Web Worker, converts raw decodes to WsjtxDecode format, and handles
// deduplication across decode cycles.
// ---------------------------------------------------------------------------

import type { WsjtxDecode } from "@/lib/radio/protocol";
import type {
  Ft8WorkerInbound,
  Ft8WorkerOutbound,
  Ft8RawDecode,
  Ft8DecodeDepthWorkerConfig,
} from "./types";
import { extractCallInfo } from "./ft8MessageParser";

/** Stamped on every native decode so the source can be identified downstream. */
export const NATIVE_INSTANCE_ID = "propulse-native";

// ---------------------------------------------------------------------------
// Public handler types
// ---------------------------------------------------------------------------

export type Ft8DecodeHandler = (
  decodes: WsjtxDecode[],
  cycleStartMs: number,
) => void;
export type Ft8ProgressHandler = (progress: number) => void;
export type Ft8ErrorHandler = (message: string) => void;

// ---------------------------------------------------------------------------
// Ft8DecoderBridge
// ---------------------------------------------------------------------------

export class Ft8DecoderBridge {
  private worker: Worker | null = null;
  private protocol: "FT8" | "FT4" = "FT8";
  private decodeHandlers: Ft8DecodeHandler[] = [];
  private progressHandlers: Ft8ProgressHandler[] = [];
  private errorHandlers: Ft8ErrorHandler[] = [];

  /** Deduplication window: key = "message|freqBin" -> last-seen timestamp. */
  private dedupeWindow: Map<string, number> = new Map();
  private static readonly DEDUP_WINDOW_MS = 30_000;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Spin up the decoder worker and begin listening for messages.
   *
   * The optional `decodeDepth` config (derived from the `sdrFt8DecodeDepth`
   * setting) tunes weak-signal decoding; it is read once at start, so a depth
   * change takes effect on the next decoder start.
   */
  start(
    protocol: "FT8" | "FT4",
    decodeDepth?: Ft8DecodeDepthWorkerConfig,
  ): void {
    this.protocol = protocol;

    // Create the worker using Vite's ?worker inline URL pattern.
    this.worker = new Worker(
      new URL("./ft8DecoderWorker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = (e: MessageEvent<Ft8WorkerOutbound>) =>
      this.handleWorkerMessage(e.data);

    this.worker.onerror = (e: ErrorEvent) => this.emitError(e.message);

    this.send({ type: "init", protocol, decodeDepth });
  }

  /** Stop the worker and clean up resources. */
  stop(): void {
    if (this.worker) {
      this.send({ type: "stop" });
      this.worker.terminate();
      this.worker = null;
    }
    this.dedupeWindow.clear();
  }

  // -------------------------------------------------------------------------
  // Audio feed
  // -------------------------------------------------------------------------

  /**
   * Feed raw PCM audio samples into the decoder worker.
   * The underlying ArrayBuffer is **transferred** (zero-copy).
   */
  feedAudio(samples: Float32Array, sampleRate: number): void {
    if (!this.worker) return;
    // Transfer the buffer for zero-copy
    this.send({ type: "audio", samples, sampleRate }, [samples.buffer]);
  }

  // -------------------------------------------------------------------------
  // Runtime configuration
  // -------------------------------------------------------------------------

  /** Switch between FT8 and FT4 at runtime. */
  setProtocol(protocol: "FT8" | "FT4"): void {
    this.protocol = protocol;
    this.send({ type: "setProtocol", protocol });
  }

  // -------------------------------------------------------------------------
  // Event subscriptions (returns unsubscribe function)
  // -------------------------------------------------------------------------

  onDecode(handler: Ft8DecodeHandler): () => void {
    this.decodeHandlers.push(handler);
    return () => {
      const idx = this.decodeHandlers.indexOf(handler);
      if (idx >= 0) this.decodeHandlers.splice(idx, 1);
    };
  }

  onProgress(handler: Ft8ProgressHandler): () => void {
    this.progressHandlers.push(handler);
    return () => {
      const idx = this.progressHandlers.indexOf(handler);
      if (idx >= 0) this.progressHandlers.splice(idx, 1);
    };
  }

  onError(handler: Ft8ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      const idx = this.errorHandlers.indexOf(handler);
      if (idx >= 0) this.errorHandlers.splice(idx, 1);
    };
  }

  // -------------------------------------------------------------------------
  // Private — worker message dispatch
  // -------------------------------------------------------------------------

  private handleWorkerMessage(msg: Ft8WorkerOutbound): void {
    switch (msg.type) {
      case "ready":
        // Worker initialised — nothing to propagate yet.
        break;

      case "decodes": {
        const converted = this.convertToWsjtxDecodes(
          msg.results,
          msg.cycleStartMs,
        );
        if (converted.length > 0) {
          for (const h of this.decodeHandlers) h(converted, msg.cycleStartMs);
        }
        break;
      }

      case "cycleProgress":
        for (const h of this.progressHandlers) h(msg.progress);
        break;

      case "error":
        this.emitError(msg.message);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Private — raw decode -> WsjtxDecode conversion + dedup
  // -------------------------------------------------------------------------

  /**
   * Convert an array of Ft8RawDecode into WsjtxDecode[], filtering duplicates
   * that fall within the dedup window.
   */
  private convertToWsjtxDecodes(
    raws: Ft8RawDecode[],
    cycleStartMs: number,
  ): WsjtxDecode[] {
    const now = Date.now();

    // Prune stale entries from the dedup window.
    this.pruneDedupeWindow(now);

    const results: WsjtxDecode[] = [];

    for (const raw of raws) {
      if (this.isDuplicate(raw, now)) continue;

      const callInfo = extractCallInfo(raw.message);

      // Convert cycleStartMs (epoch) to ms-since-midnight-UTC
      const msSinceMidnight = cycleStartMs % 86_400_000;

      const decode: WsjtxDecode = {
        isNew: true,
        time: msSinceMidnight,
        epochMs: cycleStartMs,
        snr: raw.snr,
        deltaTime: raw.timeSec,
        deltaFrequency: Math.round(raw.freqHz),
        mode: this.protocol,
        message: raw.message,
        lowConfidence: raw.ldpcErrors > 0,
        callsign: callInfo.callsign,
        grid: callInfo.grid,
        instanceId: NATIVE_INSTANCE_ID,
      };

      results.push(decode);
    }

    return results;
  }

  /**
   * Check whether a raw decode is a duplicate within the dedup window.
   * The dedup key rounds frequency to 10 Hz bins so slight drift doesn't
   * produce false negatives.
   */
  private isDuplicate(raw: Ft8RawDecode, now: number): boolean {
    const key = `${raw.message}|${Math.round(raw.freqHz / 10) * 10}`;
    const prev = this.dedupeWindow.get(key);
    if (prev !== undefined && now - prev < Ft8DecoderBridge.DEDUP_WINDOW_MS) {
      return true;
    }
    // Record / refresh this key.
    this.dedupeWindow.set(key, now);
    return false;
  }

  /** Remove dedup entries older than the window. */
  private pruneDedupeWindow(now: number): void {
    for (const [key, ts] of this.dedupeWindow) {
      if (now - ts >= Ft8DecoderBridge.DEDUP_WINDOW_MS) {
        this.dedupeWindow.delete(key);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private — helpers
  // -------------------------------------------------------------------------

  private emitError(message: string): void {
    for (const h of this.errorHandlers) h(message);
  }

  /** Type-safe postMessage wrapper with optional transferable list. */
  private send(msg: Ft8WorkerInbound, transfer?: Transferable[]): void {
    if (!this.worker) return;
    if (transfer) {
      this.worker.postMessage(msg, transfer);
    } else {
      this.worker.postMessage(msg);
    }
  }
}

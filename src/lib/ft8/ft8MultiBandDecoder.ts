// ---------------------------------------------------------------------------
// Ft8MultiBandDecoder -- WP-3.5 Multi-Band Simultaneous Decode
//
// Manages multiple Ft8DecoderBridge instances, one per band, each paired
// with its own audio source.  Decodes from all bands are tagged with their
// source band and surfaced through a single unified callback.
// ---------------------------------------------------------------------------

import type { WsjtxDecode } from "@/lib/radio/protocol";
import type { AudioSourceHandle } from "@/lib/ft8/audioSource";
import { Ft8DecoderBridge } from "@/lib/ft8/ft8Bridge";
import { createGetUserMediaSource } from "@/lib/ft8/getUserMediaSource";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MultiBandDecoderBandConfig {
  /** Band identifier (e.g. "20m", "40m") */
  band: string;
  /** Dial frequency in Hz for this band */
  dialFreqHz: number;
  /** Audio input device ID for this band's receiver */
  audioDeviceId: string;
  /** Decode protocol */
  mode: "FT8" | "FT4";
}

export interface MultiBandDecoderConfig {
  /** Bands to decode, each with its own audio source ID */
  bands: MultiBandDecoderBandConfig[];
}

export interface MultiBandDecode {
  /** Which band/source this decode came from */
  band: string;
  /** Dial frequency in Hz for this band */
  dialFreqHz: number;
  /** The raw decode data */
  decode: WsjtxDecode;
}

// ---------------------------------------------------------------------------
// Internal per-band state
// ---------------------------------------------------------------------------

interface BandSlot {
  bridge: Ft8DecoderBridge;
  audio: AudioSourceHandle;
  config: MultiBandDecoderBandConfig;
  /** Unsubscribe functions for bridge event listeners */
  unsubs: Array<() => void>;
}

// ---------------------------------------------------------------------------
// Ft8MultiBandDecoder
// ---------------------------------------------------------------------------

export class Ft8MultiBandDecoder {
  private bands: Map<string, BandSlot> = new Map();
  private decodeHandlers: Array<(decodes: MultiBandDecode[]) => void> = [];
  private errorHandlers: Array<(band: string, message: string) => void> = [];
  private progressHandlers: Array<(band: string, progress: number) => void> =
    [];

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start decoding on all configured bands. */
  start(config: MultiBandDecoderConfig): void {
    // Stop any existing decoders first
    this.stop();

    for (const bandConfig of config.bands) {
      this.startBand(bandConfig);
    }
  }

  /** Stop all decoders and release resources. */
  stop(): void {
    for (const [band] of this.bands) {
      this.teardownBand(band);
    }
    this.bands.clear();
  }

  // -------------------------------------------------------------------------
  // Dynamic band management
  // -------------------------------------------------------------------------

  /** Add a band at runtime. If the band is already active it is restarted. */
  addBand(bandConfig: MultiBandDecoderBandConfig): void {
    // Tear down existing slot for this band if present
    if (this.bands.has(bandConfig.band)) {
      this.teardownBand(bandConfig.band);
    }
    this.startBand(bandConfig);
  }

  /** Remove a band and release its resources. */
  removeBand(band: string): void {
    this.teardownBand(band);
  }

  /** Get the list of currently active band identifiers. */
  getActiveBands(): string[] {
    return Array.from(this.bands.keys());
  }

  // -------------------------------------------------------------------------
  // Event subscriptions (return unsubscribe function)
  // -------------------------------------------------------------------------

  /** Subscribe to decodes from all bands. */
  onDecode(cb: (decodes: MultiBandDecode[]) => void): () => void {
    this.decodeHandlers.push(cb);
    return () => {
      const idx = this.decodeHandlers.indexOf(cb);
      if (idx >= 0) this.decodeHandlers.splice(idx, 1);
    };
  }

  /** Subscribe to per-band errors. */
  onError(cb: (band: string, message: string) => void): () => void {
    this.errorHandlers.push(cb);
    return () => {
      const idx = this.errorHandlers.indexOf(cb);
      if (idx >= 0) this.errorHandlers.splice(idx, 1);
    };
  }

  /** Subscribe to per-band decode-cycle progress (0-1). */
  onProgress(cb: (band: string, progress: number) => void): () => void {
    this.progressHandlers.push(cb);
    return () => {
      const idx = this.progressHandlers.indexOf(cb);
      if (idx >= 0) this.progressHandlers.splice(idx, 1);
    };
  }

  // -------------------------------------------------------------------------
  // Private -- band lifecycle helpers
  // -------------------------------------------------------------------------

  private startBand(bandConfig: MultiBandDecoderBandConfig): void {
    const { band, audioDeviceId, mode, dialFreqHz } = bandConfig;

    const bridge = new Ft8DecoderBridge();
    const audio = createGetUserMediaSource(audioDeviceId);
    const unsubs: Array<() => void> = [];

    // Bridge -> unified decode output
    unsubs.push(
      bridge.onDecode((decodes: WsjtxDecode[]) => {
        const tagged: MultiBandDecode[] = decodes.map((decode) => ({
          band,
          dialFreqHz,
          decode,
        }));
        if (tagged.length > 0) {
          for (const h of this.decodeHandlers) h(tagged);
        }
      }),
    );

    // Bridge -> per-band progress
    unsubs.push(
      bridge.onProgress((progress: number) => {
        for (const h of this.progressHandlers) h(band, progress);
      }),
    );

    // Bridge -> per-band errors
    unsubs.push(
      bridge.onError((message: string) => {
        for (const h of this.errorHandlers) h(band, message);
      }),
    );

    // Audio source -> bridge
    unsubs.push(
      audio.onAudio((samples: Float32Array, sampleRate: number) => {
        // Copy before transfer (feedAudio transfers the underlying buffer)
        bridge.feedAudio(new Float32Array(samples), sampleRate);
      }),
    );

    // Audio source errors -> unified error handler
    unsubs.push(
      audio.onError((err: Error) => {
        for (const h of this.errorHandlers) h(band, `Audio: ${err.message}`);
      }),
    );

    // Start the decoder worker then the audio source
    bridge.start(mode);

    audio.start().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      for (const h of this.errorHandlers)
        h(band, `Audio start failed: ${message}`);
    });

    this.bands.set(band, { bridge, audio, config: bandConfig, unsubs });
  }

  private teardownBand(band: string): void {
    const slot = this.bands.get(band);
    if (!slot) return;

    // Unsubscribe all event listeners
    for (const unsub of slot.unsubs) unsub();

    // Stop audio and decoder
    slot.audio.stop();
    slot.bridge.stop();

    this.bands.delete(band);
  }
}

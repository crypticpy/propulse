// ---------------------------------------------------------------------------
// Ft8WidebandDecoder -- Phase 4: Multi-SDR Wideband Decode
//
// Aggregates IQ/audio data from multiple SDR dongles for simultaneous
// all-band FT8/FT4 monitoring.  Each SDR source covers a frequency range;
// the decoder determines which FT8/FT4 band presets fall within that range,
// then delegates per-band decoding to an internal Ft8MultiBandDecoder.
//
// Architecture:
//   SDR1 (14-28 MHz) ---+
//   SDR2 (1.8-14 MHz) --+---> WidebandDecoder ---> BandExtractor ---> MultiBandDecoder
//   SDR3 (50-144 MHz) --+
// ---------------------------------------------------------------------------

import { FT8_BAND_PRESETS } from "@/lib/ft8/ft8BandPresets";
import type { Ft8BandPreset } from "@/lib/ft8/ft8BandPresets";
import {
  Ft8MultiBandDecoder,
  type MultiBandDecode,
  type MultiBandDecoderBandConfig,
} from "@/lib/ft8/ft8MultiBandDecoder";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Configuration for a single SDR source */
export interface WidebandSdrSource {
  /** Unique identifier for this SDR */
  id: string;
  /** Human-readable label */
  label: string;
  /** Center frequency in Hz */
  centerFreqHz: number;
  /** Bandwidth in Hz */
  bandwidthHz: number;
  /** Audio device ID for this SDR's output */
  audioDeviceId: string;
  /** Bands covered by this SDR's bandwidth */
  coveredBands: string[];
}

/** Band extraction from wideband IQ */
export interface ExtractedBand {
  band: string;
  dialFreqHz: number;
  /** Audio samples for this band's FT8 passband */
  audioSamples: Float32Array;
  sampleRate: number;
}

/** Status of the wideband decoder */
export interface WidebandDecoderStatus {
  activeSources: number;
  activeBands: number;
  totalDecodesThisCycle: number;
  /** Per-source status */
  sources: { id: string; connected: boolean; bandCount: number }[];
}

// ---------------------------------------------------------------------------
// Internal per-source state
// ---------------------------------------------------------------------------

interface SourceSlot {
  source: WidebandSdrSource;
  decoder: Ft8MultiBandDecoder;
  /** Bands this source is decoding */
  bands: MultiBandDecoderBandConfig[];
  /** Unsubscribe functions for decoder event listeners */
  unsubs: Array<() => void>;
  /** Whether the source is connected and decoding */
  connected: boolean;
  /** Running decode count for the current cycle */
  cycleDecodeCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine which FT8/FT4 band presets fall within an SDR's receive window.
 *
 * An FT8 dial frequency is "covered" when the full 3 kHz digital passband
 * (dialFreqHz .. dialFreqHz + 3000) lies within the SDR's tuned range:
 *   [centerFreqHz - bandwidthHz/2 , centerFreqHz + bandwidthHz/2]
 */
function extractCoveredPresets(
  centerFreqHz: number,
  bandwidthHz: number,
): Ft8BandPreset[] {
  const halfBw = bandwidthHz / 2;
  const low = centerFreqHz - halfBw;
  const high = centerFreqHz + halfBw;

  return FT8_BAND_PRESETS.filter((preset) => {
    const presetLow = preset.dialFreqHz;
    const presetHigh = preset.dialFreqHz + preset.audioRangeHigh;
    return presetLow >= low && presetHigh <= high;
  });
}

/**
 * Build MultiBandDecoderBandConfig entries from an SDR source.
 * Each covered preset becomes a separate band config sharing the same
 * audioDeviceId (the SDR's output).
 */
function buildBandConfigs(
  source: WidebandSdrSource,
): MultiBandDecoderBandConfig[] {
  const presets = extractCoveredPresets(
    source.centerFreqHz,
    source.bandwidthHz,
  );

  return presets.map((preset) => ({
    band: preset.label, // e.g. "20m FT8" -- unique across mode
    dialFreqHz: preset.dialFreqHz,
    audioDeviceId: source.audioDeviceId,
    mode: preset.mode,
  }));
}

// ---------------------------------------------------------------------------
// Ft8WidebandDecoder
// ---------------------------------------------------------------------------

/**
 * Wideband FT8 Decoder -- Aggregates multiple SDR sources for
 * simultaneous all-band FT8/FT4 monitoring.
 */
export class Ft8WidebandDecoder {
  private sources: Map<string, SourceSlot> = new Map();
  private running = false;

  // Unified event handlers
  private decodeHandlers: Array<
    (
      decodes: Array<{
        band: string;
        dialFreqHz: number;
        decode: {
          message: string;
          snr: number;
          deltaFrequency: number;
          time: string;
        };
      }>,
    ) => void
  > = [];
  private statusChangeHandlers: Array<(status: WidebandDecoderStatus) => void> =
    [];
  private errorHandlers: Array<(sourceId: string, error: string) => void> = [];

  // -------------------------------------------------------------------------
  // Source management
  // -------------------------------------------------------------------------

  /** Add an SDR source. If already running, the source starts immediately. */
  addSource(source: WidebandSdrSource): void {
    // If a source with this ID already exists, remove it first
    if (this.sources.has(source.id)) {
      this.removeSource(source.id);
    }

    const decoder = new Ft8MultiBandDecoder();
    const bands = buildBandConfigs(source);
    const unsubs: Array<() => void> = [];

    // Populate coveredBands on the source for status reporting
    const enrichedSource: WidebandSdrSource = {
      ...source,
      coveredBands: [...new Set(bands.map((b) => b.band))],
    };

    const slot: SourceSlot = {
      source: enrichedSource,
      decoder,
      bands,
      unsubs,
      connected: false,
      cycleDecodeCount: 0,
    };

    // Wire up decode events -- tag with source and normalize output format
    unsubs.push(
      decoder.onDecode((decodes: MultiBandDecode[]) => {
        slot.cycleDecodeCount += decodes.length;

        const unified = decodes.map((d) => ({
          band: d.band,
          dialFreqHz: d.dialFreqHz,
          decode: {
            message: d.decode.message,
            snr: d.decode.snr,
            deltaFrequency: d.decode.deltaFrequency,
            time: new Date(d.decode.time).toISOString(),
          },
        }));

        if (unified.length > 0) {
          for (const h of this.decodeHandlers) {
            try {
              h(unified);
            } catch {
              /* listener errors must not break the pipeline */
            }
          }
        }

        this.emitStatusChange();
      }),
    );

    // Wire up error events -- prefix with source ID
    unsubs.push(
      decoder.onError((band: string, message: string) => {
        for (const h of this.errorHandlers) {
          try {
            h(source.id, `[${band}] ${message}`);
          } catch {
            /* swallow listener errors */
          }
        }
      }),
    );

    this.sources.set(source.id, slot);

    // If the wideband decoder is already running, start this source now
    if (this.running && bands.length > 0) {
      decoder.start({ bands });
      slot.connected = true;
    }

    this.emitStatusChange();
  }

  /** Remove an SDR source and release its resources. */
  removeSource(id: string): void {
    const slot = this.sources.get(id);
    if (!slot) return;

    for (const unsub of slot.unsubs) unsub();
    slot.decoder.stop();
    this.sources.delete(id);

    this.emitStatusChange();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start wideband decoding on all registered sources. */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const [, slot] of this.sources) {
      if (slot.bands.length > 0) {
        slot.decoder.start({ bands: slot.bands });
        slot.connected = true;
        slot.cycleDecodeCount = 0;
      }
    }

    this.emitStatusChange();
  }

  /** Stop all decoding across all sources. */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const [, slot] of this.sources) {
      slot.decoder.stop();
      slot.connected = false;
      slot.cycleDecodeCount = 0;
    }

    this.emitStatusChange();
  }

  // -------------------------------------------------------------------------
  // Status & queries
  // -------------------------------------------------------------------------

  /** Get current status snapshot. */
  getStatus(): WidebandDecoderStatus {
    let activeBands = 0;
    let totalDecodes = 0;
    const sourceSummaries: WidebandDecoderStatus["sources"] = [];

    for (const [, slot] of this.sources) {
      const bandCount = slot.bands.length;
      activeBands += bandCount;
      totalDecodes += slot.cycleDecodeCount;

      sourceSummaries.push({
        id: slot.source.id,
        connected: slot.connected,
        bandCount,
      });
    }

    return {
      activeSources: sourceSummaries.filter((s) => s.connected).length,
      activeBands,
      totalDecodesThisCycle: totalDecodes,
      sources: sourceSummaries,
    };
  }

  /** Get the list of all bands currently being decoded (unique band labels). */
  getActiveBands(): string[] {
    const bands = new Set<string>();
    for (const [, slot] of this.sources) {
      if (slot.connected) {
        for (const b of slot.bands) bands.add(b.band);
      }
    }
    return Array.from(bands);
  }

  /** Get the list of registered SDR sources. */
  getSources(): WidebandSdrSource[] {
    return Array.from(this.sources.values()).map((s) => ({ ...s.source }));
  }

  // -------------------------------------------------------------------------
  // Event subscriptions (return unsubscribe function)
  // -------------------------------------------------------------------------

  /** Subscribe to decodes from all bands across all SDR sources. */
  onDecode(
    cb: (
      decodes: Array<{
        band: string;
        dialFreqHz: number;
        decode: {
          message: string;
          snr: number;
          deltaFrequency: number;
          time: string;
        };
      }>,
    ) => void,
  ): () => void {
    this.decodeHandlers.push(cb);
    return () => {
      const idx = this.decodeHandlers.indexOf(cb);
      if (idx >= 0) this.decodeHandlers.splice(idx, 1);
    };
  }

  /** Subscribe to status changes (source added/removed, decode counts). */
  onStatusChange(cb: (status: WidebandDecoderStatus) => void): () => void {
    this.statusChangeHandlers.push(cb);
    return () => {
      const idx = this.statusChangeHandlers.indexOf(cb);
      if (idx >= 0) this.statusChangeHandlers.splice(idx, 1);
    };
  }

  /** Subscribe to per-source errors. */
  onError(cb: (sourceId: string, error: string) => void): () => void {
    this.errorHandlers.push(cb);
    return () => {
      const idx = this.errorHandlers.indexOf(cb);
      if (idx >= 0) this.errorHandlers.splice(idx, 1);
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private emitStatusChange(): void {
    const status = this.getStatus();
    for (const h of this.statusChangeHandlers) {
      try {
        h(status);
      } catch {
        /* swallow listener errors */
      }
    }
  }
}

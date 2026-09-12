import { getWaterfallPaletteStops } from "@/lib/colors/palettes/sdrWaterfall";
import type {
  WaterfallPaletteName,
  Rgb,
  Stop,
} from "@/lib/colors/palettes/sdrWaterfall";

export type { WaterfallPaletteName } from "@/lib/colors/palettes/sdrWaterfall";
export { PALETTE_NAMES } from "@/lib/colors/palettes/sdrWaterfall";

export interface WaterfallView {
  centerHz: number;
  spanHz: number;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleStops(stops: Stop[], tIn: number): Rgb {
  const t = Math.max(0, Math.min(1, tIn));
  if (t <= stops[0]?.[0]) return stops[0]?.[1] ?? [0, 0, 0];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
      return [
        clampByte(lerp(a[1][0], b[1][0], u)),
        clampByte(lerp(a[1][1], b[1][1], u)),
        clampByte(lerp(a[1][2], b[1][2], u)),
      ];
    }
  }
  return stops[stops.length - 1]?.[1] ?? [255, 0, 0];
}

const LUT_CACHE = new Map<WaterfallPaletteName, Uint8Array>();

export function getWaterfallPaletteLut(name: WaterfallPaletteName): Uint8Array {
  const cached = LUT_CACHE.get(name);
  if (cached) return cached;

  const stops = getWaterfallPaletteStops(name);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const [r, g, b] = sampleStops(stops, t);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }

  LUT_CACHE.set(name, lut);
  return lut;
}

/** Cache for gamma-baked LUTs keyed by `${palette}_${gamma}` */
const GAMMA_LUT_CACHE = new Map<string, Uint8Array>();

/**
 * Returns a 256×3 Uint8Array LUT with gamma pre-applied.
 * Index `i` maps to the color for a linear value of `i/255` after gamma correction.
 * This eliminates per-pixel `Math.pow()` calls in the waterfall render loop.
 */
export function getWaterfallPaletteLutWithGamma(
  name: WaterfallPaletteName,
  gamma: number,
): Uint8Array {
  // For gamma=1.0, delegate to the regular LUT (already cached)
  if (gamma === 1.0) return getWaterfallPaletteLut(name);

  const key = `${name}_${gamma.toFixed(3)}`;
  const cached = GAMMA_LUT_CACHE.get(key);
  if (cached) return cached;

  const stops = getWaterfallPaletteStops(name);
  const lut = new Uint8Array(256 * 3);
  const invGamma = 1 / gamma;

  for (let i = 0; i < 256; i++) {
    // Apply gamma: map linear index to gamma-corrected position
    const tLinear = i / 255;
    const t = Math.pow(tLinear, invGamma);
    const [r, g, b] = sampleStops(stops, t);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }

  // Dragging the gamma slider generates a fresh key per step, so bound the
  // cache — reset once it grows large (regeneration is cheap).
  if (GAMMA_LUT_CACHE.size >= 64) GAMMA_LUT_CACHE.clear();
  GAMMA_LUT_CACHE.set(key, lut);
  return lut;
}

/** Human-readable display names */
export function getPaletteDisplayName(name: WaterfallPaletteName): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** CSS linear-gradient string for palette preview swatches */
export function getWaterfallPaletteGradientCss(
  name: WaterfallPaletteName,
): string {
  const stops = getWaterfallPaletteStops(name);
  const samples = 8;
  const colorStops: string[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const [r, g, b] = sampleStops(stops, t);
    const pct = Math.round(t * 100);
    colorStops.push(`rgb(${r},${g},${b}) ${pct}%`);
  }
  return `linear-gradient(to right, ${colorStops.join(", ")})`;
}

/* ------------------------------------------------------------------ */
/*  Tuning overlay types for SDR views (Wave 2)                       */
/* ------------------------------------------------------------------ */

export interface TuningOverlay {
  freqHz: number;
  filterLowHz: number;
  filterHighHz: number;
  mode: string;
}

/**
 * Convert an RF frequency (absolute Hz) to audio offset Hz relative to carrier.
 * USB/CW: rfHz - carrierHz (positive = above carrier)
 * LSB/CWR: carrierHz - rfHz (positive = below carrier)
 * AM/FM/WFM: |rfHz - carrierHz| (absolute distance)
 */
export function rfHzToAudioHz(
  rfHz: number,
  carrierHz: number,
  mode: string,
): number {
  const m = mode.toUpperCase();
  if (m === "LSB" || m === "CWR") return carrierHz - rfHz;
  if (m === "AM" || m === "FM" || m === "WFM")
    return Math.abs(rfHz - carrierHz);
  // USB, CW, default
  return rfHz - carrierHz;
}

/**
 * Convert audio offset Hz back to absolute RF frequency.
 * Inverse of rfHzToAudioHz (except AM/FM always returns the upper sideband).
 */
export function audioHzToRfHz(
  audioHz: number,
  carrierHz: number,
  mode: string,
): number {
  const m = mode.toUpperCase();
  if (m === "LSB" || m === "CWR") return carrierHz - audioHz;
  if (m === "AM" || m === "FM" || m === "WFM")
    return carrierHz + Math.abs(audioHz);
  // USB, CW, default
  return carrierHz + audioHz;
}

export function computePassbandHz(tuning: TuningOverlay): {
  startHz: number;
  endHz: number;
} {
  const mode = tuning.mode.toUpperCase();
  if (mode === "LSB") {
    return {
      startHz: tuning.freqHz - tuning.filterHighHz,
      endHz: tuning.freqHz - tuning.filterLowHz,
    };
  }
  if (mode === "CW" || mode === "CWR") {
    const center = (tuning.filterLowHz + tuning.filterHighHz) / 2;
    const half = (tuning.filterHighHz - tuning.filterLowHz) / 2;
    return {
      startHz: tuning.freqHz + center - half,
      endHz: tuning.freqHz + center + half,
    };
  }
  if (mode === "AM" || mode === "FM" || mode === "WFM") {
    return {
      startHz: tuning.freqHz - tuning.filterHighHz,
      endHz: tuning.freqHz + tuning.filterHighHz,
    };
  }
  // USB and default
  return {
    startHz: tuning.freqHz + tuning.filterLowHz,
    endHz: tuning.freqHz + tuning.filterHighHz,
  };
}

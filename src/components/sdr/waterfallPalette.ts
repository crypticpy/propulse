export type WaterfallPaletteName =
  | "classic"
  | "viridis"
  | "magma"
  | "gray"
  | "plasma"
  | "inferno"
  | "turbo"
  | "hot-iron"
  | "deep-ocean"
  | "electric"
  | "radioactive"
  | "arctic"
  | "fire"
  | "night-vision"
  | "copper"
  | "sunset";

export interface WaterfallView {
  centerHz: number;
  spanHz: number;
}

type Rgb = readonly [number, number, number];
type Stop = readonly [number, Rgb];

const PALETTES: Record<WaterfallPaletteName, Stop[]> = {
  classic: [
    [0.0, [0, 0, 0]],
    [0.25, [0, 0, 200]],
    [0.5, [0, 255, 255]],
    [0.75, [255, 255, 0]],
    [1.0, [255, 0, 0]],
  ],
  viridis: [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ],
  magma: [
    [0.0, [0, 0, 4]],
    [0.25, [74, 14, 107]],
    [0.5, [163, 35, 98]],
    [0.75, [231, 103, 57]],
    [1.0, [252, 253, 191]],
  ],
  gray: [
    [0.0, [0, 0, 0]],
    [1.0, [255, 255, 255]],
  ],
  plasma: [
    [0, [13, 8, 135]],
    [0.25, [126, 3, 168]],
    [0.5, [204, 71, 120]],
    [0.75, [248, 149, 64]],
    [1, [240, 249, 33]],
  ],
  inferno: [
    [0, [0, 0, 4]],
    [0.25, [87, 16, 110]],
    [0.5, [188, 55, 84]],
    [0.75, [249, 142, 9]],
    [1, [252, 255, 164]],
  ],
  turbo: [
    [0, [48, 18, 59]],
    [0.15, [68, 91, 205]],
    [0.3, [33, 168, 226]],
    [0.45, [54, 222, 152]],
    [0.6, [163, 233, 50]],
    [0.75, [241, 185, 32]],
    [0.9, [230, 95, 31]],
    [1, [122, 4, 3]],
  ],
  "hot-iron": [
    [0, [0, 0, 0]],
    [0.2, [95, 0, 80]],
    [0.4, [175, 15, 10]],
    [0.6, [230, 85, 0]],
    [0.8, [255, 200, 0]],
    [1, [255, 255, 255]],
  ],
  "deep-ocean": [
    [0, [0, 0, 10]],
    [0.3, [0, 30, 80]],
    [0.5, [0, 80, 130]],
    [0.7, [0, 160, 180]],
    [0.9, [100, 220, 240]],
    [1, [230, 250, 255]],
  ],
  electric: [
    [0, [0, 0, 0]],
    [0.2, [20, 0, 80]],
    [0.5, [40, 40, 220]],
    [0.7, [80, 130, 255]],
    [0.85, [160, 200, 255]],
    [1, [240, 245, 255]],
  ],
  radioactive: [
    [0, [0, 0, 0]],
    [0.2, [0, 30, 0]],
    [0.45, [0, 100, 0]],
    [0.65, [0, 200, 0]],
    [0.85, [130, 255, 30]],
    [1, [220, 255, 150]],
  ],
  arctic: [
    [0, [10, 10, 50]],
    [0.25, [30, 50, 120]],
    [0.5, [80, 130, 200]],
    [0.75, [160, 200, 240]],
    [1, [240, 248, 255]],
  ],
  fire: [
    [0, [0, 0, 0]],
    [0.2, [100, 0, 0]],
    [0.4, [180, 20, 0]],
    [0.6, [230, 100, 0]],
    [0.8, [255, 200, 50]],
    [1, [255, 255, 200]],
  ],
  "night-vision": [
    [0, [0, 0, 0]],
    [0.3, [0, 30, 0]],
    [0.6, [0, 120, 0]],
    [0.85, [0, 220, 0]],
    [1, [100, 255, 80]],
  ],
  copper: [
    [0, [0, 0, 0]],
    [0.25, [50, 20, 5]],
    [0.5, [140, 70, 20]],
    [0.75, [200, 140, 50]],
    [1, [255, 220, 140]],
  ],
  sunset: [
    [0, [20, 0, 30]],
    [0.25, [80, 10, 80]],
    [0.5, [180, 40, 60]],
    [0.75, [240, 130, 40]],
    [1, [255, 230, 150]],
  ],
};

/** Ordered list of all palette names for UI iteration */
export const PALETTE_NAMES: readonly WaterfallPaletteName[] = [
  "classic",
  "viridis",
  "plasma",
  "inferno",
  "turbo",
  "magma",
  "hot-iron",
  "fire",
  "sunset",
  "copper",
  "deep-ocean",
  "arctic",
  "electric",
  "radioactive",
  "night-vision",
  "gray",
] as const;

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

  const stops = PALETTES[name] ?? PALETTES.classic;
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

  const stops = PALETTES[name] ?? PALETTES.classic;
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
  const stops = PALETTES[name] ?? PALETTES.classic;
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

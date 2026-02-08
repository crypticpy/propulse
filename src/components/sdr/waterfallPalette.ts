export type WaterfallPaletteName = "classic" | "viridis" | "magma" | "gray";

export interface WaterfallView {
  centerHz: number;
  spanHz: number;
}

type Rgb = readonly [number, number, number];
type Stop = readonly [number, Rgb]; // t in [0,1]

const PALETTES: Record<WaterfallPaletteName, Stop[]> = {
  classic: [
    [0.0, [0, 0, 0]],
    [0.25, [0, 0, 200]],
    [0.5, [0, 255, 255]],
    [0.75, [255, 255, 0]],
    [1.0, [255, 0, 0]],
  ],
  // Approximate viridis stops (not exact, but close enough for UI).
  viridis: [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ],
  // Approximate magma stops.
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
};

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


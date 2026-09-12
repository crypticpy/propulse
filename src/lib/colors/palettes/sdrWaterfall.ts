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

export type Rgb = readonly [number, number, number];
export type Stop = readonly [number, Rgb];

export const SDR_WATERFALL_PALETTES: Record<WaterfallPaletteName, Stop[]> = {
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

/** Unknown names use classic data; caches still belong to the requested name. */
export function getWaterfallPaletteStops(name: WaterfallPaletteName): Stop[] {
  return Object.prototype.hasOwnProperty.call(SDR_WATERFALL_PALETTES, name)
    ? SDR_WATERFALL_PALETTES[name]
    : SDR_WATERFALL_PALETTES.classic;
}

import type { DisplayQuality } from "@/stores/displayQualityStore";

export type EffectiveDisplayQuality =
  | "data-saver"
  | "balanced"
  | "uhd"
  | "extreme";

export interface DisplayQualitySettings {
  effective: EffectiveDisplayQuality;
  label: string;
  maxDevicePixelRatio: number;
  globeErrorTarget: number;
  /** Maximum decoded XYZ tiles retained by the primary globe renderer. */
  globeTileCacheSize: number;
  /** Maximum decoded imagery memory retained by the primary globe renderer. */
  globeTileCacheBytes: number;
  /** Maximum tile nodes traversed during one renderer update. */
  globeTileTraversalBudget: number;
  flatTileCacheSize: number;
  tileZoomBias: number;
  tileRequestConcurrency: number;
  prefetchRadius: number;
  settleDelayMs: number;
}

export interface DisplayQualityEnvironment {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  saveData: boolean;
}

const SETTINGS: Record<EffectiveDisplayQuality, DisplayQualitySettings> = {
  "data-saver": {
    effective: "data-saver",
    label: "Data Saver",
    maxDevicePixelRatio: 1,
    globeErrorTarget: 4,
    globeTileCacheSize: 320,
    globeTileCacheBytes: 96 * 1024 * 1024,
    globeTileTraversalBudget: 120,
    flatTileCacheSize: 160,
    tileZoomBias: -1,
    tileRequestConcurrency: 6,
    prefetchRadius: 0,
    settleDelayMs: 350,
  },
  balanced: {
    effective: "balanced",
    label: "Auto · Balanced",
    maxDevicePixelRatio: 1.75,
    globeErrorTarget: 2,
    globeTileCacheSize: 700,
    globeTileCacheBytes: 192 * 1024 * 1024,
    globeTileTraversalBudget: 200,
    flatTileCacheSize: 420,
    tileZoomBias: 0,
    tileRequestConcurrency: 10,
    prefetchRadius: 0,
    settleDelayMs: 220,
  },
  uhd: {
    effective: "uhd",
    label: "UHD",
    maxDevicePixelRatio: 2,
    globeErrorTarget: 1,
    globeTileCacheSize: 1200,
    globeTileCacheBytes: 320 * 1024 * 1024,
    globeTileTraversalBudget: 280,
    flatTileCacheSize: 640,
    tileZoomBias: 0,
    tileRequestConcurrency: 14,
    prefetchRadius: 1,
    settleDelayMs: 160,
  },
  extreme: {
    effective: "extreme",
    label: "Extreme",
    maxDevicePixelRatio: 3,
    globeErrorTarget: 0.65,
    globeTileCacheSize: 1800,
    globeTileCacheBytes: 512 * 1024 * 1024,
    globeTileTraversalBudget: 400,
    flatTileCacheSize: 1024,
    tileZoomBias: 1,
    tileRequestConcurrency: 20,
    prefetchRadius: 1,
    settleDelayMs: 100,
  },
};

export function readDisplayQualityEnvironment(): DisplayQualityEnvironment {
  if (typeof window === "undefined") {
    return {
      cssWidth: 1920,
      cssHeight: 1080,
      devicePixelRatio: 1,
      saveData: false,
    };
  }
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return {
    cssWidth: window.innerWidth,
    cssHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    saveData: connection?.saveData === true,
  };
}

export function resolveDisplayQuality(
  requested: DisplayQuality,
  environment: DisplayQualityEnvironment = readDisplayQualityEnvironment(),
): DisplayQualitySettings {
  if (requested !== "auto") return SETTINGS[requested];
  if (environment.saveData) return SETTINGS["data-saver"];

  const physicalPixels =
    environment.cssWidth *
    environment.cssHeight *
    environment.devicePixelRatio ** 2;
  if (physicalPixels >= 6_000_000) return SETTINGS.uhd;
  return SETTINGS.balanced;
}

export const DISPLAY_QUALITY_OPTIONS: ReadonlyArray<{
  id: DisplayQuality;
  label: string;
  description: string;
}> = [
  {
    id: "data-saver",
    label: "Saver",
    description: "Lower bandwidth and GPU use",
  },
  {
    id: "auto",
    label: "Auto",
    description: "Adapts to this display and connection",
  },
  {
    id: "uhd",
    label: "UHD",
    description: "Crisp 4K wall presentation",
  },
  {
    id: "extreme",
    label: "Extreme",
    description: "Maximum stationary detail",
  },
];

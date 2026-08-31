export type SolarImageProductId =
  | "drap-global"
  | "drap-10mhz"
  | "drap-20mhz"
  | "aurora-north"
  | "synoptic-map"
  | "sunspot-hmi";

export type SolarAnimationProductId = "drap-global" | "aurora-north";

export interface SolarImageProduct {
  id: SolarImageProductId;
  title: string;
  description: string;
  alt: string;
  provider: string;
  sourceUrl: string;
  upstreamUrl: string;
  softTtlSeconds: number;
  hardTtlSeconds: number;
  maxBytes: number;
  animation?: SolarAnimationProductId;
}

export const SOLAR_IMAGE_PRODUCTS: Record<SolarImageProductId, SolarImageProduct> = {
  "drap-global": {
    id: "drap-global",
    title: "Global D-RAP absorption",
    description: "Estimated highest frequency affected by sunlit-side D-region absorption.",
    alt: "NOAA global D-RAP map with its complete frequency legend",
    provider: "NOAA SWPC",
    sourceUrl: "https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap",
    upstreamUrl: "https://services.swpc.noaa.gov/images/d-rap/global.png",
    softTtlSeconds: 300,
    hardTtlSeconds: 3_600,
    maxBytes: 6_000_000,
    animation: "drap-global",
  },
  "drap-10mhz": {
    id: "drap-10mhz",
    title: "10 MHz absorption",
    description: "Modeled D-region absorption affecting the 10 MHz region.",
    alt: "NOAA 10 MHz D-RAP absorption map with complete legend",
    provider: "NOAA SWPC",
    sourceUrl: "https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap",
    upstreamUrl: "https://services.swpc.noaa.gov/images/d-rap/global_f10.png",
    softTtlSeconds: 300,
    hardTtlSeconds: 3_600,
    maxBytes: 6_000_000,
  },
  "drap-20mhz": {
    id: "drap-20mhz",
    title: "20 MHz absorption",
    description: "Modeled D-region absorption affecting the 20 MHz region.",
    alt: "NOAA 20 MHz D-RAP absorption map with complete legend",
    provider: "NOAA SWPC",
    sourceUrl: "https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap",
    upstreamUrl: "https://services.swpc.noaa.gov/images/d-rap/global_f20.png",
    softTtlSeconds: 300,
    hardTtlSeconds: 3_600,
    maxBytes: 6_000_000,
  },
  "aurora-north": {
    id: "aurora-north",
    title: "Northern aurora forecast",
    description: "NOAA OVATION auroral probability forecast for the Northern Hemisphere.",
    alt: "NOAA northern hemisphere aurora forecast with full map legend",
    provider: "NOAA SWPC",
    sourceUrl: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    upstreamUrl: "https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg",
    softTtlSeconds: 300,
    hardTtlSeconds: 3_600,
    maxBytes: 6_000_000,
    animation: "aurora-north",
  },
  "synoptic-map": {
    id: "synoptic-map",
    title: "Solar synoptic map",
    description: "A full-Sun synoptic view assembled by NOAA SWPC.",
    alt: "NOAA solar synoptic map with annotations and coordinate edges visible",
    provider: "NOAA SWPC",
    sourceUrl: "https://www.swpc.noaa.gov/products/solar-synoptic-map",
    upstreamUrl: "https://services.swpc.noaa.gov/images/synoptic-map.jpg",
    softTtlSeconds: 900,
    hardTtlSeconds: 7_200,
    maxBytes: 6_000_000,
  },
  "sunspot-hmi": {
    id: "sunspot-hmi",
    title: "SDO HMI sunspots",
    description: "Latest SDO HMI continuum image for visible sunspot structure.",
    alt: "NASA SDO HMI full solar disk showing visible sunspots",
    provider: "NASA SDO",
    sourceUrl: "https://sdo.gsfc.nasa.gov/data/",
    upstreamUrl: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg",
    softTtlSeconds: 300,
    hardTtlSeconds: 86_400,
    maxBytes: 6_000_000,
  },
};

export const SOLAR_ANIMATION_PRODUCTS: Record<
  SolarAnimationProductId,
  { manifestUrl: string; frameBaseUrl: string; maxFrames: number }
> = {
  "drap-global": {
    manifestUrl: "https://services.swpc.noaa.gov/products/animations/d-rap/global.json",
    frameBaseUrl: "https://services.swpc.noaa.gov/images/animations/d-rap/global/",
    maxFrames: 180,
  },
  "aurora-north": {
    manifestUrl: "https://services.swpc.noaa.gov/products/animations/ovation_north_24h.json",
    frameBaseUrl: "https://services.swpc.noaa.gov/images/animations/ovation/north/",
    maxFrames: 180,
  },
};

export function isSolarImageProduct(value: string): value is SolarImageProductId {
  return value in SOLAR_IMAGE_PRODUCTS;
}

export function isSolarAnimationProduct(
  value: string,
): value is SolarAnimationProductId {
  return value in SOLAR_ANIMATION_PRODUCTS;
}

/**
 * Build a cache-stable media URL that advances at the product's own cadence.
 *
 * A bare `/api/solar/image?product=…` URL never changes in a mounted `<img>`,
 * so browser image caches can keep a wall display on its first frame forever.
 * The shared time bucket keeps every client on the same CDN cache key for the
 * full soft-TTL window, then asks for the newly validated upstream frame.
 * `retry` changes only for an explicit/automatic recovery attempt.
 */
export function solarImageUrl(
  productId: SolarImageProductId,
  now = Date.now(),
  retry = 0,
): string {
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const refreshBucket = Math.floor(now / (product.softTtlSeconds * 1_000));
  return `/api/solar/image?product=${encodeURIComponent(productId)}&refresh=${refreshBucket}-${retry}`;
}

/** Metadata follows the exact same cache bucket as its image bytes. */
export function solarImageMetadataUrl(
  productId: SolarImageProductId,
  now = Date.now(),
  retry = 0,
): string {
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const refreshBucket = Math.floor(now / (product.softTtlSeconds * 1_000));
  return `/api/solar/image-meta?product=${encodeURIComponent(productId)}&refresh=${refreshBucket}-${retry}`;
}

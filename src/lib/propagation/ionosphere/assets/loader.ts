/**
 * Loader for the CCIR numerical-map coefficient asset.
 *
 * The asset is a static file under `public/`, fetched once and cached, so it
 * contributes nothing to any JavaScript bundle budget. It is verified against
 * the SHA-256 digest pinned in `manifest.json` before a single coefficient is
 * used, and a mismatch is fatal. There is no degraded mode: a silently
 * substituted curve would look exactly like a correct answer at the call site.
 *
 * Binary layout, little-endian throughout:
 *
 *   0   16  magic "PROPULSE-IONOMAP"
 *   16   4  uint32 schema version
 *   20   4  uint32 months (12)
 *   24   4  uint32 solar levels (2, R12 = 0 and R12 = 100)
 *   28   4  uint32 foF2 geographic terms (76)
 *   32   4  uint32 foF2 time terms (13)
 *   36   4  uint32 M(3000)F2 geographic terms (49)
 *   40   4  uint32 M(3000)F2 time terms (9)
 *   44  20  reserved, zero
 *   64  ..  float64 blocks, month-major then solar level, foF2 then M(3000)F2
 *
 * float64 rather than float32 is deliberate. Each foF2 value is a sum of 988
 * coefficient-times-basis products; rounding the coefficients to float32 alone
 * moves the result by up to about 1e-3 MHz, which is the entire parity budget.
 * The cost is 274 kB instead of 137 kB, fetched once.
 */

import manifest from "./manifest.json";
import {
  FOF2_GEOGRAPHIC_TERMS,
  FOF2_TIME_TERMS,
  M3000F2_GEOGRAPHIC_TERMS,
  M3000F2_TIME_TERMS,
} from "../numericalMap";
import {
  IonosphereAssetError,
  type ArtifactHash,
  isArtifactHash,
} from "../types";

const MAGIC = "PROPULSE-IONOMAP";
const HEADER_BYTES = 64;
const SCHEMA_VERSION = 1;
const MONTHS = 12;
const SOLAR_LEVELS = 2;

const FOF2_BLOCK = FOF2_GEOGRAPHIC_TERMS * FOF2_TIME_TERMS;
const M3000F2_BLOCK = M3000F2_GEOGRAPHIC_TERMS * M3000F2_TIME_TERMS;
const LEVEL_BLOCK = FOF2_BLOCK + M3000F2_BLOCK;

export const ASSET_URL = manifest.asset.served_at;
export const ASSET_SHA256 = manifest.asset.sha256 as ArtifactHash;

/** One month at one solar-index level. */
export interface CoefficientBlock {
  readonly foF2: Float64Array;
  readonly m3000F2: Float64Array;
}

export interface NumericalMapAsset {
  readonly artifactHash: ArtifactHash;
  /** `[monthIndex][solarLevel]`, month 0 = January, level 0 = R12 0, level 1 = R12 100. */
  readonly blocks: ReadonlyArray<readonly [CoefficientBlock, CoefficientBlock]>;
}

/** Injected so tests and server-side callers can supply bytes without a network. */
export type AssetByteSource = (url: string) => Promise<ArrayBuffer>;

const defaultByteSource: AssetByteSource = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new IonosphereAssetError(
      url,
      `fetch failed with HTTP ${response.status} ${response.statusText}`,
    );
  }
  return response.arrayBuffer();
};

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new IonosphereAssetError(
      ASSET_URL,
      "WebCrypto SubtleCrypto is unavailable, so the coefficient digest cannot " +
        "be verified; refusing to use unverified coefficients",
    );
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decode(bytes: ArrayBuffer, hash: ArtifactHash): NumericalMapAsset {
  const expectedBytes = HEADER_BYTES + MONTHS * SOLAR_LEVELS * LEVEL_BLOCK * 8;
  if (bytes.byteLength !== expectedBytes) {
    throw new IonosphereAssetError(
      ASSET_URL,
      `expected ${expectedBytes} bytes, received ${bytes.byteLength}`,
    );
  }
  const header = new DataView(bytes, 0, HEADER_BYTES);
  const magic = String.fromCharCode(...new Uint8Array(bytes, 0, MAGIC.length));
  if (magic !== MAGIC) {
    throw new IonosphereAssetError(ASSET_URL, `bad magic "${magic}"`);
  }
  const fields = [
    ["schema version", header.getUint32(16, true), SCHEMA_VERSION],
    ["month count", header.getUint32(20, true), MONTHS],
    ["solar level count", header.getUint32(24, true), SOLAR_LEVELS],
    [
      "foF2 geographic terms",
      header.getUint32(28, true),
      FOF2_GEOGRAPHIC_TERMS,
    ],
    ["foF2 time terms", header.getUint32(32, true), FOF2_TIME_TERMS],
    [
      "M(3000)F2 geographic terms",
      header.getUint32(36, true),
      M3000F2_GEOGRAPHIC_TERMS,
    ],
    ["M(3000)F2 time terms", header.getUint32(40, true), M3000F2_TIME_TERMS],
  ] as const;
  for (const [label, actual, expected] of fields) {
    if (actual !== expected) {
      throw new IonosphereAssetError(
        ASSET_URL,
        `header ${label} is ${actual}, expected ${expected}`,
      );
    }
  }

  const blocks: Array<readonly [CoefficientBlock, CoefficientBlock]> = [];
  let offset = HEADER_BYTES;
  for (let month = 0; month < MONTHS; month += 1) {
    const levels: CoefficientBlock[] = [];
    for (let level = 0; level < SOLAR_LEVELS; level += 1) {
      // The header is a multiple of 8 bytes, so these views are always aligned.
      const foF2 = new Float64Array(bytes, offset, FOF2_BLOCK);
      offset += FOF2_BLOCK * 8;
      const m3000F2 = new Float64Array(bytes, offset, M3000F2_BLOCK);
      offset += M3000F2_BLOCK * 8;
      levels.push({ foF2, m3000F2 });
    }
    blocks.push([levels[0], levels[1]] as const);
  }
  return { artifactHash: hash, blocks };
}

let cached: Promise<NumericalMapAsset> | null = null;

/**
 * Load, verify and decode the coefficient asset. The result is cached for the
 * lifetime of the module; a failed load is not cached, so a transient network
 * error can be retried.
 */
export function loadNumericalMapAsset(
  byteSource: AssetByteSource = defaultByteSource,
): Promise<NumericalMapAsset> {
  if (cached !== null) return cached;
  const pending = (async () => {
    if (!isArtifactHash(ASSET_SHA256)) {
      throw new IonosphereAssetError(
        ASSET_URL,
        `manifest digest "${ASSET_SHA256}" is not a sha256 artifact hash`,
      );
    }
    const bytes = await byteSource(ASSET_URL);
    const actual = await sha256Hex(bytes);
    if (`sha256:${actual}` !== ASSET_SHA256) {
      throw new IonosphereAssetError(
        ASSET_URL,
        "coefficient digest does not match the manifest",
        ASSET_SHA256,
        `sha256:${actual}`,
      );
    }
    return decode(bytes, ASSET_SHA256);
  })();
  cached = pending;
  pending.catch(() => {
    if (cached === pending) cached = null;
  });
  return pending;
}

/** Test-only: drop the module-level cache so a fresh load can be observed. */
export function resetNumericalMapAssetCache(): void {
  cached = null;
}

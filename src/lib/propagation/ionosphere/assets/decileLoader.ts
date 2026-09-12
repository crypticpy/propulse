/**
 * Loader for the ITU-R P.1239-3 foF2 decile-factor asset (PROP-07b, #1102).
 *
 * Same contract as `loader.ts`, for the same reasons: a static file under
 * `public/` that costs no bundle budget, fetched once, verified against the
 * SHA-256 digest pinned in `manifest.json` before a single factor is read, and
 * fatal on mismatch. There is no degraded mode here either. A decile factor
 * that quietly became 1.0 would turn "the MUF is exceeded on nine days in ten"
 * into "the MUF is never exceeded" with nothing at the call site to see.
 *
 * Binary layout, little-endian throughout:
 *
 *    0  24  magic "PROPULSE-P1239-DECILES\0\0"
 *   24   4  uint32 schema version
 *   28   4  uint32 deciles (2: lower, upper)
 *   32   4  uint32 seasons (3: winter, equinox, summer)
 *   36   4  uint32 R12 ranges (3: below 50, 50 to 100, above 100)
 *   40   4  uint32 latitudes (19: 0 to 90 degrees in steps of 5, ascending)
 *   44   4  uint32 hours (24)
 *   48  16  reserved, zero
 *   64  ..  float64 factors, in that axis order with hour varying fastest
 *
 * The published table prints latitude descending from 90; the asset stores it
 * ascending so an index is `abs(latitude) / 5`. The reference does the same
 * reversal on read (ReadP1239.c counts its row index down from 18).
 */

import manifest from "./manifest.json";
import {
  IonosphereAssetError,
  isArtifactHash,
  type ArtifactHash,
  type ReadonlyFloat64Array,
} from "../types";

const MAGIC = "PROPULSE-P1239-DECILES\0\0";
const HEADER_BYTES = 64;
const SCHEMA_VERSION = 1;

export const DECILE_COUNT = 2;
export const SEASON_COUNT = 3;
export const R12_RANGE_COUNT = 3;
/** 0, 5, ... 90 degrees. */
export const LATITUDE_ROWS = 19;
export const HOUR_COLUMNS = 24;

export const FACTOR_COUNT =
  DECILE_COUNT * SEASON_COUNT * R12_RANGE_COUNT * LATITUDE_ROWS * HOUR_COLUMNS;

export const DECILE_ASSET_URL = manifest.decile_factors.asset.served_at;
export const DECILE_ASSET_SHA256 = manifest.decile_factors.asset
  .sha256 as ArtifactHash;

export interface DecileFactorTable {
  readonly artifactHash: ArtifactHash;
  /**
   * All 8208 factors, flat. Index with `decileFactorIndex`; the axis order is
   * in the layout comment above and is not a caller's business to rederive.
   */
  readonly factors: ReadonlyFloat64Array;
}

/** Flat index into `DecileFactorTable.factors`. All arguments are indices. */
export function decileFactorIndex(
  decile: number,
  season: number,
  r12Range: number,
  latitudeRow: number,
  hourColumn: number,
): number {
  return (
    (((decile * SEASON_COUNT + season) * R12_RANGE_COUNT + r12Range) *
      LATITUDE_ROWS +
      latitudeRow) *
      HOUR_COLUMNS +
    hourColumn
  );
}

/** Injected so tests and server-side callers can supply bytes without a network. */
export type DecileByteSource = (url: string) => Promise<ArrayBuffer>;

const defaultByteSource: DecileByteSource = async (url) => {
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
      DECILE_ASSET_URL,
      "WebCrypto SubtleCrypto is unavailable, so the decile-factor digest " +
        "cannot be verified; refusing to use unverified factors",
    );
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function decode(bytes: ArrayBuffer, hash: ArtifactHash): DecileFactorTable {
  const expectedBytes = HEADER_BYTES + FACTOR_COUNT * 8;
  if (bytes.byteLength !== expectedBytes) {
    throw new IonosphereAssetError(
      DECILE_ASSET_URL,
      `expected ${expectedBytes} bytes, received ${bytes.byteLength}`,
    );
  }
  const magic = String.fromCharCode(...new Uint8Array(bytes, 0, MAGIC.length));
  if (magic !== MAGIC) {
    throw new IonosphereAssetError(
      DECILE_ASSET_URL,
      `bad magic "${magic.replace(/\0/g, "")}"`,
    );
  }
  const header = new DataView(bytes, 0, HEADER_BYTES);
  const fields = [
    ["schema version", header.getUint32(24, true), SCHEMA_VERSION],
    ["decile count", header.getUint32(28, true), DECILE_COUNT],
    ["season count", header.getUint32(32, true), SEASON_COUNT],
    ["R12 range count", header.getUint32(36, true), R12_RANGE_COUNT],
    ["latitude row count", header.getUint32(40, true), LATITUDE_ROWS],
    ["hour column count", header.getUint32(44, true), HOUR_COLUMNS],
  ] as const;
  for (const [label, actual, expected] of fields) {
    if (actual !== expected) {
      throw new IonosphereAssetError(
        DECILE_ASSET_URL,
        `header ${label} is ${actual}, expected ${expected}`,
      );
    }
  }
  // `.slice()` copies into storage this module owns: the caller's buffer is
  // read exactly once, here, under the digest that was just checked, so a
  // caller holding those bytes cannot rewrite the factors after verification.
  const factors = new Float64Array(bytes, HEADER_BYTES, FACTOR_COUNT).slice();
  return Object.freeze({ artifactHash: hash, factors });
}

/** The verified master. Never returned; `loadDecileFactorAsset` copies out of it. */
let cached: Promise<DecileFactorTable> | null = null;

function copyTable(table: DecileFactorTable): DecileFactorTable {
  return Object.freeze({
    artifactHash: table.artifactHash,
    factors: Float64Array.from(table.factors),
  });
}

/**
 * Load, verify and decode the decile-factor asset.
 *
 * The fetch and the digest check happen once; a failed load is not cached, so
 * a transient network error can be retried. Every call returns its own 66 kB
 * copy, for the same reason `loadNumericalMapAsset` does: the array is typed
 * read-only, a cast defeats that, and a shared table a caller could write into
 * would change every later answer while still reporting the verified hash.
 */
export function loadDecileFactorAsset(
  byteSource: DecileByteSource = defaultByteSource,
): Promise<DecileFactorTable> {
  if (cached !== null) return cached.then(copyTable);
  const pending = (async () => {
    if (!isArtifactHash(DECILE_ASSET_SHA256)) {
      throw new IonosphereAssetError(
        DECILE_ASSET_URL,
        `manifest digest "${DECILE_ASSET_SHA256}" is not a sha256 artifact hash`,
      );
    }
    const bytes = await byteSource(DECILE_ASSET_URL);
    const actual = await sha256Hex(bytes);
    if (`sha256:${actual}` !== DECILE_ASSET_SHA256) {
      throw new IonosphereAssetError(
        DECILE_ASSET_URL,
        "decile-factor digest does not match the manifest",
        DECILE_ASSET_SHA256,
        `sha256:${actual}`,
      );
    }
    return decode(bytes, DECILE_ASSET_SHA256);
  })();
  cached = pending;
  pending.catch(() => {
    if (cached === pending) cached = null;
  });
  return pending.then(copyTable);
}

/** Test-only: drop the module-level cache so a fresh load can be observed. */
export function resetDecileFactorAssetCache(): void {
  cached = null;
}

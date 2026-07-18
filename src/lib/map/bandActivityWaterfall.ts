import type { LiveSpot } from "@/types/livespot";

export const WATERFALL_BAND_NAMES: string[] = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
];

const WATERFALL_BAND_SET = new Set(WATERFALL_BAND_NAMES);

export const WATERFALL_MAX_ROWS = 20;
export const WATERFALL_SAMPLE_INTERVAL_MS = 30_000;

export interface BandActivityRow {
  timestamp: number;
  bands: Record<string, number>;
}

type ActivitySpot = Pick<LiveSpot, "band" | "time">;

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(WATERFALL_BAND_NAMES.map((band) => [band, 0]));
}

function normalizedBandName(band: string | undefined): string | null {
  if (!band) return null;
  const normalized = band.toLowerCase().trim();
  return WATERFALL_BAND_SET.has(normalized) ? normalized : null;
}

function normalizeRows(
  rows: Array<{ timestamp: number; bands: Record<string, number> }>,
): BandActivityRow[] {
  const peak = Math.max(
    1,
    ...rows.flatMap((row) => Object.values(row.bands)),
  );

  return rows.map((row) => ({
    timestamp: row.timestamp,
    bands: Object.fromEntries(
      WATERFALL_BAND_NAMES.map((band) => {
        const count = row.bands[band] ?? 0;
        return [band, count === 0 ? 0 : Math.max(18, (count / peak) * 100)];
      }),
    ),
  }));
}

export function buildBandActivityHistory(
  spots: readonly ActivitySpot[],
  now = Date.now(),
  bucketMs = WATERFALL_SAMPLE_INTERVAL_MS,
  maxRows = WATERFALL_MAX_ROWS,
): BandActivityRow[] {
  const newestBucket = Math.floor(now / bucketMs) * bucketMs;
  const oldestBucket = newestBucket - (maxRows - 1) * bucketMs;
  const buckets = new Map<number, Record<string, number>>();

  for (const spot of spots) {
    const band = normalizedBandName(spot.band);
    const timestamp = spot.time.getTime();
    if (!band || !Number.isFinite(timestamp)) continue;

    const bucket = Math.floor(timestamp / bucketMs) * bucketMs;
    if (bucket < oldestBucket || bucket > newestBucket) continue;
    const counts = buckets.get(bucket) ?? emptyCounts();
    counts[band] += 1;
    buckets.set(bucket, counts);
  }

  const rows = Array.from(buckets, ([timestamp, bands]) => ({
    timestamp,
    bands,
  })).sort((a, b) => a.timestamp - b.timestamp);

  return normalizeRows(rows);
}

export function createBandActivitySnapshot(
  spots: readonly ActivitySpot[],
  timestamp = Date.now(),
): BandActivityRow | null {
  const counts = emptyCounts();
  let counted = 0;

  for (const spot of spots) {
    const band = normalizedBandName(spot.band);
    if (!band) continue;
    counts[band] += 1;
    counted += 1;
  }

  if (counted === 0) return null;
  return normalizeRows([{ timestamp, bands: counts }])[0];
}

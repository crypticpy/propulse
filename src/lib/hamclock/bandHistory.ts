/** Completed global band/hour counts. Missing rows are unknown, not zero. */
export interface BandHistoryRow {
  hour: string;
  band: string;
  count: number;
  sources: Record<string, number>;
  modes: Record<string, number>;
}

export interface BandHistorySnapshot {
  rows: BandHistoryRow[];
  windowStart: string;
  windowEnd: string;
  fetchedAt: string;
  scope: "global";
}

function counts(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      return null;
    // Copy only ordinary own keys into a null-prototype-free dictionary.
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      return null;
    result[key] = count;
  }
  return result;
}

export function parseStoredBandHistory(value: unknown): BandHistoryRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const time =
    typeof row.hour_utc === "string" ? Date.parse(row.hour_utc) : NaN;
  const sources = counts(row.source_counts);
  const modes = counts(row.mode_counts);
  if (
    !Number.isFinite(time) ||
    time % 3_600_000 !== 0 ||
    typeof row.band !== "string" ||
    !/^(160|80|60|40|30|20|17|15|12|10|6|2)m$/.test(row.band) ||
    typeof row.spot_count !== "number" ||
    !Number.isSafeInteger(row.spot_count) ||
    row.spot_count < 0 ||
    !sources ||
    !modes
  )
    return null;
  return {
    hour: new Date(time).toISOString(),
    band: row.band,
    count: row.spot_count,
    sources,
    modes,
  };
}

export function bandHistoryHours(snapshot: BandHistorySnapshot) {
  const start = Date.parse(snapshot.windowStart);
  return Array.from({ length: 6 }, (_, i) => {
    const hour = new Date(start + i * 3_600_000).toISOString();
    const rows = snapshot.rows.filter((row) => row.hour === hour);
    return {
      hour,
      rows,
      count: rows.length ? rows.reduce((sum, row) => sum + row.count, 0) : null,
    };
  });
}

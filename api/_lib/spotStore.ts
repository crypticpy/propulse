export type StoredSpotSource = "pskreporter" | "rbn" | "dxcluster";

export interface SpotHistoryRow {
  source: StoredSpotSource;
  spotted_at: string;
  tx_callsign: string;
  tx_grid: string | null;
  tx_lat: number | null;
  tx_lon: number | null;
  rx_callsign: string;
  rx_grid: string | null;
  rx_lat: number | null;
  rx_lon: number | null;
  frequency_khz: number;
  band: string;
  mode: string | null;
  snr: number | null;
  wpm: number | null;
  comment: string | null;
  dxcc: number | null;
  continent: string | null;
}

export type SpotStoreStatus = "ok" | "stale" | "unavailable";

export interface SpotStoreResult {
  rows: SpotHistoryRow[];
  status: SpotStoreStatus;
  observedAt: string | null;
  fetchedAt: string;
  staleAfterSeconds: number;
}

export interface SpotStoreOptions {
  limit: number;
  grid?: string;
  bands?: string[];
  modes?: string[];
}

export interface SpotStoreDependencies {
  fetcher: typeof fetch;
  now: () => number;
  storageConfig: () => { baseUrl: string; anonKey: string } | null;
}

const RESPONSE_BYTE_LIMIT = 512 * 1024;
const STORE_TIMEOUT_MS = 5_000;
const STALE_AFTER_SECONDS: Record<StoredSpotSource, number> = {
  pskreporter: 30 * 60,
  rbn: 30 * 60,
  dxcluster: 30 * 60,
};

function configuredStorage(): { baseUrl: string; anonKey: string } | null {
  const rawUrl = process.env.VITE_SUPABASE_URL?.trim();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    return { baseUrl: parsed.origin, anonKey };
  } catch {
    return null;
  }
}

const DEFAULT_DEPENDENCIES: SpotStoreDependencies = {
  fetcher: (input, init) => fetch(input, init),
  now: () => Date.now(),
  storageConfig: configuredStorage,
};

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > RESPONSE_BYTE_LIMIT)
  ) {
    throw new RangeError("spot store response exceeds byte limit");
  }

  if (!response.body) return [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > RESPONSE_BYTE_LIMIT) {
      await reader.cancel();
      throw new RangeError("spot store response exceeds byte limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRow(value: unknown, source: StoredSpotSource): SpotHistoryRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.source !== source ||
    typeof row.spotted_at !== "string" ||
    !Number.isFinite(Date.parse(row.spotted_at)) ||
    typeof row.tx_callsign !== "string" ||
    typeof row.rx_callsign !== "string" ||
    typeof row.frequency_khz !== "number" ||
    !Number.isFinite(row.frequency_khz) ||
    typeof row.band !== "string"
  ) {
    return null;
  }
  return {
    source,
    spotted_at: row.spotted_at,
    tx_callsign: row.tx_callsign,
    tx_grid: nullableString(row.tx_grid),
    tx_lat: nullableNumber(row.tx_lat),
    tx_lon: nullableNumber(row.tx_lon),
    rx_callsign: row.rx_callsign,
    rx_grid: nullableString(row.rx_grid),
    rx_lat: nullableNumber(row.rx_lat),
    rx_lon: nullableNumber(row.rx_lon),
    frequency_khz: row.frequency_khz,
    band: row.band,
    mode: nullableString(row.mode),
    snr: nullableNumber(row.snr),
    wpm: nullableNumber(row.wpm),
    comment: nullableString(row.comment),
    dxcc: nullableNumber(row.dxcc),
    continent: nullableString(row.continent),
  };
}

function emptyResult(
  source: StoredSpotSource,
  now: number,
  status: Exclude<SpotStoreStatus, "ok">,
  observedAt: string | null = null,
): SpotStoreResult {
  return {
    rows: [],
    status,
    observedAt,
    fetchedAt: new Date(now).toISOString(),
    staleAfterSeconds: STALE_AFTER_SECONDS[source],
  };
}

export async function readStoredSpots(
  source: StoredSpotSource,
  options: SpotStoreOptions,
  overrides: Partial<SpotStoreDependencies> = {},
): Promise<SpotStoreResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const now = dependencies.now();
  const config = dependencies.storageConfig();
  if (!config) return emptyResult(source, now, "unavailable");

  const query = new URLSearchParams({
    select:
      "source,spotted_at,tx_callsign,tx_grid,tx_lat,tx_lon,rx_callsign,rx_grid,rx_lat,rx_lon,frequency_khz,band,mode,snr,wpm,comment,dxcc,continent",
    source: `eq.${source}`,
    spotted_at: `gte.${new Date(
      now - STALE_AFTER_SECONDS[source] * 1_000,
    ).toISOString()}`,
    order: "spotted_at.desc",
    limit: String(Math.min(800, Math.max(options.limit, options.limit * 4))),
  });
  if (source === "pskreporter" && options.grid) {
    query.set("rx_grid", `ilike.${options.grid.slice(0, 4).toUpperCase()}*`);
  }
  if (options.bands?.length) {
    query.set("band", `in.(${options.bands.join(",")})`);
  }
  if (options.modes?.length) {
    query.set("mode", `in.(${options.modes.join(",")})`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);
  try {
    const response = await dependencies.fetcher(
      `${config.baseUrl}/rest/v1/spot_history?${query}`,
      {
        headers: {
          Accept: "application/json",
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
        redirect: "error",
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return emptyResult(source, now, "unavailable");
    }
    const payload = await readBoundedJson(response);
    if (!Array.isArray(payload)) {
      return emptyResult(source, now, "unavailable");
    }
    const rows = payload
      .map((row) => parseRow(row, source))
      .filter((row): row is SpotHistoryRow => row !== null);
    const observedAt = rows[0]?.spotted_at ?? null;
    const newestMs = observedAt ? Date.parse(observedAt) : Number.NaN;
    const staleAfterSeconds = STALE_AFTER_SECONDS[source];
    if (!Number.isFinite(newestMs) || now - newestMs > staleAfterSeconds * 1_000) {
      return emptyResult(source, now, "stale", observedAt);
    }
    return {
      rows: rows.slice(0, options.limit),
      status: "ok",
      observedAt,
      fetchedAt: new Date(now).toISOString(),
      staleAfterSeconds,
    };
  } catch {
    return emptyResult(source, now, "unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}

export function spotCacheHeaders(result: SpotStoreResult): Record<string, string> {
  return {
    "Cache-Control":
      result.status === "ok"
        ? "s-maxage=30, stale-while-revalidate=300, stale-if-error=86400"
        : "s-maxage=15, stale-while-revalidate=60",
    "X-Propulse-Spot-Status": result.status,
    ...(result.observedAt
      ? { "X-Propulse-Spot-Observed-At": result.observedAt }
      : {}),
  };
}

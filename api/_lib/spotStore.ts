import { isErrorNamed } from "./runtimeError.js";

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

export type SpotStoreFailureReason =
  | "configuration_missing"
  | "upstream_http"
  | "invalid_payload"
  | "response_too_large"
  | "timeout"
  | "network_error";

export interface SpotStoreResult {
  rows: SpotHistoryRow[];
  status: SpotStoreStatus;
  observedAt: string | null;
  fetchedAt: string;
  staleAfterSeconds: number;
  failureReason: SpotStoreFailureReason | null;
  upstreamStatus: number | null;
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

const METER_BAND_REGEX = /^(160|80|60|40|30|20|17|15|12|10|6|2)m$/;

export function meterBandNumber(value: string): number | null {
  const match = value.match(METER_BAND_REGEX);
  return match ? Number.parseInt(match[1], 10) : null;
}

function configuredStorage(): { baseUrl: string; anonKey: string } | null {
  const rawUrl = (
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  )?.trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  )?.trim();
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
    typeof row.band !== "string" ||
    meterBandNumber(row.band) === null
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
  failureReason: SpotStoreFailureReason | null = null,
  upstreamStatus: number | null = null,
): SpotStoreResult {
  return {
    rows: [],
    status,
    observedAt,
    fetchedAt: new Date(now).toISOString(),
    staleAfterSeconds: STALE_AFTER_SECONDS[source],
    failureReason,
    upstreamStatus,
  };
}

function unavailableResult(
  source: StoredSpotSource,
  now: number,
  failureReason: SpotStoreFailureReason,
  upstreamStatus: number | null = null,
): SpotStoreResult {
  console.warn(
    JSON.stringify({
      event: "spot_store_read_failed",
      source,
      failureReason,
      upstreamStatus,
    }),
  );
  return emptyResult(
    source,
    now,
    "unavailable",
    null,
    failureReason,
    upstreamStatus,
  );
}

export async function readStoredSpots(
  source: StoredSpotSource,
  options: SpotStoreOptions,
  overrides: Partial<SpotStoreDependencies> = {},
): Promise<SpotStoreResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const now = dependencies.now();
  const config = dependencies.storageConfig();
  if (!config) return unavailableResult(source, now, "configuration_missing");

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
      `${config.baseUrl}/rest/v1/spot_history_live?${query}`,
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
      return unavailableResult(source, now, "upstream_http", response.status);
    }
    const payload = await readBoundedJson(response);
    if (!Array.isArray(payload)) {
      return unavailableResult(source, now, "invalid_payload");
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
      failureReason: null,
      upstreamStatus: null,
    };
  } catch (error) {
    const reason: SpotStoreFailureReason =
      error instanceof RangeError
        ? "response_too_large"
        : error instanceof SyntaxError
          ? "invalid_payload"
          : isErrorNamed(error, "AbortError", "TimeoutError")
            ? "timeout"
            : "network_error";
    return unavailableResult(source, now, reason);
  } finally {
    clearTimeout(timeoutId);
  }
}

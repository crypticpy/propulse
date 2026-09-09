export const PATH_GAP_PREFLIGHT_LIMIT = 100;
export const PATH_GAP_PREFLIGHT_MAX_BYTES = 64 * 1024;

function readHour(hourISO) {
  const hourMs = Date.parse(hourISO);
  if (!Number.isFinite(hourMs) || hourMs % 3_600_000 !== 0) {
    throw new Error("path-recency hour is invalid");
  }
  return hourMs;
}

export function pathGapPreflightUrl(supabaseUrl, hourISO) {
  const url = new URL(`${supabaseUrl}/rest/v1/collector_aggregation_gaps`);
  url.searchParams.set("select", "start_hour,end_hour");
  url.searchParams.set("aggregation", "eq.path_hourly");
  url.searchParams.set("start_hour", `lte.${hourISO}`);
  url.searchParams.set("end_hour", `gte.${hourISO}`);
  url.searchParams.set("order", "start_hour.asc");
  url.searchParams.set("limit", String(PATH_GAP_PREFLIGHT_LIMIT + 1));
  return url;
}

function exactRange(value, rowCount) {
  const match = /^(\d+)-(\d+)\/(\d+)$/.exec(value ?? "") ??
    /^(\*)\/(\d+)$/.exec(value ?? "");
  if (!match) throw new Error("gap metadata count is unavailable");
  if (match.length === 3) {
    const total = Number(match[2]);
    if (rowCount !== 0 || total !== 0) throw new Error("gap metadata response is truncated");
    return;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (start !== 0 || end !== rowCount - 1 || total !== rowCount || total > PATH_GAP_PREFLIGHT_LIMIT) {
    throw new Error("gap metadata response is truncated");
  }
}

async function readBoundedText(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > PATH_GAP_PREFLIGHT_MAX_BYTES) {
    throw new Error("gap metadata response is oversized");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > PATH_GAP_PREFLIGHT_MAX_BYTES) {
      await reader.cancel();
      throw new Error("gap metadata response is oversized");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(joined);
  } catch {
    throw new Error("gap metadata response is not valid UTF-8");
  }
}

export async function readPathGapPreflight(response, hourMs) {
  if (!response.ok) {
    throw new Error(`gap metadata request failed with HTTP ${response.status}`);
  }
  const text = await readBoundedText(response);
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error("gap metadata response is not JSON");
  }
  if (!Array.isArray(rows)) throw new Error("gap metadata response is malformed");
  exactRange(response.headers.get("content-range"), rows.length);
  let previousStart = Number.NEGATIVE_INFINITY;
  return rows.map((row) => {
    if (!row || typeof row !== "object" || typeof row.start_hour !== "string" || typeof row.end_hour !== "string") {
      throw new Error("gap metadata row is malformed");
    }
    const startMs = Date.parse(row.start_hour);
    const endMs = Date.parse(row.end_hour);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs % 3_600_000 !== 0 ||
      endMs % 3_600_000 !== 0 || endMs < startMs || hourMs < startMs || hourMs > endMs) {
      throw new Error("gap metadata range is invalid");
    }
    if (startMs <= previousStart) throw new Error("gap metadata ranges are duplicate or unsorted");
    previousStart = startMs;
    return { startMs, endMs };
  });
}

export async function preflightPathRecencyHour({ fetchImpl, supabaseUrl, serviceKey, hourISO }) {
  const hourMs = readHour(hourISO);
  const response = await fetchImpl(pathGapPreflightUrl(supabaseUrl, hourISO), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readPathGapPreflight(response, hourMs);
}

#!/usr/bin/env node

const DATA_PRODUCTS = [
  ["noaa-k-index", "/api/solar/k-index", 48_000, 30 * 60_000, "observedAt", 3 * 60 * 60_000],
  ["noaa-solar-flux", "/api/solar/flux", 32_000, 24 * 60 * 60_000],
  ["noaa-magnetometer", "/api/solar/magnetometer", 64_000, 30 * 60_000],
  ["noaa-probabilities", "/api/solar/probabilities", 8_000, 24 * 60 * 60_000],
  ["noaa-sunspots", "/api/solar/sunspots", 32_000, 75 * 24 * 60 * 60_000],
  ["noaa-xray", "/api/solar/xray", 64_000, 30 * 60_000],
  ["noaa-protons", "/api/solar/protons", 64_000, 30 * 60_000],
  ["noaa-dst", "/api/solar/dst", 32_000, 2 * 60 * 60_000],
  ["noaa-drap", "/api/solar/drap", 500_000, 60 * 60_000],
  ["noaa-flux-forecast", "/api/solar/flux-forecast", 24_000, 24 * 60 * 60_000],
  ["nasa-cme", "/api/solar/cme", 160_000, 6 * 60 * 60_000, "fetchedAt"],
  ["swpc-scales", "/api/solar/scales", 16_000, 30 * 60_000],
  ["swpc-alerts", "/api/solar/alerts", 160_000, 10 * 60_000, "fetchedAt"],
  ["swpc-xray-latest", "/api/solar/xray-latest", 12_000, 30 * 60_000, "fetchedAt"],
  ["swpc-solar-wind-mag", "/api/solar/wind-mag", 8_000, 30 * 60_000],
  ["swpc-solar-wind-plasma", "/api/solar/wind-plasma", 8_000, 30 * 60_000],
];

const IMAGE_PRODUCTS = [
  "drap-global",
  "drap-10mhz",
  "drap-20mhz",
  "aurora-north",
  "synoptic-map",
  "sunspot-hmi",
];

const ANIMATION_PRODUCTS = ["drap-global", "aurora-north"];
const SCHEMA_VERSION = 1;
const baseInput = process.env.SOLAR_SYNTHETIC_BASE_URL;

if (!baseInput) {
  console.error(
    "SOLAR_SYNTHETIC_BASE_URL is required (for example, https://production.example).",
  );
  process.exit(2);
}

let baseUrl;
try {
  baseUrl = new URL(baseInput);
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("unsupported protocol");
} catch {
  console.error("SOLAR_SYNTHETIC_BASE_URL must be an absolute HTTP(S) URL.");
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseTimestamp(value, label, maxFutureMs = 5 * 60_000) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  assert(Number.isFinite(parsed), `${label} is not an ISO timestamp`);
  assert(parsed <= Date.now() + maxFutureMs, `${label} is implausibly far in the future`);
  return parsed;
}

async function fetchWithDeadline(path, accept) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL(path, baseUrl), {
      signal: controller.signal,
      headers: { Accept: accept, "User-Agent": "Propulse-Solar-Synthetic/1.0" },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { response, bytes, durationMs: Math.round(performance.now() - startedAt) };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkData([
  sourceId,
  path,
  maxBytes,
  hardTtlMs,
  freshnessBasis = "observedAt",
  maxFutureMs = 5 * 60_000,
]) {
  const { response, bytes, durationMs } = await fetchWithDeadline(path, "application/json");
  const text = new TextDecoder().decode(bytes);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}; response was not JSON`);
  }
  if (!response.ok) {
    const code = body?.error?.code ?? "untyped error";
    throw new Error(`HTTP ${response.status}; ${code}: ${body?.error?.message ?? "unknown failure"}`);
  }
  assert(bytes.byteLength <= maxBytes, `${bytes.byteLength} bytes exceeds ${maxBytes}`);
  assert(response.headers.get("content-type")?.includes("application/json"), "wrong content type");
  assert(response.headers.get("x-solar-schema") === String(SCHEMA_VERSION), "wrong schema header");
  assert(response.headers.get("x-solar-source") === sourceId, "wrong source header");
  assert(response.headers.get("cache-control")?.includes("stale-if-error"), "missing stale-if-error policy");
  assert(body?.schemaVersion === SCHEMA_VERSION, "wrong envelope schema version");
  assert(body?.sourceId === sourceId, "wrong envelope sourceId");
  assert(typeof body?.provider === "string" && body.provider.length > 0, "provider missing");
  assert(typeof body?.product === "string" && body.product.length > 0, "product missing");
  assert(typeof body?.sourceUrl === "string" && body.sourceUrl.startsWith("https://"), "source URL missing");
  assert(Object.hasOwn(body, "data"), "data field missing");
  const observedAt = parseTimestamp(body.observedAt, "observedAt", maxFutureMs);
  const fetchedAt = parseTimestamp(body.fetchedAt, "fetchedAt");
  const freshnessTime = freshnessBasis === "fetchedAt" ? fetchedAt : observedAt;
  assert(Date.now() - freshnessTime <= hardTtlMs, `${freshnessBasis} passed the hard TTL`);
  return { name: sourceId, durationMs, bytes: bytes.byteLength };
}

async function checkImageMetadata(product) {
  const path = `/api/solar/image-meta?product=${encodeURIComponent(product)}`;
  const { response, bytes, durationMs } = await fetchWithDeadline(path, "application/json");
  const body = JSON.parse(new TextDecoder().decode(bytes));
  assert(response.ok, `HTTP ${response.status}: ${body?.error?.message ?? "metadata failure"}`);
  assert(body?.product === product, "wrong product in metadata response");
  assert(typeof body?.provider === "string" && body.provider.length > 0, "provider missing");
  assert(typeof body?.sourceUrl === "string" && body.sourceUrl.startsWith("https://"), "source URL missing");
  parseTimestamp(body.checkedAt, "checkedAt");
  if (body.observedAt !== null) parseTimestamp(body.observedAt, "observedAt");
  assert(response.headers.get("cache-control")?.includes("stale-if-error"), "missing stale-if-error policy");
  return { name: `image-meta:${product}`, durationMs, bytes: bytes.byteLength };
}

async function checkAnimation(product) {
  const path = `/api/solar/animation?product=${encodeURIComponent(product)}`;
  const { response, bytes, durationMs } = await fetchWithDeadline(path, "application/json");
  const body = JSON.parse(new TextDecoder().decode(bytes));
  assert(response.ok, `HTTP ${response.status}: ${body?.error?.message ?? "animation failure"}`);
  assert(body?.product === product, "wrong product in animation response");
  assert(Array.isArray(body?.frames) && body.frames.length > 0, "animation has no usable frames");
  assert(body.frames.length <= 180, "animation frame budget exceeded");
  for (const frame of body.frames) {
    assert(typeof frame?.url === "string" && frame.url.startsWith("/api/solar/frame?"), "unsafe frame URL");
    parseTimestamp(frame?.time_tag, "frame time_tag");
  }
  assert(response.headers.get("cache-control")?.includes("stale-if-error"), "missing stale-if-error policy");
  return { name: `animation:${product}`, durationMs, bytes: bytes.byteLength };
}

const checks = [
  ...DATA_PRODUCTS.map((entry) => () => checkData(entry)),
  ...IMAGE_PRODUCTS.map((product) => () => checkImageMetadata(product)),
  ...ANIMATION_PRODUCTS.map((product) => () => checkAnimation(product)),
];

const results = await Promise.allSettled(checks.map((check) => check()));
let failures = 0;
for (let index = 0; index < results.length; index += 1) {
  const result = results[index];
  if (result.status === "fulfilled") {
    const { name, durationMs, bytes } = result.value;
    console.log(`PASS ${name.padEnd(31)} ${String(durationMs).padStart(5)} ms ${String(bytes).padStart(7)} bytes`);
  } else {
    failures += 1;
    const fallbackName = index < DATA_PRODUCTS.length
      ? DATA_PRODUCTS[index][0]
      : index < DATA_PRODUCTS.length + IMAGE_PRODUCTS.length
        ? `image-meta:${IMAGE_PRODUCTS[index - DATA_PRODUCTS.length]}`
        : `animation:${ANIMATION_PRODUCTS[index - DATA_PRODUCTS.length - IMAGE_PRODUCTS.length]}`;
    console.error(`FAIL ${fallbackName}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  }
}

console.log(`\nSolar synthetic: ${results.length - failures}/${results.length} contracts healthy at ${baseUrl.origin}`);
if (failures > 0) process.exitCode = 1;

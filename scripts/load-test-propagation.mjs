const forbiddenHost = /(^|\.)(localhost|local|lan)$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|\bm5\b/i;
const requiredTargets = new Set(["nowcast", "reachmap"]);

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, ordered.length - 1);
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}

function latencySummary(values) {
  return {
    p50_ms: Math.round(percentile(values, 0.5) * 10) / 10,
    p95_ms: Math.round(percentile(values, 0.95) * 10) / 10,
    max_ms: Math.round(Math.max(...values) * 10) / 10,
  };
}

function targetsFromEnvironment() {
  const raw = process.env.PROPULSE_LOAD_TEST_TARGETS?.trim();
  if (!raw) throw new Error("PROPULSE_LOAD_TEST_TARGETS is required");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length !== requiredTargets.size) {
    throw new Error("PROPULSE_LOAD_TEST_TARGETS must contain nowcast and reachmap");
  }
  const names = new Set();
  const targets = parsed.map((target) => {
    if (!target || typeof target !== "object" || typeof target.name !== "string") {
      throw new Error("each load-test target requires a name");
    }
    if (!requiredTargets.has(target.name) || names.has(target.name)) {
      throw new Error(`unexpected or duplicate load-test target: ${target.name}`);
    }
    names.add(target.name);
    const endpoint = new URL(target.url);
    if (endpoint.protocol !== "https:" || forbiddenHost.test(endpoint.hostname)) {
      throw new Error(`${target.name} must use a public HTTPS endpoint`);
    }
    if (!target.body || typeof target.body !== "object" || Array.isArray(target.body)) {
      throw new Error(`${target.name} requires a JSON object body`);
    }
    return { name: target.name, endpoint, body: JSON.stringify(target.body) };
  });
  if ([...requiredTargets].some((name) => !names.has(name))) {
    throw new Error("PROPULSE_LOAD_TEST_TARGETS must contain nowcast and reachmap");
  }
  return targets;
}

async function consumeBody(response, maximumBytes) {
  if (!response.body) return 0;
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        throw new Error(`response exceeded ${maximumBytes} bytes`);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return bytes;
}

async function runTarget(target, options) {
  const results = new Array(options.requests);
  let nextRequest = 0;
  async function worker() {
    while (true) {
      const requestIndex = nextRequest;
      nextRequest += 1;
      if (requestIndex >= options.requests) return;
      const started = performance.now();
      try {
        const response = await fetch(target.endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs),
          headers: {
            "Authorization": `Bearer ${options.bearerToken}`,
            "Content-Type": "application/json",
            "User-Agent": "Propulse-Railway-Load-Test/1.0",
            "X-Propulse-Load-Test": `${target.name}-${requestIndex}`,
          },
          body: target.body,
        });
        const responseBytes = await consumeBody(response, options.maximumResponseBytes);
        results[requestIndex] = {
          ok: response.ok,
          status: response.status,
          durationMs: performance.now() - started,
          responseBytes,
        };
      } catch (error) {
        results[requestIndex] = {
          ok: false,
          status: 0,
          durationMs: performance.now() - started,
          responseBytes: 0,
          error: error instanceof Error ? error.name : "UnknownError",
        };
      }
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  const statusCounts = {};
  const errorCounts = {};
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    if (result.error) errorCounts[result.error] = (errorCounts[result.error] ?? 0) + 1;
  }
  return {
    name: target.name,
    origin: target.endpoint.origin,
    path: target.endpoint.pathname,
    requests: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    status_counts: statusCounts,
    error_counts: errorCounts,
    response_bytes: results.reduce((total, result) => total + result.responseBytes, 0),
    latency: latencySummary(results.map((result) => result.durationMs)),
  };
}

const bearerToken = process.env.PROPULSE_LOAD_TEST_BEARER_TOKEN?.trim();
if (!bearerToken) throw new Error("PROPULSE_LOAD_TEST_BEARER_TOKEN is required");
if (!process.env.RAILWAY_ENVIRONMENT_ID?.trim() || !process.env.RAILWAY_SERVICE_ID?.trim()) {
  throw new Error("Railway environment and service identity are required");
}
const options = {
  bearerToken,
  concurrency: boundedInteger("PROPULSE_LOAD_TEST_CONCURRENCY", 8, 1, 100),
  requests: boundedInteger("PROPULSE_LOAD_TEST_REQUESTS", 100, 25, 10_000),
  timeoutMs: boundedInteger("PROPULSE_LOAD_TEST_TIMEOUT_MS", 15_000, 1_000, 120_000),
  maximumResponseBytes: boundedInteger(
    "PROPULSE_LOAD_TEST_MAX_RESPONSE_BYTES", 25_000_000, 1_000, 100_000_000,
  ),
};
const startedAt = new Date();
const targets = [];
for (const target of targetsFromEnvironment()) {
  targets.push(await runTarget(target, options));
}
const receipt = {
  status: targets.every((target) => target.failed === 0) ? "passed" : "failed",
  started_at: startedAt.toISOString(),
  completed_at: new Date().toISOString(),
  environment: "railway",
  railway_environment_verified: true,
  m5_required: false,
  concurrency: options.concurrency,
  requests_per_target: options.requests,
  timeout_ms: options.timeoutMs,
  targets,
};
console.log(JSON.stringify(receipt));
if (receipt.status !== "passed") process.exitCode = 1;

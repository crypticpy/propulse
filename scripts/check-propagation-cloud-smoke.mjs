const forbiddenHost = /(^|\.)(localhost|local|lan)$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|\bm5\b/i;

function endpointsFromEnvironment() {
  const value = process.env.PROPULSE_CLOUD_SMOKE_URLS?.trim();
  if (!value) {
    throw new Error("PROPULSE_CLOUD_SMOKE_URLS is required");
  }
  const endpoints = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (endpoints.length < 2 || endpoints.length > 10) {
    throw new Error("cloud smoke requires 2 to 10 comma-separated endpoints");
  }
  return endpoints.map((value) => {
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || forbiddenHost.test(endpoint.hostname)) {
      throw new Error(`cloud smoke endpoint is not a public HTTPS target: ${value}`);
    }
    return endpoint;
  });
}

const results = [];
for (const endpoint of endpointsFromEnvironment()) {
  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Propulse-Cloud-Smoke/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${endpoint.origin} returned HTTP ${response.status}`);
  }
  await response.body?.cancel();
  results.push({
    origin: endpoint.origin,
    path: endpoint.pathname,
    status: response.status,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  });
}

console.log(JSON.stringify({
  status: "passed",
  m5Required: false,
  endpoints: results,
}));

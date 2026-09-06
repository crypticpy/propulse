import { checkRateLimit, getClientIP } from "../_lib/rateLimit";

export const config = { runtime: "edge" };

const STYLES = new Set(["dark_all", "dark_only_labels", "light_only_labels"]);
const PARAMETERS = new Set(["style", "z", "x", "y"]);
const MAX_TILE_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function failure(status: number): Response {
  return new Response(JSON.stringify({ error: "Basemap tile unavailable" }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 405 ? { Allow: "GET" } : {}),
    },
  });
}

/** Public raster proxy. Neither credentials nor upstream headers/errors escape. */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return failure(405);
  const params = new URL(request.url).searchParams;
  for (const name of params.keys()) {
    if (!PARAMETERS.has(name) || params.getAll(name).length !== 1)
      return failure(400);
  }
  const style = params.get("style") ?? "";
  const coordinates = ["z", "x", "y"].map((name) => params.get(name) ?? "");
  if (
    !STYLES.has(style) ||
    coordinates.some((value) => !/^(0|[1-9]\d{0,6})$/.test(value))
  ) {
    return failure(400);
  }
  const [z, x, y] = coordinates.map(Number);
  if (z > 20 || x >= 2 ** z || y >= 2 ** z) return failure(400);

  const key = process.env.CARTO_BASEMAPS_API_KEY;
  if (!key?.trim()) return failure(503);
  const limit = checkRateLimit("tiles/carto", getClientIP(request), 600, 60);
  if (!limit.success) {
    const response = failure(429);
    response.headers.set("Retry-After", String(limit.reset));
    return response;
  }

  const upstreamUrl = new URL(
    `https://basemaps.cartocdn.com/${style}/${z}/${x}/${y}@2x.png`,
  );
  upstreamUrl.searchParams.set("key", key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(upstreamUrl, {
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "image/png" },
    });
    if (
      upstream.status !== 200 ||
      upstream.headers
        .get("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "image/png"
    ) {
      await upstream.body?.cancel();
      return failure(502);
    }
    const length = Number(upstream.headers.get("Content-Length"));
    if (length > MAX_TILE_BYTES || !upstream.body) {
      await upstream.body?.cancel();
      return failure(502);
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TILE_BYTES) {
        await reader.cancel();
        return failure(502);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (PNG_SIGNATURE.some((byte, index) => body[index] !== byte))
      return failure(502);
    return new Response(body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Fetch exceptions can include the credential-bearing URL. Never log them.
    return failure(controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

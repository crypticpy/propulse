import { applyRateLimit } from "../rateLimit";
import { isErrorNamed } from "../runtimeError";
import {
  isSolarAnimationProduct,
  isSolarImageProduct,
  SOLAR_ANIMATION_PRODUCTS,
  SOLAR_IMAGE_PRODUCTS,
} from "../../../src/lib/solar/mediaProducts";
import { normalizeTimeSeries } from "../../../src/lib/solar/normalization";

// ─── Animation ──────────────────────────────────────────────────────────────

interface RawFrame { url?: unknown; time_tag?: unknown }
const MANIFEST_MAX_BYTES = 512_000;

export async function handleSolarAnimation(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET, OPTIONS" } });
  const limited = applyRateLimit(request, "solar/animation", 60, 60);
  if (limited) return limited;
  const productId = new URL(request.url).searchParams.get("product") ?? "";
  if (!isSolarAnimationProduct(productId)) {
    return new Response(JSON.stringify({ error: "Unknown animation product" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const product = SOLAR_ANIMATION_PRODUCTS[productId];
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(product.manifestUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Propulse/2.0 (Solar Animation)" },
    });
    if (!response.ok) throw new Error(`Manifest provider returned ${response.status}`);
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
      throw new Error("Manifest provider returned the wrong media type");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MANIFEST_MAX_BYTES) {
      throw new Error("Animation manifest exceeds its response budget");
    }
    const text = await response.text();
    const manifestBytes = new TextEncoder().encode(text).byteLength;
    if (manifestBytes > MANIFEST_MAX_BYTES) {
      throw new Error("Animation manifest exceeds its response budget");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error("Animation manifest is not valid JSON");
    }
    if (!Array.isArray(raw)) throw new Error("Animation manifest is not an array");
    const frames = normalizeTimeSeries(
      raw.flatMap((value): Array<{ url: string; time_tag: string }> => {
        const frame = value as RawFrame;
        if (typeof frame.url !== "string" || typeof frame.time_tag !== "string") return [];
        const file = frame.url.split("/").pop() ?? "";
        if (!/^[A-Za-z0-9_.-]+\.(?:png|jpe?g)$/i.test(file)) return [];
        return [{
          url: `/api/solar/frame?product=${encodeURIComponent(productId)}&file=${encodeURIComponent(file)}`,
          time_tag: frame.time_tag,
        }];
      }),
      { timestamp: (frame) => frame.time_tag, maxRows: product.maxFrames, maxFutureMs: 24 * 60 * 60_000 },
    );
    const body = JSON.stringify({ product: productId, frames });
    console.info(JSON.stringify({
      event: "solar_media_fetch",
      kind: "animation-manifest",
      productId,
      outcome: "success",
      durationMs: Date.now() - startedAt,
      upstreamBytes: manifestBytes,
      responseBytes: new TextEncoder().encode(body).byteLength,
      frameCount: frames.length,
    }));
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300, stale-if-error=3600",
      },
    });
  } catch (cause) {
    console.warn(JSON.stringify({
      event: "solar_media_fetch",
      kind: "animation-manifest",
      productId,
      outcome: "failure",
      durationMs: Date.now() - startedAt,
      message: cause instanceof Error ? cause.message : "Animation unavailable",
    }));
    return new Response(
      JSON.stringify({ error: { code: "ANIMATION_UNAVAILABLE", message: cause instanceof Error ? cause.message : "Animation unavailable" } }),
      { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Frame ──────────────────────────────────────────────────────────────────

export async function handleSolarFrame(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET, OPTIONS" } });
  const limited = applyRateLimit(request, "solar/frame", 240, 60);
  if (limited) return limited;
  const url = new URL(request.url);
  const productId = url.searchParams.get("product") ?? "";
  const file = url.searchParams.get("file") ?? "";
  if (!isSolarAnimationProduct(productId) || !/^[A-Za-z0-9_.-]+\.(?:png|jpe?g)$/i.test(file)) {
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(`${SOLAR_ANIMATION_PRODUCTS[productId].frameBaseUrl}${file}`, {
      signal: controller.signal,
      headers: { Accept: "image/*", "User-Agent": "Propulse/2.0 (Solar Animation Frame)" },
    });
    if (!upstream.ok) return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) return new Response(null, { status: 502 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 6_000_000) return new Response(null, { status: 502 });
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400, stale-if-error=604800",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Image ──────────────────────────────────────────────────────────────────

function imageError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code: "IMAGE_UNAVAILABLE", message } }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handleSolarImage(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "GET, OPTIONS", "Access-Control-Allow-Methods": "GET, OPTIONS" },
    });
  }
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET, OPTIONS" } });
  }
  const limited = applyRateLimit(request, "solar/image", 120, 60);
  if (limited) return limited;
  const productId = new URL(request.url).searchParams.get("product") ?? "";
  if (!isSolarImageProduct(productId)) return imageError("Unknown solar image product", 400);
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(product.upstreamUrl, {
      signal: controller.signal,
      headers: { Accept: "image/*", "User-Agent": "Propulse/2.0 (Solar Media)" },
    });
    if (!upstream.ok) {
      console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "http-error", upstreamStatus: upstream.status, durationMs: Date.now() - startedAt }));
      return imageError(`Image provider returned HTTP ${upstream.status}`, 502);
    }
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "wrong-content-type", contentType: contentType || "unknown", durationMs: Date.now() - startedAt }));
      return imageError(`Image provider returned ${contentType || "an unknown media type"}`, 502);
    }
    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > product.maxBytes) {
      console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "payload-too-large", upstreamBytes: contentLength, durationMs: Date.now() - startedAt }));
      return imageError("Solar image exceeds its response budget", 502);
    }
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > product.maxBytes) {
      console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "payload-too-large", upstreamBytes: bytes.byteLength, durationMs: Date.now() - startedAt }));
      return imageError("Solar image exceeds its response budget", 502);
    }
    const etag = upstream.headers.get("etag");
    const lastModified = upstream.headers.get("last-modified");
    console.info(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "success", durationMs: Date.now() - startedAt, responseBytes: bytes.byteLength, contentType, observationAgeMs: lastModified && Number.isFinite(Date.parse(lastModified)) ? Math.max(0, Date.now() - Date.parse(lastModified)) : null }));
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": `public, s-maxage=${product.softTtlSeconds}, stale-while-revalidate=${product.softTtlSeconds}, stale-if-error=${product.hardTtlSeconds}`,
        ...(etag ? { ETag: etag } : {}),
        ...(lastModified ? { "Last-Modified": lastModified } : {}),
        "X-Solar-Product": productId,
      },
    });
  } catch (cause) {
    const timedOut = isErrorNamed(cause, "AbortError", "TimeoutError");
    console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: timedOut ? "timeout" : "failure", durationMs: Date.now() - startedAt }));
    return imageError(timedOut ? "Solar image provider timed out" : "Solar image provider is unavailable", timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Image metadata ─────────────────────────────────────────────────────────

export async function handleSolarImageMeta(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET, OPTIONS" } });
  const limited = applyRateLimit(request, "solar/image-meta", 120, 60);
  if (limited) return limited;
  const productId = new URL(request.url).searchParams.get("product") ?? "";
  if (!isSolarImageProduct(productId)) {
    return new Response(JSON.stringify({ error: "Unknown image product" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(product.upstreamUrl, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Propulse/2.0 (Solar Media Metadata)" },
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const lastModified = response.headers.get("last-modified");
    const observedAt = lastModified && Number.isFinite(Date.parse(lastModified))
      ? new Date(lastModified).toISOString()
      : null;
    console.info(JSON.stringify({ event: "solar_media_fetch", kind: "image-metadata", productId, outcome: "success", durationMs: Date.now() - startedAt, observationAgeMs: observedAt ? Math.max(0, Date.now() - Date.parse(observedAt)) : null }));
    return new Response(
      JSON.stringify({
        product: productId,
        provider: product.provider,
        observedAt,
        checkedAt: new Date().toISOString(),
        sourceUrl: product.sourceUrl,
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, s-maxage=${product.softTtlSeconds}, stale-while-revalidate=${product.softTtlSeconds}, stale-if-error=${product.hardTtlSeconds}`,
        },
      },
    );
  } catch (cause) {
    console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image-metadata", productId, outcome: isErrorNamed(cause, "AbortError", "TimeoutError") ? "timeout" : "failure", durationMs: Date.now() - startedAt }));
    return new Response(
      JSON.stringify({ error: { code: "IMAGE_METADATA_UNAVAILABLE", message: "Image timestamp is temporarily unavailable" } }),
      { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}

import { applyRateLimit } from "../_lib/rateLimit";
import { isErrorNamed } from "../_lib/runtimeError";
import {
  isSolarImageProduct,
  SOLAR_IMAGE_PRODUCTS,
} from "../../src/lib/solar/mediaProducts";

export const config = { runtime: "edge" };

function error(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code: "IMAGE_UNAVAILABLE", message } }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async function handler(request: Request): Promise<Response> {
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
  if (!isSolarImageProduct(productId)) return error("Unknown solar image product", 400);
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
      return error(`Image provider returned HTTP ${upstream.status}`, 502);
    }
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "wrong-content-type", contentType: contentType || "unknown", durationMs: Date.now() - startedAt }));
      return error(`Image provider returned ${contentType || "an unknown media type"}`, 502);
    }
    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > product.maxBytes) {
      console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "payload-too-large", upstreamBytes: contentLength, durationMs: Date.now() - startedAt }));
      return error("Solar image exceeds its response budget", 502);
    }
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > product.maxBytes) {
      console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image", productId, outcome: "payload-too-large", upstreamBytes: bytes.byteLength, durationMs: Date.now() - startedAt }));
      return error("Solar image exceeds its response budget", 502);
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
    return error(timedOut ? "Solar image provider timed out" : "Solar image provider is unavailable", timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

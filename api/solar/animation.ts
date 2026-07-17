import { applyRateLimit } from "../_lib/rateLimit";
import {
  isSolarAnimationProduct,
  SOLAR_ANIMATION_PRODUCTS,
} from "../../src/lib/solar/mediaProducts";
import { normalizeTimeSeries } from "../../src/lib/solar/normalization";

export const config = { runtime: "edge" };

interface RawFrame { url?: unknown; time_tag?: unknown }
const MANIFEST_MAX_BYTES = 512_000;

export default async function handler(request: Request): Promise<Response> {
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

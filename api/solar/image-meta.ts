import { applyRateLimit } from "../_lib/rateLimit";
import {
  isSolarImageProduct,
  SOLAR_IMAGE_PRODUCTS,
} from "../../src/lib/solar/mediaProducts";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
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
    console.warn(JSON.stringify({ event: "solar_media_fetch", kind: "image-metadata", productId, outcome: cause instanceof DOMException && cause.name === "AbortError" ? "timeout" : "failure", durationMs: Date.now() - startedAt }));
    return new Response(
      JSON.stringify({ error: { code: "IMAGE_METADATA_UNAVAILABLE", message: "Image timestamp is temporarily unavailable" } }),
      { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}

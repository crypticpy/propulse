import { applyRateLimit } from "../_lib/rateLimit";
import {
  isSolarAnimationProduct,
  SOLAR_ANIMATION_PRODUCTS,
} from "../../src/lib/solar/mediaProducts";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
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

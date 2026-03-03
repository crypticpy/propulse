/**
 * Vercel Edge Function: NASA SDO Image Proxy
 *
 * Proxies the latest NASA SDO HMI Intensitygram (sunspot image) to avoid
 * cross-origin issues and ensure reliable delivery.
 *
 * Supports ?type= parameter for different SDO wavelengths.
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = { runtime: "edge" };

const SDO_IMAGES: Record<string, string> = {
  hmi: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg",
  aia171: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg",
  aia193: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg",
  aia304: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg",
  hmimag: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIB.jpg",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "solar/sdo-image", 30, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "hmi";
  const sdoUrl = SDO_IMAGES[type] ?? SDO_IMAGES.hmi;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(sdoUrl, {
      headers: { "User-Agent": "Propulse/1.0 (SDO Image Proxy)" },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(null, { status: res.status });
    }

    const imageData = await res.arrayBuffer();

    return new Response(imageData, {
      headers: {
        "Content-Type": "image/jpeg",
        // Cache 5 min, revalidate in background for 1 min, serve stale on
        // upstream error for up to 24 h (NASA outages)
        "Cache-Control":
          "s-maxage=300, stale-while-revalidate=60, stale-if-error=86400",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

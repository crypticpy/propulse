/**
 * Reverse Beacon Network API Proxy - Vercel Edge Function
 *
 * Proxies requests to HamQTH RBN JSON feed to avoid CORS issues
 * Transforms object-keyed response to unified spot array format
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/**
 * Get the allowed CORS origin based on environment
 * Never returns wildcard "*" to prevent security issues
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

/**
 * Map frequency (kHz) to band number for the RBN band field
 */
function freqToBand(freqKHz: number): number {
  if (freqKHz >= 1800 && freqKHz <= 2000) return 160;
  if (freqKHz >= 3500 && freqKHz <= 4000) return 80;
  if (freqKHz >= 5330 && freqKHz <= 5405) return 60;
  if (freqKHz >= 7000 && freqKHz <= 7300) return 40;
  if (freqKHz >= 10100 && freqKHz <= 10150) return 30;
  if (freqKHz >= 14000 && freqKHz <= 14350) return 20;
  if (freqKHz >= 18068 && freqKHz <= 18168) return 17;
  if (freqKHz >= 21000 && freqKHz <= 21450) return 15;
  if (freqKHz >= 24890 && freqKHz <= 24990) return 12;
  if (freqKHz >= 28000 && freqKHz <= 29700) return 10;
  if (freqKHz >= 50000 && freqKHz <= 54000) return 6;
  if (freqKHz >= 144000 && freqKHz <= 148000) return 2;
  return 0;
}

/**
 * HamQTH RBN entry shape (per callsign)
 */
interface HamQTHRBNEntry {
  dxcall: string;
  freq: string; // e.g. "14 004.3"
  mode: string; // e.g. "CW", "RTTY", "PSK31"
  age: number; // seconds since last report
  lsn: Record<string, number>; // spotter callsign -> SNR
}

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(req, "spots/rbn", 20, 60);
  if (limited) return limited;

  const url = new URL(req.url);

  // Validate and clamp limit (1-200)
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

  try {
    // HamQTH RBN JSON feed
    // age=900 means spots from the last 15 minutes
    const params = new URLSearchParams();
    params.set("data", "1");
    params.set("age", "900");

    // Pass through optional band/mode filters from client
    const bandFilter = url.searchParams.get("band");
    if (bandFilter && /^[\d,]+$/.test(bandFilter)) {
      params.set("band", bandFilter);
    }
    const modeFilter = url.searchParams.get("mode");
    if (modeFilter && /^[A-Za-z0-9,]+$/.test(modeFilter)) {
      params.set("mode", modeFilter);
    }

    const apiUrl = `https://www.hamqth.com/rbn_data.php?${params}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "RBN API error", spots: [] }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=30",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const data: Record<string, HamQTHRBNEntry> = await response.json();

    // Transform object-keyed response into array of spots
    const now = Date.now();
    const spots = Object.values(data)
      .map((entry) => {
        // Parse frequency: "14 004.3" -> 14004.3
        const freqNum = parseFloat((entry.freq || "0").replace(/\s+/g, ""));

        // Find the highest-SNR spotter from the lsn object
        let bestSpotter = "";
        let bestSNR = -999;
        if (entry.lsn && typeof entry.lsn === "object") {
          for (const [spotter, snr] of Object.entries(entry.lsn)) {
            if (typeof snr === "number" && snr > bestSNR) {
              bestSNR = snr;
              bestSpotter = spotter;
            }
          }
        }

        // Compute time from age (seconds ago)
        const ageMs = (entry.age || 0) * 1000;
        const spotTime = Math.floor((now - ageMs) / 1000);

        const band = freqToBand(freqNum);

        return {
          callsign: entry.dxcall || "",
          de_pfx: bestSpotter,
          de_cont: "",
          dx_pfx: "",
          dx_cont: "",
          freq: freqNum,
          band,
          mode: entry.mode || "CW",
          db: bestSNR > -999 ? bestSNR : 0,
          wpm: 0,
          time: spotTime,
          spotted_time: new Date(now - ageMs).toISOString(),
        };
      })
      .slice(0, limit);

    return new Response(JSON.stringify({ spots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=30, stale-while-revalidate=15",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("RBN proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", spots: [] }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}

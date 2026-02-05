/**
 * DX Cluster API Proxy - Vercel Edge Function
 *
 * Proxies requests to HamQTH.com CSV feed to avoid CORS issues
 * Transforms ^-delimited CSV response to unified DXSpot JSON format
 */

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
 * Extract operating mode from DX cluster comment string
 * Examples: "FT8 -10 dB 1234 Hz", "CW 22 WPM", "SSB"
 */
function extractMode(comment: string): string | undefined {
  if (!comment) return undefined;
  const upper = comment.toUpperCase();
  const modes = [
    "FT8",
    "FT4",
    "CW",
    "SSB",
    "RTTY",
    "PSK31",
    "PSK63",
    "JT65",
    "JT9",
    "JS8",
    "DATA",
    "AM",
    "FM",
  ];
  for (const mode of modes) {
    if (upper.includes(mode)) return mode;
  }
  return undefined;
}

/**
 * Parse HamQTH "HHMM YYYY-MM-DD" time string to ISO timestamp
 * Example: "1606 2026-02-05"
 */
function parseHamQTHTime(timeDate: string): string {
  if (!timeDate || timeDate.trim().length === 0) {
    return new Date().toISOString();
  }

  const parts = timeDate.trim().split(/\s+/);
  if (parts.length >= 2) {
    const hhmm = parts[0];
    const dateStr = parts[1];
    const h = parseInt(hhmm.substring(0, 2), 10);
    const m = parseInt(hhmm.substring(2, 4), 10);

    if (!isNaN(h) && !isNaN(m) && dateStr.includes("-")) {
      const dateParts = dateStr.split("-");
      if (dateParts.length === 3) {
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // zero-indexed
        const day = parseInt(dateParts[2], 10);

        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return new Date(Date.UTC(year, month, day, h, m, 0, 0)).toISOString();
        }
      }
    }
  }

  // Fallback: try HHMM only (no date part)
  if (parts.length >= 1 && /^\d{4}$/.test(parts[0])) {
    const now = new Date();
    const h = parseInt(parts[0].substring(0, 2), 10);
    const m2 = parseInt(parts[0].substring(2, 4), 10);
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        h,
        m2,
        0,
        0,
      ),
    );
    if (date.getTime() > now.getTime() + 60_000) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    return date.toISOString();
  }

  return new Date().toISOString();
}

/**
 * Parse a single ^-delimited CSV line from HamQTH DX Cluster feed
 * Format: Spotter^Frequency^DX^Comment^TimeDate^LoTW^eQSL^Continent^Band^Country^DXCCNumber
 */
function parseCSVLine(
  line: string,
  index: number,
): Record<string, string | number | undefined> | null {
  const fields = line.split("^");
  if (fields.length < 11) return null;

  const [
    spotter,
    freqStr,
    dx,
    comment,
    timeDate,
    _lotw,
    _eqsl,
    continent,
    band,
    country,
    dxccStr,
  ] = fields;

  // Skip header line if present
  if (spotter === "Spotter") return null;

  const frequency = parseFloat(freqStr || "0");
  if (isNaN(frequency) || frequency === 0) return null;

  return {
    id: `dxc-${Date.now()}-${spotter}-${dx}-${index}`,
    spotter: spotter || "",
    dx: dx || "",
    frequency,
    mode: extractMode(comment || ""),
    comment: comment || "",
    time: parseHamQTHTime(timeDate || ""),
    band: band || undefined,
    continent: continent || undefined,
    country: country || undefined,
    dxcc: parseInt(dxccStr || "0", 10) || undefined,
  };
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

  const url = new URL(req.url);

  // Validate and clamp limit (1-200)
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

  try {
    // HamQTH DX Cluster CSV feed
    const apiUrl = `https://www.hamqth.com/dxc_csv.php?limit=${limit}`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "HamQTH API error", spots: [] }),
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

    const csvText = await response.text();

    // Parse ^-delimited CSV lines
    const lines = csvText.trim().split("\n");
    const spots = lines
      .map((line, index) => parseCSVLine(line.trim(), index))
      .filter((spot): spot is NonNullable<typeof spot> => spot !== null)
      .slice(0, limit);

    return new Response(JSON.stringify({ spots }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("DXCluster proxy error:", error);
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

/**
 * Vercel Edge Function: Solar Flux Forecast Proxy
 * Fetches the NOAA 3-day space weather forecast and parses SFI predictions
 *
 * Source: https://services.swpc.noaa.gov/text/3-day-forecast.txt
 * Cache: 4 hours with 1 hour stale-while-revalidate
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

const NOAA_URL =
  "https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt";

interface ForecastDay {
  date: string;
  predicted_flux: number | null;
  predicted_a_index: number | null;
  probabilities?: {
    m_class: number | null;
    x_class: number | null;
    proton: number | null;
  };
}

/**
 * Parse the NOAA 3-day solar-geomag predictions text into structured data.
 *
 * Format uses colon-prefixed section headers with values on the NEXT line:
 *   :Prediction_dates:   2026 Feb 14   2026 Feb 15   2026 Feb 16
 *   :10cm_flux:
 *                           115           115           110
 *   :Whole_Disk_Flare_Prob:
 *   Class_M                  10            10            10
 */
function parseForecast(text: string): ForecastDay[] {
  const lines = text.split("\n");

  // Extract dates from :Prediction_dates: line
  const dateHeaders: string[] = [];
  for (const line of lines) {
    if (line.startsWith(":Prediction_dates:")) {
      // Extract "2026 Feb 14" style dates, display as "Feb 14"
      const matches = line.matchAll(/(\d{4})\s+(\w{3})\s+(\d{1,2})/g);
      for (const m of matches) {
        dateHeaders.push(`${m[2]} ${m[3]}`);
      }
      break;
    }
  }

  const days: ForecastDay[] = [];
  for (let d = 0; d < 3; d++) {
    days.push({
      date: dateHeaders[d] || `Day ${d + 1}`,
      predicted_flux: null,
      predicted_a_index: null,
      probabilities: { m_class: null, x_class: null, proton: null },
    });
  }

  // Helper: extract 3 numbers from a line (values are whitespace-separated)
  const extract3Numbers = (line: string): number[] => {
    const nums = line.trim().split(/\s+/).map(Number).filter(Number.isFinite);
    return nums;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // :10cm_flux: header — values on next line
    if (line === ":10cm_flux:") {
      const vals = extract3Numbers(lines[i + 1] || "");
      for (let d = 0; d < Math.min(vals.length, 3); d++) {
        if (vals[d] >= 50 && vals[d] <= 400) days[d].predicted_flux = vals[d];
      }
    }

    // Flare probabilities — "Class_M  10  10  10" on same line
    if (/^Class_M\b/i.test(line)) {
      const vals = extract3Numbers(line.replace(/^Class_M\s*/i, ""));
      for (let d = 0; d < Math.min(vals.length, 3); d++) {
        if (days[d].probabilities) days[d].probabilities!.m_class = vals[d];
      }
    }
    if (/^Class_X\b/i.test(line)) {
      const vals = extract3Numbers(line.replace(/^Class_X\s*/i, ""));
      for (let d = 0; d < Math.min(vals.length, 3); d++) {
        if (days[d].probabilities) days[d].probabilities!.x_class = vals[d];
      }
    }
    if (/^Proton\b/i.test(line)) {
      const vals = extract3Numbers(line.replace(/^Proton\s*/i, ""));
      for (let d = 0; d < Math.min(vals.length, 3); d++) {
        if (days[d].probabilities) days[d].probabilities!.proton = vals[d];
      }
    }

    // A Planetary index
    if (/^A_Planetary\b/i.test(line)) {
      const vals = extract3Numbers(line.replace(/^A_Planetary\s*/i, ""));
      for (let d = 0; d < Math.min(vals.length, 3); d++) {
        days[d].predicted_a_index = vals[d];
      }
    }
  }

  return days;
}

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "solar/flux-forecast", 20, 60);
  if (limited) return limited;

  try {
    const response = await fetch(NOAA_URL, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `NOAA API returned ${response.status}: ${response.statusText}`,
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const text = await response.text();
    const forecast = parseForecast(text);

    return new Response(JSON.stringify({ raw: text, forecast }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=14400, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch solar flux forecast: ${message}`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}

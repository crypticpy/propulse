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

const NOAA_URL = "https://services.swpc.noaa.gov/text/3-day-forecast.txt";

interface ForecastDay {
  date: string;
  predicted_flux: number | null;
  predicted_kp: number | null;
  probabilities?: {
    m_class: number | null;
    x_class: number | null;
    proton: number | null;
  };
}

/**
 * Parse the NOAA 3-day forecast text into structured data.
 * The format includes sections for solar activity, Kp, and probabilities.
 */
function parseForecast(text: string): ForecastDay[] {
  const days: ForecastDay[] = [];
  const lines = text.split("\n");

  // Find the date headers — typically a line like "Feb 15  Feb 16  Feb 17"
  // or "15 Feb    16 Feb    17 Feb"
  let dateLineIdx = -1;
  const dateHeaders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Look for a line with 3 date-like patterns
    const dateMatch = lines[i].match(/(\d{1,2}\s+\w{3}|\w{3}\s+\d{1,2})/g);
    if (dateMatch && dateMatch.length >= 3) {
      dateLineIdx = i;
      dateHeaders.push(...dateMatch.slice(0, 3));
      break;
    }
  }

  // Initialize forecast days
  for (let d = 0; d < 3; d++) {
    days.push({
      date: dateHeaders[d] || `Day ${d + 1}`,
      predicted_flux: null,
      predicted_kp: null,
      probabilities: { m_class: null, x_class: null, proton: null },
    });
  }

  // Parse Solar Flux (10.7 cm) line
  for (let i = dateLineIdx; i < lines.length; i++) {
    const line = lines[i];

    // Look for "10.7 cm" or "Solar flux" line with numbers
    if (/10\.7\s*cm|solar\s*flux/i.test(line)) {
      const numbers = line.match(/\d{2,4}/g);
      if (numbers) {
        // Filter to plausible SFI values (50-400)
        const sfiValues = numbers
          .map(Number)
          .filter((n) => n >= 50 && n <= 400);
        for (let d = 0; d < Math.min(sfiValues.length, 3); d++) {
          days[d].predicted_flux = sfiValues[d];
        }
      }
    }

    // Look for Kp predictions
    if (/Kp\b/i.test(line) && !/probability/i.test(line)) {
      const numbers = line.match(/\d+/g);
      if (numbers) {
        const kpValues = numbers.map(Number).filter((n) => n >= 0 && n <= 9);
        for (let d = 0; d < Math.min(kpValues.length, 3); d++) {
          days[d].predicted_kp = kpValues[d];
        }
      }
    }

    // M-class probability
    if (/M\s*-?\s*class/i.test(line)) {
      const numbers = line.match(/\d+/g);
      if (numbers) {
        const probs = numbers.map(Number).filter((n) => n >= 0 && n <= 100);
        for (let d = 0; d < Math.min(probs.length, 3); d++) {
          if (days[d].probabilities) days[d].probabilities!.m_class = probs[d];
        }
      }
    }

    // X-class probability
    if (/X\s*-?\s*class/i.test(line)) {
      const numbers = line.match(/\d+/g);
      if (numbers) {
        const probs = numbers.map(Number).filter((n) => n >= 0 && n <= 100);
        for (let d = 0; d < Math.min(probs.length, 3); d++) {
          if (days[d].probabilities) days[d].probabilities!.x_class = probs[d];
        }
      }
    }

    // Proton probability
    if (/proton/i.test(line) && /\d/.test(line)) {
      const numbers = line.match(/\d+/g);
      if (numbers) {
        const probs = numbers.map(Number).filter((n) => n >= 0 && n <= 100);
        for (let d = 0; d < Math.min(probs.length, 3); d++) {
          if (days[d].probabilities) days[d].probabilities!.proton = probs[d];
        }
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

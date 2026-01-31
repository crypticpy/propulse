/**
 * Vercel Edge Function: Magnetometer Proxy
 * Fetches solar wind magnetometer data from NOAA SWPC to avoid CORS restrictions
 *
 * Source: https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json
 * Returns Bz (IMF Z-component), By, and Bt (total field) values
 * Cache: 60 seconds with 5 minute stale-while-revalidate
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

const NOAA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";

/**
 * Raw NOAA magnetometer response format
 * Array of arrays where first row is headers:
 * ["time_tag", "bx_gsm", "by_gsm", "bz_gsm", "lon_gsm", "lat_gsm", "bt"]
 */
type NOAAMagnetometerResponse = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
][];

/**
 * Processed magnetometer data point
 */
interface MagnetometerDataPoint {
  time_tag: string;
  bz_gsm: number | null;
  by_gsm: number | null;
  bt: number | null;
}

export default async function handler(_request: Request): Promise<Response> {
  try {
    const response = await fetch(NOAA_URL, {
      headers: {
        Accept: "application/json",
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

    const rawData: NOAAMagnetometerResponse = await response.json();

    // Skip header row and transform data
    // NOAA format: [time_tag, bx_gsm, by_gsm, bz_gsm, lon_gsm, lat_gsm, bt]
    const processedData: MagnetometerDataPoint[] = rawData
      .slice(1)
      .map((row) => ({
        time_tag: row[0],
        by_gsm: row[2] !== null && row[2] !== "" ? parseFloat(row[2]) : null,
        bz_gsm: row[3] !== null && row[3] !== "" ? parseFloat(row[3]) : null,
        bt: row[6] !== null && row[6] !== "" ? parseFloat(row[6]) : null,
      }));

    return new Response(JSON.stringify(processedData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch magnetometer data: ${message}`,
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

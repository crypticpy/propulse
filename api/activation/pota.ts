/**
 * Vercel Edge Function: POTA API Proxy
 *
 * Proxies requests to the Parks on the Air (POTA) API to avoid CORS restrictions.
 * Supports park search, park details, and park activation history.
 *
 * Cache: 5 minutes with 2 minute stale-while-revalidate
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/** Get the allowed CORS origin based on environment */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const POTA_API_BASE = "https://api.pota.app";

/** Standard headers for POTA API requests */
const POTA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Propulse/1.0 (Ham Radio Propagation Dashboard)",
};

/** Standard CORS response headers */
function corsHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

/** Park record returned by POTA search */
interface POTAPark {
  reference: string;
  name: string;
  latitude: number;
  longitude: number;
  grid4: string;
  grid6: string;
  parktypeId: number;
  active: number;
  parkComments: string;
  accessibility: string;
  sensitivity: string;
  accessMethods: string;
  activationMethods: string;
  agencies: string;
  agencyURLs: string;
  parkURLs: string;
  website: string;
  createdByAdmin: string;
  entityId: number;
  locationDesc: string;
  locationName: string;
  entityName: string;
  firstActivator: string;
  firstActivationDate: string;
}

/** Normalized park for frontend consumption */
interface NormalizedPark {
  ref: string;
  name: string;
  location: string;
  grid: string;
  active: boolean;
}

/** Normalize a POTA park record for the frontend */
function normalizePark(park: POTAPark): NormalizedPark {
  return {
    ref: park.reference,
    name: park.name,
    location: park.locationDesc || park.locationName || "",
    grid: park.grid6 || park.grid4 || "",
    active: park.active === 1,
  };
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "activation/pota", 60, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const ref = url.searchParams.get("ref");
  const activations = url.searchParams.get("activations");
  const activator = url.searchParams.get("activator");

  try {
    // Search parks
    if (search) {
      const potaUrl = `${POTA_API_BASE}/park/autocomplete/${encodeURIComponent(search)}`;
      const response = await fetch(potaUrl, { headers: POTA_HEADERS });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `POTA API returned ${response.status}` }),
          { status: response.status, headers: corsHeaders() },
        );
      }

      const data = (await response.json()) as POTAPark[];
      const parks = Array.isArray(data)
        ? data.slice(0, 10).map(normalizePark)
        : [];

      return new Response(JSON.stringify({ parks }), {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    // Get park details
    if (ref) {
      const potaUrl = `${POTA_API_BASE}/park/${encodeURIComponent(ref)}`;
      const response = await fetch(potaUrl, { headers: POTA_HEADERS });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `POTA API returned ${response.status}` }),
          { status: response.status, headers: corsHeaders() },
        );
      }

      const data = (await response.json()) as POTAPark;
      const park = normalizePark(data);

      return new Response(JSON.stringify({ park }), {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    // Get park activations
    if (activations) {
      const potaUrl = `${POTA_API_BASE}/park/activations/${encodeURIComponent(activations)}`;
      const response = await fetch(potaUrl, { headers: POTA_HEADERS });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `POTA API returned ${response.status}` }),
          { status: response.status, headers: corsHeaders() },
        );
      }

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    // Check if a callsign is currently activating a POTA park
    if (activator) {
      const potaUrl = `${POTA_API_BASE}/spot/activator/${encodeURIComponent(activator)}`;
      const response = await fetch(potaUrl, { headers: POTA_HEADERS });

      if (!response.ok) {
        // 404 = not currently active, which is normal
        if (response.status === 404) {
          return new Response(JSON.stringify({ spots: [] }), {
            status: 200,
            headers: {
              ...corsHeaders(),
              "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
            },
          });
        }
        return new Response(
          JSON.stringify({ error: `POTA API returned ${response.status}` }),
          { status: response.status, headers: corsHeaders() },
        );
      }

      const data = await response.json();
      const spots = Array.isArray(data) ? data : [];

      return new Response(JSON.stringify({ spots }), {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
        },
      });
    }

    return new Response(
      JSON.stringify({
        error:
          "Missing query parameter. Use ?search=, ?ref=, ?activations=, or ?activator=",
      }),
      { status: 400, headers: corsHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: `Failed to fetch POTA data: ${message}` }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Cache-Control": "no-cache" },
      },
    );
  }
}

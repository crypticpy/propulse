/**
 * Vercel Edge Function: POTA API Proxy
 *
 * Proxies requests to the Parks on the Air (POTA) API to avoid CORS restrictions.
 * Supports park search, park details, and park activation history.
 *
 * Cache: 5 minutes with 2 minute stale-while-revalidate
 */

/**
 * Vercel Edge Function: SOTA API Proxy
 *
 * Proxies requests to the Summits on the Air (SOTA) API to avoid CORS restrictions.
 * Supports summit search and summit details.
 *
 * Cache: 5 minutes with 2 minute stale-while-revalidate
 */

import { applyRateLimit } from "../rateLimit";

/** Get the allowed CORS origin based on environment */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

// ─── POTA ────────────────────────────────────────────────────────────────────

const POTA_API_BASE = "https://api.pota.app";

/** Standard headers for POTA API requests */
const POTA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Propulse/1.0 (Ham Radio Propagation Dashboard)",
};

/** Standard CORS response headers */
function potaCorsHeaders(): Record<string, string> {
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

/** A single result row from the POTA `/lookup` endpoint */
interface POTALookupEntry {
  type: string;
  id: number;
  display: string;
  value: string;
}

/** Normalize a POTA `/lookup` park entry for the frontend */
function normalizeLookupPark(entry: POTALookupEntry): NormalizedPark {
  const ref = entry.value;
  const display = entry.display ?? "";
  const name = display.startsWith(ref) ? display.slice(ref.length).trim() : display;
  return {
    ref,
    name,
    location: "",
    grid: "",
    active: true,
  };
}

/** A single row from the POTA `/spot/activator` feed */
interface POTASpotRow {
  activator?: unknown;
  [key: string]: unknown;
}

/**
 * Base callsign for matching: trimmed, uppercased, with prefix/suffix
 * modifiers stripped. The longest slash-separated segment is the callsign
 * itself (W1ABC/P -> W1ABC, TI7/W1ABC -> W1ABC).
 */
function baseCallsign(callsign: string): string {
  return callsign
    .trim()
    .toUpperCase()
    .split("/")
    .reduce((best, part) => (part.length > best.length ? part : best), "");
}

export async function handleActivationPota(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...potaCorsHeaders(),
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
      const potaUrl = `${POTA_API_BASE}/lookup?search=${encodeURIComponent(search)}`;
      const response = await fetch(potaUrl, { headers: POTA_HEADERS });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `POTA API returned ${response.status}` }),
          { status: response.status, headers: potaCorsHeaders() },
        );
      }

      const data = (await response.json()) as POTALookupEntry[] | null;
      const parks = Array.isArray(data)
        ? data
            .filter((entry) => entry && entry.type === "park")
            .slice(0, 10)
            .map(normalizeLookupPark)
        : [];

      return new Response(JSON.stringify({ parks }), {
        status: 200,
        headers: {
          ...potaCorsHeaders(),
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
          { status: response.status, headers: potaCorsHeaders() },
        );
      }

      const data = (await response.json()) as POTAPark;
      const park = normalizePark(data);

      return new Response(JSON.stringify({ park }), {
        status: 200,
        headers: {
          ...potaCorsHeaders(),
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
          { status: response.status, headers: potaCorsHeaders() },
        );
      }

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...potaCorsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    // Check if a callsign is currently activating a POTA park
    if (activator) {
      const potaUrl = `${POTA_API_BASE}/spot/activator`;
      const response = await fetch(potaUrl, { headers: POTA_HEADERS });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `POTA API returned ${response.status}` }),
          { status: response.status, headers: potaCorsHeaders() },
        );
      }

      const data = (await response.json()) as POTASpotRow[] | null;
      const target = baseCallsign(activator);
      const spots = Array.isArray(data)
        ? data.filter(
            (row) =>
              typeof row?.activator === "string" &&
              baseCallsign(row.activator) === target,
          )
        : [];

      return new Response(JSON.stringify({ spots }), {
        status: 200,
        headers: {
          ...potaCorsHeaders(),
          "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
        },
      });
    }

    return new Response(
      JSON.stringify({
        error:
          "Missing query parameter. Use ?search=, ?ref=, ?activations=, or ?activator=",
      }),
      { status: 400, headers: potaCorsHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: `Failed to fetch POTA data: ${message}` }),
      {
        status: 500,
        headers: { ...potaCorsHeaders(), "Cache-Control": "no-cache" },
      },
    );
  }
}

// ─── SOTA ────────────────────────────────────────────────────────────────────

const SOTA_API_BASE = "https://api2.sota.org.uk/api";

/** Standard headers for SOTA API requests */
const SOTA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Propulse/1.0 (Ham Radio Propagation Dashboard)",
};

/** Standard CORS response headers */
function sotaCorsHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

/** Summit record from SOTA API */
interface SOTASummit {
  SummitCode: string;
  SummitName: string;
  AltM: number;
  AltFt: number;
  Points: number;
  BonusPoints: number;
  ValidFrom: string;
  ValidTo: string;
  ActivationCount: number;
  ActivationDate: string;
  ActivationCall: string;
  RegionCode: string;
  RegionName: string;
  AssociationCode: string;
  AssociationName: string;
  Latitude: number;
  Longitude: number;
}

/** Normalized summit for frontend consumption */
interface NormalizedSummit {
  ref: string;
  name: string;
  altitude: number;
  points: number;
  region: string;
}

/** Normalize a SOTA summit record for the frontend */
function normalizeSummit(summit: SOTASummit): NormalizedSummit {
  return {
    ref: summit.SummitCode,
    name: summit.SummitName,
    altitude: summit.AltM,
    points: summit.Points + (summit.BonusPoints || 0),
    region: summit.RegionName || summit.AssociationName || "",
  };
}

export async function handleActivationSota(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...sotaCorsHeaders(),
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(request, "activation/sota", 60, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const ref = url.searchParams.get("ref");

  try {
    // Search summits
    if (search) {
      // SOTA API uses association/region prefix search
      // Try the SOTA associations endpoint for autocomplete-like behavior
      const sotaUrl = `${SOTA_API_BASE}/summits/${encodeURIComponent(search)}`;
      const response = await fetch(sotaUrl, { headers: SOTA_HEADERS });

      if (!response.ok) {
        // If single summit lookup fails, try as association search
        if (response.status === 404) {
          return new Response(JSON.stringify({ summits: [] }), {
            status: 200,
            headers: {
              ...sotaCorsHeaders(),
              "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
            },
          });
        }
        return new Response(
          JSON.stringify({ error: `SOTA API returned ${response.status}` }),
          { status: response.status, headers: sotaCorsHeaders() },
        );
      }

      const data = await response.json();
      // SOTA API returns either a single summit or an array depending on the query
      let summits: NormalizedSummit[];
      if (Array.isArray(data)) {
        summits = data.slice(0, 10).map(normalizeSummit);
      } else if (data && typeof data === "object" && "SummitCode" in data) {
        summits = [normalizeSummit(data as SOTASummit)];
      } else {
        summits = [];
      }

      return new Response(JSON.stringify({ summits }), {
        status: 200,
        headers: {
          ...sotaCorsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    // Get summit details
    if (ref) {
      const sotaUrl = `${SOTA_API_BASE}/summits/${encodeURIComponent(ref)}`;
      const response = await fetch(sotaUrl, { headers: SOTA_HEADERS });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `SOTA API returned ${response.status}` }),
          { status: response.status, headers: sotaCorsHeaders() },
        );
      }

      const data = (await response.json()) as SOTASummit;
      const summit = normalizeSummit(data);

      return new Response(JSON.stringify({ summit }), {
        status: 200,
        headers: {
          ...sotaCorsHeaders(),
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
        },
      });
    }

    return new Response(
      JSON.stringify({
        error: "Missing query parameter. Use ?search= or ?ref=",
      }),
      { status: 400, headers: sotaCorsHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: `Failed to fetch SOTA data: ${message}` }),
      {
        status: 500,
        headers: { ...sotaCorsHeaders(), "Cache-Control": "no-cache" },
      },
    );
  }
}

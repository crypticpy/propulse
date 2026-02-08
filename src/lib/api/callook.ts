/**
 * Callook (US FCC) API client
 * Calls our edge function proxy at /api/callsign/lookup
 *
 * Handles two response formats:
 * - Edge function (production): flat { callsign, name, grid, lat, lon, licenseClass, ... }
 * - Raw Callook proxy (dev): nested { status, current, location, otherInfo, ... }
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CallookResult {
  callsign: string;
  name?: string;
  grid?: string;
  lat?: number;
  lon?: number;
  licenseClass?: string;
  grantDate?: string;
  expiryDate?: string;
  licenseId?: string;
  source: "callook";
}

export interface CallookError {
  error: string;
  provider: "callook";
}

export function isCallookError(
  result: CallookResult | CallookError,
): result is CallookError {
  return "error" in result && "provider" in result;
}

// ─── Raw response parsing ───────────────────────────────────────────────────

/** Convert Callook MM/DD/YYYY date string to ISO YYYY-MM-DD */
function parseCallookDate(mmddyyyy: unknown): string | undefined {
  if (typeof mmddyyyy !== "string") return undefined;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mmddyyyy);
  if (!match) return undefined;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Detect if the response is raw Callook JSON (has `status` field)
 * vs. our edge function's parsed format (has `source` field).
 */
function isRawCallookResponse(data: Record<string, unknown>): boolean {
  return "status" in data && !("source" in data);
}

/** Parse the raw Callook upstream JSON into our normalized format */
function parseRawCallook(
  data: Record<string, unknown>,
  fallbackCallsign: string,
): CallookResult | CallookError {
  if (data.status !== "VALID") {
    return { error: "Callsign not found", provider: "callook" };
  }

  const current = data.current as Record<string, unknown> | undefined;
  const location = data.location as Record<string, unknown> | undefined;
  const otherInfo = data.otherInfo as Record<string, unknown> | undefined;
  const trustee = data.trustee as Record<string, unknown> | undefined;

  // Name: try top-level name, then current.name, then trustee.name
  const name =
    (typeof data.name === "string" && data.name) ||
    (typeof current?.name === "string" && current.name) ||
    (typeof trustee?.name === "string" && trustee.name) ||
    undefined;

  // Location data is at `location`, NOT `address`
  const lat =
    location?.latitude != null ? Number(location.latitude) : undefined;
  const lon =
    location?.longitude != null ? Number(location.longitude) : undefined;
  const grid =
    typeof location?.gridsquare === "string" ? location.gridsquare : undefined;

  // License data
  const operClass =
    typeof current?.operClass === "string" && current.operClass
      ? current.operClass.toUpperCase()
      : undefined;
  const grantDate = parseCallookDate(otherInfo?.grantDate);
  const expiryDate = parseCallookDate(otherInfo?.expiryDate);
  const frn =
    typeof otherInfo?.frn === "string" && otherInfo.frn
      ? otherInfo.frn
      : undefined;

  return {
    callsign:
      (typeof current?.callsign === "string" && current.callsign) ||
      fallbackCallsign,
    name: name || undefined,
    grid,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    licenseClass: operClass,
    grantDate,
    expiryDate,
    licenseId: frn,
    source: "callook",
  };
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchCallook(
  callsign: string,
): Promise<CallookResult | CallookError> {
  const normalized = callsign.trim().toUpperCase();

  if (!normalized) {
    return { error: "Callsign is required", provider: "callook" };
  }

  try {
    const url = `/api/callsign/lookup?callsign=${encodeURIComponent(normalized)}`;
    const response = await fetch(url);

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return {
          error:
            errorData.error ||
            `HTTP error ${response.status}: ${response.statusText}`,
          provider: "callook",
        };
      } catch {
        return {
          error: `HTTP error ${response.status}: ${response.statusText}`,
          provider: "callook",
        };
      }
    }

    const data = await response.json();

    if (data.error) {
      return { error: data.error, provider: "callook" };
    }

    // Detect response format: raw Callook vs. edge function
    if (isRawCallookResponse(data)) {
      return parseRawCallook(data, normalized);
    }

    // Edge function response (production) — already flat
    return {
      callsign: data.callsign || normalized,
      name: data.name,
      grid: data.grid,
      lat: data.lat != null ? Number(data.lat) : undefined,
      lon: data.lon != null ? Number(data.lon) : undefined,
      licenseClass: data.licenseClass,
      grantDate: data.grantDate,
      expiryDate: data.expiryDate,
      licenseId: data.licenseId,
      source: "callook",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      provider: "callook",
    };
  }
}

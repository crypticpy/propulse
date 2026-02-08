/**
 * Callook (US FCC) API client
 * Calls our edge function proxy at /api/callsign/lookup
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

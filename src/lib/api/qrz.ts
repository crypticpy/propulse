/**
 * QRZ XML API client
 * Calls our edge function proxy at /api/callsign/qrz
 * Requires the user's personal QRZ XML API key
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QRZResult {
  callsign: string;
  name?: string;
  grid?: string;
  lat?: number;
  lon?: number;
  country?: string;
  qth?: string;
  licenseClass?: string;
  grantDate?: string;
  expiryDate?: string;
  bioText?: string;
  imageUrl?: string;
  cqzone?: number;
  ituzone?: number;
  source: "qrz";
}

export interface QRZError {
  error: string;
  provider: "qrz";
}

export function isQRZError(result: QRZResult | QRZError): result is QRZError {
  return "error" in result && "provider" in result;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchQRZ(
  callsign: string,
  apiKey: string,
): Promise<QRZResult | QRZError> {
  const normalized = callsign.trim().toUpperCase();

  if (!normalized) {
    return { error: "Callsign is required", provider: "qrz" };
  }

  if (!apiKey) {
    return { error: "API key is required", provider: "qrz" };
  }

  try {
    const { authHeaders } = await import("@/lib/api/authFetch");
    const response = await fetch("/api/callsign/qrz", {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ callsign: normalized, apiKey }),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return {
          error:
            errorData.error ||
            `HTTP error ${response.status}: ${response.statusText}`,
          provider: "qrz",
        };
      } catch {
        return {
          error: `HTTP error ${response.status}: ${response.statusText}`,
          provider: "qrz",
        };
      }
    }

    const data = await response.json();

    if (data.error) {
      return { error: data.error, provider: "qrz" };
    }

    return {
      callsign: data.callsign || normalized,
      name: data.name,
      grid: data.grid,
      lat: data.lat != null ? Number(data.lat) : undefined,
      lon: data.lon != null ? Number(data.lon) : undefined,
      country: data.country,
      qth: data.qth,
      licenseClass: data.licenseClass,
      grantDate: data.grantDate,
      expiryDate: data.expiryDate,
      bioText: data.bioText,
      imageUrl: data.imageUrl,
      cqzone: data.cqzone != null ? Number(data.cqzone) : undefined,
      ituzone: data.ituzone != null ? Number(data.ituzone) : undefined,
      source: "qrz",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      provider: "qrz",
    };
  }
}

/**
 * Total Electron Content (TEC) API client.
 * Fetches global ionospheric TEC grid data via edge function proxy.
 *
 * TEC (measured in TECU — Total Electron Content Units) indicates the
 * density of electrons along a vertical column through the ionosphere.
 * Higher TEC values generally improve HF propagation on higher bands
 * but can cause GPS signal degradation.
 */

export interface TECGridPoint {
  lat: number;
  lon: number;
  tec: number; // TECU (Total Electron Content Units, 1 TECU = 10^16 el/m^2)
}

export interface TECData {
  grid: TECGridPoint[];
  timestamp: string | null;
  available: boolean;
}

const EMPTY_TEC: TECData = { grid: [], timestamp: null, available: false };

export async function fetchTECData(signal?: AbortSignal): Promise<TECData> {
  const res = await fetch("/api/atmos/tec", { signal });
  if (!res.ok) {
    return EMPTY_TEC;
  }

  try {
    const raw = await res.json();

    // Handle our fallback structure (available: false)
    if (raw.available === false) {
      return EMPTY_TEC;
    }

    // If the proxy returned structured grid data
    if (raw.grid && Array.isArray(raw.grid) && raw.grid.length > 0) {
      return raw as TECData;
    }

    // Try to parse raw SWPC format if it's an array of objects
    if (Array.isArray(raw)) {
      const grid: TECGridPoint[] = [];
      for (const entry of raw) {
        if (entry.lat != null && entry.lon != null && entry.tec != null) {
          grid.push({
            lat: Number(entry.lat),
            lon: Number(entry.lon),
            tec: Number(entry.tec),
          });
        }
      }
      return {
        grid,
        timestamp: new Date().toISOString(),
        available: grid.length > 0,
      };
    }

    return EMPTY_TEC;
  } catch {
    return EMPTY_TEC;
  }
}

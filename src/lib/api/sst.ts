/**
 * Sea Surface Temperature API client
 * Fetches NOAA OISST data via edge proxy
 */

export interface SSTDataPoint {
  lat: number;
  lon: number;
  sst: number; // Celsius
}

export async function fetchSSTData(): Promise<SSTDataPoint[]> {
  const res = await fetch("/api/atmos/sst");
  if (!res.ok) return [];

  const data: unknown = await res.json();
  return parseSSTResponse(data);
}

function parseSSTResponse(data: unknown): SSTDataPoint[] {
  if (!data || typeof data !== "object") return [];

  const d = data as Record<string, unknown>;

  // Handle ERDDAP table format: { table: { columnNames: [...], rows: [[...], ...] } }
  if (d.table && typeof d.table === "object") {
    const table = d.table as {
      columnNames?: string[];
      rows?: unknown[][];
    };
    if (!table.columnNames || !table.rows) return [];

    const latIdx = table.columnNames.indexOf("latitude");
    const lonIdx = table.columnNames.indexOf("longitude");
    const sstIdx = table.columnNames.indexOf("sst");
    if (latIdx < 0 || lonIdx < 0 || sstIdx < 0) return [];

    return table.rows
      .filter((row) => row[sstIdx] != null && !isNaN(Number(row[sstIdx])))
      .map((row) => ({
        lat: Number(row[latIdx]),
        lon:
          Number(row[lonIdx]) > 180
            ? Number(row[lonIdx]) - 360
            : Number(row[lonIdx]),
        sst: Number(row[sstIdx]),
      }));
  }

  // Handle pre-parsed format: { rows: [{lat, lon, sst}, ...] }
  if (Array.isArray(d.rows)) {
    return (d.rows as Record<string, unknown>[])
      .filter((r) => r.sst != null)
      .map((r) => ({
        lat: Number(r.lat),
        lon: Number(r.lon),
        sst: Number(r.sst),
      }));
  }

  return [];
}

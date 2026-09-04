import { isValidGrid, gridToLatLon, latLonToGrid } from "@/lib/utils/grid";
import { geocodeAddress, parseCoordinateString } from "@/lib/api/geocoding";
import { ingestCallsign } from "@/lib/api/callsignIngestion";
import type { ResolvedTarget } from "./types";

export type TargetResolveResult =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; error: string };

export async function resolveTargetQuery(
  rawInput: string,
): Promise<TargetResolveResult> {
  const raw = rawInput.trim();
  if (!raw) {
    return {
      ok: false,
      error: "Enter a grid square, coordinates, or a location name.",
    };
  }

  if (isValidGrid(raw)) {
    const grid = raw.toUpperCase();
    const { lat, lon } = gridToLatLon(grid);
    return {
      ok: true,
      target: { label: grid, grid, lat, lon, source: "grid" },
    };
  }

  const parsed = parseCoordinateString(raw);
  if (!("error" in parsed)) {
    const grid = latLonToGrid(parsed.lat, parsed.lon);
    return {
      ok: true,
      target: {
        label: `${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)}`,
        grid,
        lat: parsed.lat,
        lon: parsed.lon,
        source: "coords",
      },
    };
  }

  const geo = await geocodeAddress(raw, 1);
  if ("error" in geo) {
    return { ok: false, error: geo.error.message };
  }
  const best = geo.results[0];
  const grid = latLonToGrid(best.lat, best.lon);
  return {
    ok: true,
    target: {
      label: best.displayName,
      grid,
      lat: best.lat,
      lon: best.lon,
      source: "geocode",
    },
  };
}

export async function resolveCallsignTarget(
  callsignInput: string,
  qrzApiKey?: string,
): Promise<TargetResolveResult> {
  const cs = callsignInput.trim().toUpperCase();
  if (!cs) {
    return { ok: false, error: "Enter a callsign to look up." };
  }

  const ingested = await ingestCallsign(cs, qrzApiKey);
  if (!ingested) {
    return {
      ok: false,
      error:
        "Callsign not found via Callook / HamQTH / QRZ. Try a grid or coordinates.",
    };
  }

  if (ingested.grid && isValidGrid(ingested.grid)) {
    const grid = ingested.grid.toUpperCase();
    const { lat, lon } = gridToLatLon(grid);
    return {
      ok: true,
      target: {
        label: ingested.name ? `${cs} — ${ingested.name}` : cs,
        grid,
        lat,
        lon,
        source: "callsign",
        callsign: cs,
        lookupSources: ingested.sources,
      },
    };
  }

  if (
    typeof ingested.lat === "number" &&
    typeof ingested.lon === "number" &&
    Number.isFinite(ingested.lat) &&
    Number.isFinite(ingested.lon)
  ) {
    const grid = latLonToGrid(ingested.lat, ingested.lon);
    return {
      ok: true,
      target: {
        label: ingested.name ? `${cs} — ${ingested.name}` : cs,
        grid,
        lat: ingested.lat,
        lon: ingested.lon,
        source: "callsign",
        callsign: cs,
        lookupSources: ingested.sources,
      },
    };
  }

  return {
    ok: false,
    error: "Lookup succeeded, but no location was returned.",
  };
}

export function targetFromMapLocation(params: {
  lat: number;
  lon: number;
  grid?: string;
  name?: string;
}): ResolvedTarget {
  const grid = params.grid?.toUpperCase() || latLonToGrid(params.lat, params.lon);
  return {
    label: params.name ?? grid,
    grid,
    lat: params.lat,
    lon: params.lon,
    source: "map",
  };
}

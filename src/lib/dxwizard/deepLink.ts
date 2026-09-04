import { isValidGrid, gridToLatLon, latLonToGrid } from "@/lib/utils/grid";
import type { ResolvedTarget, WizardMode, WizardPathMode } from "./types";
import { WIZARD_MODES } from "./types";

export interface WizardDeepLink {
  target: ResolvedTarget | null;
  mode: WizardMode | null;
  pathMode: WizardPathMode | null;
  callsign: string | null;
}

function parseMode(raw: string | null): WizardMode | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  return (WIZARD_MODES as string[]).includes(upper)
    ? (upper as WizardMode)
    : null;
}

function parsePath(raw: string | null): WizardPathMode | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "long" || lower === "lp") return "long";
  if (lower === "short" || lower === "sp") return "short";
  return null;
}

/** Truncate 8-char grids to 6 chars for gridToLatLon. */
function gridForLatLon(grid: string): string {
  const upper = grid.toUpperCase();
  if (upper.length >= 8) return upper.slice(0, 6);
  return upper;
}

function parseExplicitCoordinate(
  raw: string | null,
): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Parse `/dx?...` search params into wizard session seeds. */
export function parseWizardDeepLink(
  search: string | URLSearchParams,
): WizardDeepLink {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;

  const mode = parseMode(params.get("mode"));
  const pathMode = parsePath(params.get("path"));
  const callParam = params.get("call")?.trim().toUpperCase() || null;

  // Prefer explicit lat/lon when present so spot deep-links keep exact
  // coordinates instead of snapping to grid-cell center.
  const lat = parseExplicitCoordinate(params.get("lat"));
  const lon = parseExplicitCoordinate(params.get("lon"));
  if (
    lat != null &&
    lon != null &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  ) {
    const gridParam = params.get("grid")?.trim();
    const grid =
      gridParam && isValidGrid(gridParam)
        ? gridParam.toUpperCase().slice(0, 6)
        : latLonToGrid(lat, lon);
    return {
      target: {
        label: callParam ? `${callParam} · ${grid}` : grid,
        grid,
        lat,
        lon,
        source: "url",
        callsign: callParam ?? undefined,
      },
      mode,
      pathMode,
      callsign: callParam,
    };
  }

  const gridParam = params.get("grid")?.trim();
  if (gridParam && isValidGrid(gridParam)) {
    const grid = gridParam.toUpperCase();
    const coords = gridToLatLon(gridForLatLon(grid));
    return {
      target: {
        label: callParam ? `${callParam} · ${grid}` : grid,
        grid: grid.length >= 6 ? grid.slice(0, 6) : grid,
        lat: coords.lat,
        lon: coords.lon,
        source: "url",
        callsign: callParam ?? undefined,
      },
      mode,
      pathMode,
      callsign: callParam,
    };
  }

  return {
    target: null,
    mode,
    pathMode,
    callsign: callParam,
  };
}

export function buildWizardSearchParams(params: {
  target: ResolvedTarget | null;
  mode: WizardMode;
  pathMode: WizardPathMode;
}): URLSearchParams {
  const out = new URLSearchParams();
  if (params.target) {
    if (params.target.callsign) {
      out.set("call", params.target.callsign);
    }
    out.set("grid", params.target.grid);
    out.set("lat", String(params.target.lat));
    out.set("lon", String(params.target.lon));
  }
  out.set("mode", params.mode);
  if (params.pathMode === "long") {
    out.set("path", "long");
  }
  return out;
}

export function bandPlannerHrefForTarget(grid: string): string {
  const params = new URLSearchParams({ grid: grid.toUpperCase() });
  return `/planner?${params.toString()}`;
}

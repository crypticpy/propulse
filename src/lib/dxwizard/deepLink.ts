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

/** Parse `/dx?...` search params into wizard session seeds. */
export function parseWizardDeepLink(
  search: string | URLSearchParams,
): WizardDeepLink {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;

  const mode = parseMode(params.get("mode"));
  const pathMode = parsePath(params.get("path"));
  const callParam = params.get("call")?.trim().toUpperCase() || null;

  const gridParam = params.get("grid")?.trim();
  if (gridParam && isValidGrid(gridParam)) {
    const grid = gridParam.toUpperCase();
    const { lat, lon } = gridToLatLon(grid);
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

  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const grid = latLonToGrid(lat, lon);
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

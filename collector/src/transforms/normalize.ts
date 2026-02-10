import { isValidGrid, gridToLatLon } from "./grid.js";

interface GridResult {
  grid: string | null;
  lat: number | null;
  lon: number | null;
}

export function resolveGrid(grid: string | undefined | null): GridResult {
  if (!grid || !isValidGrid(grid)) return { grid: null, lat: null, lon: null };
  try {
    const { lat, lon } = gridToLatLon(grid);
    return { grid, lat, lon };
  } catch {
    return { grid: null, lat: null, lon: null };
  }
}

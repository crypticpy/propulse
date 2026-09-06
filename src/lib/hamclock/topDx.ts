import type { DXSpot } from "@/types/dxcluster";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { getDistance } from "@/lib/utils/path";

export function rankLoadedDx(
  spots: DXSpot[],
  home: { lat: number; lon: number },
  now: number,
) {
  const unique = new Map<string, DXSpot>();
  for (const spot of spots) {
    const at = new Date(spot.time).getTime();
    if (Number.isFinite(at) && at <= now && now - at <= 60 * 60_000)
      unique.set(spot.id, spot);
  }
  return [...unique.values()]
    .flatMap((spot) => {
      if (spot.dxLocApprox) return [];
      const grid = spot.dxGrid?.trim();
      const target =
        grid && isValidGrid(grid)
          ? gridToLatLon(grid.slice(0, 6))
          : !spot.dxLocApprox &&
              typeof spot.dxLat === "number" &&
              typeof spot.dxLon === "number" &&
              Number.isFinite(spot.dxLat) &&
              Number.isFinite(spot.dxLon) &&
              Math.abs(spot.dxLat) <= 90 &&
              Math.abs(spot.dxLon) <= 180
            ? { lat: spot.dxLat, lon: spot.dxLon }
            : null;
      return target
        ? [
            {
              spot,
              target,
              km: getDistance(home.lat, home.lon, target.lat, target.lon),
            },
          ]
        : [];
    })
    .sort((a, b) => b.km - a.km || a.spot.id.localeCompare(b.spot.id));
}

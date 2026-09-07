/**
 * WorkStationPanel — compact spot CTA into DX Wizard + optional CAT tune.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { DXSpot } from "@/types/dxcluster";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { TuneButton } from "@/components/radio/TuneButton";
import { latLonToGrid } from "@/lib/utils/grid";
import { getPathMetrics, formatDistance, formatBearing } from "@/lib/utils/path";

interface WorkStationPanelProps {
  spot: DXSpot;
  onClose: () => void;
  onSetTarget?: (spot: DXSpot) => void;
}

export function WorkStationPanel({
  spot,
  onClose,
  onSetTarget,
}: WorkStationPanelProps) {
  const location = useActiveLocation();
  const info = useMemo(() => {
    if (!location || !spot.dxLat || !spot.dxLon) return null;
    const metrics = getPathMetrics(
      location.lat,
      location.lon,
      spot.dxLat,
      spot.dxLon,
    );
    return metrics;
  }, [location, spot.dxLat, spot.dxLon]);

  const wizardHref = useMemo(() => {
    const params = new URLSearchParams({ call: spot.dx });
    if (spot.dxLat != null && spot.dxLon != null) {
      params.set("lat", String(spot.dxLat));
      params.set("lon", String(spot.dxLon));
      params.set(
        "grid",
        spot.dxGrid || latLonToGrid(spot.dxLat, spot.dxLon),
      );
    } else if (spot.dxGrid) {
      params.set("grid", spot.dxGrid);
    }
    const mode = (spot.mode || "").toUpperCase();
    if (["FT8", "FT4", "CW", "SSB", "RTTY"].includes(mode)) {
      params.set("mode", mode);
    }
    return `/dx?${params.toString()}`;
  }, [spot]);

  return (
    <div className="rounded-xl border border-cosmic-cyan/30 bg-su-line/10 backdrop-blur-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-su-text">
            {spot.dx}
          </span>
          <span className="text-xs text-su-muted">
            {spot.band} {spot.mode}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-su-muted hover:text-su-text transition-colors"
        >
          ✕
        </button>
      </div>

      {info && (
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-lg bg-su-line/10 p-2">
            <div className="text-[10px] text-su-muted uppercase">Bearing</div>
            <div className="font-mono text-su-text">
              {Math.round(info.shortPath.bearing)}°{" "}
              {formatBearing(info.shortPath.bearing)}
            </div>
          </div>
          <div className="rounded-lg bg-su-line/10 p-2">
            <div className="text-[10px] text-su-muted uppercase">Distance</div>
            <div className="font-mono text-su-text">
              {formatDistance(info.shortPath.distance)}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          to={wizardHref}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-center bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/40 rounded-lg hover:bg-plasma-orange/30 transition-colors"
        >
          Analyze in DX Wizard
        </Link>
        <TuneButton frequencyKHz={spot.frequency} mode={spot.mode} wall={false} />
        {onSetTarget && (
          <button
            type="button"
            onClick={() => onSetTarget(spot)}
            className="px-3 py-1.5 text-xs font-medium bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30 rounded-lg hover:bg-cosmic-cyan/30 transition-colors"
          >
            Target
          </button>
        )}
      </div>
    </div>
  );
}

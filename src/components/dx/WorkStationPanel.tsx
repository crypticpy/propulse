/**
 * WorkStationPanel Component (QoL4)
 *
 * One-click "Work This Station" flow: instant propagation assessment,
 * bearing, TX power recommendation, and optional auto-tune.
 */

import { useMemo } from "react";
import type { DXSpot } from "@/types/dxcluster";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useRigStore } from "@/stores/rigStore";

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = (lon2 - lon1) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG);
  const x =
    Math.cos(lat1 * DEG) * Math.sin(lat2 * DEG) -
    Math.sin(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const catEnabled = useRigStore((s) => s.catEnabled);
  const setPendingFrequency = useRigStore((s) => s.setPendingFrequency);
  const setPendingMode = useRigStore((s) => s.setPendingMode);

  const info = useMemo(() => {
    if (!location || !spot.dxLat || !spot.dxLon) return null;

    const dist = haversineKm(
      location.lat,
      location.lon,
      spot.dxLat,
      spot.dxLon,
    );
    const shortPath = bearing(
      location.lat,
      location.lon,
      spot.dxLat,
      spot.dxLon,
    );
    const longPath = (shortPath + 180) % 360;
    const distMi = dist * 0.621371;

    // Simple propagation assessment
    let assessment: string;
    let assessmentColor: string;
    if (dist < 3000) {
      assessment = "NVIS/Ground Wave likely";
      assessmentColor = "text-signal-green";
    } else if (dist < 8000) {
      assessment = "1-2 hop F2 likely";
      assessmentColor = "text-signal-green";
    } else if (dist < 15000) {
      assessment = "Multi-hop, check forecast";
      assessmentColor = "text-caution-amber";
    } else {
      assessment = "Long path may be better";
      assessmentColor = "text-plasma-orange";
    }

    return {
      dist,
      distMi,
      shortPath,
      longPath,
      assessment,
      assessmentColor,
    };
  }, [location, spot.dxLat, spot.dxLon]);

  const handleTune = () => {
    setPendingFrequency(spot.frequency * 1000);
    const upper = (spot.mode || "").toUpperCase();
    const rigMode =
      upper === "CW" ? "CW" : spot.frequency < 10000 ? "LSB" : "USB";
    setPendingMode(rigMode);
  };

  return (
    <div className="rounded-xl border border-cosmic-cyan/30 bg-white/[0.05] backdrop-blur-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-white">
            {spot.dx}
          </span>
          <span className="text-xs text-gray-400">
            {spot.band} {spot.mode}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {info && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-[10px] text-gray-400 uppercase">Bearing</div>
            <div className="text-sm font-bold text-white font-mono">
              {info.shortPath.toFixed(0)}°
            </div>
            <div className="text-[9px] text-gray-500">
              LP {info.longPath.toFixed(0)}°
            </div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-[10px] text-gray-400 uppercase">Distance</div>
            <div className="text-sm font-bold text-white font-mono">
              {Math.round(info.dist).toLocaleString()} km
            </div>
            <div className="text-[9px] text-gray-500">
              {Math.round(info.distMi).toLocaleString()} mi
            </div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-[10px] text-gray-400 uppercase">Freq</div>
            <div className="text-sm font-bold text-cosmic-cyan font-mono">
              {(spot.frequency / 1000).toFixed(3)}
            </div>
            <div className="text-[9px] text-gray-500">MHz</div>
          </div>
        </div>
      )}

      {info && (
        <div
          className={`text-xs font-medium ${info.assessmentColor} text-center`}
        >
          {info.assessment}
        </div>
      )}

      <div className="flex gap-2">
        {catEnabled && (
          <button
            onClick={handleTune}
            className="flex-1 px-3 py-1.5 text-xs font-medium bg-signal-green/20 text-signal-green border border-signal-green/30 rounded-lg hover:bg-signal-green/30 transition-colors"
          >
            Tune
          </button>
        )}
        {onSetTarget && (
          <button
            onClick={() => onSetTarget(spot)}
            className="flex-1 px-3 py-1.5 text-xs font-medium bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30 rounded-lg hover:bg-cosmic-cyan/30 transition-colors"
          >
            Set Target
          </button>
        )}
      </div>
    </div>
  );
}

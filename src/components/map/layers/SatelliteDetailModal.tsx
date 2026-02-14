/**
 * SatelliteDetailModal — Centered modal for satellite detail view
 *
 * Opens when `selectedSatelliteId` is set in mapStore. Shows satellite
 * position data, transponder info with Doppler correction, and pass
 * predictions. Rendered via createPortal to document.body.
 */

import { useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { format, formatDistanceToNow } from "date-fns";
import { useMapStore } from "@/stores/mapStore";
import { useSatellites } from "@/hooks/useSatellites";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { useUserStore } from "@/stores/userStore";
import { useRigStore } from "@/stores/rigStore";
import {
  getTransponder,
  type SatelliteTransponder,
  type Transponder,
} from "@/lib/data/satelliteTransponders";
import {
  getCorrectedFrequencies,
  type CorrectedFrequencies,
} from "@/lib/utils/doppler";
import { calculatePosition } from "@/lib/api/satellites";
import {
  CATEGORY_META,
  formatAzimuth,
  formatFreqMHz,
  formatShift,
  formatLatLon,
} from "@/lib/utils/satellite";
import type {
  SatelliteCategory,
  SatelliteInfo,
  PassPrediction,
} from "@/types/satellite";

// ---------------------------------------------------------------------------
// Inline micro-components
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: SatelliteCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${meta.color} ${meta.bg}`}
    >
      {meta.label}
    </span>
  );
}

function VisibilityDot({ isVisible }: { isVisible: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        isVisible ? "bg-green-400 animate-pulse" : "bg-gray-600"
      }`}
      title={isVisible ? "Above horizon" : "Below horizon"}
    />
  );
}

// ---------------------------------------------------------------------------
// TransponderInfo (self-contained copy from SatellitePanel)
// ---------------------------------------------------------------------------

function TransponderInfo({
  satellite,
  transponderData,
}: {
  satellite: SatelliteInfo;
  transponderData: SatelliteTransponder;
}) {
  const { station } = useUserStore();
  const rigConnected = useRigStore((s) => s.connected);
  const setPendingFrequency = useRigStore((s) => s.setPendingFrequency);

  const dopplerInfo = useMemo((): CorrectedFrequencies | null => {
    if (!station || !satellite.isVisible) return null;
    const xpdr = transponderData.transponders[0];
    if (!xpdr) return null;

    const now = new Date();
    const prevTime = new Date(now.getTime() - 1000);
    const prevPos = calculatePosition(satellite, prevTime);

    try {
      return getCorrectedFrequencies(
        satellite.position,
        prevPos,
        { lat: station.lat, lon: station.lon, alt: 0 },
        xpdr,
        1,
      );
    } catch {
      return null;
    }
  }, [satellite, station, transponderData]);

  return (
    <div className="mt-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">
        Transponders
      </div>
      {transponderData.transponders.map((xpdr: Transponder, idx: number) => (
        <div key={idx} className="bg-white/[0.03] rounded-md px-2.5 py-2 mb-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-300">
              {xpdr.name}
            </span>
            <span
              className={`text-[9px] px-1 py-0.5 rounded uppercase font-semibold ${
                xpdr.mode === "FM"
                  ? "bg-green-400/20 text-green-400"
                  : xpdr.mode === "linear"
                    ? "bg-cyan-400/20 text-cyan-400"
                    : "bg-orange-400/20 text-orange-400"
              }`}
            >
              {xpdr.mode}
              {xpdr.inverted ? " INV" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-mono">
            <div>
              <span className="text-gray-500">UP: </span>
              <span className="text-gray-300">
                {formatFreqMHz(xpdr.uplinkRangeHz[0])}
                {xpdr.uplinkRangeHz[0] !== xpdr.uplinkRangeHz[1] &&
                  ` - ${formatFreqMHz(xpdr.uplinkRangeHz[1])}`}
              </span>
            </div>
            <div>
              <span className="text-gray-500">DN: </span>
              <span className="text-gray-300">
                {formatFreqMHz(xpdr.downlinkRangeHz[0])}
                {xpdr.downlinkRangeHz[0] !== xpdr.downlinkRangeHz[1] &&
                  ` - ${formatFreqMHz(xpdr.downlinkRangeHz[1])}`}
              </span>
            </div>
          </div>
        </div>
      ))}

      {transponderData.beaconHz && (
        <div className="text-[10px] font-mono text-gray-400 mt-1">
          Beacon: {formatFreqMHz(transponderData.beaconHz)}
        </div>
      )}

      {transponderData.notes && (
        <div className="text-[10px] text-gray-500 mt-1 italic">
          {transponderData.notes}
        </div>
      )}

      {/* Real-time Doppler correction (visible pass only) */}
      {dopplerInfo && (
        <div className="mt-2 bg-cyan-400/5 border border-cyan-400/20 rounded-md px-2.5 py-2">
          <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-1 font-semibold">
            Doppler-Corrected
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
            <div>
              <span className="text-gray-500">TX: </span>
              <span className="text-white">
                {formatFreqMHz(dopplerInfo.uplinkHz)}
              </span>
              <div className="text-gray-500">
                {formatShift(dopplerInfo.uplinkShiftHz)}
              </div>
            </div>
            <div>
              <span className="text-gray-500">RX: </span>
              <span className="text-white">
                {formatFreqMHz(dopplerInfo.downlinkHz)}
              </span>
              <div className="text-gray-500">
                {formatShift(dopplerInfo.downlinkShiftHz)}
              </div>
            </div>
          </div>

          {rigConnected && (
            <button
              onClick={() => setPendingFrequency(dopplerInfo.downlinkHz)}
              className="mt-1.5 w-full text-[10px] font-medium px-2 py-1 rounded bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30 transition-colors"
            >
              Tune RX to {formatFreqMHz(dopplerInfo.downlinkHz)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PassRow (self-contained copy from SatellitePanel)
// ---------------------------------------------------------------------------

function PassRow({ pass }: { pass: PassPrediction }) {
  const { use24h } = useTimeFormat();
  const isActive = pass.aos <= new Date() && pass.los >= new Date();
  const isFuture = pass.aos > new Date();
  const timeFmt = use24h ? "HH:mm" : "h:mm a";

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
        isActive
          ? "bg-green-400/10 border border-green-400/20"
          : "bg-white/[0.02]"
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
          <span className="font-mono text-gray-300">
            {isActive ? "NOW" : format(pass.aos, timeFmt)}
          </span>
          <span className="text-gray-500">-</span>
          <span className="font-mono text-gray-400">
            {format(pass.los, timeFmt)}
          </span>
        </div>
        {isFuture && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            in {formatDistanceToNow(pass.aos)}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="font-mono text-gray-300">
          {Math.round(pass.maxEl)}&deg; max
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {formatAzimuth(pass.aosAz)} &rarr; {formatAzimuth(pass.losAz)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SatelliteDetailContent
// ---------------------------------------------------------------------------

function SatelliteDetailContent({
  satellite,
  passes,
  onClose,
}: {
  satellite: SatelliteInfo;
  passes: PassPrediction[];
  onClose: () => void;
}) {
  const { lat, lon, alt, velocity } = satellite.position;

  const transponderData = useMemo(
    () => getTransponder(satellite.name, satellite.noradId),
    [satellite.name, satellite.noradId],
  );

  return (
    <div className="flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {satellite.name}
            </span>
            <CategoryBadge category={satellite.category} />
            <VisibilityDot isVisible={satellite.isVisible} />
          </div>
          <div className="text-[10px] text-gray-500 font-mono mt-0.5">
            NORAD {satellite.noradId}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
          title="Close"
        >
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
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

      {/* Scrollable content */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {/* Position data grid */}
        <div
          className="grid gap-2 mb-3"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <div className="bg-white/[0.03] rounded-md px-2.5 py-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">
              Position
            </div>
            <div className="text-xs font-mono text-gray-200 mt-0.5">
              {formatLatLon(lat, lon)}
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-md px-2.5 py-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">
              Altitude
            </div>
            <div className="text-xs font-mono text-gray-200 mt-0.5">
              {Math.round(alt)} km
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-md px-2.5 py-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">
              Velocity
            </div>
            <div className="text-xs font-mono text-gray-200 mt-0.5">
              {velocity.toFixed(1)} km/s
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-md px-2.5 py-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">
              Status
            </div>
            <div
              className={`text-xs font-mono mt-0.5 ${
                satellite.isVisible ? "text-green-400" : "text-gray-400"
              }`}
            >
              {satellite.isVisible ? "Visible" : "Below horizon"}
            </div>
          </div>
        </div>

        {/* Transponder & Doppler info */}
        {transponderData && (
          <TransponderInfo
            satellite={satellite}
            transponderData={transponderData}
          />
        )}

        {/* Pass predictions */}
        <div className="mt-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-semibold">
            Next Passes (24h)
          </div>
          {passes.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-3">
              No passes predicted &mdash; set your QTH in settings
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {passes.slice(0, 8).map((pass, idx) => (
                <PassRow key={idx} pass={pass} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal Component
// ---------------------------------------------------------------------------

export default function SatelliteDetailModal() {
  const selectedSatelliteId = useMapStore((s) => s.selectedSatelliteId);
  const setSelectedSatelliteId = useMapStore((s) => s.setSelectedSatelliteId);

  const { selectedSatellite, nextPasses } = useSatellites();

  const handleClose = useCallback(() => {
    setSelectedSatelliteId(null);
  }, [setSelectedSatelliteId]);

  // Escape key handler
  useEffect(() => {
    if (selectedSatelliteId === null) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedSatelliteId, handleClose]);

  // Render nothing when no satellite is selected
  if (selectedSatelliteId === null || !selectedSatellite) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal content */}
      <div
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/60 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <SatelliteDetailContent
          satellite={selectedSatellite}
          passes={nextPasses}
          onClose={handleClose}
        />
      </div>
    </div>,
    document.body,
  );
}

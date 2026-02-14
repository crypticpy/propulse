/**
 * SatellitePanel Component
 *
 * Info panel displaying tracked amateur radio satellites with:
 * - List of satellites with category badges and visibility indicators
 * - Selected satellite details (position, altitude, velocity)
 * - Next pass predictions when observer location is available
 *
 * Uses the same Card styling pattern as BandConditionsPanel.
 */

import { useMemo, useState, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/Card";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { useSatellites } from "@/hooks/useSatellites";
import { useSatelliteTransponders } from "@/hooks/useSatelliteTransponders";
import { useSatelliteAlerts } from "@/hooks/useSatelliteAlerts";
import type {
  SatelliteInfo,
  SatelliteCategory,
  PassPrediction,
  SatNOGSTransmitter,
} from "@/types/satellite";
import {
  getTransponder,
  type SatelliteTransponder,
  type Transponder,
} from "@/lib/data/satelliteTransponders";
import {
  getCorrectedFrequencies,
  type CorrectedFrequencies,
} from "@/lib/utils/doppler";
import { computePassQuality } from "@/lib/utils/passQuality";
import { calculatePosition } from "@/lib/api/satellites";
import { useUserStore } from "@/stores/userStore";
import { useRigStore } from "@/stores/rigStore";
import { SatelliteLogButton } from "./layers/SatelliteLogButton";
import { CustomTLEDialog } from "./layers/CustomTLEDialog";

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

/** Category display config */
const CATEGORY_META: Record<
  SatelliteCategory,
  { label: string; color: string; bg: string }
> = {
  iss: { label: "ISS", color: "text-white", bg: "bg-white/20" },
  fm: { label: "FM", color: "text-green-400", bg: "bg-green-400/20" },
  linear: { label: "LIN", color: "text-cyan-400", bg: "bg-cyan-400/20" },
  digital: { label: "DIG", color: "text-orange-400", bg: "bg-orange-400/20" },
  weather: { label: "WX", color: "text-purple-400", bg: "bg-purple-400/20" },
  other: { label: "OTH", color: "text-gray-400", bg: "bg-gray-400/20" },
};

/** Format azimuth to compass bearing string */
function formatAzimuth(az: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(az / 45) % 8;
  return `${Math.round(az)}° ${directions[index]}`;
}

/** Format frequency in Hz to a readable string */
function formatFreqMHz(hz: number): string {
  if (hz >= 1_000_000_000) {
    return `${(hz / 1_000_000_000).toFixed(3)} GHz`;
  }
  return `${(hz / 1_000_000).toFixed(3)} MHz`;
}

/** Format Doppler shift for display */
function formatShift(hz: number): string {
  const prefix = hz >= 0 ? "+" : "";
  if (Math.abs(hz) >= 1000) {
    return `${prefix}${(hz / 1000).toFixed(1)} kHz`;
  }
  return `${prefix}${Math.round(hz)} Hz`;
}

/** Format lat/lon for display */
function formatLatLon(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${latDir} ${Math.abs(lon).toFixed(1)}°${lonDir}`;
}

/** Color class for pass quality score */
function qualityColor(score: number): string {
  if (score >= 4) return "text-green-400";
  if (score === 3) return "text-yellow-400";
  if (score === 2) return "text-orange-400";
  return "text-red-400";
}

/** Render filled/empty stars for a 1-5 rating */
function StarRating({ score }: { score: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span
      className={`text-[10px] ${qualityColor(score)}`}
      aria-label={`${score} out of 5 stars`}
    >
      {"★".repeat(score)}
      {"☆".repeat(5 - score)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Category badge */
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

/** Visibility indicator dot */
function VisibilityDot({ isVisible }: { isVisible: boolean }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isVisible ? "bg-green-400 animate-pulse" : "bg-gray-600"
      }`}
      title={isVisible ? "Above horizon" : "Below horizon"}
    />
  );
}

/** Single satellite row in the list */
function SatelliteRow({
  satellite,
  isSelected,
  onSelect,
}: {
  satellite: SatelliteInfo;
  isSelected: boolean;
  onSelect: (noradId: number) => void;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${
        isSelected
          ? "bg-white/10 border border-white/20"
          : "hover:bg-white/5 border border-transparent"
      }`}
      onClick={() => onSelect(satellite.noradId)}
    >
      <VisibilityDot isVisible={satellite.isVisible} />
      <span className="flex-1 text-xs font-mono text-gray-200 truncate">
        {satellite.name}
      </span>
      <CategoryBadge category={satellite.category} />
    </button>
  );
}

/** Pass prediction row with quality stars */
function PassRow({ pass }: { pass: PassPrediction }) {
  const { use24h } = useTimeFormat();
  const isActive = pass.aos <= new Date() && pass.los >= new Date();
  const isFuture = pass.aos > new Date();
  const timeFmt = use24h ? "HH:mm" : "h:mm a";
  const quality = computePassQuality(pass);

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
            {isActive
              ? "NOW"
              : isFuture
                ? format(pass.aos, timeFmt)
                : format(pass.aos, timeFmt)}
          </span>
          <span className="text-gray-500">-</span>
          <span className="font-mono text-gray-400">
            {format(pass.los, timeFmt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <StarRating score={quality.score} />
          <span
            className={`text-[9px] px-1 py-0.5 rounded font-medium ${qualityColor(quality.score)} ${
              quality.score >= 4
                ? "bg-green-400/10"
                : quality.score === 3
                  ? "bg-yellow-400/10"
                  : quality.score === 2
                    ? "bg-orange-400/10"
                    : "bg-red-400/10"
            }`}
          >
            {quality.label}
          </span>
          {isFuture && (
            <span className="text-[10px] text-gray-500">
              in {formatDistanceToNow(pass.aos)}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-gray-300">
          {Math.round(pass.maxEl)}° max
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {formatAzimuth(pass.aosAz)} → {formatAzimuth(pass.losAz)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selected Satellite Detail View
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Transponder & Doppler Sub-component
// ---------------------------------------------------------------------------

/** Single SatNOGS transponder row */
function SatNOGSTransponderRow({ tx }: { tx: SatNOGSTransmitter }) {
  return (
    <div className="bg-white/[0.03] rounded-md px-2 py-1.5 mb-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-gray-300 truncate">
          {tx.description}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className={`text-[8px] px-1 py-0.5 rounded font-semibold uppercase ${
              tx.status === "active"
                ? "bg-green-400/20 text-green-400"
                : "bg-gray-500/20 text-gray-500"
            }`}
          >
            {tx.status}
          </span>
          {tx.mode && (
            <span className="text-[9px] px-1 py-0.5 rounded uppercase font-semibold bg-cyan-400/20 text-cyan-400">
              {tx.mode}
              {tx.invert ? " INV" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-mono">
        {(tx.uplink_low || tx.uplink_high) && (
          <div>
            <span className="text-gray-500">UP: </span>
            <span className="text-gray-300">
              {tx.uplink_low ? formatFreqMHz(tx.uplink_low) : "—"}
              {tx.uplink_high &&
                tx.uplink_low !== tx.uplink_high &&
                ` - ${formatFreqMHz(tx.uplink_high)}`}
            </span>
          </div>
        )}
        {(tx.downlink_low || tx.downlink_high) && (
          <div>
            <span className="text-gray-500">DN: </span>
            <span className="text-gray-300">
              {tx.downlink_low ? formatFreqMHz(tx.downlink_low) : "—"}
              {tx.downlink_high &&
                tx.downlink_low !== tx.downlink_high &&
                ` - ${formatFreqMHz(tx.downlink_high)}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TransponderInfo({
  satellite,
  transponderData,
  satnogsTransponders,
}: {
  satellite: SatelliteInfo;
  transponderData: SatelliteTransponder;
  /** SatNOGS live data — when available, shown alongside static data */
  satnogsTransponders?: SatNOGSTransmitter[];
}) {
  const { station } = useUserStore();
  const rigConnected = useRigStore((s) => s.connected);
  const setPendingFrequency = useRigStore((s) => s.setPendingFrequency);

  const useSatNOGS = satnogsTransponders && satnogsTransponders.length > 0;

  // Compute Doppler-corrected frequencies for the primary transponder
  const dopplerInfo = useMemo((): CorrectedFrequencies | null => {
    if (!station || !satellite.isVisible) return null;
    const xpdr = transponderData.transponders[0];
    if (!xpdr) return null;

    const now = new Date();
    const prevTime = new Date(now.getTime() - 1000);
    const prevPos = calculatePosition(satellite, prevTime);
    if (!prevPos) return null;

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
    <div className="mt-2">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
          Transponders
        </span>
        {useSatNOGS && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-medium">
            SatNOGS
          </span>
        )}
      </div>

      {/* Prefer SatNOGS live data when available, fallback to static */}
      {useSatNOGS
        ? satnogsTransponders.map((tx) => (
            <SatNOGSTransponderRow key={tx.uuid} tx={tx} />
          ))
        : transponderData.transponders.map((xpdr: Transponder, idx: number) => (
            <div
              key={idx}
              className="bg-white/[0.03] rounded-md px-2 py-1.5 mb-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-gray-300">
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
        <div className="mt-2 bg-cyan-400/5 border border-cyan-400/20 rounded-md px-2 py-1.5">
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
// Satellite Detail View
// ---------------------------------------------------------------------------

function SatelliteDetail({
  satellite,
  passes,
  onBack,
}: {
  satellite: SatelliteInfo;
  passes: PassPrediction[];
  onBack: () => void;
}) {
  const { lat, lon, alt, velocity } = satellite.position;

  // Look up static transponder data
  const transponderData = useMemo(
    () => getTransponder(satellite.name, satellite.noradId),
    [satellite.name, satellite.noradId],
  );

  // Fetch live SatNOGS transponder data
  const { transponders: satnogsXpdrs } = useSatelliteTransponders(
    satellite.noradId,
  );

  // Determine primary transponder mode/frequency for the log button
  const primaryXpdr = transponderData?.transponders[0];
  const activePass = passes.find(
    (p) => p.aos <= new Date() && p.los >= new Date(),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header with back button */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onBack}
          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
          title="Back to list"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {satellite.name}
            </span>
            <CategoryBadge category={satellite.category} />
          </div>
          <div className="text-[10px] text-gray-500 font-mono">
            NORAD {satellite.noradId}
          </div>
        </div>
        <VisibilityDot isVisible={satellite.isVisible} />
      </div>

      {/* Position data grid */}
      <div
        className="grid gap-2 mb-3"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            Position
          </div>
          <div className="text-xs font-mono text-gray-200 mt-0.5">
            {formatLatLon(lat, lon)}
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            Altitude
          </div>
          <div className="text-xs font-mono text-gray-200 mt-0.5">
            {Math.round(alt)} km
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            Velocity
          </div>
          <div className="text-xs font-mono text-gray-200 mt-0.5">
            {velocity.toFixed(1)} km/s
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-md px-2 py-1.5">
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
          satnogsTransponders={
            satnogsXpdrs.length > 0 ? satnogsXpdrs : undefined
          }
        />
      )}

      {/* Log This Pass button */}
      <div className="mt-2">
        <SatelliteLogButton
          satelliteName={satellite.name}
          transponderMode={primaryXpdr?.mode}
          downlinkFrequencyHz={primaryXpdr?.downlinkRangeHz[0]}
          passStartTime={activePass?.aos}
          isAboveHorizon={satellite.isVisible}
        />
      </div>

      {/* Pass predictions */}
      <div className="flex-1 min-h-0">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
          Next Passes (24h)
        </div>
        {passes.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-3">
            No passes predicted — set your QTH in settings
          </div>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[200px] scrollbar-hide">
            {passes.slice(0, 8).map((pass, idx) => (
              <PassRow key={idx} pass={pass} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel Component
// ---------------------------------------------------------------------------

interface SatellitePanelProps {
  className?: string;
  /** When true, panel collapses to a slim summary bar */
  collapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
}

export function SatellitePanel({
  className = "",
  collapsed = false,
  onToggleCollapse,
}: SatellitePanelProps) {
  const {
    satellites,
    selectedSatellite,
    selectSatellite,
    isLoading,
    nextPasses,
    isAvailable,
    refetch,
  } = useSatellites();

  const [filterCategory, setFilterCategory] = useState<
    SatelliteCategory | "all"
  >("all");

  // Custom TLE dialog state
  const [showCustomTLE, setShowCustomTLE] = useState(false);

  // Satellite pass alerts
  const { alertsEnabled, notificationSupported, requestPermission } =
    useSatelliteAlerts();

  // Filter and sort satellites
  const filteredSatellites = useMemo(() => {
    let filtered = satellites;

    // Apply category filter
    if (filterCategory !== "all") {
      filtered = filtered.filter((s) => s.category === filterCategory);
    }

    // Sort: visible first, then by category priority, then alphabetically
    const categoryOrder: Record<SatelliteCategory, number> = {
      iss: 0,
      fm: 1,
      linear: 2,
      digital: 3,
      weather: 4,
      other: 5,
    };

    return [...filtered].sort((a, b) => {
      // Visible satellites first
      if (a.isVisible !== b.isVisible) {
        return a.isVisible ? -1 : 1;
      }
      // Then by category
      if (a.category !== b.category) {
        return categoryOrder[a.category] - categoryOrder[b.category];
      }
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [satellites, filterCategory]);

  // Count visible satellites
  const visibleCount = useMemo(
    () => satellites.filter((s) => s.isVisible).length,
    [satellites],
  );

  const handleSelect = useCallback(
    (noradId: number) => {
      if (selectedSatellite?.noradId === noradId) {
        selectSatellite(null);
      } else {
        selectSatellite(noradId);
      }
    },
    [selectedSatellite, selectSatellite],
  );

  const handleBack = useCallback(() => {
    selectSatellite(null);
  }, [selectSatellite]);

  // Category filter buttons
  const categoryFilters: Array<{
    key: SatelliteCategory | "all";
    label: string;
  }> = [
    { key: "all", label: "All" },
    { key: "iss", label: "ISS" },
    { key: "fm", label: "FM" },
    { key: "linear", label: "Linear" },
    { key: "digital", label: "Digital" },
  ];

  // Collapsed summary
  if (collapsed) {
    return (
      <Card className={`${className} !p-2.5 !rounded-lg`}>
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={onToggleCollapse}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleCollapse?.();
            }
          }}
        >
          {/* Expand indicator */}
          <svg
            className="w-3.5 h-3.5 text-gray-500 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>

          {/* Satellite icon */}
          <svg
            className="w-4 h-4 text-cyan-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>

          <span className="text-sm text-gray-300">Satellites</span>

          <div className="w-px h-3 bg-white/10" />

          {/* Summary stats */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-gray-400">{satellites.length} tracked</span>
            {visibleCount > 0 && (
              <span className="text-green-400">{visibleCount} visible</span>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className} flex flex-col h-full p-2 !rounded-lg`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
              title="Collapse panel"
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
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
          <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide truncate">
            Satellites
          </h3>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {visibleCount > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-green-400/10 text-green-400">
              {visibleCount} vis
            </span>
          )}
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
            {satellites.length} sats
          </span>

          {/* Alerts toggle */}
          {notificationSupported && (
            <button
              onClick={() => {
                if (!alertsEnabled) requestPermission();
              }}
              className={`relative p-1 rounded transition-colors ${
                alertsEnabled
                  ? "text-green-400 hover:bg-green-400/10"
                  : "text-gray-500 hover:bg-white/10"
              }`}
              title={
                alertsEnabled ? "Pass alerts enabled" : "Enable pass alerts"
              }
              aria-label={
                alertsEnabled ? "Pass alerts enabled" : "Enable pass alerts"
              }
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {alertsEnabled && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
            </button>
          )}

          {/* Import Custom TLE */}
          <button
            onClick={() => setShowCustomTLE(true)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Import custom TLE"
            aria-label="Import custom TLE"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </button>

          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Refresh TLE data"
            aria-label="Refresh satellite data"
          >
            <svg
              className={`w-3.5 h-3.5 text-gray-400 ${isLoading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Loading state */}
        {isLoading && satellites.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <svg
              className="w-4 h-4 mr-2 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading TLE data...
          </div>
        )}

        {/* No data state */}
        {!isLoading && !isAvailable && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm text-center px-4">
            <p>No satellite data available</p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Detail view for selected satellite */}
        {selectedSatellite && (
          <SatelliteDetail
            satellite={selectedSatellite}
            passes={nextPasses}
            onBack={handleBack}
          />
        )}

        {/* Satellite list (when no satellite is selected) */}
        {!selectedSatellite && isAvailable && (
          <div className="flex flex-col h-full">
            {/* Category filter bar */}
            <div className="flex gap-1 mb-2 flex-shrink-0 overflow-x-auto scrollbar-hide">
              {categoryFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setFilterCategory(filter.key)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap ${
                    filterCategory === filter.key
                      ? "bg-white/15 text-white"
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Scrollable satellite list */}
            <div className="flex-1 overflow-y-auto scrollbar-hide -mx-1">
              <div className="flex flex-col gap-0.5 px-1">
                {filteredSatellites.map((sat) => (
                  <SatelliteRow
                    key={sat.noradId}
                    satellite={sat}
                    isSelected={false}
                    onSelect={handleSelect}
                  />
                ))}
              </div>

              {filteredSatellites.length === 0 && (
                <div className="text-center text-gray-500 text-xs py-4">
                  No satellites match filter
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom TLE import dialog */}
      <CustomTLEDialog
        isOpen={showCustomTLE}
        onClose={() => setShowCustomTLE(false)}
      />
    </Card>
  );
}

export default SatellitePanel;

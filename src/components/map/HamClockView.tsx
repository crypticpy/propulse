/**
 * HamClockView — Full-screen map with glass overlay panels
 *
 * Redesigned from fixed sidebars (260px left + 260px right + 48px header)
 * to a full-viewport map with floating glass panels overlaid on the surface.
 *
 * Layout:
 *   header   (36px slim bar)
 *   map      (full remaining viewport)
 *
 * Glass overlays on the map surface:
 *   - DE Station  (top-left, collapsible to callsign pill)
 *   - DX Target   (top-right, collapsible to target pill)
 *   - DX Spot Feed (bottom strip, collapsible to count bar)
 *   - Band Conditions (above DX feed on right, collapsible)
 *   - Space Weather (hidden by default, toggle from header)
 *
 * Escape key or X button returns to normal layout mode.
 */

import { useState, useEffect, useMemo } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import {
  useKIndex,
  useSolarFlux,
  useSunspots,
  useMagnetometer,
} from "@/hooks/useSolarData";
import { useDXCluster } from "@/hooks/useDXCluster";
import { getGreylineStatus } from "@/lib/utils/greyline";
import { getPathMetrics, getPathIllumination } from "@/lib/utils/path";
import {
  getBandConditionsForPath,
  type PathBandCondition,
} from "@/lib/utils/bands";
import { FlatMapView } from "./FlatMapView";
import { DXSpotList } from "@/components/dx/DXSpotList";
import { BandConditionsPanel } from "./BandConditionsPanel";
import { LayersPopover } from "@/components/map/LayersPopover";
import { WatchStatusPill } from "@/components/map/WatchStatusPill";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HamClockViewProps {
  displayTime: Date;
  onLocationClick?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pad a number to two digits */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Format a Date as HH:MM:SS */
function fmtHMS(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** Format a Date as HH:MM in local time */
function fmtLocalHM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Format a Date as HH:MM in UTC */
function fmtUTCHM(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Format latitude/longitude to a compact string */
function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}${ns}  ${Math.abs(lon).toFixed(2)}${ew}`;
}

/** Format distance with thousands separator */
function fmtDistance(km: number): string {
  return km.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " km";
}

/** Format bearing as 3-digit padded string with degree symbol */
function fmtBearing(deg: number): string {
  return Math.round(deg).toString().padStart(3, "0") + "\u00B0";
}

/** Kp index color class */
function kpColor(kp: number): string {
  if (kp > 5) return "bg-alert-red/80 text-white";
  if (kp >= 4) return "bg-caution-amber/80 text-void-black";
  return "bg-signal-green/80 text-void-black";
}

/** Kp index text color */
function kpTextColor(kp: number): string {
  if (kp > 5) return "text-alert-red";
  if (kp >= 4) return "text-caution-amber";
  return "text-signal-green";
}

/** Bz color class for pill */
function bzColor(bz: number): string {
  if (bz < -5) return "bg-alert-red/80 text-white";
  if (bz <= 0) return "bg-caution-amber/80 text-void-black";
  return "bg-signal-green/80 text-void-black";
}

/** Bz text color */
function bzTextColor(bz: number): string {
  if (bz < -5) return "text-alert-red";
  if (bz <= 0) return "text-caution-amber";
  return "text-signal-green";
}

// ---------------------------------------------------------------------------
// Isolated clock component — prevents 1s re-renders of entire HamClockView
// ---------------------------------------------------------------------------

function HamClockTime() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <span className="text-xl font-mono font-bold text-white tracking-wider">
        {fmtHMS(now)} UTC
      </span>
      <span className="text-[11px] text-gray-400 font-mono">
        {fmtLocalHM(now)} Local
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chevron icon (up/down toggle)
// ---------------------------------------------------------------------------

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3 h-3"
    >
      {direction === "up" ? (
        <path
          fillRule="evenodd"
          d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z"
          clipRule="evenodd"
        />
      ) : (
        <path
          fillRule="evenodd"
          d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
          clipRule="evenodd"
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Glass panel wrapper
// ---------------------------------------------------------------------------

const GLASS =
  "bg-black/60 backdrop-blur-md border border-white/20 rounded-lg shadow-xl";

// ---------------------------------------------------------------------------
// Solar condition pills (header bar)
// ---------------------------------------------------------------------------

function SolarPills() {
  const solarFluxQuery = useSolarFlux();
  const kIndexQuery = useKIndex();
  const magnetometerQuery = useMagnetometer();

  const sfi = solarFluxQuery.data?.[solarFluxQuery.data.length - 1]?.flux;
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;

  const bz = useMemo(() => {
    const data = magnetometerQuery.data;
    if (!data) return undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].bz_gsm !== null) return data[i].bz_gsm;
    }
    return undefined;
  }, [magnetometerQuery.data]);

  const pillBase =
    "px-2 py-0.5 rounded text-[11px] font-mono font-medium inline-flex items-center gap-1";

  return (
    <div className="flex items-center gap-1.5">
      {sfi != null && (
        <span className={`${pillBase} bg-white/10 text-gray-200`}>
          <span className="text-gray-500">SFI</span>
          {Math.round(sfi)}
        </span>
      )}
      {kp != null && (
        <span className={`${pillBase} ${kpColor(kp)}`}>
          <span className="opacity-70">Kp</span>
          {kp.toFixed(1)}
        </span>
      )}
      {bz != null && (
        <span className={`${pillBase} ${bzColor(bz)}`}>
          <span className="opacity-70">Bz</span>
          {bz > 0 ? "+" : ""}
          {bz.toFixed(1)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DE Station overlay panel (top-left)
// ---------------------------------------------------------------------------

function DEOverlay({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const station = useUserStore((s) => s.station);
  const location = useActiveLocation();

  const greyline = useMemo(() => {
    if (!location?.lat || !location?.lon) return null;
    return getGreylineStatus(location.lat, location.lon, new Date());
  }, [location?.lat, location?.lon]);

  const callsign = station?.callsign || "NO CALL";
  const grid = station?.grid || "";

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        aria-expanded={false}
        aria-label="Expand DE station panel"
        className={`${GLASS} px-3 py-1.5 text-xs text-white/80 hover:bg-black/70 transition-colors flex items-center gap-1.5 animate-in fade-in duration-150`}
      >
        <span className="text-signal-green font-mono font-bold">
          {callsign}
        </span>
        {grid && <span className="text-white/40 font-mono">{grid}</span>}
        <ChevronIcon direction="down" />
      </button>
    );
  }

  return (
    <div
      className={`${GLASS} p-3 w-56 animate-in fade-in slide-in-from-top-1 duration-200`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          DE Station
        </span>
        <button
          onClick={onToggle}
          aria-expanded={true}
          aria-label="Collapse DE station panel"
          className="text-white/40 hover:text-white transition-colors p-0.5"
        >
          <ChevronIcon direction="up" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Callsign */}
        <div className="font-mono text-lg font-bold text-signal-green leading-tight">
          {callsign}
        </div>

        {/* Grid */}
        {grid && <div className="font-mono text-sm text-gray-300">{grid}</div>}

        {/* Coordinates */}
        {location && (
          <div className="font-mono text-xs text-gray-400">
            {fmtCoord(location.lat, location.lon)}
          </div>
        )}

        {/* Sunrise / Sunset */}
        {greyline && greyline.nextEventType && greyline.nextEventTime && (
          <div className="flex flex-col mt-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">
              {greyline.nextEventType === "sunrise" ? "Sunrise" : "Sunset"}
            </span>
            <span className="font-mono text-sm text-gray-200">
              {fmtUTCHM(greyline.nextEventTime)} z
            </span>
            {greyline.minutesToNextEvent != null && (
              <span className="font-mono text-[10px] text-gray-500">
                in{" "}
                {greyline.minutesToNextEvent < 60
                  ? `${greyline.minutesToNextEvent}m`
                  : `${Math.floor(greyline.minutesToNextEvent / 60)}h ${greyline.minutesToNextEvent % 60}m`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DX Target overlay panel (top-right)
// ---------------------------------------------------------------------------

function DXOverlay({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const target = useMapStore((s) => s.target);
  const location = useActiveLocation();

  const metrics = useMemo(() => {
    if (!target || !location) return null;
    return getPathMetrics(location.lat, location.lon, target.lat, target.lon);
  }, [target, location]);

  const greyline = useMemo(() => {
    if (!target) return null;
    return getGreylineStatus(target.lat, target.lon, new Date());
  }, [target]);

  const targetLabel = target
    ? target.name || fmtCoord(target.lat, target.lon)
    : "No DX";

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        aria-expanded={false}
        aria-label="Expand DX target panel"
        className={`${GLASS} px-3 py-1.5 text-xs text-white/80 hover:bg-black/70 transition-colors flex items-center gap-1.5 animate-in fade-in duration-150`}
      >
        <span className="text-plasma-orange font-mono font-bold truncate max-w-[140px]">
          {targetLabel}
        </span>
        {metrics && (
          <span className="ml-0.5 text-white/40 text-[10px] font-mono">
            {fmtDistance(metrics.shortPath.distance)}
          </span>
        )}
        <ChevronIcon direction="down" />
      </button>
    );
  }

  return (
    <div
      className={`${GLASS} p-3 w-56 animate-in fade-in slide-in-from-top-1 duration-200`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          DX Target
        </span>
        <button
          onClick={onToggle}
          aria-expanded={true}
          aria-label="Collapse DX target panel"
          className="text-white/40 hover:text-white transition-colors p-0.5"
        >
          <ChevronIcon direction="up" />
        </button>
      </div>

      {target ? (
        <div className="flex flex-col gap-1.5">
          {/* Name / Callsign */}
          <div className="font-mono text-lg font-bold text-plasma-orange leading-tight truncate">
            {target.name || fmtCoord(target.lat, target.lon)}
          </div>

          {/* Grid */}
          {target.grid && (
            <div className="font-mono text-sm text-gray-300">{target.grid}</div>
          )}

          {/* Coordinates */}
          <div className="font-mono text-xs text-gray-400">
            {fmtCoord(target.lat, target.lon)}
          </div>

          {/* Bearing + Distance */}
          {metrics && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Bearing
                </span>
                <span className="font-mono text-sm text-gray-200">
                  {fmtBearing(metrics.shortPath.bearing)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Distance
                </span>
                <span className="font-mono text-sm text-gray-200">
                  {fmtDistance(metrics.shortPath.distance)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Long Path
                </span>
                <span className="font-mono text-xs text-gray-400">
                  {fmtBearing(metrics.longPath.bearing)} /{" "}
                  {fmtDistance(metrics.longPath.distance)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Hops
                </span>
                <span className="font-mono text-sm text-gray-200">
                  ~{metrics.hops}F
                </span>
              </div>
            </div>
          )}

          {/* DX Sunrise / Sunset */}
          {greyline && greyline.nextEventType && greyline.nextEventTime && (
            <div className="flex flex-col mt-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                DX {greyline.nextEventType === "sunrise" ? "Sunrise" : "Sunset"}
              </span>
              <span className="font-mono text-sm text-gray-200">
                {fmtUTCHM(greyline.nextEventTime)} z
              </span>
              {greyline.minutesToNextEvent != null && (
                <span className="font-mono text-[10px] text-gray-500">
                  in{" "}
                  {greyline.minutesToNextEvent < 60
                    ? `${greyline.minutesToNextEvent}m`
                    : `${Math.floor(greyline.minutesToNextEvent / 60)}h ${greyline.minutesToNextEvent % 60}m`}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">
          Click map to select DX
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space Weather overlay panel (toggled from header)
// ---------------------------------------------------------------------------

function SpaceWeatherOverlay({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const solarFluxQuery = useSolarFlux();
  const sunspotsQuery = useSunspots();
  const kIndexQuery = useKIndex();
  const magnetometerQuery = useMagnetometer();

  const sfi = solarFluxQuery.data?.[solarFluxQuery.data.length - 1]?.flux;
  const ssn = sunspotsQuery.data?.[sunspotsQuery.data.length - 1]?.ssn;
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;

  const bz = useMemo(() => {
    const data = magnetometerQuery.data;
    if (!data) return undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].bz_gsm !== null) return data[i].bz_gsm;
    }
    return undefined;
  }, [magnetometerQuery.data]);

  const rows: { label: string; value: string; colorClass: string }[] = [];

  if (sfi != null) {
    rows.push({
      label: "SFI",
      value: Math.round(sfi).toString(),
      colorClass:
        sfi >= 150
          ? "text-signal-green"
          : sfi >= 100
            ? "text-gray-200"
            : "text-caution-amber",
    });
  }
  if (ssn != null) {
    rows.push({
      label: "SSN",
      value: Math.round(ssn).toString(),
      colorClass:
        ssn >= 100
          ? "text-signal-green"
          : ssn >= 50
            ? "text-gray-200"
            : "text-caution-amber",
    });
  }
  if (kp != null) {
    rows.push({
      label: "Kp",
      value: kp.toFixed(1),
      colorClass: kpTextColor(kp),
    });
  }
  if (bz != null) {
    const arrow = bz > 0 ? "\u2191" : bz < 0 ? "\u2193" : "\u2194";
    rows.push({
      label: "Bz",
      value: `${bz > 0 ? "+" : ""}${bz.toFixed(1)} ${arrow}`,
      colorClass: bzTextColor(bz),
    });
  }

  const isLoading =
    solarFluxQuery.isLoading ||
    sunspotsQuery.isLoading ||
    kIndexQuery.isLoading ||
    magnetometerQuery.isLoading;

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        aria-expanded={false}
        aria-label="Expand space weather panel"
        className={`${GLASS} px-3 py-1.5 text-xs text-white/80 hover:bg-black/70 transition-colors flex items-center gap-1.5 animate-in fade-in duration-150`}
      >
        <span className="text-white/60">Space Wx</span>
        {sfi != null && (
          <span className="font-mono text-white/50">{Math.round(sfi)}</span>
        )}
        <ChevronIcon direction="down" />
      </button>
    );
  }

  return (
    <div
      className={`${GLASS} p-3 w-56 animate-in fade-in slide-in-from-top-1 duration-200`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          Space Weather
        </span>
        <button
          onClick={onToggle}
          aria-expanded={true}
          aria-label="Collapse space weather panel"
          className="text-white/40 hover:text-white transition-colors p-0.5"
        >
          <ChevronIcon direction="up" />
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs text-gray-500 font-mono">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-gray-500 font-mono">No data</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="text-[10px] text-gray-500 uppercase tracking-wide font-mono">
                {row.label}
              </span>
              <span className={`font-mono text-sm font-bold ${row.colorClass}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function HamClockView({
  displayTime,
  onLocationClick,
}: HamClockViewProps) {
  // ---------- Store data ----------
  const station = useUserStore((s) => s.station);

  // ---------- DX spot count for collapsed pill ----------
  const { allSpots } = useDXCluster();
  const spotCount = allSpots?.length ?? 0;

  // ---------- Band condition summary for collapsed pill dots ----------
  const target = useMapStore((s) => s.target);
  const location = useActiveLocation();
  const kIndexData = useKIndex().data;
  const solarFluxData = useSolarFlux().data;

  const bandStatusDots = useMemo((): { band: string; color: string }[] => {
    if (!station || !target || !location) return [];
    const kp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? 3;
    const sfi = solarFluxData?.[solarFluxData.length - 1]?.flux ?? 100;
    const illum = getPathIllumination(
      location.lat,
      location.lon,
      target.lat,
      target.lon,
      new Date(),
    );
    const conditions = getBandConditionsForPath(
      location.lat,
      location.lon,
      target.lat,
      target.lon,
      kp,
      sfi,
      illum,
    );
    // Pick up to 5 representative bands with colored dots
    const statusColorMap: Record<PathBandCondition["status"], string> = {
      excellent: "bg-signal-green",
      good: "bg-signal-green",
      fair: "bg-caution-amber",
      poor: "bg-alert-red",
      closed: "bg-gray-600",
    };
    return conditions.slice(0, 5).map((c) => ({
      band: c.band,
      color: statusColorMap[c.status],
    }));
  }, [station, target, location, kIndexData, solarFluxData]);

  // ---------- Panel collapse states ----------
  const [deCollapsed, setDeCollapsed] = useState(false);
  const [dxCollapsed, setDxCollapsed] = useState(false);
  const [spotsCollapsed, setSpotsCollapsed] = useState(false);
  const [bandsCollapsed, setBandsCollapsed] = useState(false);
  const [spaceWxVisible, setSpaceWxVisible] = useState(false);

  // ---------- Escape key ----------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useMapStore.getState().setLayoutMode("normal");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ---------- FlatMapView click adapter ----------
  const handleMapClick = useMemo(() => {
    if (!onLocationClick) return undefined;
    return (lat: number, lon: number) => {
      onLocationClick(lat, lon, { x: 0, y: 0 });
    };
  }, [onLocationClick]);

  // ---------- Render ----------
  return (
    <div
      className="fixed inset-0 z-[200] bg-void-black text-white select-none"
      style={{
        display: "grid",
        gridTemplateAreas: `"header" "map"`,
        gridTemplateRows: "36px 1fr",
        gridTemplateColumns: "1fr",
      }}
    >
      {/* ================================================================= */}
      {/* HEADER BAR (36px)                                                 */}
      {/* ================================================================= */}
      <header
        className="flex items-center justify-between px-3 border-b border-white/10"
        style={{ gridArea: "header" }}
      >
        {/* Left: Station callsign + grid */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-bold text-signal-green truncate">
            {station?.callsign || "NO CALL"}
          </span>
          {station?.grid && (
            <span className="font-mono text-xs text-gray-400">
              {station.grid}
            </span>
          )}
        </div>

        {/* Center: UTC clock + local (isolated to prevent full-tree 1s re-renders) */}
        <div className="flex items-center gap-2 leading-tight">
          <HamClockTime />
        </div>

        {/* Right: Solar pills + Space Wx toggle + Layers + exit */}
        <div className="flex items-center gap-2">
          <SolarPills />

          {/* Space Weather toggle */}
          <button
            onClick={() => setSpaceWxVisible((v) => !v)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              spaceWxVisible
                ? "bg-white/15 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title="Toggle Space Weather panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5 inline-block mr-0.5"
            >
              <path d="M8 1a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-1.5 0v-.5A.75.75 0 0 1 8 1ZM10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM12.95 4.11a.75.75 0 1 0-1.06-1.06l-.354.354a.75.75 0 1 0 1.06 1.06l.354-.354ZM14 8a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1 0-1.5h.5A.75.75 0 0 1 14 8ZM12.596 11.89a.75.75 0 0 0-1.06-1.06l-.354.353a.75.75 0 1 0 1.06 1.061l.354-.354ZM8 14a.75.75 0 0 1-.75-.75v-.5a.75.75 0 0 1 1.5 0v.5A.75.75 0 0 1 8 14ZM4.11 12.95a.75.75 0 0 0 1.06-1.06l-.354-.354a.75.75 0 1 0-1.06 1.06l.354.354ZM2 8a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 2 8ZM4.464 4.11a.75.75 0 0 0 1.06-1.06l-.354-.354a.75.75 0 1 0-1.06 1.06l.354.354Z" />
            </svg>
            Wx
          </button>

          <LayersPopover />

          <WatchStatusPill className="hidden sm:flex" />

          <button
            onClick={() => useMapStore.getState().setLayoutMode("normal")}
            className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            aria-label="Exit HamClock view"
            title="Exit (Esc)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ================================================================= */}
      {/* FULL-SCREEN MAP                                                   */}
      {/* ================================================================= */}
      <main
        className="overflow-hidden relative bg-void-black"
        style={{ gridArea: "map" }}
      >
        {/* Map fills full area */}
        <FlatMapView
          displayTime={displayTime}
          onLocationClick={handleMapClick}
        />

        {/* Glass overlay container — pointer-events-none so clicks pass to map */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* ── DE Station (top-left) ── */}
          <div className="absolute top-3 left-3 pointer-events-auto">
            <DEOverlay
              collapsed={deCollapsed}
              onToggle={() => setDeCollapsed((v) => !v)}
            />
          </div>

          {/* ── DX Target (top-right) ── */}
          <div className="absolute top-3 right-3 pointer-events-auto">
            <DXOverlay
              collapsed={dxCollapsed}
              onToggle={() => setDxCollapsed((v) => !v)}
            />
          </div>

          {/* ── Space Weather (below DX Target, hidden by default) ── */}
          {spaceWxVisible && (
            <div className="absolute top-3 right-[15.5rem] pointer-events-auto">
              <SpaceWeatherOverlay
                collapsed={false}
                onToggle={() => setSpaceWxVisible(false)}
              />
            </div>
          )}

          {/* ── Band Conditions (above DX feed, right side) ── */}
          <div
            className="absolute right-3 pointer-events-auto"
            style={{ bottom: spotsCollapsed ? "2.75rem" : "11.5rem" }}
          >
            {bandsCollapsed ? (
              <button
                onClick={() => setBandsCollapsed(false)}
                aria-expanded={false}
                aria-label="Expand band conditions panel"
                className={`${GLASS} px-3 py-1.5 text-xs text-white/80 hover:bg-black/70 transition-colors flex items-center gap-1.5 animate-in fade-in duration-150`}
              >
                <span className="text-white/60 text-[10px]">Bands</span>
                {bandStatusDots.length > 0 && (
                  <div className="flex items-center gap-0.5 ml-0.5">
                    {bandStatusDots.map((dot) => (
                      <span
                        key={dot.band}
                        className={`w-1.5 h-1.5 rounded-full ${dot.color}`}
                        title={dot.band}
                      />
                    ))}
                  </div>
                )}
                <ChevronIcon direction="down" />
              </button>
            ) : (
              <div
                className={`${GLASS} w-56 max-h-64 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-200`}
              >
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Band Conditions
                  </span>
                  <button
                    onClick={() => setBandsCollapsed(true)}
                    aria-expanded={true}
                    aria-label="Collapse band conditions panel"
                    className="text-white/40 hover:text-white transition-colors p-0.5"
                  >
                    <ChevronIcon direction="up" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <BandConditionsPanel
                    displayTime={displayTime}
                    compact
                    collapsed={false}
                    className="!bg-transparent !border-0 !rounded-none !shadow-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── DX Spot Feed (bottom strip) ── */}
          <div className="absolute bottom-3 left-3 right-3 pointer-events-auto">
            {spotsCollapsed ? (
              <button
                onClick={() => setSpotsCollapsed(false)}
                aria-expanded={false}
                aria-label="Expand DX spots feed"
                className={`${GLASS} px-3 py-1.5 text-xs text-white/80 hover:bg-black/70 transition-colors flex items-center gap-1.5 w-full justify-between animate-in fade-in duration-150`}
              >
                <span className="flex items-center gap-1.5">
                  {spotCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
                  )}
                  <span className="text-white/60">DX Spots</span>
                  <span className="font-mono text-white/40">({spotCount})</span>
                </span>
                <ChevronIcon direction="up" />
              </button>
            ) : (
              <div
                className={`${GLASS} overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-200`}
                style={{ height: 160 }}
              >
                <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    DX Spots
                    <span className="ml-1.5 font-mono text-white/30">
                      ({spotCount})
                    </span>
                  </span>
                  <button
                    onClick={() => setSpotsCollapsed(true)}
                    aria-expanded={true}
                    aria-label="Collapse DX spots feed"
                    className="text-white/40 hover:text-white transition-colors p-0.5"
                  >
                    <ChevronIcon direction="down" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <DXSpotList
                    showFilters={false}
                    showHeader={false}
                    maxHeight="100%"
                    className="!bg-transparent !border-0 !rounded-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default HamClockView;

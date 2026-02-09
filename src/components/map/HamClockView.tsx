/**
 * HamClockView — OpenHamClock-inspired dense information dashboard
 *
 * Full-screen fixed overlay with a flat map in the center and data panels
 * on the left and right sidebars. Dense, monospaced, utilitarian aesthetic
 * reminiscent of a real ham radio station dashboard.
 *
 * Layout:
 *   header  header  header
 *   left    map     right
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
import { getGreylineStatus } from "@/lib/utils/greyline";
import { getPathMetrics } from "@/lib/utils/path";
import { FlatMapView } from "./FlatMapView";
import { DXSpotList } from "@/components/dx/DXSpotList";
import { BandConditionsPanel } from "./BandConditionsPanel";

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
// Section header component
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-gray-500 px-3 py-2 border-b border-white/10 select-none">
      {label}
    </div>
  );
}

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
    "px-2 py-0.5 rounded text-xs font-mono font-medium inline-flex items-center gap-1";

  return (
    <div className="flex items-center gap-2">
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
// DE Station Panel (left sidebar, top)
// ---------------------------------------------------------------------------

function DEPanel() {
  const station = useUserStore((s) => s.station);
  const location = useActiveLocation();

  const greyline = useMemo(() => {
    if (!location?.lat || !location?.lon) return null;
    return getGreylineStatus(location.lat, location.lon, new Date());
  }, [location?.lat, location?.lon]);

  return (
    <div className="p-3 flex flex-col gap-2" style={{ minHeight: 160 }}>
      <SectionHeader label="DE Station" />

      <div className="px-1 flex flex-col gap-1.5 mt-1">
        {/* Callsign */}
        <div className="font-mono text-lg font-bold text-signal-green leading-tight">
          {station?.callsign || "NO CALL"}
        </div>

        {/* Grid */}
        {station?.grid && (
          <div className="font-mono text-sm text-gray-300">{station.grid}</div>
        )}

        {/* Coordinates */}
        {location && (
          <div className="font-mono text-xs text-gray-400">
            {fmtCoord(location.lat, location.lon)}
          </div>
        )}

        {/* Sunrise / Sunset */}
        {greyline && (
          <div className="flex gap-3 mt-1">
            {greyline.nextEventType && greyline.nextEventTime && (
              <div className="flex flex-col">
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
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DX Target Panel (right sidebar, top)
// ---------------------------------------------------------------------------

function DXPanel() {
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

  return (
    <div className="p-3 flex flex-col gap-2" style={{ minHeight: 160 }}>
      <SectionHeader label="DX Target" />

      {target ? (
        <div className="px-1 flex flex-col gap-1.5 mt-1">
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
        <div className="px-1 mt-3 text-sm text-gray-500 italic">
          Click map to select DX
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space Weather Panel (right sidebar, bottom)
// ---------------------------------------------------------------------------

function SpaceWeatherPanel() {
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

  return (
    <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
      <SectionHeader label="Space Weather" />

      {isLoading ? (
        <div className="px-1 text-xs text-gray-500 font-mono mt-2">
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div className="px-1 text-xs text-gray-500 font-mono mt-2">No data</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1 mt-1">
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
  // ---------- Clock state ----------
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------- Store data ----------
  const station = useUserStore((s) => s.station);

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
  // FlatMapView's onLocationClick is (lat, lon) — adapt to our extended signature
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
        gridTemplateAreas: `
          "header  header  header"
          "left    map     right"
        `,
        gridTemplateRows: "48px 1fr",
        gridTemplateColumns: "260px 1fr 260px",
      }}
    >
      {/* ================================================================= */}
      {/* HEADER BAR                                                        */}
      {/* ================================================================= */}
      <header
        className="flex items-center justify-between px-4 border-b border-white/10"
        style={{ gridArea: "header" }}
      >
        {/* Left: Station callsign + grid */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-lg font-bold text-signal-green truncate">
            {station?.callsign || "NO CALL"}
          </span>
          {station?.grid && (
            <span className="font-mono text-sm text-gray-400">
              {station.grid}
            </span>
          )}
        </div>

        {/* Center: UTC clock + local */}
        <div className="flex flex-col items-center leading-tight">
          <span className="text-3xl font-mono font-bold text-white tracking-wider">
            {fmtHMS(now)} UTC
          </span>
          <span className="text-xs text-gray-400 font-mono">
            {fmtLocalHM(now)} Local
          </span>
        </div>

        {/* Right: Solar pills + exit */}
        <div className="flex items-center gap-3">
          <SolarPills />

          <button
            onClick={() => useMapStore.getState().setLayoutMode("normal")}
            className="ml-2 p-1.5 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            aria-label="Exit HamClock view"
            title="Exit (Esc)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ================================================================= */}
      {/* LEFT SIDEBAR                                                      */}
      {/* ================================================================= */}
      <aside
        className="flex flex-col border-r border-white/10 overflow-hidden"
        style={{ gridArea: "left" }}
      >
        {/* DE Station info */}
        <DEPanel />

        {/* Separator */}
        <div className="border-t border-white/10" />

        {/* DX Spot Feed */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <SectionHeader label="DX Cluster" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <DXSpotList
              showFilters={false}
              showHeader={false}
              maxHeight="100%"
              className="!bg-transparent !border-0 !rounded-none"
            />
          </div>
        </div>
      </aside>

      {/* ================================================================= */}
      {/* CENTER MAP                                                        */}
      {/* ================================================================= */}
      <main className="overflow-hidden relative" style={{ gridArea: "map" }}>
        <FlatMapView
          displayTime={displayTime}
          onLocationClick={handleMapClick}
        />
      </main>

      {/* ================================================================= */}
      {/* RIGHT SIDEBAR                                                     */}
      {/* ================================================================= */}
      <aside
        className="flex flex-col border-l border-white/10 overflow-hidden"
        style={{ gridArea: "right" }}
      >
        {/* DX Target */}
        <DXPanel />

        {/* Separator */}
        <div className="border-t border-white/10" />

        {/* Band Conditions */}
        <div className="flex flex-col min-h-0" style={{ maxHeight: 280 }}>
          <SectionHeader label="Band Conditions" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <BandConditionsPanel
              displayTime={displayTime}
              compact
              collapsed={false}
              className="!bg-transparent !border-0 !rounded-none"
            />
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-white/10" />

        {/* Space Weather */}
        <SpaceWeatherPanel />
      </aside>
    </div>
  );
}

export default HamClockView;

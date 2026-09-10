/**
 * OperatorProfile Component
 *
 * A compact operator profile card displaying station information including
 * callsign, grid square, sunrise/sunset times at QTH, local time, license class,
 * active radio equipment, and band/mode selector. Designed for the PropSphere
 * view's top row.
 *
 * The operating VFO panel is the hero element — recessed hardware-display
 * aesthetic with breathing glow, hover lift, chevron affordance, and on-hover
 * CTA to make its interactivity unmissable.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveRadio, useUserStore } from "@/stores/userStore";
import { getSunTimes } from "@/lib/utils/time";
import { useLicenseStatus } from "@/hooks/useActiveLocation";
import { QuickLocationControl } from "@/components/location/QuickLocationControl";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { HelpButton, HelpModal } from "@/components/ui/HelpModal";
import { useActiveBandMode } from "@/hooks/useActiveBandMode";
import { BandModeModal } from "@/components/operating/BandModeModal";
import { BAND_COLORS, MODE_COLORS, inkOnFill } from "@/lib/utils/spotColors";
import { useOperatingStore, SOURCE_DISPLAY } from "@/stores/operatingStore";
import { useBandConditionsTint } from "@/hooks/useBandConditionsTint";
import { useSettingsStore } from "@/stores/settingsStore";
import { ALL_BANDS, type BandId } from "@/types/user";

interface OperatorProfileProps {
  className?: string;
}

/**
 * Format time as HH:MM for compact display
 */
function formatCompactTime(date: Date, use24h: boolean = true): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");

  if (use24h) {
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${period}`;
}

/**
 * Format frequency in Hz to display like "14.150.00" for a VFO readout feel
 */
function formatFrequency(hz: number): string {
  const mhz = hz / 1_000_000;
  const str = mhz.toFixed(5);
  const [whole, dec] = str.split(".");
  return `${whole}.${dec.slice(0, 3)}.${dec.slice(3)}`;
}

// ── Status color palette (matches BandModeModal) ─────────────────────────
const STATUS_BAR_COLORS: Record<string, string> = {
  excellent: "#22c55e",
  good: "#eab308",
  fair: "#f97316",
  poor: "#ef4444",
  closed: "#4b5563",
};

// Bar height mapping by status — taller = better propagation
const STATUS_BAR_HEIGHT: Record<string, number> = {
  excellent: 18,
  good: 14,
  fair: 10,
  poor: 7,
  closed: 4,
};

/**
 * BandConditionsStrip — Compact propagation equalizer visualization.
 *
 * Shows all bands as slim vertical bars whose height + color encode
 * real-time propagation quality. Active band pulses with its identity
 * color. Clicking a bar selects that band instantly.
 */
function BandConditionsStrip({
  activeBand,
  onBandSelect,
  contestLocked,
}: {
  activeBand: BandId;
  onBandSelect: (band: BandId) => void;
  contestLocked: boolean;
}) {
  const { statuses } = useBandConditionsTint();
  const hiddenBands = useSettingsStore((s) => s.favoredBands?.hidden ?? []);
  const radioBands = useActiveRadio()?.bands ?? null;
  const [hoveredBand, setHoveredBand] = useState<BandId | null>(null);

  // Filter to only supported bands (when radio configured)
  const visibleBands = radioBands
    ? ALL_BANDS.filter((b) => radioBands.includes(b))
    : ALL_BANDS;

  const hoveredStatus = hoveredBand ? (statuses[hoveredBand] ?? null) : null;
  const hoveredColor = hoveredBand
    ? (STATUS_BAR_COLORS[hoveredStatus ?? "closed"] ?? STATUS_BAR_COLORS.closed)
    : null;

  return (
    <div className="relative mb-1.5">
      {/* Instant tooltip — floats above the strip */}
      {hoveredBand && (
        <div className="absolute bottom-full mb-1 left-0 right-0 flex justify-center pointer-events-none z-20">
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium max-w-full flex-wrap justify-center text-center"
            style={{
              backgroundColor: "rgba(0,0,0,0.85)",
              border: `1px solid ${hoveredColor}40`,
              boxShadow: `0 0 8px ${hoveredColor}20`,
            }}
          >
            <span
              className="font-bold font-mono"
              style={{ color: BAND_COLORS[hoveredBand] ?? BAND_COLORS.default }}
            >
              {hoveredBand}
            </span>
            <span className="text-su-muted">&middot;</span>
            <span style={{ color: hoveredColor ?? "#6b7280" }}>
              {hoveredStatus
                ? hoveredStatus.charAt(0).toUpperCase() + hoveredStatus.slice(1)
                : "No data"}
            </span>
            {hoveredBand === activeBand && (
              <span className="text-xs text-su-muted ml-0.5">active</span>
            )}
          </div>
        </div>
      )}

      {/* Bar strip */}
      <div
        className="flex items-end justify-between h-[22px] px-2"
        role="group"
        aria-label="Band conditions — click any bar to switch bands"
        onMouseLeave={() => setHoveredBand(null)}
      >
        {visibleBands.map((band) => {
          const isActive = band === activeBand;
          const isHidden = hiddenBands.includes(band);
          const status = statuses[band] ?? null;
          const barColor = isActive
            ? (BAND_COLORS[band] ?? BAND_COLORS.default)
            : (STATUS_BAR_COLORS[status ?? "closed"] ??
              STATUS_BAR_COLORS.closed);
          const barHeight = isActive
            ? 20
            : (STATUS_BAR_HEIGHT[status ?? "closed"] ?? 4);

          return (
            <button
              key={band}
              onClick={() => {
                if (!contestLocked) onBandSelect(band);
              }}
              onMouseEnter={() => setHoveredBand(band)}
              className={`
                relative rounded-sm transition-all duration-500 ease-out
                ${contestLocked ? "cursor-not-allowed" : "cursor-pointer hover:scale-y-[1.15] hover:brightness-130"}
                ${isHidden ? "opacity-30" : ""}
              `}
              style={{
                width: isActive ? 8 : 5,
                height: barHeight,
                backgroundColor: barColor,
                transformOrigin: "bottom",
                boxShadow: isActive
                  ? `0 0 8px ${barColor}90, 0 -2px 6px ${barColor}40`
                  : `0 0 2px ${barColor}20`,
                animation: isActive
                  ? "eqPulse 2s ease-in-out infinite"
                  : "none",
              }}
              aria-label={`${band}: ${status ?? "no data"}${isActive ? ", active band" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export function OperatorProfile({ className = "" }: OperatorProfileProps) {
  const { use24h } = useTimeFormat();
  const [showHelp, setShowHelp] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const station = useUserStore((state) => state.station);
  const preferences = useUserStore((state) => state.preferences);
  const activeRadio = useActiveRadio();

  // Location and license hooks
  const licenseStatus = useLicenseStatus();

  // Band/mode state
  const { activeBand, activeMode, activeSource, activeFrequency } =
    useActiveBandMode();
  const catOverridden = useOperatingStore((s) => s.catOverridden);
  const catConnected = useOperatingStore((s) => s._catConnected);
  const bandSessionStart = useOperatingStore((s) => s.bandSessionStart);
  const bandModeHistory = useOperatingStore((s) => s.bandModeHistory);
  const contestLocked = useOperatingStore((s) => s.contestLocked);
  const watchedBands = useOperatingStore((s) => s.watchedBands);
  const subBandSegment = useOperatingStore((s) => s.subBandSegment);

  // ── Band change flash animation ──────────────────────────────────────────
  const prevBandRef = useRef<BandId>(activeBand);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    if (activeBand !== prevBandRef.current) {
      prevBandRef.current = activeBand;
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 300);
      return () => clearTimeout(timer);
    }
  }, [activeBand]);

  // ── Session elapsed timer ────────────────────────────────────────────────
  const [sessionElapsed, setSessionElapsed] = useState<string | null>(null);

  useEffect(() => {
    if (bandSessionStart == null) {
      setSessionElapsed(null);
      return;
    }

    function computeElapsed() {
      const mins = Math.floor((Date.now() - bandSessionStart!) / 60_000);
      if (mins < 60) {
        setSessionElapsed(`${mins}m`);
      } else {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        setSessionElapsed(`${h}h ${m}m`);
      }
    }

    computeElapsed();
    const interval = setInterval(computeElapsed, 60_000);
    return () => clearInterval(interval);
  }, [bandSessionStart]);

  const stationConfigured = station !== null;
  const operatorCallsign = station?.callsign?.trim() || null;
  const operatorGrid = station?.grid?.trim() || null;
  const operatorLat = station?.lat ?? null;
  const operatorLon = station?.lon ?? null;
  const licenseClass = preferences.licenseClass ?? "GENERAL";

  // Calculate sunrise/sunset times at operator's QTH
  const sunTimes = useMemo(() => {
    if (operatorLat === null || operatorLon === null) {
      return { sunrise: null, sunset: null };
    }
    return getSunTimes(operatorLat, operatorLon, new Date());
  }, [operatorLat, operatorLon]);

  // Determine polar condition label
  const getPolarLabel = (): string | null => {
    if (operatorLat === null) {
      return null;
    }
    const month = new Date().getMonth();
    const isNorthernHemisphere = operatorLat > 0;
    const isSummerNorth = month >= 3 && month <= 8;
    const isSummer = isNorthernHemisphere ? isSummerNorth : !isSummerNorth;
    return isSummer ? "Midnight Sun" : "Polar Night";
  };

  const operatorStatus =
    stationConfigured && operatorGrid ? "ready" : "incomplete";

  const bandColor = BAND_COLORS[activeBand] ?? BAND_COLORS.default;
  const modeColor = MODE_COLORS[activeMode] ?? MODE_COLORS.default;
  const sourceInfo = SOURCE_DISPLAY[activeSource];
  const sourceLabel = sourceInfo?.label ?? null;
  const sourceStyles = sourceInfo?.badge ?? "";

  // Derived hover/flash states for VFO panel
  const isLifted = isHovered && !contestLocked && !isFlashing;

  // Empty state
  if (!stationConfigured) {
    return (
      <div
        className={`h-full flex flex-col justify-center items-center gap-2 ${className}`}
      >
        <div className="w-3 h-3 rounded-full bg-su-line" />
        <span className="text-sm text-su-muted">No station configured</span>
        <span className="text-xs text-su-muted">Set your QTH in Settings</span>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header: Title + Help button */}
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-medium text-su-muted uppercase tracking-wide">
          Operator Profile
        </h3>
        <HelpButton onClick={() => setShowHelp(true)} />
      </div>

      {/* Callsign - prominent display */}
      <div className="flex items-center gap-2 mb-2">
        <div
          role="status"
          aria-label={
            operatorStatus === "ready"
              ? "Station configured"
              : "Station incomplete"
          }
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            operatorStatus === "ready"
              ? "bg-signal-green animate-pulse"
              : "bg-su-line"
          }`}
        />
        <div className="text-xl font-bold font-mono text-su-text leading-none">
          {operatorCallsign ?? "---"}
        </div>
      </div>

      {/* Grid + License row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
        {/* Location type indicator + Grid */}
        <QuickLocationControl variant="profile" />

        {/* License badge */}
        <div className="flex items-center gap-1.5">
          {!licenseStatus.isValid && (
            <span
              className="text-red-400 text-xs font-bold"
              title="License expired"
            >
              EXPIRED
            </span>
          )}
          {licenseStatus.isValid && licenseStatus.isExpiringSoon && (
            <span
              className="text-amber-400 text-xs"
              title={`License expires in ${licenseStatus.daysUntilExpiration} days`}
            >
              {licenseStatus.daysUntilExpiration}d
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 text-xs font-medium rounded ${
              !licenseStatus.isValid
                ? "bg-red-500/20 text-red-400"
                : licenseStatus.isExpiringSoon
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-su-line/20 text-su-muted"
            }`}
          >
            {licenseClass}
          </span>
        </div>
      </div>

      {/* Compact sun times - single inline row */}
      {operatorLat !== null && operatorLon !== null && (
        <div className="flex items-center gap-1 text-xs text-su-muted mb-2">
          <span
            className="flex items-center gap-0.5"
            title={
              sunTimes.sunrise
                ? `Sunrise at QTH: ${formatCompactTime(sunTimes.sunrise, use24h)} UTC`
                : "No sunrise today"
            }
          >
            <svg
              className="w-3 h-3 text-amber-400"
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="6" cy="7" r="2.5" />
              <path
                d="M6 2v1.5M9.5 4.5L8.4 5.6M10 7H8.5M3.5 4.5L4.6 5.6M2 7h1.5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <svg
              className="w-2.5 h-2.5 text-amber-400"
              viewBox="0 0 8 8"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 1L2 4h4L4 1z" />
            </svg>
            <span className="font-mono text-amber-400">
              {sunTimes.sunrise
                ? formatCompactTime(sunTimes.sunrise, use24h)
                : (getPolarLabel() ?? "--:--")}
            </span>
          </span>
          <span className="text-su-muted mx-0.5">&middot;</span>
          <span
            className="flex items-center gap-0.5"
            title={
              sunTimes.sunset
                ? `Sunset at QTH: ${formatCompactTime(sunTimes.sunset, use24h)} UTC`
                : "No sunset today"
            }
          >
            <svg
              className="w-3 h-3 text-orange-400"
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="6" cy="5" r="2.5" />
              <path
                d="M6 9v1.5M9.5 7.5L8.4 6.4M10 5H8.5M3.5 7.5L4.6 6.4M2 5h1.5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                fill="none"
                opacity="0.6"
              />
            </svg>
            <svg
              className="w-2.5 h-2.5 text-orange-400"
              viewBox="0 0 8 8"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 7L2 4h4L4 7z" />
            </svg>
            <span className="font-mono text-orange-400">
              {sunTimes.sunset
                ? formatCompactTime(sunTimes.sunset, use24h)
                : (getPolarLabel() ?? "--:--")}
            </span>
          </span>
        </div>
      )}

      {/* ── Active Band section label ──────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-[3px] h-3 rounded-full bg-plasma-orange" />
        <span className="text-xs font-semibold text-su-muted uppercase tracking-widest">
          Active Band
        </span>
        {activeSource === "default" && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-plasma-orange animate-pulse"
            title="No band selected yet"
          />
        )}
      </div>

      {/* ── Start Here CTA — shown only when no selection has ever been made */}
      {activeSource === "default" && bandModeHistory.length === 0 && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full rounded-lg bg-plasma-orange/10 border border-plasma-orange/30 px-3 py-2.5 mb-2 text-left animate-pulse cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-plasma-orange flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              />
            </svg>
            <div>
              <div className="text-sm font-medium text-plasma-orange">
                Start here &mdash; set your operating band
              </div>
              <div className="text-xs text-su-muted mt-0.5">
                This controls what propagation data you see
              </div>
            </div>
          </div>
        </button>
      )}

      {/* ── VFO Panel — Interactive Operating Console ──────────────── */}
      <button
        onClick={() => {
          if (!contestLocked) setIsModalOpen(true);
        }}
        onMouseEnter={() => !contestLocked && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          relative w-full rounded-xl overflow-hidden text-left group mb-1.5
          ${contestLocked ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}
        `}
        style={{
          background: `linear-gradient(145deg, ${bandColor}${isLifted ? "18" : "10"} 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.55) 100%)`,
          border: `1px solid ${bandColor}${isFlashing ? "60" : isLifted ? "50" : "25"}`,
          boxShadow: isFlashing
            ? `inset 0 1px 4px rgba(0,0,0,0.3), 0 0 30px ${bandColor}20`
            : isLifted
              ? `inset 0 2px 6px rgba(0,0,0,0.3), 0 0 30px ${bandColor}15, 0 6px 24px rgba(0,0,0,0.25)`
              : `inset 0 2px 8px rgba(0,0,0,0.4), 0 0 12px ${bandColor}06`,
          transform: isFlashing
            ? "scale(1.015)"
            : isLifted
              ? "translateY(-2px)"
              : "none",
          transition: "all 0.3s ease-out",
        }}
        aria-label={
          contestLocked
            ? `Active band ${activeBand}, mode ${activeMode}. Locked for contest.`
            : `Active band ${activeBand}, mode ${activeMode}. Click to change.`
        }
        aria-disabled={contestLocked}
      >
        {/* Thick left accent bar — band color identity */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
          style={{
            background: `linear-gradient(180deg, ${bandColor} 0%, ${bandColor}50 100%)`,
          }}
        />

        {/* Expand chevron — top right affordance */}
        {!contestLocked && (
          <div
            className="absolute top-3 right-3 transition-all duration-300"
            style={{
              color: isHovered
                ? "rgba(255,255,255,0.8)"
                : "rgba(255,255,255,0.15)",
              transform: isHovered ? "translateY(1px)" : "none",
            }}
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
                strokeWidth={2.5}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        )}

        {/* Contest lock icon — top right */}
        {contestLocked && (
          <div className="absolute top-3 right-3">
            <svg
              className="w-3.5 h-3.5 text-amber-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}

        {/* Pulsing glow ring — draws attention at rest */}
        {!contestLocked && (
          <div
            className="absolute inset-[-1px] rounded-xl pointer-events-none animate-live-pulse"
            style={{
              boxShadow: `0 0 10px ${bandColor}10, 0 0 20px ${bandColor}05`,
            }}
          />
        )}

        <div className="relative pl-4 pr-8 py-3">
          {/*
            Primary row: Pulse dot + Band (large) + Mode badge + Source.
            This button sits in the Operator Profile's normal fixed-width
            column and clips overflow (see the wrapping button above). At
            the xl scale a band such as "160m" plus a mode badge such as
            "CONTEST" plus a source badge can no longer share this line in
            that column. `flex-wrap` lets the source badge (pushed right by
            `ml-auto` while everything fits) drop to its own line instead
            of being clipped by the button's overflow-hidden.
          */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
              style={{ backgroundColor: bandColor }}
            />
            <span
              className="text-xl font-black font-mono leading-none tracking-tight"
              style={{ color: bandColor }}
            >
              {activeBand}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-md text-xs font-bold border"
              style={{
                backgroundColor: modeColor,
                color: inkOnFill(modeColor),
                borderColor: `${modeColor}55`,
              }}
            >
              {activeMode}
            </span>

            {/* Source badge */}
            {sourceLabel && (
              <span
                className={`ml-auto mr-4 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${sourceStyles}`}
              >
                {sourceLabel}
              </span>
            )}
          </div>

          {/*
            Secondary row: Frequency + Segment + Session.
            Same fixed-width overflow-hidden column and clip risk as the
            primary row above. The frequency ("14.074.00") and segment
            ("Digital/FM") strings have no internal wrap points, so at the
            xl scale they can outgrow the column with nothing to give.
            `flex-wrap` lets the session timer (pushed right by `ml-auto`)
            drop to its own line instead of being clipped.
          */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1.5 text-xs font-mono text-su-muted">
            {(activeSource === "cat" || activeSource === "wsjtx") &&
              activeFrequency > 0 && (
                <span className="text-su-muted tracking-wider">
                  {formatFrequency(activeFrequency)}
                </span>
              )}
            {subBandSegment && (
              <>
                {(activeSource === "cat" || activeSource === "wsjtx") &&
                  activeFrequency > 0 && (
                    <span className="text-su-muted">&middot;</span>
                  )}
                <span>{subBandSegment}</span>
              </>
            )}
            {sessionElapsed != null && (
              <span className="ml-auto text-su-muted tabular-nums">
                {sessionElapsed}
              </span>
            )}
          </div>

          {/*
            Tertiary row: Radio info (integrated into VFO panel).
            Same fixed-width overflow-hidden column as the rows above. The
            manufacturer/model string has no internal wrap points, so at the
            xl scale it can outgrow the column alongside the power reading.
            `flex-wrap` + `min-w-0` let the label wrap or drop to its own
            line, and `break-words` stops a single long model name from
            forcing the row wider than the column.
          */}
          {activeRadio && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1.5 text-xs text-su-muted min-w-0">
              <svg
                className="w-3 h-3 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <polyline points="17 2 12 7 7 2" />
              </svg>
              <span className="min-w-0 break-words">
                {activeRadio.manufacturer} {activeRadio.model}
              </span>
              <span className="font-mono" style={{ color: `${bandColor}90` }}>
                {activeRadio.maxPower}W
              </span>
            </div>
          )}

          {/* Watched bands strip */}
          {watchedBands.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1.5">
              <span className="text-xs text-su-muted uppercase tracking-wider">
                Watch
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {watchedBands.map((band) => (
                  <span
                    key={band}
                    className="w-2 h-1 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: BAND_COLORS[band] ?? BAND_COLORS.default,
                    }}
                    title={band}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CAT override hint — visible on hover */}
        {!contestLocked && catOverridden && catConnected && (
          <div
            className="px-4 pb-2 -mt-1 text-xs transition-colors duration-300"
            style={{
              color: isHovered ? "#22c55e" : "rgba(255,255,255,0.2)",
            }}
          >
            &#8617; Resume CAT follow
          </div>
        )}

        {/* Hover CTA — for manual/default source, fades in on hover */}
        {!contestLocked &&
          !catOverridden &&
          (activeSource === "manual" || activeSource === "default") && (
            <div
              className="px-4 pb-2 -mt-1 text-xs text-su-muted transition-opacity duration-300"
              style={{ opacity: isHovered ? 1 : 0 }}
            >
              Click to change band &amp; mode
            </div>
          )}
      </button>

      {/* ── Band Conditions Strip — propagation EQ ────────────────── */}
      <BandConditionsStrip
        activeBand={activeBand}
        onBandSelect={(band) => {
          useOperatingStore.getState().setManualBand(band);
        }}
        contestLocked={contestLocked}
      />

      {/* EQ bar animation keyframes */}
      <style>{`
        @keyframes eqPulse {
          0%, 100% { opacity: 1; transform: scaleY(1); }
          50% { opacity: 0.8; transform: scaleY(0.88); }
        }
      `}</style>

      {/* Band/Mode selection modal */}
      <BandModeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Operator Profile"
        sections={[
          {
            title: "Overview",
            content:
              "Your station information including callsign, grid square, license class, and active radio.",
          },
          {
            title: "Sun Times",
            content:
              "Sunrise and sunset times at your QTH in UTC. These are key for greyline propagation - the terminator crossing your location creates enhanced propagation windows.",
          },
          {
            title: "Band & Mode",
            content:
              "Shows your active band and mode. Click to change manually, or it follows your radio via CAT/WSJT-X automatically. The colored dot indicates the source: green for CAT, cyan for WSJT-X, amber for contest.",
          },
        ]}
      />
    </div>
  );
}

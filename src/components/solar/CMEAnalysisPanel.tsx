/**
 * CMEAnalysisPanel
 *
 * Compact KPI-style dashboard widget for Coronal Mass Ejection data.
 *
 * Each CME is classified into one of three lifecycle states:
 *   1. EN ROUTE — estimated arrival time is in the future
 *   2. ARRIVED  — estimated arrival was within the last 48h (still affecting conditions)
 *   3. PAST     — arrived >48h ago, no longer relevant (hidden by default)
 *
 * The KPI strip, threat level, and card display all reflect only
 * operationally relevant CMEs (en route + recently arrived).
 */

import React, { useState, useMemo } from "react";
import type { CMEAnalysis } from "@/types/alerts";
import { InfoTip } from "@/components/ui/Tooltip";
import { useCMEAnalysis } from "@/hooks/useSolarExpanded";

// =============================================================================
// TYPES
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CMEAnalysisPanelProps {}

type CMEStatus = "en_route" | "arrived" | "past";

interface ClassifiedCME {
  cme: CMEAnalysis;
  status: CMEStatus;
  /** Estimated travel time from 21.5 Rs to Earth, in hours */
  travelTimeHours: number;
  /** Estimated arrival Date */
  estimatedArrival: Date;
  /** Hours from now until arrival (negative = already arrived) */
  hoursUntilArrival: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Distance from 21.5 solar radii to Earth in km.
 * 1 AU = 149,597,870 km. 21.5 solar radii = 21.5 * 696,000 km ≈ 14,964,000 km.
 * Remaining distance ≈ 134,634,000 km.
 */
const DISTANCE_21_5_TO_EARTH_KM = 1.346e8;

/** How long after arrival a CME is still considered "affecting conditions" */
const ARRIVED_WINDOW_HOURS = 48;

/** Speed thresholds for severity classification */
const SPEED_FAST = 800;
const SPEED_EXTREME = 1200;

// =============================================================================
// HELPERS
// =============================================================================

function speedColor(speed: number): string {
  if (speed > SPEED_EXTREME) return "text-alert-red";
  if (speed > SPEED_FAST) return "text-caution-amber";
  return "text-signal-green";
}

function speedBg(speed: number): string {
  if (speed > SPEED_EXTREME) return "bg-alert-red";
  if (speed > SPEED_FAST) return "bg-caution-amber";
  return "bg-signal-green";
}

function speedBorder(speed: number): string {
  if (speed > SPEED_EXTREME) return "border-alert-red/25";
  if (speed > SPEED_FAST) return "border-caution-amber/25";
  return "border-signal-green/25";
}

/**
 * Classify a CME into its lifecycle state relative to `now`.
 */
function classifyCME(cme: CMEAnalysis, now: Date): ClassifiedCME {
  const detectionTime = new Date(cme.time21_5);
  const travelTimeHours = DISTANCE_21_5_TO_EARTH_KM / cme.speed / 3600;
  const estimatedArrival = new Date(
    detectionTime.getTime() + travelTimeHours * 3600 * 1000,
  );
  const hoursUntilArrival =
    (estimatedArrival.getTime() - now.getTime()) / (3600 * 1000);

  let status: CMEStatus;
  if (hoursUntilArrival > 0) {
    status = "en_route";
  } else if (Math.abs(hoursUntilArrival) <= ARRIVED_WINDOW_HOURS) {
    status = "arrived";
  } else {
    status = "past";
  }

  return { cme, status, travelTimeHours, estimatedArrival, hoursUntilArrival };
}

/** Format a positive hours-until-arrival as a human-readable ETA */
function formatTimeUntil(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 24) return `~${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainHours = Math.round(hours % 24);
  if (remainHours === 0) return `~${days}d`;
  return `~${days}d ${remainHours}h`;
}

/** Format how long ago a CME arrived */
function formatTimeAgo(hoursAgo: number): string {
  const h = Math.abs(hoursAgo);
  if (h < 1) return "just now";
  if (h < 24) return `~${Math.round(h)}h ago`;
  const days = Math.floor(h / 24);
  return `~${days}d ago`;
}

/** Threat level derived from en-route CMEs only */
function getThreatLevel(enRouteCMEs: ClassifiedCME[]): {
  label: string;
  color: string;
  bg: string;
} {
  if (enRouteCMEs.length === 0)
    return { label: "All Clear", color: "text-gray-400", bg: "bg-white/5" };

  const maxSpeed = Math.max(...enRouteCMEs.map((c) => c.cme.speed));
  if (maxSpeed > SPEED_EXTREME)
    return { label: "Severe", color: "text-alert-red", bg: "bg-alert-red/15" };
  if (maxSpeed > SPEED_FAST)
    return {
      label: "Elevated",
      color: "text-caution-amber",
      bg: "bg-caution-amber/15",
    };
  return {
    label: "Watch",
    color: "text-signal-green",
    bg: "bg-signal-green/15",
  };
}

/** CME type label */
function cmeTypeLabel(type: string): string {
  switch (type) {
    case "S":
      return "Slow";
    case "C":
      return "Common";
    case "O":
      return "Occasional";
    default:
      return type || "\u2014";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return "\u2014";
  }
}

function formatDateTime(iso: string): string {
  try {
    return (
      new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC"
    );
  } catch {
    return "\u2014";
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Single KPI metric tile */
function KPITile({
  label,
  value,
  unit,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-1.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 whitespace-nowrap">
        {label}
      </span>
      <div className="flex items-baseline gap-0.5">
        <span className={`text-lg font-mono font-bold leading-tight ${color}`}>
          {value}
        </span>
        {unit && (
          <span className="text-[10px] text-gray-500 font-mono">{unit}</span>
        )}
      </div>
    </div>
  );
}

/** Status pill shown on each CME card */
function StatusPill({ classified }: { classified: ClassifiedCME }) {
  if (classified.status === "en_route") {
    return (
      <span className="text-[10px] font-mono text-caution-amber bg-caution-amber/10 px-1.5 py-0.5 rounded flex-shrink-0">
        ETA {formatTimeUntil(classified.hoursUntilArrival)}
      </span>
    );
  }
  if (classified.status === "arrived") {
    return (
      <span className="text-[10px] font-mono text-plasma-orange bg-plasma-orange/10 px-1.5 py-0.5 rounded flex-shrink-0">
        Arrived {formatTimeAgo(classified.hoursUntilArrival)}
      </span>
    );
  }
  return null;
}

/** Expandable CME mini-card */
function CMECard({
  classified,
  index,
}: {
  classified: ClassifiedCME;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { cme, status } = classified;

  return (
    <div
      className={`rounded-lg border ${speedBorder(cme.speed)} bg-white/[0.02] transition-colors hover:bg-white/[0.04] ${
        status === "arrived" ? "ring-1 ring-plasma-orange/20" : ""
      }`}
    >
      {/* Compact header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center gap-2"
        aria-expanded={expanded}
        aria-controls={`cme-detail-${index}`}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${speedBg(cme.speed)}`}
        />
        <span
          className={`text-sm font-bold font-mono flex-shrink-0 ${speedColor(cme.speed)}`}
        >
          {Math.round(cme.speed)}
        </span>
        <span className="text-[10px] text-gray-500 font-mono flex-shrink-0 -ml-1">
          km/s
        </span>

        <span className="text-xs text-gray-400 font-mono flex-shrink-0 ml-auto">
          {formatDate(cme.time21_5)}
        </span>

        <StatusPill classified={classified} />

        <svg
          className={`w-3 h-3 text-gray-500 flex-shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          id={`cme-detail-${index}`}
          className="px-3 pb-2.5 pt-0 border-t border-white/5"
        >
          <div className="grid grid-cols-4 gap-2 text-xs mt-2">
            <div>
              <span className="text-gray-500 block">Detected</span>
              <span className="text-gray-300 font-mono text-[11px]">
                {formatDateTime(cme.time21_5)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Half-angle</span>
              <span className="text-gray-300 font-mono">{cme.halfAngle}°</span>
            </div>
            <div>
              <span className="text-gray-500 block">Type</span>
              <span className="text-gray-300 font-mono">
                {cmeTypeLabel(cme.type)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">
                {classified.status === "en_route" ? "Arrives" : "Arrived"}
              </span>
              <span className="text-gray-300 font-mono text-[11px]">
                {formatDateTime(classified.estimatedArrival.toISOString())}
              </span>
            </div>
          </div>
          {cme.note && (
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              {cme.note}
            </p>
          )}
          {cme.link && (
            <a
              href={cme.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-plasma-orange hover:text-plasma-orange/80 mt-1.5"
            >
              Full analysis
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CMEAnalysisPanel: React.FC<CMEAnalysisPanelProps> = React.memo(
  function CMEAnalysisPanel() {
    const { data: cmeData, isLoading, isError } = useCMEAnalysis();
    const [showPast, setShowPast] = useState(false);

    const { enRoute, arrived, past } = useMemo(() => {
      const now = new Date();
      const classified = (cmeData ?? [])
        .filter(
          (c) =>
            c &&
            typeof c.speed === "number" &&
            Number.isFinite(c.speed) &&
            c.speed > 500 &&
            c.time21_5 &&
            !Number.isNaN(new Date(c.time21_5).getTime()),
        )
        .map((c) => classifyCME(c, now));

      const groups = {
        enRoute: classified
          .filter((c) => c.status === "en_route")
          .sort((a, b) => a.hoursUntilArrival - b.hoursUntilArrival),
        arrived: classified
          .filter((c) => c.status === "arrived")
          .sort(
            (a, b) =>
              Math.abs(a.hoursUntilArrival) - Math.abs(b.hoursUntilArrival),
          ),
        past: classified
          .filter((c) => c.status === "past")
          .sort(
            (a, b) =>
              Math.abs(a.hoursUntilArrival) - Math.abs(b.hoursUntilArrival),
          ),
      };

      return groups;
    }, [cmeData]);

    // Only en-route + arrived are "relevant"
    const relevant = [...enRoute, ...arrived];
    const threat = getThreatLevel(enRoute);

    // Nearest arrival for KPI
    const nearestEnRoute = enRoute.length > 0 ? enRoute[0] : null;
    const fastestEnRoute =
      enRoute.length > 0
        ? enRoute.reduce((f, c) => (c.cme.speed > f.cme.speed ? c : f))
        : null;

    return (
      <section className="rounded-2xl border border-plasma-orange/20 bg-white/[0.03] backdrop-blur-md p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
              CME Analysis
            </h2>
            <InfoTip content="Coronal Mass Ejections from NASA DONKI. Only CMEs still en route to Earth or recently arrived (within 48h) are shown. Past events are hidden by default." />
          </div>
          <a
            href="https://kauai.ccmc.gsfc.nasa.gov/DONKI/search/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-plasma-orange hover:text-white bg-plasma-orange/10 hover:bg-plasma-orange/20 border border-plasma-orange/30 rounded-lg transition-all duration-200"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            DONKI
          </a>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-plasma-orange/30 border-t-plasma-orange rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 py-4 text-gray-500">
            <div className="w-8 h-8 rounded-full bg-alert-red/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-alert-red"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div className="text-xs">
              <div className="text-gray-300 font-medium">
                Unable to load CME data
              </div>
              <div className="text-gray-500">
                NASA DONKI may be temporarily unavailable
              </div>
            </div>
          </div>
        ) : relevant.length === 0 ? (
          /* Empty state */
          <div className="flex items-center gap-3 py-4">
            <div className="w-8 h-8 rounded-full bg-signal-green/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-signal-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-sm text-gray-300 font-medium">All Clear</div>
              <div className="text-xs text-gray-500">
                No CMEs currently heading toward Earth
                {past.length > 0 && (
                  <>
                    {" \u00b7 "}
                    <button
                      type="button"
                      onClick={() => setShowPast(!showPast)}
                      className="text-gray-400 hover:text-gray-300 underline decoration-dotted underline-offset-2"
                    >
                      {showPast ? "Hide" : "Show"} {past.length} past event
                      {past.length !== 1 ? "s" : ""}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Summary Strip */}
            <div className="flex items-stretch justify-between rounded-xl bg-white/[0.03] border border-white/5 mb-3 divide-x divide-white/5">
              {enRoute.length > 0 ? (
                <>
                  <KPITile
                    label="En Route"
                    value={enRoute.length}
                    color="text-caution-amber"
                  />
                  <KPITile
                    label="Fastest"
                    value={
                      fastestEnRoute
                        ? Math.round(fastestEnRoute.cme.speed)
                        : "\u2014"
                    }
                    unit="km/s"
                    color={
                      fastestEnRoute
                        ? speedColor(fastestEnRoute.cme.speed)
                        : "text-gray-400"
                    }
                  />
                  <KPITile
                    label="Next Arrival"
                    value={
                      nearestEnRoute
                        ? formatTimeUntil(nearestEnRoute.hoursUntilArrival)
                        : "\u2014"
                    }
                    color="text-white"
                  />
                </>
              ) : (
                <>
                  <KPITile label="En Route" value={0} color="text-gray-500" />
                  <KPITile
                    label="Arrived"
                    value={arrived.length}
                    color="text-plasma-orange"
                  />
                </>
              )}
              {arrived.length > 0 && enRoute.length > 0 && (
                <KPITile
                  label="Arrived"
                  value={arrived.length}
                  color="text-plasma-orange"
                />
              )}
              <div
                className={`flex flex-col items-center justify-center px-3 py-1.5 ${threat.bg} rounded-r-xl`}
              >
                <span className="text-[10px] uppercase tracking-wider text-gray-500">
                  Threat
                </span>
                <span
                  className={`text-sm font-semibold leading-tight ${threat.color}`}
                >
                  {threat.label}
                </span>
              </div>
            </div>

            {/* En-route CME cards */}
            {enRoute.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] uppercase tracking-wider text-caution-amber/70 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-caution-amber animate-pulse" />
                  Approaching Earth
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {enRoute.map((c, i) => (
                    <CMECard
                      key={`enroute-${c.cme.time21_5}-${i}`}
                      classified={c}
                      index={i}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recently arrived CME cards */}
            {arrived.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] uppercase tracking-wider text-plasma-orange/70 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-plasma-orange" />
                  Recently Arrived (may affect conditions)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {arrived.map((c, i) => (
                    <CMECard
                      key={`arrived-${c.cme.time21_5}-${i}`}
                      classified={c}
                      index={1000 + i}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Past events toggle */}
            {past.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowPast(!showPast)}
                  className="text-[11px] text-gray-500 hover:text-gray-400 transition-colors"
                >
                  {showPast ? "Hide" : "Show"} {past.length} past event
                  {past.length !== 1 ? "s" : ""} (no longer affecting
                  conditions)
                </button>
              </div>
            )}
          </>
        )}

        {/* Past events — collapsed by default */}
        {showPast && past.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">
              Past Events
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 opacity-50">
              {past.map((c, i) => (
                <CMECard
                  key={`past-${c.cme.time21_5}-${i}`}
                  classified={c}
                  index={2000 + i}
                />
              ))}
            </div>
          </div>
        )}

        {/* Compact legend — only when there are relevant CMEs */}
        {relevant.length > 0 && (
          <div className="mt-2.5 flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
              &lt;800
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-caution-amber" />
              800-1200
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-alert-red" />
              &gt;1200 km/s
            </span>
          </div>
        )}
      </section>
    );
  },
);

export default CMEAnalysisPanel;

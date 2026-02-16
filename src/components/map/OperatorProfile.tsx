/**
 * OperatorProfile Component
 *
 * A compact operator profile card displaying station information including
 * callsign, grid square, sunrise/sunset times at QTH, local time, license class,
 * active radio equipment, and band/mode selector. Designed for the PropSphere
 * view's top row.
 *
 * Information is tailored for different user types:
 * - Electrical engineers: Technical specs, measurements
 * - Solar weather enthusiasts: Solar data, indices
 * - Experienced hams: Advanced propagation data
 * - New hams: Explanations, guidance
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveRadio, useUserStore } from "@/stores/userStore";
import { getSunTimes } from "@/lib/utils/time";
import {
  useActiveLocation,
  useIsTemporaryActive,
  useLicenseStatus,
} from "@/hooks/useActiveLocation";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { HelpButton, HelpModal } from "@/components/ui/HelpModal";
import { useActiveBandMode } from "@/hooks/useActiveBandMode";
import { BandModeModal } from "@/components/operating/BandModeModal";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { useOperatingStore } from "@/stores/operatingStore";
import type { BandId } from "@/types/user";

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

export function OperatorProfile({ className = "" }: OperatorProfileProps) {
  const { use24h } = useTimeFormat();
  const [showHelp, setShowHelp] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const station = useUserStore((state) => state.station);
  const preferences = useUserStore((state) => state.preferences);
  const activeRadio = useActiveRadio();

  // Location and license hooks
  const activeLocation = useActiveLocation();
  const isTemporaryActive = useIsTemporaryActive();
  const licenseStatus = useLicenseStatus();

  // Band/mode state
  const { activeBand, activeMode, activeSource } = useActiveBandMode();
  const catOverridden = useOperatingStore((s) => s.catOverridden);
  const catConnected = useOperatingStore((s) => s._catConnected);
  const bandSessionStart = useOperatingStore((s) => s.bandSessionStart);
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

  // Source dot color for band/mode widget
  const getSourceDotColor = (): string | null => {
    if (activeSource === "cat") return "bg-green-400";
    if (activeSource === "wsjtx") return "bg-cyan-400";
    if (activeSource === "contest") return "bg-amber-400";
    return null;
  };

  const sourceDotColor = getSourceDotColor();
  const bandColor = BAND_COLORS[activeBand] ?? BAND_COLORS.default;

  // Empty state
  if (!stationConfigured) {
    return (
      <div
        className={`h-full flex flex-col justify-center items-center gap-2 ${className}`}
      >
        <div className="w-3 h-3 rounded-full bg-gray-600" />
        <span className="text-sm text-gray-400">No station configured</span>
        <span className="text-xs text-gray-400">Set your QTH in Settings</span>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header: Title + Help button */}
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
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
              : "bg-gray-600"
          }`}
        />
        <div className="text-xl font-bold font-mono text-white leading-none">
          {operatorCallsign ?? "---"}
        </div>
      </div>

      {/* Grid + License row */}
      <div className="flex items-center gap-2 mb-2">
        {/* Location type indicator + Grid */}
        <div className="flex items-center gap-1.5">
          {isTemporaryActive ? (
            <svg
              className="w-3.5 h-3.5 text-amber-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-label="Portable location"
            >
              <path
                fillRule="evenodd"
                d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-label="Home location"
            >
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          )}
          <span
            className={`text-sm font-mono font-medium ${isTemporaryActive ? "text-amber-400" : "text-gray-300"}`}
          >
            {activeLocation?.grid ?? operatorGrid ?? "----"}
          </span>
        </div>

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
                  : "bg-white/10 text-gray-300"
            }`}
          >
            {licenseClass}
          </span>
        </div>
      </div>

      {/* Compact sun times - single inline row */}
      {operatorLat !== null && operatorLon !== null && (
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
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
          <span className="text-gray-600 mx-0.5">&middot;</span>
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

      {/* Band/Mode selector widget */}
      <button
        onClick={() => {
          if (!contestLocked) setIsModalOpen(true);
        }}
        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/5 border-l-2 transition-all duration-150 mb-1 w-full text-left ${
          contestLocked
            ? "opacity-60 cursor-not-allowed"
            : "hover:bg-white/[0.08]"
        } ${isFlashing ? "ring-2" : ""}`}
        style={{
          borderLeftColor: bandColor,
          ...(isFlashing
            ? {
                ringColor: bandColor,
                boxShadow: `0 0 0 2px ${bandColor}`,
                transform: "scale(1.02)",
              }
            : { transform: "scale(1)" }),
        }}
        aria-label={
          contestLocked
            ? `Active band ${activeBand}, mode ${activeMode}. Locked for contest.`
            : `Active band ${activeBand}, mode ${activeMode}. Click to change.`
        }
        aria-disabled={contestLocked}
      >
        {sourceDotColor && (
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${sourceDotColor}`}
          />
        )}
        <span className="text-sm font-bold text-white font-mono">
          {activeBand}
        </span>
        <span className="text-xs text-gray-400">&middot;</span>
        <span className="text-sm text-gray-300">{activeMode}</span>
        {contestLocked && (
          <svg
            className="w-3.5 h-3.5 text-amber-400 ml-auto flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {!contestLocked && catOverridden && catConnected && (
          <span className="ml-auto text-[10px] text-gray-500">
            Resume &#8617;
          </span>
        )}
      </button>

      {/* Session timer + sub-band segment + contest lock label */}
      {(sessionElapsed != null || contestLocked) && (
        <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1 px-0.5">
          {sessionElapsed != null && (
            <span>
              on {activeBand} for {sessionElapsed}
            </span>
          )}
          {sessionElapsed != null && subBandSegment && (
            <span className="text-gray-600">&middot;</span>
          )}
          {subBandSegment && <span>{subBandSegment}</span>}
          {contestLocked && (
            <>
              {(sessionElapsed != null || subBandSegment) && (
                <span className="text-gray-600">&middot;</span>
              )}
              <span className="text-amber-500">Locked for contest</span>
            </>
          )}
        </div>
      )}

      {/* Multi-band monitoring dots */}
      {watchedBands.length > 0 && (
        <div className="flex items-center gap-1 mb-1 px-0.5">
          <span className="text-[10px] text-gray-500">Watching</span>
          <div className="flex items-center gap-1">
            {watchedBands.map((band) => (
              <span
                key={band}
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: BAND_COLORS[band] ?? BAND_COLORS.default,
                }}
                title={band}
              />
            ))}
          </div>
        </div>
      )}

      {/* Band/Mode selection modal */}
      <BandModeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Radio profile - expanded details */}
      <div className="pt-2 border-t border-white/10">
        {activeRadio ? (
          <div className="space-y-1.5">
            {/* Radio name */}
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-plasma-orange flex-shrink-0"
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
              <span className="text-sm font-medium text-white">
                {activeRadio.manufacturer} {activeRadio.model}
              </span>
            </div>
            {/* Radio specs row */}
            <div className="flex items-center gap-2 flex-wrap text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-plasma-orange/20 text-plasma-orange font-mono font-medium">
                {activeRadio.maxPower}W
              </span>
              {activeRadio.bands && activeRadio.bands.length > 0 && (
                <span className="text-gray-400">
                  {activeRadio.bands.slice(0, 4).join(" · ")}
                  {activeRadio.bands.length > 4 &&
                    ` +${activeRadio.bands.length - 4}`}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 italic">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
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
            No radio selected
          </div>
        )}
      </div>

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

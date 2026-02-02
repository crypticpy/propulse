/**
 * OperatorProfile Component
 *
 * A compact operator profile card displaying station information including
 * callsign, grid square, sunrise/sunset times at QTH, local time, license class,
 * and active radio equipment. Designed for the PropSphere view's top row.
 *
 * Information is tailored for different user types:
 * - Electrical engineers: Technical specs, measurements
 * - Solar weather enthusiasts: Solar data, indices
 * - Experienced hams: Advanced propagation data
 * - New hams: Explanations, guidance
 */

import { useMemo } from "react";
import { useActiveRadio, useUserStore } from "@/stores/userStore";
import { useMapStore } from "@/stores/mapStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getSunTimes } from "@/lib/utils/time";
import { getDistance } from "@/lib/utils/path";

interface OperatorProfileProps {
  className?: string;
}

/**
 * Calculate local time at a given longitude based on UTC offset
 * Each 15 degrees of longitude equals 1 hour offset from UTC
 */
function getLocalTimeAtLongitude(lon: number): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const offsetHours = lon / 15;
  const localMs = utcMs + offsetHours * 60 * 60 * 1000;
  return new Date(localMs);
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
 * Sunrise SVG icon - cheerful sun rising with rays
 * Bright yellow/orange sun peeking over horizon with radiating rays
 */
function SunriseIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Sun body - bright and cheerful */}
      <circle cx="12" cy="14" r="5" fill="#FFD93D" />
      <circle cx="12" cy="14" r="5" stroke="#FF9500" strokeWidth="1" />

      {/* Sun rays - energetic, radiating outward */}
      <g stroke="#FFD93D" strokeWidth="2" strokeLinecap="round">
        <path d="M12 4v3" />
        <path d="M18.36 7.64l-2.12 2.12" />
        <path d="M21 14h-3" />
        <path d="M5.64 7.64l2.12 2.12" />
        <path d="M3 14h3" />
      </g>

      {/* Horizon line */}
      <path
        d="M1 19h22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Up arrow indicating rising */}
      <path d="M12 1l-2.5 3h5L12 1z" fill="#FF9500" />
    </svg>
  );
}

/**
 * Sunset SVG icon - sleepy sun going down with clouds
 * Orange/red sun partially behind clouds, sinking below horizon
 */
function SunsetIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Sun body - warm orange, partially hidden */}
      <circle cx="12" cy="16" r="5" fill="#FF8C42" />
      <circle cx="12" cy="16" r="5" stroke="#FF6B35" strokeWidth="1" />

      {/* Fading rays - shorter, dimmer */}
      <g stroke="#FF8C42" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
        <path d="M12 7v2" />
        <path d="M17 10l-1.5 1.5" />
        <path d="M7 10l1.5 1.5" />
      </g>

      {/* Clouds - fluffy, partially covering sun */}
      <ellipse cx="8" cy="14" rx="4" ry="2.5" fill="#64748b" opacity="0.8" />
      <ellipse cx="15" cy="13" rx="5" ry="3" fill="#475569" opacity="0.7" />
      <ellipse cx="11" cy="12" rx="3" ry="2" fill="#94a3b8" opacity="0.6" />

      {/* Horizon line */}
      <path
        d="M1 19h22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Down arrow indicating setting */}
      <path d="M12 23l-2.5-3h5L12 23z" fill="#FF6B35" />
    </svg>
  );
}

export function OperatorProfile({ className = "" }: OperatorProfileProps) {
  const station = useUserStore((state) => state.station);
  const preferences = useUserStore((state) => state.preferences);
  const target = useMapStore((state) => state.target);
  const activeRadio = useActiveRadio();

  // Fetch solar data for context
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  const stationConfigured = station !== null;
  const operatorCallsign = station?.callsign?.trim() || null;
  const operatorGrid = station?.grid?.trim() || null;
  const operatorLat = station?.lat ?? null;
  const operatorLon = station?.lon ?? null;
  const licenseClass = preferences.licenseClass ?? "GENERAL";

  // Current solar indices
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return null;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return null;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Calculate sunrise/sunset times at operator's QTH
  const sunTimes = useMemo(() => {
    if (operatorLat === null || operatorLon === null) {
      return { sunrise: null, sunset: null };
    }
    return getSunTimes(operatorLat, operatorLon, new Date());
  }, [operatorLat, operatorLon]);

  // Calculate local time at QTH based on longitude
  const localTimeAtQTH = useMemo(() => {
    if (operatorLon === null) return null;
    return getLocalTimeAtLongitude(operatorLon);
  }, [operatorLon]);

  // Calculate path distance to target
  const pathDistance = useMemo(() => {
    if (operatorLat === null || operatorLon === null || !target) return null;
    return getDistance(operatorLat, operatorLon, target.lat, target.lon);
  }, [operatorLat, operatorLon, target]);

  // Format radio display
  const radioDisplay = useMemo(() => {
    if (!activeRadio) return null;
    return `${activeRadio.manufacturer} ${activeRadio.model}`;
  }, [activeRadio]);

  // Determine polar condition label
  const getPolarLabel = (): string | null => {
    if (operatorLat === null) return null;
    const month = new Date().getMonth();
    const isNorthernHemisphere = operatorLat > 0;
    const isSummerNorth = month >= 3 && month <= 8;
    const isSummer = isNorthernHemisphere ? isSummerNorth : !isSummerNorth;
    return isSummer ? "Midnight Sun" : "Polar Night";
  };

  // Get operating tip based on conditions
  const getOperatingTip = (): string => {
    if (currentKp !== null && currentKp >= 5) {
      return "Storm active - try 40m/80m";
    }
    if (currentSfi !== null && currentSfi >= 150) {
      return "Excellent HF - try 10m/15m";
    }
    if (currentSfi !== null && currentSfi < 80) {
      return "Low flux - stick to 20m/40m";
    }
    const hour = new Date().getUTCHours();
    if (hour >= 6 && hour < 10) {
      return "Greyline window active";
    }
    if (hour >= 12 && hour < 18) {
      return "Peak daytime propagation";
    }
    if (hour >= 22 || hour < 4) {
      return "Low bands open for DX";
    }
    return "Good conditions for most bands";
  };

  const operatorStatus =
    stationConfigured && operatorGrid ? "ready" : "incomplete";

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
    <div className={`h-full flex flex-col gap-2 ${className}`}>
      {/* Top: Callsign + Grid + Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Status indicator */}
          <div
            role="status"
            aria-label={
              operatorStatus === "ready"
                ? "Station configured"
                : "Station incomplete"
            }
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              operatorStatus === "ready"
                ? "bg-signal-green animate-pulse"
                : "bg-gray-600"
            }`}
          />
          {/* Callsign + Grid */}
          <div className="min-w-0">
            <div className="text-lg font-bold font-mono text-white truncate leading-tight">
              {operatorCallsign ?? "---"}
            </div>
            <div className="text-xs font-mono text-gray-400 leading-tight">
              {operatorGrid ?? "----"}
            </div>
          </div>
        </div>
        {/* License badge */}
        <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-white/10 text-gray-300 flex-shrink-0">
          {licenseClass}
        </span>
      </div>

      {/* Sun times with SVG icons - stacked vertically */}
      {operatorLat !== null && operatorLon !== null && (
        <div className="flex flex-col gap-1">
          {/* Sunrise and Sunset row */}
          <div className="flex items-center gap-3">
            {/* Sunrise */}
            <div
              className="flex items-center gap-1.5 group"
              title={
                sunTimes.sunrise
                  ? `Sunrise: ${formatCompactTime(sunTimes.sunrise, true)} UTC`
                  : "No sunrise today"
              }
            >
              <SunriseIcon className="w-5 h-5 text-gray-400" />
              <span className="text-xs font-mono text-amber-400">
                {sunTimes.sunrise
                  ? formatCompactTime(sunTimes.sunrise, true)
                  : (getPolarLabel() ?? "--:--")}
              </span>
            </div>

            {/* Sunset */}
            <div
              className="flex items-center gap-1.5 group"
              title={
                sunTimes.sunset
                  ? `Sunset: ${formatCompactTime(sunTimes.sunset, true)} UTC`
                  : "No sunset today"
              }
            >
              <SunsetIcon className="w-5 h-5 text-gray-400" />
              <span className="text-xs font-mono text-orange-400">
                {sunTimes.sunset
                  ? formatCompactTime(sunTimes.sunset, true)
                  : (getPolarLabel() ?? "--:--")}
              </span>
            </div>
          </div>

          {/* Local time - clear live clock display */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase">Local:</span>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-sm font-mono font-bold text-cyan-400">
                {localTimeAtQTH
                  ? formatCompactTime(localTimeAtQTH, true)
                  : "--:--"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Middle: Context info - fills remaining space */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-h-0">
        {/* Path distance (if target selected) */}
        {pathDistance !== null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 uppercase">Path:</span>
            <span className="font-mono text-white">
              {pathDistance < 1000
                ? `${Math.round(pathDistance)} km`
                : `${(pathDistance / 1000).toFixed(1)}k km`}
            </span>
            <span className="text-gray-400">
              ({Math.ceil(pathDistance / 3000)} hop
              {Math.ceil(pathDistance / 3000) > 1 ? "s" : ""})
            </span>
          </div>
        )}

        {/* Operating tip */}
        <div className="px-2 py-1 rounded bg-white/5 border-l-2 border-plasma-orange">
          <span className="text-xs text-gray-300">{getOperatingTip()}</span>
        </div>
      </div>

      {/* Bottom: Radio profile */}
      <div className="pt-1.5 border-t border-white/10">
        <div className="text-xs truncate">
          <span className="text-gray-400">Current Radio Profile: </span>
          {radioDisplay ? (
            <span className="text-white font-medium">{radioDisplay}</span>
          ) : (
            <span className="text-gray-400 italic">None selected</span>
          )}
        </div>
      </div>
    </div>
  );
}

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

import { useMemo, useState } from "react";
import { useActiveRadio, useUserStore } from "@/stores/userStore";
import { getSunTimes } from "@/lib/utils/time";
import {
  useActiveLocation,
  useIsTemporaryActive,
  useLicenseStatus,
} from "@/hooks/useActiveLocation";
import { HelpButton, HelpModal } from "@/components/ui/HelpModal";

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
  const [showHelp, setShowHelp] = useState(false);
  const station = useUserStore((state) => state.station);
  const preferences = useUserStore((state) => state.preferences);
  const activeRadio = useActiveRadio();

  // Location and license hooks
  const activeLocation = useActiveLocation();
  const isTemporaryActive = useIsTemporaryActive();
  const licenseStatus = useLicenseStatus();

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

      {/* Sun times - stacked vertically with larger display */}
      {operatorLat !== null && operatorLon !== null && (
        <div className="flex justify-center gap-6 py-2">
          {/* Sunrise */}
          <div
            className="flex flex-col items-center"
            title={
              sunTimes.sunrise
                ? `Sunrise at QTH: ${formatCompactTime(sunTimes.sunrise, true)} UTC`
                : "No sunrise today"
            }
          >
            <SunriseIcon className="w-10 h-10" />
            <span className="text-xl font-mono font-bold text-amber-400 mt-1">
              {sunTimes.sunrise
                ? formatCompactTime(sunTimes.sunrise, true)
                : (getPolarLabel() ?? "--:--")}
            </span>
            <span className="text-[10px] text-gray-500 uppercase">Sunrise</span>
          </div>

          {/* Divider */}
          <div className="w-px bg-white/10" />

          {/* Sunset */}
          <div
            className="flex flex-col items-center"
            title={
              sunTimes.sunset
                ? `Sunset at QTH: ${formatCompactTime(sunTimes.sunset, true)} UTC`
                : "No sunset today"
            }
          >
            <SunsetIcon className="w-10 h-10" />
            <span className="text-xl font-mono font-bold text-orange-400 mt-1">
              {sunTimes.sunset
                ? formatCompactTime(sunTimes.sunset, true)
                : (getPolarLabel() ?? "--:--")}
            </span>
            <span className="text-[10px] text-gray-500 uppercase">Sunset</span>
          </div>
        </div>
      )}

      {/* Radio profile - expanded details */}
      <div className="pt-2 border-t border-white/10 mt-auto">
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
        ]}
      />
    </div>
  );
}

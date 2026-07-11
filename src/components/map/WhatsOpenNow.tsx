/**
 * WhatsOpenNow Component
 *
 * A beginner-friendly summary card that shows current band conditions
 * in plain language with simple traffic-light colors.
 * Designed for users new to ham radio who don't need technical details.
 */

import { useMemo, useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getPathIllumination } from "@/lib/utils/path";
import {
  getBandConditionsForPath,
  type PathBandCondition,
} from "@/lib/utils/bands";
import { Card } from "@/components/ui/Card";

interface WhatsOpenNowProps {
  displayTime: Date;
  className?: string;
}

/**
 * Status indicator component with traffic-light colors
 */
function StatusDot({ status }: { status: PathBandCondition["status"] }) {
  const colors = {
    excellent: "bg-signal-green",
    good: "bg-signal-green",
    fair: "bg-caution-amber",
    poor: "bg-alert-red",
    closed: "bg-gray-500",
  };

  return (
    <span
      className={`inline-block w-3 h-3 rounded-full ${colors[status]}`}
      aria-label={status}
    />
  );
}

/**
 * Get a friendly description for band condition
 */
function getFriendlyDescription(
  band: string,
  status: PathBandCondition["status"],
): string {
  const bandDescriptions: Record<string, Record<string, string>> = {
    "20m": {
      excellent: "Excellent worldwide",
      good: "Good worldwide",
      fair: "Fair, try EU/Asia",
      poor: "Weak signals",
      closed: "Not available",
    },
    "17m": {
      excellent: "Excellent to EU/Asia",
      good: "Good to EU/Asia",
      fair: "Fair, try nearby",
      poor: "Weak signals",
      closed: "Not available",
    },
    "15m": {
      excellent: "Excellent DX",
      good: "Good DX",
      fair: "Fair for DX",
      poor: "Weak signals",
      closed: "Not available",
    },
    "40m": {
      excellent: "Excellent regional",
      good: "Good regional",
      fair: "Fair regional",
      poor: "Weak signals",
      closed: "Not available",
    },
    "80m": {
      excellent: "Excellent night DX",
      good: "Good night DX",
      fair: "Fair regional",
      poor: "Noisy",
      closed: "Daytime - wait for night",
    },
    "10m": {
      excellent: "Excellent when open",
      good: "Good openings",
      fair: "Sporadic openings",
      poor: "Rarely open",
      closed: "Closed - solar conditions",
    },
  };

  const defaults: Record<string, string> = {
    excellent: "Excellent conditions",
    good: "Good conditions",
    fair: "Fair conditions",
    poor: "Weak signals",
    closed: "Not available now",
  };

  return bandDescriptions[band]?.[status] || defaults[status];
}

/**
 * Get time-based tips for beginners
 */
function getQuickTips(displayTime: Date, illumination: number): string[] {
  const hour = displayTime.getUTCHours();
  const tips: string[] = [];

  // Time-based tips
  if (hour >= 12 && hour <= 20) {
    tips.push("Daytime is best for higher bands (20m, 17m, 15m)");
  } else if (hour >= 0 && hour <= 6) {
    tips.push("Night is best for lower bands (40m, 80m)");
  } else {
    tips.push("Greyline time - try both high and low bands");
  }

  // Illumination-based tips
  if (illumination > 70) {
    tips.push("Good daylight path - higher bands should work well");
  } else if (illumination < 30) {
    tips.push("Dark path - lower bands (40m, 80m) are your best bet");
  }

  // General beginner tips
  tips.push("Try FT8 mode for easy contacts on any band");

  return tips;
}

/**
 * Priority bands to show for beginners (most useful bands)
 */
const BEGINNER_BANDS = ["20m", "40m", "17m", "15m", "80m", "10m"];

export function WhatsOpenNow({
  displayTime,
  className = "",
}: WhatsOpenNowProps) {
  const { target } = useMapStore();
  const { station } = useUserStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Fetch current solar data
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return 3;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Calculate path illumination
  const illumination = useMemo(() => {
    if (!station || !target) return 50; // Default to 50% if no path
    return getPathIllumination(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      displayTime,
    );
  }, [station, target, displayTime]);

  // Calculate band conditions
  const bandConditions = useMemo(() => {
    if (!station) return [];

    // If no target, show general conditions for a medium-distance path
    const targetLat = target?.lat ?? station.lat + 30;
    const targetLon = target?.lon ?? station.lon + 60;

    return getBandConditionsForPath(
      station.lat,
      station.lon,
      targetLat,
      targetLon,
      currentKp,
      currentSfi,
      illumination,
    );
  }, [station, target, currentKp, currentSfi, illumination]);

  // Filter to beginner-priority bands and sort by status
  const filteredBands = useMemo(() => {
    const statusOrder = {
      excellent: 0,
      good: 1,
      fair: 2,
      poor: 3,
      closed: 4,
    };

    return bandConditions
      .filter((b) => BEGINNER_BANDS.includes(b.band))
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [bandConditions]);

  // Get quick tips
  const tips = useMemo(
    () => getQuickTips(displayTime, illumination),
    [displayTime, illumination],
  );

  // No station configured
  if (!station) {
    return (
      <Card className={`${className}`}>
        <div className="p-4 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">
            What's Open Now?
          </h3>
          <p className="text-gray-400 text-sm">
            Set your station location in settings to see band recommendations
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      {/* Header with collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors rounded-t-lg"
      >
        <div>
          <h3 className="text-lg font-semibold text-white text-left">
            What's Open Now?
          </h3>
          <p className="text-xs text-gray-400 text-left">
            Based on current solar conditions
          </p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isCollapsed ? "" : "rotate-180"
          }`}
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

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* Best Bands section */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              Best Bands Right Now
            </h4>
            <div className="space-y-2">
              {filteredBands.slice(0, 5).map((band) => (
                <div
                  key={band.band}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <StatusDot status={band.status} />
                  <span className="font-mono text-white font-medium w-12">
                    {band.band}
                  </span>
                  <span className="text-gray-300 text-sm flex-1">
                    {getFriendlyDescription(band.band, band.status)}
                  </span>
                  {/* Help tooltip */}
                  <button
                    className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                    title={`${band.frequency} - ${band.notes}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M12 21a9 9 0 110-18 9 9 0 010 18z"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-gray-400 border-t border-white/10 pt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-signal-green" />
              <span>Good</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-caution-amber" />
              <span>Fair</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-alert-red" />
              <span>Poor</span>
            </div>
          </div>

          {/* Quick Tips section */}
          <div className="border-t border-white/10 pt-3">
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              Quick Tips
            </h4>
            <ul className="space-y-1.5">
              {tips.map((tip, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-400"
                >
                  <span className="text-plasma-orange mt-0.5">*</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Link to learn more */}
          <div className="border-t border-white/10 pt-3">
            <a
              href="/learn"
              className="flex items-center gap-2 text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <span>Learn more about propagation</span>
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}

export default WhatsOpenNow;

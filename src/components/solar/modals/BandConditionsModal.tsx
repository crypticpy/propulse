import React from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { calculateBandConditions } from "@/lib/utils/bands";
import type { BandCondition, VHFCondition } from "@/types/solar";

export interface BandConditionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  kIndex: number;
  solarFlux: number;
}

/**
 * Detailed band information including propagation modes
 */
const BAND_DETAILS: Record<
  string,
  {
    wavelength: string;
    propagationModes: string[];
    typicalRange: string;
    bestTime: string;
    notes: string;
  }
> = {
  "160m": {
    wavelength: "Top Band",
    propagationModes: ["Ground wave", "NVIS", "F2 skip (rare)"],
    typicalRange: "Regional to 500+ miles at night",
    bestTime: "Night (local sunset to sunrise)",
    notes:
      "The most challenging HF band. Requires large antennas and high power for DX. Subject to significant atmospheric noise in summer.",
  },
  "80m": {
    wavelength: "75/80m",
    propagationModes: ["Ground wave", "NVIS", "F2 skip"],
    typicalRange: "Regional to continental",
    bestTime: "Night and twilight hours",
    notes:
      "Excellent for regional nets and night-time DX. Higher noise levels than daytime bands. Split between phone (75m) and CW/digital (80m).",
  },
  "60m": {
    wavelength: "5 MHz channels",
    propagationModes: ["NVIS", "Ground wave"],
    typicalRange: "0-500 miles typical",
    bestTime: "Any time (NVIS optimized)",
    notes:
      "Channelized band primarily for emergency communications. Excellent NVIS coverage. Not available in all countries.",
  },
  "40m": {
    wavelength: "Workhorse band",
    propagationModes: ["F2 skip", "NVIS (day)", "Ground wave"],
    typicalRange: "Regional to worldwide",
    bestTime: "24/7 reliable",
    notes:
      "The most reliable DX band at any point in the solar cycle. Day and night operation. First choice when unsure of conditions.",
  },
  "30m": {
    wavelength: "WARC band",
    propagationModes: ["F2 skip"],
    typicalRange: "Continental to worldwide",
    bestTime: "Day and night",
    notes:
      "CW and digital only (no phone). Quieter than 40m with excellent propagation characteristics. Popular for FT8 and digital modes.",
  },
  "20m": {
    wavelength: "Primary DX band",
    propagationModes: ["F2 skip", "Multi-hop"],
    typicalRange: "Worldwide during day",
    bestTime: "Daylight hours (local)",
    notes:
      "The king of DX bands. Open to somewhere in the world almost always during daylight. First choice for daytime DX operations.",
  },
  "17m": {
    wavelength: "WARC band",
    propagationModes: ["F2 skip"],
    typicalRange: "Continental to worldwide",
    bestTime: "Daylight hours",
    notes:
      "Excellent DX band when open. Less crowded than 20m or 15m. Requires moderate solar activity (SFI > 90) for reliable openings.",
  },
  "15m": {
    wavelength: "Contest favorite",
    propagationModes: ["F2 skip", "Sporadic E"],
    typicalRange: "Worldwide when open",
    bestTime: "Late morning to afternoon",
    notes:
      "Outstanding DX band during moderate to high solar activity. Very quiet band when closed. Popular for contests.",
  },
  "12m": {
    wavelength: "WARC band",
    propagationModes: ["F2 skip", "Sporadic E"],
    typicalRange: "Worldwide when open",
    bestTime: "Midday",
    notes:
      "Requires good solar activity (SFI > 100) for F2 openings. Can have excellent sporadic E openings in summer.",
  },
  "10m": {
    wavelength: "Magic band for HF",
    propagationModes: ["F2 skip", "Sporadic E", "Tropo"],
    typicalRange: "Worldwide when open",
    bestTime: "Midday during high solar activity",
    notes:
      "Excellent for worldwide DX at solar maximum. Very quiet when closed. Summer sporadic E can provide regional contacts regardless of solar cycle.",
  },
  "6m": {
    wavelength: "Magic band",
    propagationModes: [
      "Sporadic E",
      "F2 (rare)",
      "Tropo",
      "Aurora",
      "Meteor scatter",
    ],
    typicalRange: "Variable - local to worldwide",
    bestTime: "Summer (Es), Solar max (F2)",
    notes:
      "Fascinating band with unpredictable propagation. Multiple propagation modes. Requires patience and antenna pointing.",
  },
};

/**
 * Map condition to badge status
 */
function conditionToBadgeStatus(
  condition: BandCondition | VHFCondition,
): BadgeStatus {
  switch (condition) {
    case "Excellent":
      return "excellent";
    case "Good":
      return "good";
    case "Fair":
      return "fair";
    case "Poor":
      return "poor";
    case "Aurora":
      return "active";
    default:
      return "fair";
  }
}

/**
 * Get best DX windows for a band based on conditions
 */
function getDXWindow(
  bandName: string,
  solarFlux: number,
): { window: string; quality: string } {
  switch (bandName) {
    case "160m":
    case "80m":
      return {
        window: "21:00 - 06:00 local",
        quality: solarFlux > 100 ? "Good" : "Fair",
      };
    case "60m":
      return { window: "Any time (NVIS)", quality: "Good" };
    case "40m":
      return { window: "24/7 (best at twilight)", quality: "Excellent" };
    case "30m":
      return {
        window: "Day/twilight",
        quality: solarFlux > 90 ? "Excellent" : "Good",
      };
    case "20m":
      return {
        window: "08:00 - 18:00 local",
        quality: solarFlux > 80 ? "Excellent" : "Good",
      };
    case "17m":
      return {
        window: "10:00 - 16:00 local",
        quality: solarFlux > 100 ? "Good" : "Fair",
      };
    case "15m":
      return {
        window: "10:00 - 15:00 local",
        quality: solarFlux > 110 ? "Good" : "Fair",
      };
    case "12m":
      return {
        window: "11:00 - 14:00 local",
        quality: solarFlux > 120 ? "Good" : "Poor",
      };
    case "10m":
      return {
        window: "11:00 - 14:00 local",
        quality: solarFlux > 140 ? "Good" : "Poor",
      };
    case "6m":
      return { window: "Variable (check spots)", quality: "Unpredictable" };
    default:
      return { window: "Unknown", quality: "Unknown" };
  }
}

/**
 * BandConditionsModal Component
 *
 * Full band matrix with all 11 HF bands, expanded details for each band,
 * propagation mode explanations, and best DX windows.
 */
export const BandConditionsModal: React.FC<BandConditionsModalProps> = ({
  isOpen,
  onClose,
  kIndex,
  solarFlux,
}) => {
  const bands = calculateBandConditions(kIndex, solarFlux);

  // Determine current time for recommendations
  const now = new Date();
  const isDaytime = now.getHours() >= 6 && now.getHours() < 18;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="HF Band Conditions"
      subtitle="Complete band analysis and propagation guide"
      size="full"
    >
      <div className="space-y-6">
        {/* Current Indices */}
        <div className="flex flex-wrap gap-4">
          <div className="bg-void-black/50 rounded-lg px-4 py-3 border border-white/5">
            <span className="text-xs text-gray-500 block">Solar Flux</span>
            <span className="text-xl font-mono font-bold text-plasma-orange">
              {solarFlux} sfu
            </span>
          </div>
          <div className="bg-void-black/50 rounded-lg px-4 py-3 border border-white/5">
            <span className="text-xs text-gray-500 block">K-Index</span>
            <span className="text-xl font-mono font-bold text-cosmic-cyan">
              {kIndex}
            </span>
          </div>
          <div className="bg-void-black/50 rounded-lg px-4 py-3 border border-white/5">
            <span className="text-xs text-gray-500 block">Local Time</span>
            <span className="text-xl font-mono font-bold text-white">
              {now.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="bg-void-black/50 rounded-lg px-4 py-3 border border-white/5">
            <span className="text-xs text-gray-500 block">Period</span>
            <span className="text-xl font-mono font-bold text-white">
              {isDaytime ? "Daytime" : "Nighttime"}
            </span>
          </div>
        </div>

        {/* Full Band Matrix */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Band Condition Matrix
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Band
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Frequency
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Day
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Night
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase">
                    Best For
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                    DX Window
                  </th>
                </tr>
              </thead>
              <tbody>
                {bands.map((band) => {
                  const dxWindow = getDXWindow(band.name, solarFlux);
                  const currentCondition = isDaytime
                    ? band.dayCondition
                    : band.nightCondition;
                  const isRecommended =
                    currentCondition === "Excellent" ||
                    currentCondition === "Good";

                  return (
                    <tr
                      key={band.name}
                      className={`border-b border-white/5 ${
                        isRecommended ? "bg-signal-green/5" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-white">
                          {band.name}
                        </span>
                        {isRecommended && (
                          <span className="ml-2 text-xs text-signal-green">
                            *
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-gray-400 font-mono">
                        {band.freq}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge
                          status={conditionToBadgeStatus(band.dayCondition)}
                          size="sm"
                        >
                          {band.dayCondition}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge
                          status={conditionToBadgeStatus(band.nightCondition)}
                          size="sm"
                        >
                          {band.nightCondition}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-gray-400">
                        {band.bestFor}
                      </td>
                      <td className="py-3 px-3 text-gray-400 hidden md:table-cell">
                        {dxWindow.window}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            * Recommended bands for current time and conditions
          </p>
        </div>

        {/* Detailed Band Information */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Band Details and Propagation Modes
          </h4>
          <div className="grid gap-4">
            {bands.map((band) => {
              const details = BAND_DETAILS[band.name];
              if (!details) {
                return null;
              }

              const currentCondition = isDaytime
                ? band.dayCondition
                : band.nightCondition;
              const isOpen =
                currentCondition === "Excellent" || currentCondition === "Good";

              return (
                <div
                  key={band.name}
                  className={`p-4 rounded-lg border ${
                    isOpen
                      ? "bg-signal-green/5 border-signal-green/20"
                      : "bg-white/[0.02] border-white/5"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono font-bold text-xl text-white">
                          {band.name}
                        </span>
                        <span className="text-sm text-gray-500">
                          {band.freq}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({details.wavelength})
                        </span>
                        {isOpen && (
                          <Badge status="excellent" size="sm">
                            OPEN NOW
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 mb-3">
                        {details.notes}
                      </p>
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 block mb-1">
                            Propagation Modes:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {details.propagationModes.map((mode) => (
                              <span
                                key={mode}
                                className="px-2 py-0.5 text-xs bg-white/5 border border-white/10 rounded text-gray-300"
                              >
                                {mode}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-1">
                            Typical Range:
                          </span>
                          <span className="text-gray-300">
                            {details.typicalRange}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-1">
                            Best Time:
                          </span>
                          <span className="text-gray-300">
                            {details.bestTime}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-1">
                            Current Conditions:
                          </span>
                          <span className="flex gap-2">
                            <span className="text-gray-400">Day:</span>
                            <Badge
                              status={conditionToBadgeStatus(band.dayCondition)}
                              size="sm"
                            >
                              {band.dayCondition}
                            </Badge>
                            <span className="text-gray-400 ml-2">Night:</span>
                            <Badge
                              status={conditionToBadgeStatus(
                                band.nightCondition,
                              )}
                              size="sm"
                            >
                              {band.nightCondition}
                            </Badge>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Propagation Mode Explanations */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Propagation Mode Guide
          </h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
              <h5 className="text-white font-medium mb-2">
                F2 Skip (Ionospheric)
              </h5>
              <p className="text-gray-400">
                Primary long-distance HF mode. Radio waves refract off the F2
                layer of the ionosphere (200-400 km altitude). Effectiveness
                depends on solar activity - higher SFI means better F2
                propagation on higher bands.
              </p>
            </div>
            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
              <h5 className="text-white font-medium mb-2">Sporadic E (Es)</h5>
              <p className="text-gray-400">
                Unpredictable propagation via dense patches in the E layer
                (100-120 km). Common in summer months. Can provide excellent 6m,
                10m, and 12m openings regardless of solar cycle. Watch for
                sudden band openings.
              </p>
            </div>
            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
              <h5 className="text-white font-medium mb-2">
                NVIS (Near Vertical)
              </h5>
              <p className="text-gray-400">
                Signals sent nearly straight up reflect back down, providing
                coverage out to ~300 miles with no skip zone. Ideal for
                emergency communications on 40m, 60m, and 80m during daylight.
              </p>
            </div>
            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
              <h5 className="text-white font-medium mb-2">Ground Wave</h5>
              <p className="text-gray-400">
                Direct propagation following Earth&apos;s surface. Reliable for
                short distances (typically under 100 miles on HF). Range depends
                on frequency, power, and terrain. Primary mode for local
                contacts on lower bands.
              </p>
            </div>
            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
              <h5 className="text-white font-medium mb-2">Aurora</h5>
              <p className="text-gray-400">
                Signals reflect off the auroral curtain during geomagnetic
                storms (high K-index). Produces characteristic
                &quot;flutter&quot; on signals. Primarily affects 6m and 2m.
                Point antennas toward the aurora.
              </p>
            </div>
            <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
              <h5 className="text-white font-medium mb-2">
                Tropospheric (Tropo)
              </h5>
              <p className="text-gray-400">
                VHF/UHF signals bend in temperature inversions in the
                troposphere. Common during stable high-pressure weather
                patterns. Can provide extended range on 6m and above. Watch for
                ducting conditions.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Reference Legend */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            Condition Legend
          </h4>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Badge status="excellent" size="sm">
                Excellent
              </Badge>
              <span className="text-sm text-gray-400">
                Worldwide DX possible
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge status="good" size="sm">
                Good
              </Badge>
              <span className="text-sm text-gray-400">Reliable DX</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge status="fair" size="sm">
                Fair
              </Badge>
              <span className="text-sm text-gray-400">Limited openings</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge status="poor" size="sm">
                Poor
              </Badge>
              <span className="text-sm text-gray-400">
                Band closed or very weak
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge status="active" size="sm">
                Aurora
              </Badge>
              <span className="text-sm text-gray-400">
                Aurora scatter possible
              </span>
            </div>
          </div>
        </div>
      </div>
    </DetailModal>
  );
};

BandConditionsModal.displayName = "BandConditionsModal";

export default BandConditionsModal;

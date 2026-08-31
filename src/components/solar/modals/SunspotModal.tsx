import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { solarImageUrl } from "@/lib/solar/mediaProducts";

export interface SunspotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValue: number;
}

/**
 * Get solar cycle phase description based on SSN
 */
function getSolarCyclePhase(ssn: number): {
  phase: string;
  description: string;
  color: string;
} {
  if (ssn >= 150) {
    return {
      phase: "Solar Maximum",
      description:
        "Peak solar-cycle activity can increase high-band potential; individual paths still depend on time, geometry, mode, and noise.",
      color: "#3a86ff",
    };
  }
  if (ssn >= 100) {
    return {
      phase: "High Activity",
      description:
        "Strong solar activity with frequent sunspots and greater potential on the higher HF bands.",
      color: "#44ddff",
    };
  }
  if (ssn >= 50) {
    return {
      phase: "Moderate Activity",
      description:
        "Middle solar-cycle activity with mixed-to-supportive global ionization context.",
      color: "#ffaa00",
    };
  }
  if (ssn >= 20) {
    return {
      phase: "Low Activity",
      description:
        "Approaching or leaving solar minimum; lower HF bands are often less dependent on high solar flux.",
      color: "#ff7700",
    };
  }
  return {
    phase: "Solar Minimum",
    description:
      "Bottom of the solar cycle, with limited F-layer support for higher HF bands.",
    color: "#888899",
  };
}

/**
 * Relationship between SSN and propagation conditions
 */
const SSN_PROPAGATION_INFO = [
  {
    range: "150+",
    condition: "Very high activity",
    bands: "Greater high-band potential",
    color: "#3a86ff",
  },
  {
    range: "100-150",
    condition: "High activity",
    bands: "Supportive high-band potential",
    color: "#44ddff",
  },
  {
    range: "50-100",
    condition: "Moderate activity",
    bands: "Mixed high-band potential",
    color: "#ffaa00",
  },
  {
    range: "20-50",
    condition: "Low activity",
    bands: "Lower-band context favored",
    color: "#ff7700",
  },
  {
    range: "<20",
    condition: "Very low activity",
    bands: "Limited high-band F-layer support",
    color: "#888899",
  },
];

/**
 * Get the primary sun image URL via our edge function proxy. The shared helper
 * advances only at the product cadence, preserving bounded edge caching while
 * allowing a modal left open on a wall display to receive new SDO frames.
 */
function getSunImageUrl(now: number): string {
  return solarImageUrl("sunspot-hmi", now);
}

/**
 * SunspotModal Component
 *
 * Displays detailed sunspot information including:
 * - Current sunspot number (SSN)
 * - Current timestamped sun image from NASA SDO
 * - Solar cycle position context
 * - Relationship between SSN and propagation
 */
export const SunspotModal: React.FC<SunspotModalProps> = ({
  isOpen,
  onClose,
  currentValue,
}) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const imageUrl = isOpen ? getSunImageUrl(now) : null;

  const cyclePhase = getSolarCyclePhase(currentValue);

  // Generate a fresh cadence key when the modal opens, then keep it current
  // for operators who leave the detailed view mounted.
  useEffect(() => {
    if (isOpen) {
      setImageLoading(true);
      setImageError(false);
      setNow(Date.now());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!imageUrl) return;
    setImageLoading(true);
    setImageError(false);
  }, [imageUrl]);

  const handleImageLoad = useCallback(() => {
    setImageLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setImageLoading(false);
    setImageError(true);
  }, []);

  // Memoize the fallback sun SVG
  const fallbackSun = useMemo(
    () => (
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full max-w-[300px] mx-auto"
      >
        <defs>
          <radialGradient id="sunGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffdd00" />
            <stop offset="70%" stopColor="#ff8800" />
            <stop offset="100%" stopColor="#ff4400" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="80" fill="url(#sunGradient)" />
        {/* Simulated sunspots based on current value */}
        {currentValue > 20 && (
          <circle cx="85" cy="90" r="8" fill="rgba(0,0,0,0.3)" />
        )}
        {currentValue > 50 && (
          <circle cx="120" cy="95" r="6" fill="rgba(0,0,0,0.3)" />
        )}
        {currentValue > 80 && (
          <circle cx="95" cy="115" r="10" fill="rgba(0,0,0,0.3)" />
        )}
        {currentValue > 100 && (
          <>
            <circle cx="70" cy="105" r="5" fill="rgba(0,0,0,0.25)" />
            <circle cx="130" cy="80" r="7" fill="rgba(0,0,0,0.25)" />
          </>
        )}
        {currentValue > 130 && (
          <>
            <circle cx="110" cy="120" r="4" fill="rgba(0,0,0,0.2)" />
            <circle cx="80" cy="70" r="6" fill="rgba(0,0,0,0.2)" />
          </>
        )}
        <text
          x="100"
          y="185"
          textAnchor="middle"
          fill="#666"
          fontSize="12"
          fontFamily="monospace"
        >
          Illustration (current image unavailable)
        </text>
      </svg>
    ),
    [currentValue],
  );

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Sunspot Number (SSN)"
      subtitle="International Sunspot Number"
      size="lg"
    >
      <div className="space-y-6">
        {/* Current Value Section */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
                Current SSN
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className="text-5xl font-orbitron font-bold"
                  style={{ color: cyclePhase.color }}
                >
                  {currentValue}
                </span>
              </div>
            </div>
            <div className="text-right max-w-xs">
              <span
                className="text-lg font-semibold"
                style={{ color: cyclePhase.color }}
              >
                {cyclePhase.phase}
              </span>
              <p className="text-sm text-gray-400 mt-1">
                {cyclePhase.description}
              </p>
            </div>
          </div>
        </Card>

        {/* Current SDO image */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Current SDO HMI image
          </h3>
          <div className="relative bg-black/30 rounded-lg overflow-hidden aspect-square max-w-[400px] mx-auto">
            {imageLoading && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner size="lg" />
                <span className="sr-only">Loading sun image...</span>
              </div>
            )}

            {imageError ? (
              <div className="w-full h-full flex items-center justify-center p-4">
                {fallbackSun}
              </div>
            ) : (
              imageUrl && (
                <img
                  src={imageUrl}
                  alt="Current view of the Sun from NASA Solar Dynamics Observatory"
                  className={`w-full h-full object-contain transition-opacity duration-300 ${
                    imageLoading ? "opacity-0" : "opacity-100"
                  }`}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              )
            )}
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">
            HMI Intensitygram - Shows sunspots on the solar surface
          </p>
        </Card>

        {/* What are Sunspots? */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            What are Sunspots?
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Sunspots are temporary dark spots on the Sun's photosphere caused by
            concentrations of magnetic flux. They appear darker because they are
            cooler than the surrounding area (about 3,500K vs 5,800K). Sunspot
            activity follows an approximately 11-year cycle. More sunspots
            indicate higher solar activity, which increases ionospheric
            ionization and improves HF radio propagation.
          </p>
        </Card>

        {/* Solar Cycle Context */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Solar Cycle 25 Status
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            We are currently in Solar Cycle 25, which began in December 2019.
            Solar Cycle 25 reached its maximum in October 2024; activity
            remains elevated near the peak of the cycle.
          </p>
          <div className="relative h-4 bg-white/5 rounded-full overflow-hidden">
            {/* Cycle progress bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.min(100, (currentValue / 180) * 100)}%`,
                background: `linear-gradient(90deg, #888899 0%, ${cyclePhase.color} 100%)`,
              }}
            />
            {/* Current position marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2"
              style={{
                left: `${Math.min(95, (currentValue / 180) * 100)}%`,
                borderColor: cyclePhase.color,
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Solar Min (SSN ~0)</span>
            <span>Solar Max (SSN ~180)</span>
          </div>
        </Card>

        {/* SSN and Propagation Relationship */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            SSN vs. HF Propagation
          </h3>
          <div className="space-y-2">
            {SSN_PROPAGATION_INFO.map((item) => (
              <div
                key={item.range}
                className={`flex items-center justify-between p-2 rounded ${
                  // Highlight current range
                  (item.range === "150+" && currentValue >= 150) ||
                  (item.range === "100-150" &&
                    currentValue >= 100 &&
                    currentValue < 150) ||
                  (item.range === "50-100" &&
                    currentValue >= 50 &&
                    currentValue < 100) ||
                  (item.range === "20-50" &&
                    currentValue >= 20 &&
                    currentValue < 50) ||
                  (item.range === "<20" && currentValue < 20)
                    ? "bg-white/5 border border-white/10"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-mono text-white">
                    {item.range}
                  </span>
                </div>
                <span className="text-sm text-gray-400">{item.condition}</span>
                <span className="text-sm text-gray-500 hidden md:block">
                  {item.bands}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Did You Know? */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            Did You Know?
          </h3>
          <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
            <li>
              The sunspot number is calculated using the formula: SSN = k(10g +
              s), where g is the number of sunspot groups, s is the total number
              of spots, and k is a correction factor.
            </li>
            <li>
              Large sunspot groups can be visible to the naked eye (with proper
              solar filters) and may persist for several solar rotations (~27
              days).
            </li>
            <li>
              The correlation between SSN and MUF (Maximum Usable Frequency) is
              well established - higher SSN means higher MUF and better
              propagation on higher bands.
            </li>
          </ul>
        </Card>
      </div>
    </DetailModal>
  );
};

SunspotModal.displayName = "SunspotModal";

export default SunspotModal;

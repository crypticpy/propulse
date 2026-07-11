import React from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { Card } from "@/components/ui/Card";

export interface AIndexModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValue: number;
  kIndex: number;
}

/**
 * A-index interpretation scale
 */
const A_INDEX_SCALE = [
  {
    range: "0-7",
    level: "Quiet",
    color: "#00ff88",
    description: "Stable geomagnetic field. Excellent for HF propagation.",
  },
  {
    range: "8-15",
    level: "Unsettled",
    color: "#44dd66",
    description: "Minor fluctuations. Good propagation with occasional fading.",
  },
  {
    range: "16-29",
    level: "Active",
    color: "#ffaa00",
    description: "Moderate activity. Some polar path degradation.",
  },
  {
    range: "30-49",
    level: "Minor Storm",
    color: "#ff7700",
    description: "Storm conditions. HF may be affected at high latitudes.",
  },
  {
    range: "50-99",
    level: "Major Storm",
    color: "#ff4455",
    description:
      "Significant storm. HF blackouts likely at mid to high latitudes.",
  },
  {
    range: "100+",
    level: "Severe Storm",
    color: "#ff0088",
    description: "Extreme conditions. Widespread HF disruption expected.",
  },
];

/**
 * Get current A-index level info
 */
function getAIndexLevel(aIndex: number): {
  level: string;
  color: string;
  description: string;
} {
  if (aIndex <= 7) {
    return {
      level: "Quiet",
      color: "#00ff88",
      description:
        "Stable geomagnetic conditions. Optimal for HF radio operations.",
    };
  }
  if (aIndex <= 15) {
    return {
      level: "Unsettled",
      color: "#44dd66",
      description:
        "Minor activity. Good propagation with possible brief fading.",
    };
  }
  if (aIndex <= 29) {
    return {
      level: "Active",
      color: "#ffaa00",
      description:
        "Increased activity. Polar and high-latitude paths may be degraded.",
    };
  }
  if (aIndex <= 49) {
    return {
      level: "Minor Storm",
      color: "#ff7700",
      description:
        "Geomagnetic storm conditions. Expect HF disruption at higher latitudes.",
    };
  }
  if (aIndex <= 99) {
    return {
      level: "Major Storm",
      color: "#ff4455",
      description:
        "Significant storm. HF blackouts likely. Use NVIS or ground wave.",
    };
  }
  return {
    level: "Severe Storm",
    color: "#ff0088",
    description:
      "Extreme storm. Complete HF disruption possible. Avoid long-distance HF.",
  };
}

/**
 * K to A index conversion table (approximate)
 */
const K_TO_A_TABLE = [
  { k: 0, a: 0 },
  { k: 1, a: 3 },
  { k: 2, a: 7 },
  { k: 3, a: 15 },
  { k: 4, a: 27 },
  { k: 5, a: 48 },
  { k: 6, a: 80 },
  { k: 7, a: 132 },
  { k: 8, a: 208 },
  { k: 9, a: 400 },
];

/**
 * Full Kp-to-Ap conversion table (ITU standard, 0.33 increments)
 */
const FULL_KP_AP_TABLE = [
  { kp: "0", ap: 0 },
  { kp: "0+", ap: 2 },
  { kp: "1-", ap: 3 },
  { kp: "1", ap: 4 },
  { kp: "1+", ap: 5 },
  { kp: "2-", ap: 6 },
  { kp: "2", ap: 7 },
  { kp: "2+", ap: 9 },
  { kp: "3-", ap: 12 },
  { kp: "3", ap: 15 },
  { kp: "3+", ap: 18 },
  { kp: "4-", ap: 22 },
  { kp: "4", ap: 27 },
  { kp: "4+", ap: 32 },
  { kp: "5-", ap: 39 },
  { kp: "5", ap: 48 },
  { kp: "5+", ap: 56 },
  { kp: "6-", ap: 67 },
  { kp: "6", ap: 80 },
  { kp: "6+", ap: 94 },
  { kp: "7-", ap: 111 },
  { kp: "7", ap: 132 },
  { kp: "7+", ap: 154 },
  { kp: "8-", ap: 179 },
  { kp: "8", ap: 207 },
  { kp: "8+", ap: 236 },
  { kp: "9-", ap: 300 },
  { kp: "9", ap: 400 },
];

/**
 * AIndexModal Component
 *
 * Displays detailed A-index information including:
 * - Current Ap equivalent value (instantaneous, not 24hr average)
 * - Relationship to K-index
 * - Interpretation scale
 * - Impact on propagation
 * - Educational content about Ap vs true A-index
 */
export const AIndexModal: React.FC<AIndexModalProps> = ({
  isOpen,
  onClose,
  currentValue,
  kIndex,
}) => {
  const levelInfo = getAIndexLevel(currentValue);

  // Calculate expected A from current K (for comparison)
  const expectedAFromK = K_TO_A_TABLE.find(
    (row) => row.k === Math.round(kIndex),
  )?.a;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Ap Index"
      subtitle="Instantaneous geomagnetic activity equivalent"
      size="lg"
    >
      <div className="space-y-6">
        {/* Current Value Section */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
                Current Ap Equivalent
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className="text-5xl font-orbitron font-bold"
                  style={{ color: levelInfo.color }}
                >
                  {Math.round(currentValue)}
                </span>
              </div>
            </div>
            <div className="text-right max-w-xs">
              <span
                className="text-lg font-semibold"
                style={{ color: levelInfo.color }}
              >
                {levelInfo.level}
              </span>
              <p className="text-sm text-gray-400 mt-1">
                {levelInfo.description}
              </p>
            </div>
          </div>
        </Card>

        {/* Important Clarification */}
        <Card className="p-4 border-l-4 border-caution-amber">
          <h3 className="text-sm font-semibold text-caution-amber mb-2">
            Ap Equivalent vs True A-Index
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            <strong className="text-white">What you see here:</strong> The Ap
            equivalent for the current Kp value. This shows what the
            instantaneous geomagnetic activity level means on the linear Ap
            scale.
          </p>
          <p className="text-sm text-gray-400 leading-relaxed mt-2">
            <strong className="text-white">The true daily A-index:</strong> An
            average of eight 3-hourly Ap values over a 24-hour period. This
            requires a full day of measurements and is published by NOAA/GFZ
            after the day completes.
          </p>
          <p className="text-xs text-gray-500 mt-2 italic">
            For propagation decisions, the current Ap equivalent is often more
            useful as it reflects real-time conditions rather than a daily
            average.
          </p>
        </Card>

        {/* What is the A-Index? */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            Understanding A-Index and Ap
          </h3>
          <div className="space-y-3 text-sm text-gray-400 leading-relaxed">
            <p>
              The <strong className="text-white">Ap index</strong> is the
              linearized equivalent of a Kp value. While Kp uses a
              quasi-logarithmic scale (0-9), Ap converts this to a linear scale
              (0-400) that better represents the actual magnetic field
              disturbance amplitude.
            </p>
            <p>
              The <strong className="text-white">true A-index</strong> (daily A)
              is calculated as the arithmetic mean of eight consecutive 3-hourly
              Ap values over a complete UT day. The formula is:
            </p>
            <div className="bg-white/5 rounded-lg p-3 font-mono text-xs text-center border border-white/10">
              A = (Ap₁ + Ap₂ + Ap₃ + Ap₄ + Ap₅ + Ap₆ + Ap₇ + Ap₈) / 8
            </div>
            <p>
              Because this requires 24 hours of data, the true A-index is only
              available after the UT day ends. For real-time monitoring,
              Propulse displays the Ap equivalent of the current Kp reading.
            </p>
          </div>
        </Card>

        {/* K-Index Relationship */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Relationship to K-Index
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <span className="text-xs text-gray-500 block">
                Current K-Index
              </span>
              <span className="text-2xl font-orbitron font-bold text-plasma-orange">
                {kIndex.toFixed(1)}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <span className="text-xs text-gray-500 block">Ap Equivalent</span>
              <span className="text-2xl font-orbitron font-bold text-gray-300">
                {expectedAFromK ?? Math.round(currentValue)}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-3">
            The Kp-to-Ap conversion is non-linear. Notice how equal Kp
            increments result in increasingly larger Ap jumps at higher activity
            levels. This reflects the logarithmic nature of magnetic
            disturbances:
          </p>

          {/* Simple K to A conversion table */}
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 px-3 text-left text-gray-400 font-medium">
                    K-Index
                  </th>
                  {K_TO_A_TABLE.map((row) => (
                    <th
                      key={row.k}
                      className={`py-2 px-3 text-center font-mono ${
                        Math.round(kIndex) === row.k
                          ? "text-plasma-orange"
                          : "text-gray-300"
                      }`}
                    >
                      {row.k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2 px-3 text-gray-400 font-medium">Ap</td>
                  {K_TO_A_TABLE.map((row) => (
                    <td
                      key={row.k}
                      className={`py-2 px-3 text-center font-mono ${
                        Math.round(kIndex) === row.k
                          ? "text-plasma-orange bg-plasma-orange/10"
                          : "text-gray-400"
                      }`}
                    >
                      {row.a}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Full ITU table (collapsed/expandable) */}
          <details className="mt-4">
            <summary className="text-xs text-cosmic-cyan cursor-pointer hover:text-white transition-colors">
              View full ITU Kp-to-Ap table (including fractional Kp values)
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-1 px-2 text-left text-gray-400">Kp</th>
                    {FULL_KP_AP_TABLE.slice(0, 10).map((row) => (
                      <th
                        key={row.kp}
                        className="py-1 px-2 text-center font-mono text-gray-300"
                      >
                        {row.kp}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-1 px-2 text-gray-400">Ap</td>
                    {FULL_KP_AP_TABLE.slice(0, 10).map((row) => (
                      <td
                        key={row.kp}
                        className="py-1 px-2 text-center font-mono text-gray-500"
                      >
                        {row.ap}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-1 px-2 text-gray-400">Kp</td>
                    {FULL_KP_AP_TABLE.slice(10, 19).map((row) => (
                      <th
                        key={row.kp}
                        className="py-1 px-2 text-center font-mono text-gray-300"
                      >
                        {row.kp}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1 px-2 text-gray-400">Ap</td>
                    {FULL_KP_AP_TABLE.slice(10, 19).map((row) => (
                      <td
                        key={row.kp}
                        className="py-1 px-2 text-center font-mono text-gray-500"
                      >
                        {row.ap}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-1 px-2 text-gray-400">Kp</td>
                    {FULL_KP_AP_TABLE.slice(19).map((row) => (
                      <th
                        key={row.kp}
                        className="py-1 px-2 text-center font-mono text-gray-300"
                      >
                        {row.kp}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-1 px-2 text-gray-400">Ap</td>
                    {FULL_KP_AP_TABLE.slice(19).map((row) => (
                      <td
                        key={row.kp}
                        className="py-1 px-2 text-center font-mono text-gray-500"
                      >
                        {row.ap}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Source: ITU-R P.533-14, NOAA/SWPC
            </p>
          </details>
        </Card>

        {/* Interpretation Scale */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            A-Index Interpretation Scale
          </h3>
          <div className="space-y-2">
            {A_INDEX_SCALE.map((item) => {
              // Check if current value falls in this range
              const [min, max] = item.range.includes("+")
                ? [parseInt(item.range), Infinity]
                : item.range.split("-").map(Number);
              const isCurrentRange =
                currentValue >= min && currentValue <= (max || Infinity);

              return (
                <div
                  key={item.range}
                  className={`flex items-start gap-3 p-2 rounded transition-colors ${
                    isCurrentRange ? "bg-white/5 border border-white/10" : ""
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-white">
                        A {item.range}
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: item.color }}
                      >
                        {item.level}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Why Use A-Index? */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            Why Use the A-Index?
          </h3>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex gap-3">
              <span className="text-signal-green font-medium">
                Trend Analysis:
              </span>
              <span>
                The linear scale makes it easier to spot trends and compare
                activity over weeks or months.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-cosmic-cyan font-medium">DX Planning:</span>
              <span>
                Low A-index days (under 10) are ideal for working difficult DX
                paths, especially polar routes.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-caution-amber font-medium">Stability:</span>
              <span>
                Unlike K which can spike temporarily, A-index reflects the
                overall day's conditions, helping you plan operations.
              </span>
            </div>
          </div>
        </Card>

        {/* Practical Tips */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Practical Tips
          </h3>
          <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
            <li>
              <span className="text-white">A &lt; 10:</span> Excellent for
              long-path and polar DX. Work those rare ones!
            </li>
            <li>
              <span className="text-white">A 10-20:</span> Good conditions for
              most HF activities. Normal operations.
            </li>
            <li>
              <span className="text-white">A 20-30:</span> Consider focusing on
              lower bands and non-polar paths.
            </li>
            <li>
              <span className="text-white">A &gt; 30:</span> Storm recovery may
              take 12-24 hours. Use NVIS or local propagation.
            </li>
          </ul>
        </Card>
      </div>
    </DetailModal>
  );
};

AIndexModal.displayName = "AIndexModal";

export default AIndexModal;

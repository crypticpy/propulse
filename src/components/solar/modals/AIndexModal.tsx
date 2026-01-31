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
 * AIndexModal Component
 *
 * Displays detailed A-index information including:
 * - Current A-index value
 * - Relationship to K-index
 * - Interpretation scale
 * - Impact on propagation
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
      title="A-Index"
      subtitle="24-hour geomagnetic activity average"
      size="lg"
    >
      <div className="space-y-6">
        {/* Current Value Section */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
                Current A-Index
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

        {/* What is the A-Index? */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            What is the A-Index?
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            The A-index is a daily average of geomagnetic activity derived from
            the eight 3-hourly K-index values. Unlike the K-index which uses a
            quasi-logarithmic scale (0-9), the A-index is linear and ranges from
            0 to 400. This makes it easier to compare activity levels across
            different days and to calculate longer-term averages.
          </p>
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
              <span className="text-xs text-gray-500 block">
                Expected A (from K)
              </span>
              <span className="text-2xl font-orbitron font-bold text-gray-300">
                ~{expectedAFromK ?? "N/A"}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-3">
            The A-index is calculated by converting each K value to an
            "equivalent amplitude" (a) and averaging. The conversion is
            non-linear:
          </p>

          {/* K to A conversion table */}
          <div className="overflow-x-auto">
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
                  <td className="py-2 px-3 text-gray-400 font-medium">
                    A Equiv.
                  </td>
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

          <p className="text-xs text-gray-500 mt-3">
            Formula: A = average of eight 3-hourly "a" values (converted from K)
          </p>
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

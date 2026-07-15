import React from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { Card } from "@/components/ui/Card";

export interface KIndexModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValue: number;
}

/**
 * G-scale storm levels with corresponding Kp values
 */
const G_SCALE_DATA = [
  {
    scale: "G1",
    kp: "5",
    name: "Minor",
    color: "#ffaa00",
    effects:
      "Weak power grid fluctuations, minor impact on satellite operations",
    aurora: "Northern US states, southern Canada",
  },
  {
    scale: "G2",
    kp: "6",
    name: "Moderate",
    color: "#ff7700",
    effects: "High-latitude power systems may experience voltage alarms",
    aurora: "New York, Idaho, northern US",
  },
  {
    scale: "G3",
    kp: "7",
    name: "Strong",
    color: "#ff4455",
    effects:
      "Intermittent satellite navigation problems, HF radio intermittent",
    aurora: "Illinois, Oregon, mid-latitudes",
  },
  {
    scale: "G4",
    kp: "8",
    name: "Severe",
    color: "#ff0088",
    effects: "Widespread voltage control problems, HF radio blackout possible",
    aurora: "Alabama, California, lower mid-latitudes",
  },
  {
    scale: "G5",
    kp: "9",
    name: "Extreme",
    color: "#cc00ff",
    effects: "Complete HF radio blackout, satellite damage possible",
    aurora: "Florida, Texas, southern US",
  },
];

/**
 * K-index color scale with descriptions
 */
const K_COLOR_SCALE = [
  {
    range: "K0-2",
    color: "#00ff88",
    label: "Quiet",
    description: "Excellent HF propagation",
  },
  {
    range: "K3-4",
    color: "#ffaa00",
    label: "Unsettled",
    description: "Good propagation, some fading",
  },
  {
    range: "K5-6",
    color: "#ff4455",
    label: "Storm",
    description: "Degraded HF, possible blackouts",
  },
  {
    range: "K7-9",
    color: "#ff0088",
    label: "Severe",
    description: "Major HF disruption",
  },
];

/**
 * Get the current condition based on K-index
 */
function getCurrentCondition(kIndex: number): {
  level: string;
  color: string;
  gScale: string | null;
  description: string;
} {
  if (kIndex <= 2) {
    return {
      level: "Quiet",
      color: "#00ff88",
      gScale: null,
      description:
        "Geomagnetically quiet global conditions. Individual HF paths still depend on illumination, frequency, season, antennas, and noise.",
    };
  }
  if (kIndex <= 4) {
    return {
      level: "Unsettled",
      color: "#ffaa00",
      gScale: null,
      description:
        "Minor global geomagnetic activity. Some paths may remain stable while others vary.",
    };
  }
  if (kIndex === 5) {
    return {
      level: "Minor Storm",
      color: "#ffaa00",
      gScale: "G1",
      description:
        "Minor geomagnetic storm. Some HF degradation at high latitudes.",
    };
  }
  if (kIndex === 6) {
    return {
      level: "Moderate Storm",
      color: "#ff7700",
      gScale: "G2",
      description:
        "Moderate geomagnetic storm. HF propagation affected at higher latitudes.",
    };
  }
  if (kIndex === 7) {
    return {
      level: "Strong Storm",
      color: "#ff4455",
      gScale: "G3",
      description:
        "Strong geomagnetic storm. Significant HF degradation is possible, particularly on polar and high-latitude paths.",
    };
  }
  if (kIndex === 8) {
    return {
      level: "Severe Storm",
      color: "#ff0088",
      gScale: "G4",
      description:
        "Severe geomagnetic storm. Major HF disruption is possible, with strong path and latitude dependence.",
    };
  }
  return {
    level: "Extreme Storm",
    color: "#cc00ff",
    gScale: "G5",
    description:
      "Extreme geomagnetic storm. Complete HF radio blackout likely.",
  };
}

/**
 * Get aurora visibility based on Kp index
 */
function getAuroraVisibility(kIndex: number): string {
  if (kIndex <= 2) {
    return "Arctic regions only (>65° latitude)";
  }
  if (kIndex === 3) {
    return "Northern Canada, Alaska, Scandinavia (~60° latitude)";
  }
  if (kIndex === 4) {
    return "Northern US, southern Canada (~55° latitude)";
  }
  if (kIndex === 5) {
    return "Northern tier US states (~50° latitude)";
  }
  if (kIndex === 6) {
    return "Central US, UK, central Europe (~45° latitude)";
  }
  if (kIndex === 7) {
    return "Southern US states (~40° latitude)";
  }
  if (kIndex === 8) {
    return "Texas, Florida, Mediterranean (~35° latitude)";
  }
  return "Visible from most of the world (equatorial regions)";
}

/**
 * KIndexModal Component
 *
 * Displays detailed K-index information including:
 * - Current value with G-scale correlation
 * - Color legend and interpretation
 * - NOAA G-scale explanation table
 * - Aurora visibility zones
 * - Impact on radio communications
 */
export const KIndexModal: React.FC<KIndexModalProps> = ({
  isOpen,
  onClose,
  currentValue,
}) => {
  const condition = getCurrentCondition(Math.round(currentValue));
  const auroraVisibility = getAuroraVisibility(Math.round(currentValue));

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="K-Index (Planetary Kp)"
      subtitle="Geomagnetic activity indicator"
      size="lg"
    >
      <div className="space-y-6">
        {/* Current Value Section */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
                Current K-Index
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <span
                  className="text-5xl font-orbitron font-bold"
                  style={{ color: condition.color }}
                >
                  {currentValue.toFixed(1)}
                </span>
                {condition.gScale && (
                  <span
                    className="px-2 py-1 rounded text-sm font-bold"
                    style={{
                      backgroundColor: `${condition.color}20`,
                      color: condition.color,
                      border: `1px solid ${condition.color}40`,
                    }}
                  >
                    {condition.gScale}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right max-w-xs">
              <span
                className="text-lg font-semibold"
                style={{ color: condition.color }}
              >
                {condition.level}
              </span>
              <p className="text-sm text-gray-400 mt-1">
                {condition.description}
              </p>
            </div>
          </div>
        </Card>

        {/* What is K-Index? */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            What is the K-Index?
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            The K-index quantifies disturbances in Earth's magnetic field on a
            scale of 0-9. It is measured every 3 hours at ground-based
            magnetometers worldwide. The planetary Kp index is a weighted
            average from 13 stations. Values of 5 or higher indicate geomagnetic
            storm conditions that can disrupt HF radio propagation, GPS
            accuracy, and power grids.
          </p>
        </Card>

        {/* Color Legend */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            K-Index Scale
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {K_COLOR_SCALE.map((item) => (
              <div
                key={item.range}
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: `${item.color}10`,
                  border: `1px solid ${item.color}30`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-mono text-white">
                    {item.range}
                  </span>
                </div>
                <span
                  className="text-xs font-medium block"
                  style={{ color: item.color }}
                >
                  {item.label}
                </span>
                <span className="text-xs text-gray-500 block mt-0.5">
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* NOAA G-Scale Table */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            NOAA Geomagnetic Storm Scale
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-2 text-gray-400 font-medium">
                    Scale
                  </th>
                  <th className="text-left py-2 px-2 text-gray-400 font-medium">
                    Kp
                  </th>
                  <th className="text-left py-2 px-2 text-gray-400 font-medium">
                    Level
                  </th>
                  <th className="text-left py-2 px-2 text-gray-400 font-medium hidden md:table-cell">
                    Effects
                  </th>
                </tr>
              </thead>
              <tbody>
                {G_SCALE_DATA.map((row) => (
                  <tr
                    key={row.scale}
                    className={`border-b border-white/5 ${
                      condition.gScale === row.scale ? "bg-white/5" : ""
                    }`}
                  >
                    <td className="py-2 px-2">
                      <span
                        className="font-mono font-bold"
                        style={{ color: row.color }}
                      >
                        {row.scale}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-mono text-gray-300">
                      {row.kp}
                    </td>
                    <td className="py-2 px-2">
                      <span style={{ color: row.color }}>{row.name}</span>
                    </td>
                    <td className="py-2 px-2 text-gray-400 hidden md:table-cell">
                      {row.effects}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Aurora Visibility */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            Aurora Visibility Zone
          </h3>
          <p className="text-sm text-gray-400 mb-3">
            Based on current Kp of {Math.round(currentValue)}:
          </p>
          <div
            className="p-3 rounded-lg flex items-center gap-3"
            style={{
              backgroundColor: `${condition.color}10`,
              border: `1px solid ${condition.color}30`,
            }}
          >
            <span className="text-2xl">
              {currentValue >= 5
                ? "Northern Lights visible southward"
                : "Limited visibility"}
            </span>
            <span className="text-sm text-gray-300">{auroraVisibility}</span>
          </div>
        </Card>

        {/* Radio Communications Impact */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Impact on Radio Communications
          </h3>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex gap-3">
              <span className="text-signal-green font-medium min-w-[80px]">
                K0-2:
              </span>
              <span>
                Stable ionosphere. Excellent HF propagation on all bands.
                Long-distance contacts reliable.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-caution-amber font-medium min-w-[80px]">
                K3-4:
              </span>
              <span>
                Moderate disturbance. Good propagation with occasional signal
                fading. Polar paths may be affected.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-alert-red font-medium min-w-[80px]">
                K5+:
              </span>
              <span>
                Storm conditions. HF blackouts possible, especially at high
                latitudes. Stick to NVIS or local propagation modes.
              </span>
            </div>
          </div>
        </Card>
      </div>
    </DetailModal>
  );
};

KIndexModal.displayName = "KIndexModal";

export default KIndexModal;

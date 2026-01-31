import React from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { ProgressBar } from "@/components/ui/ProgressBar";

export interface FlareProbabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  cProb: number;
  mProb: number;
  xProb: number;
  protonProb: number;
}

/**
 * Comprehensive flare class information
 */
const FLARE_CLASSES = [
  {
    class: "A",
    name: "A-Class",
    peakFlux: "< 10^-7 W/m²",
    color: "#44dd66",
    frequency: "Very common",
    radioImpact: "None - Background solar activity",
    description:
      "A-class flares are the smallest and most common type. They represent normal background solar activity and have no impact on Earth or radio communications.",
    recovery: "N/A",
  },
  {
    class: "B",
    name: "B-Class",
    peakFlux: "10^-7 to 10^-6 W/m²",
    color: "#88cc44",
    frequency: "Common",
    radioImpact: "None - Minor solar activity",
    description:
      "B-class flares are small flares with no noticeable effect on Earth. They occur frequently during active solar periods.",
    recovery: "N/A",
  },
  {
    class: "C",
    name: "C-Class",
    peakFlux: "10^-6 to 10^-5 W/m²",
    color: "#ffaa00",
    frequency: "Moderate",
    radioImpact: "Minor - Brief HF degradation possible on sunlit side",
    description:
      "C-class flares are moderate flares that can cause brief, minor radio blackouts in the polar regions. Most amateur radio operators will not notice any effect.",
    recovery: "Minutes",
  },
  {
    class: "M",
    name: "M-Class",
    peakFlux: "10^-5 to 10^-4 W/m²",
    color: "#ff7700",
    frequency: "Occasional",
    radioImpact:
      "Moderate - HF radio blackouts for tens of minutes on sunlit side",
    description:
      "M-class flares are moderately strong. They can cause brief radio blackouts at polar latitudes and minor radiation storms. During an M-class flare, expect degraded HF propagation, especially on higher frequencies.",
    recovery: "10-60 minutes",
  },
  {
    class: "X",
    name: "X-Class",
    peakFlux: "> 10^-4 W/m²",
    color: "#ff4455",
    frequency: "Rare",
    radioImpact:
      "Severe - Complete HF blackout for hours, navigation errors possible",
    description:
      "X-class flares are the most powerful. They can trigger planet-wide radio blackouts and long-lasting radiation storms. The largest X-class flares can cause complete HF blackout on the entire sunlit side of Earth for hours.",
    recovery: "1-4 hours",
  },
];

/**
 * Historical typical probability ranges
 */
const HISTORICAL_CONTEXT = {
  solarMin: { c: "5-15%", m: "1-5%", x: "<1%", proton: "<1%" },
  solarMid: { c: "30-50%", m: "10-20%", x: "1-5%", proton: "1-5%" },
  solarMax: { c: "60-80%", m: "25-40%", x: "5-15%", proton: "5-15%" },
};

/**
 * Get severity level based on probability
 */
function getSeverityLevel(prob: number): { level: string; color: string } {
  if (prob >= 50) return { level: "High", color: "#ff4455" };
  if (prob >= 25) return { level: "Moderate", color: "#ff7700" };
  if (prob >= 10) return { level: "Low", color: "#ffaa00" };
  return { level: "Very Low", color: "#44dd66" };
}

/**
 * FlareProbabilityModal Component
 *
 * Detailed flare class explanations, current probabilities with visual bars,
 * impact on radio communications, and historical context.
 */
export const FlareProbabilityModal: React.FC<FlareProbabilityModalProps> = ({
  isOpen,
  onClose,
  cProb,
  mProb,
  xProb,
  protonProb,
}) => {
  const probabilities = [
    { class: "C", prob: cProb, color: "amber" as const },
    { class: "M", prob: mProb, color: "orange" as const },
    { class: "X", prob: xProb, color: "red" as const },
    { class: "Proton", prob: protonProb, color: "purple" as const },
  ];

  const mSeverity = getSeverityLevel(mProb);
  const xSeverity = getSeverityLevel(xProb);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Solar Flare Probability"
      subtitle="24-hour forecast and impact assessment"
      size="xl"
    >
      <div className="space-y-6">
        {/* Current Probabilities */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            24-Hour Forecast
          </h4>
          <div className="space-y-4">
            {probabilities.map(({ class: flareClass, prob, color }) => {
              const classInfo = FLARE_CLASSES.find(
                (c) => c.class === flareClass,
              );
              const severity = getSeverityLevel(prob);

              return (
                <div key={flareClass} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-white text-lg">
                        {flareClass === "Proton"
                          ? "Proton Event"
                          : `${flareClass}-Class`}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${severity.color}20`,
                          color: severity.color,
                          border: `1px solid ${severity.color}40`,
                        }}
                      >
                        {severity.level}
                      </span>
                    </div>
                    <span className="font-mono text-xl font-bold text-white">
                      {Math.round(prob)}%
                    </span>
                  </div>
                  <ProgressBar value={prob} color={color} />
                  {classInfo && (
                    <p className="text-xs text-gray-500">
                      {classInfo.radioImpact}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk Assessment */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              HF Radio Risk
            </h4>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center font-mono font-bold"
                style={{
                  backgroundColor: `${mSeverity.color}20`,
                  color: mSeverity.color,
                  border: `2px solid ${mSeverity.color}`,
                }}
              >
                {mSeverity.level.charAt(0)}
              </div>
              <div>
                <div className="text-white font-medium">
                  {mSeverity.level} Risk of Disruption
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  {mProb >= 25
                    ? "Significant chance of HF radio blackouts in next 24 hours. Monitor conditions before long QSOs."
                    : "Low probability of significant HF disruption. Normal operations expected."}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              Severe Event Risk
            </h4>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center font-mono font-bold"
                style={{
                  backgroundColor: `${xSeverity.color}20`,
                  color: xSeverity.color,
                  border: `2px solid ${xSeverity.color}`,
                }}
              >
                {xSeverity.level.charAt(0)}
              </div>
              <div>
                <div className="text-white font-medium">
                  {xSeverity.level} Risk of X-Class Event
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  {xProb >= 10
                    ? "Elevated chance of major flare. May cause extended HF blackouts and geomagnetic storms."
                    : "Low probability of major flare event. Standard conditions expected."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flare Class Explanations */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Understanding Flare Classifications
          </h4>
          <div className="space-y-4">
            {FLARE_CLASSES.map((flare) => (
              <div
                key={flare.class}
                className="p-4 rounded-lg bg-white/[0.02] border border-white/5"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                  <div
                    className="w-12 h-8 rounded flex items-center justify-center font-mono font-bold text-sm shrink-0"
                    style={{
                      backgroundColor: `${flare.color}20`,
                      color: flare.color,
                      border: `1px solid ${flare.color}40`,
                    }}
                  >
                    {flare.class}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-white font-medium">
                        {flare.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        Peak Flux: {flare.peakFlux}
                      </span>
                      <span className="text-xs text-gray-500">
                        Frequency: {flare.frequency}
                      </span>
                      {flare.recovery !== "N/A" && (
                        <span className="text-xs text-gray-500">
                          Recovery: {flare.recovery}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-400 mb-2">
                  {flare.description}
                </p>
                <div className="text-xs text-gray-500">
                  <strong>Radio Impact:</strong> {flare.radioImpact}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What to Expect */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            What to Expect if a Flare Occurs
          </h4>
          <div className="space-y-4 text-sm">
            <div>
              <h5 className="text-white font-medium mb-2">During the Flare:</h5>
              <ul className="space-y-1 text-gray-400">
                <li>
                  &#8226; Sudden increase in noise levels on HF bands
                  (especially higher frequencies)
                </li>
                <li>
                  &#8226; Rapid signal fading or complete loss of propagation
                </li>
                <li>
                  &#8226; Effects concentrated on the sunlit side of Earth
                </li>
                <li>
                  &#8226; Lower frequencies (40m, 80m) may remain partially
                  usable
                </li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-medium mb-2">Recovery Phase:</h5>
              <ul className="space-y-1 text-gray-400">
                <li>
                  &#8226; Propagation typically returns from lower to higher
                  bands
                </li>
                <li>
                  &#8226; Recovery time depends on flare intensity (minutes to
                  hours)
                </li>
                <li>
                  &#8226; Watch for enhanced propagation as ionosphere
                  stabilizes
                </li>
                <li>
                  &#8226; Large flares may be followed by geomagnetic storms 1-3
                  days later
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Historical Context */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Typical Probability Ranges
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-gray-400">
                    Solar Phase
                  </th>
                  <th className="text-center py-2 px-3 text-gray-400">
                    C-Class
                  </th>
                  <th className="text-center py-2 px-3 text-gray-400">
                    M-Class
                  </th>
                  <th className="text-center py-2 px-3 text-gray-400">
                    X-Class
                  </th>
                  <th className="text-center py-2 px-3 text-gray-400">
                    Proton
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3 text-gray-300">Solar Minimum</td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMin.c}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMin.m}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMin.x}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMin.proton}
                  </td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3 text-gray-300">Mid-Cycle</td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMid.c}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMid.m}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMid.x}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMid.proton}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-gray-300">Solar Maximum</td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMax.c}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMax.m}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMax.x}
                  </td>
                  <td className="py-2 px-3 text-center text-gray-400">
                    {HISTORICAL_CONTEXT.solarMax.proton}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            These are typical ranges. Active regions on the sun can cause
            elevated probabilities regardless of cycle phase.
          </p>
        </div>

        {/* Proton Events */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            About Proton Events
          </h4>
          <div className="text-sm text-gray-300 space-y-2">
            <p>
              Solar Proton Events (SPEs) occur when high-energy protons are
              accelerated by solar flares or CME-driven shocks. These events
              primarily affect:
            </p>
            <ul className="space-y-1 text-gray-400 ml-4">
              <li>
                &#8226; <strong>Polar HF communications</strong> - Complete
                absorption (Polar Cap Absorption event)
              </li>
              <li>
                &#8226; <strong>Aviation</strong> - Increased radiation exposure
                on polar routes
              </li>
              <li>
                &#8226; <strong>Satellites</strong> - Single-event upsets in
                electronics
              </li>
              <li>
                &#8226; <strong>Astronauts</strong> - Elevated radiation hazard
              </li>
            </ul>
            <p className="text-gray-400">
              For amateur radio, proton events primarily impact polar and
              high-latitude paths. Mid-latitude and equatorial paths are
              generally unaffected.
            </p>
          </div>
        </div>
      </div>
    </DetailModal>
  );
};

FlareProbabilityModal.displayName = "FlareProbabilityModal";

export default FlareProbabilityModal;

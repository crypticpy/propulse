/**
 * NVISAnalysis Component
 *
 * Displays NVIS (Near Vertical Incidence Skywave) propagation analysis
 * for emergency and regional communications. NVIS enables reliable
 * communications within ~400km radius by using high-angle radiation
 * that reflects nearly straight down from the ionosphere.
 *
 * Key use cases:
 * - ARES/RACES emergency communications
 * - Disaster response coordination
 * - Regional nets and traffic handling
 * - Skip zone coverage
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import {
  analyzeNVIS,
  getNVISConditionColor,
  getNVISConditionLabel,
} from "@/lib/utils/nvis";

interface NVISAnalysisProps {
  /** Station latitude in degrees */
  lat: number;
  /** Station longitude in degrees */
  lon: number;
  /** Solar Flux Index */
  sfi: number;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Radio wave icon for NVIS visualization
 */
function NVISIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Antenna */}
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="8" y1="20" x2="16" y2="20" />
      {/* Upward waves (NVIS pattern) */}
      <path d="M8 8 C10 4, 14 4, 16 8" />
      <path d="M6 6 C9 1, 15 1, 18 6" />
      {/* Ionosphere reflection */}
      <path d="M4 4 L20 4" strokeDasharray="2 2" opacity="0.5" />
      {/* Downward waves */}
      <path d="M4 8 C6 4, 8 6, 8 8" opacity="0.6" />
      <path d="M16 8 C16 6, 18 4, 20 8" opacity="0.6" />
    </svg>
  );
}

/**
 * Frequency bar visualization
 */
function FrequencyBar({
  min,
  max,
  optimal,
  f0F2,
}: {
  min: number;
  max: number;
  optimal: number;
  f0F2: number;
}) {
  // Scale: 1.5 MHz to 12 MHz display range
  const scaleMin = 1.5;
  const scaleMax = 12;
  const toPercent = (freq: number) =>
    ((freq - scaleMin) / (scaleMax - scaleMin)) * 100;

  const minPos = Math.max(0, toPercent(min));
  const maxPos = Math.min(100, toPercent(max));
  const optimalPos = toPercent(optimal);
  const f0F2Pos = toPercent(f0F2);

  return (
    <div className="relative h-6 bg-nebula-blue/50 rounded-lg overflow-hidden">
      {/* Usable range */}
      <div
        className="absolute h-full bg-gradient-to-r from-purple-600/40 via-purple-500/60 to-purple-600/40"
        style={{
          left: `${minPos}%`,
          width: `${maxPos - minPos}%`,
        }}
      />

      {/* Optimal frequency marker */}
      <div
        className="absolute h-full w-1 bg-signal-green shadow-[0_0_8px_rgba(0,255,136,0.6)]"
        style={{ left: `${optimalPos}%` }}
      />

      {/* f0F2 marker (critical frequency) */}
      <div
        className="absolute h-full w-0.5 bg-alert-red/80"
        style={{ left: `${f0F2Pos}%` }}
      />

      {/* Frequency labels */}
      <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-mono text-gray-400">
        <span>2</span>
        <span>4</span>
        <span>6</span>
        <span>8</span>
        <span>10</span>
      </div>
    </div>
  );
}

/**
 * Band recommendation chip
 */
function BandChip({ band, isPrimary }: { band: string; isPrimary: boolean }) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
        ${
          isPrimary
            ? "bg-purple-500/30 text-purple-300 border border-purple-500/50"
            : "bg-white/5 text-gray-400 border border-white/10"
        }
      `}
    >
      {band}
    </span>
  );
}

/**
 * Metric display item
 */
function MetricItem({
  label,
  value,
  unit,
  subValue,
}: {
  label: string;
  value: string | number;
  unit?: string;
  subValue?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-lg font-mono text-white">
        {value}
        {unit && <span className="text-xs text-gray-400 ml-0.5">{unit}</span>}
      </div>
      {subValue && <div className="text-xs text-gray-600">{subValue}</div>}
    </div>
  );
}

/**
 * NVISAnalysis Component
 *
 * Displays comprehensive NVIS analysis for emergency communications planning.
 */
export function NVISAnalysis({
  lat,
  lon,
  sfi,
  className = "",
}: NVISAnalysisProps) {
  // Calculate NVIS analysis for current conditions
  const analysis = useMemo(() => {
    return analyzeNVIS(lat, lon, sfi, new Date());
  }, [lat, lon, sfi]);

  const conditionColor = getNVISConditionColor(analysis.reliability);
  const conditionLabel = getNVISConditionLabel(analysis.reliability);

  return (
    <Card className={className}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <NVISIcon className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                NVIS Analysis
              </h3>
              <p className="text-xs text-gray-500">
                Regional Emergency Communications
              </p>
            </div>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-medium ${conditionColor} bg-white/5`}
          >
            {conditionLabel}
          </div>
        </div>

        {/* Not viable warning */}
        {!analysis.nvisViable && (
          <div className="p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
            <p className="text-sm text-alert-red">
              NVIS propagation is not viable at this time. The F2 layer critical
              frequency is too low ({analysis.f0F2.toFixed(1)} MHz) to support
              reliable NVIS communications.
            </p>
          </div>
        )}

        {/* Frequency visualization */}
        {analysis.nvisViable && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Frequency Range (MHz)</span>
              <span className="font-mono">
                {analysis.frequencyRange.min.toFixed(1)} -{" "}
                {analysis.frequencyRange.max.toFixed(1)} MHz
              </span>
            </div>
            <FrequencyBar
              min={analysis.frequencyRange.min}
              max={analysis.frequencyRange.max}
              optimal={analysis.optimalFrequency}
              f0F2={analysis.f0F2}
            />
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-purple-500/60 rounded" />
                <span className="text-gray-500">Usable</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-signal-green rounded" />
                <span className="text-gray-500">Optimal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-alert-red/80 rounded" />
                <span className="text-gray-500">f0F2</span>
              </div>
            </div>
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5">
          <MetricItem
            label="Optimal Freq"
            value={analysis.optimalFrequency.toFixed(2)}
            unit="MHz"
          />
          <MetricItem
            label="Coverage"
            value={analysis.coverageRadius}
            unit="km"
            subValue="radius"
          />
          <MetricItem label="Reliability" value={`${analysis.reliability}%`} />
        </div>

        {/* Additional info */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5">
          <MetricItem
            label="Takeoff Angle"
            value={`${analysis.takeoffAngle}°`}
            subValue="from horizontal"
          />
          <MetricItem
            label="f0F2"
            value={analysis.f0F2.toFixed(1)}
            unit="MHz"
          />
          <MetricItem
            label="Layer"
            value={analysis.layerUsed}
            subValue="reflection"
          />
        </div>

        {/* Band recommendations */}
        {analysis.recommendedBands.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="text-xs text-gray-400 font-medium">
              Recommended Bands
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis.recommendedBands.map((band, index) => (
                <BandChip key={band} band={band} isPrimary={index === 0} />
              ))}
            </div>
          </div>
        )}

        {/* Condition summary */}
        <div className="pt-2 border-t border-white/5">
          <p className="text-sm text-gray-400">{analysis.conditionSummary}</p>
        </div>

        {/* Emergency note */}
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-xs text-purple-300">
              NVIS is ideal for emergency nets. Use a horizontal dipole at 1/4
              wavelength height for best results. The 60m and 80m bands provide
              the most reliable coverage.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default NVISAnalysis;

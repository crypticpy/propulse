/**
 * StormImpactPanel
 *
 * Renders a personalized StormImpactReport as an embeddable dark-themed panel.
 * Designed to be placed inside modals (AlertHistoryModal, SwpcAlertDetailModal)
 * or below the EmergencyTickerBar.
 *
 * Sections:
 *  1. Header with overall severity badge
 *  2. Summary text
 *  3. Your Equipment (per-antenna impacts)
 *  4. Band Status timeline
 *  5. Suggested Alternatives
 *  6. Recommendations
 *  7. Recovery Estimate
 *  8. "Configure Station" CTA when no station is set up
 */

import { useStormImpact } from "@/hooks/useStormImpact";
import { isStormRelevantType } from "@/lib/utils/stormImpactAnalyzer";
import type { SolarAlert } from "@/types/alerts";
import type {
  EquipmentImpact,
  BandTimelineEntry,
  AlternativeBand,
  StormImpactReport,
} from "@/lib/utils/stormImpactAnalyzer";

// =============================================================================
// TYPES
// =============================================================================

export interface StormImpactPanelProps {
  alert: SolarAlert;
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SEVERITY_STYLES: Record<
  StormImpactReport["overallSeverity"],
  { badge: string; dot: string }
> = {
  minimal: {
    badge: "bg-signal-green/20 text-signal-green border-signal-green/40",
    dot: "bg-signal-green",
  },
  moderate: {
    badge: "bg-caution-amber/20 text-caution-amber border-caution-amber/40",
    dot: "bg-caution-amber",
  },
  severe: {
    badge: "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40",
    dot: "bg-plasma-orange",
  },
  extreme: {
    badge: "bg-alert-red/20 text-alert-red border-alert-red/40",
    dot: "bg-alert-red",
  },
};

const EQUIP_SEVERITY_COLORS: Record<EquipmentImpact["severity"], string> = {
  none: "text-signal-green",
  mild: "text-cosmic-cyan",
  moderate: "text-caution-amber",
  severe: "text-alert-red",
};

const BAND_STATUS_COLORS: Record<BandTimelineEntry["currentStatus"], string> = {
  open: "bg-signal-green",
  degraded: "bg-caution-amber",
  closed: "bg-alert-red",
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SeverityBadge({
  severity,
}: {
  severity: StormImpactReport["overallSeverity"];
}) {
  const styles = SEVERITY_STYLES[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border ${styles.badge}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${styles.dot}`} />
      {severity}
    </span>
  );
}

function EquipmentSection({ impacts }: { impacts: EquipmentImpact[] }) {
  if (impacts.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Your Equipment
      </h4>
      <div className="space-y-2">
        {impacts.map((impact) => (
          <div
            key={impact.antennaName}
            className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-white">
                {impact.antennaName}
              </span>
              <span
                className={`text-xs font-semibold uppercase ${EQUIP_SEVERITY_COLORS[impact.severity]}`}
              >
                {impact.severity}
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {impact.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BandStatusSection({ entries }: { entries: BandTimelineEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Band Status
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {entries.map((entry) => (
          <div
            key={entry.band}
            className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.03]"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${BAND_STATUS_COLORS[entry.currentStatus]}`}
            />
            <span className="text-xs font-mono text-white">{entry.band}</span>
            <span className="text-[10px] text-gray-500 ml-auto">
              {entry.recoveryEstimate}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlternativesSection({ alts }: { alts: AlternativeBand[] }) {
  if (alts.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Suggested Alternatives
      </h4>
      <div className="space-y-1.5">
        {alts.map((alt, i) => (
          <div
            key={`${alt.band}-${i}`}
            className="flex items-start gap-2 text-xs"
          >
            <span className="font-mono font-semibold text-cosmic-cyan whitespace-nowrap">
              {alt.band} {alt.mode}
            </span>
            <span className="text-gray-400">{alt.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationsSection({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Recommendations
      </h4>
      <ul className="space-y-1">
        {items.map((rec, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
            <span className="text-gray-600 mt-0.5 flex-shrink-0">&bull;</span>
            {rec}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfigureCTA() {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-3 text-center">
      <p className="text-xs text-gray-500 mb-1.5">
        Configure your station in Shack for personalized impact analysis
      </p>
      <a
        href="/shack"
        className="inline-flex items-center gap-1 text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
      >
        Go to Shack
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </a>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * StormImpactPanel renders a personalized radio-impact analysis for a given
 * solar weather alert. Reads station configuration from Zustand stores via
 * the useStormImpact hook.
 *
 * Renders nothing if the alert type is not storm-relevant.
 */
export function StormImpactPanel({
  alert,
  className = "",
}: StormImpactPanelProps) {
  const report = useStormImpact(alert);

  // Don't render if the alert type isn't relevant or report is null
  if (!report || !isStormRelevantType(alert.type)) {
    return null;
  }

  const hasEquipment = report.affectedEquipment.length > 0;
  const noStation =
    report.affectedEquipment.length === 0 &&
    report.recommendations.some((r) => r.includes("Configure your station"));

  return (
    <div
      className={`rounded-xl bg-void-black/50 border border-white/10 p-4 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Radio Impact Analysis
        </h3>
        <SeverityBadge severity={report.overallSeverity} />
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-300 mb-4 leading-relaxed">
        {report.summary}
      </p>

      {/* Sections */}
      <div className="space-y-4">
        {hasEquipment && (
          <EquipmentSection impacts={report.affectedEquipment} />
        )}

        <BandStatusSection entries={report.bandTimeline} />

        <AlternativesSection alts={report.alternativeBands} />

        <RecommendationsSection items={report.recommendations} />

        {/* Recovery estimate */}
        {report.estimatedRecovery && (
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <span className="text-xs text-gray-500">Recovery:</span>
            <span className="text-xs text-gray-300 font-medium">
              {report.estimatedRecovery}
            </span>
          </div>
        )}

        {/* Configure station CTA */}
        {noStation && <ConfigureCTA />}
      </div>
    </div>
  );
}

export default StormImpactPanel;

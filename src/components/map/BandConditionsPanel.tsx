/**
 * BandConditionsPanel Component
 *
 * Standalone panel displaying band-by-band propagation conditions
 * with S-meter indicators, SNR estimates, and status information.
 * Designed for left-side framed layout position.
 */

import { useMemo, useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getPathIllumination } from "@/lib/utils/path";
import {
  getBandConditionsForPath,
  getEnhancedBandConditions,
  getPathStatusColor,
  getPathStatusBgColor,
  type PathBandCondition,
} from "@/lib/utils/bands";
import { Card } from "@/components/ui/Card";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";
import type { SUnit } from "@/types/signal";

interface BandConditionsPanelProps {
  displayTime: Date;
  className?: string;
  compact?: boolean;
}

export function BandConditionsPanel({
  displayTime,
  className = "",
  compact = false,
}: BandConditionsPanelProps) {
  const { target } = useMapStore();
  const { station } = useUserStore();
  const [showHelp, setShowHelp] = useState(false);

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
    if (!station || !target) return 0;
    return getPathIllumination(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      displayTime,
    );
  }, [station, target, displayTime]);

  // Calculate basic band conditions (fallback)
  const basicBandConditions = useMemo(() => {
    if (!station || !target) return [];
    return getBandConditionsForPath(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      currentKp,
      currentSfi,
      illumination,
    );
  }, [station, target, currentKp, currentSfi, illumination]);

  // Calculate enhanced band conditions with S-unit readings
  const enhancedBandConditions = useMemo(() => {
    if (!station || !target) return null;
    try {
      return getEnhancedBandConditions(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        currentKp,
        currentSfi,
        displayTime,
        100, // Default 100W TX power
        "FT8", // Default to FT8 mode
      );
    } catch {
      return null;
    }
  }, [station, target, currentKp, currentSfi, displayTime]);

  // Use enhanced conditions if available
  const bandConditions = enhancedBandConditions || basicBandConditions;

  // No station configured
  if (!station) {
    return (
      <>
        <Card className={`${className} h-full`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white">
                  Band Conditions
                </h3>
                <HelpButton onClick={() => setShowHelp(true)} />
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Set your QTH in settings
            </div>
          </div>
        </Card>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.bandConditions.title}
          sections={HELP_CONTENT.bandConditions.sections}
        />
      </>
    );
  }

  // No target selected
  if (!target) {
    return (
      <>
        <Card className={`${className} h-full`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white">
                  Band Conditions
                </h3>
                <HelpButton onClick={() => setShowHelp(true)} />
              </div>
              <div className="text-xs text-gray-500 font-mono">
                Kp={currentKp} SFI={currentSfi}
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm text-center px-4">
              Click on the map to select a target
            </div>
          </div>
        </Card>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.bandConditions.title}
          sections={HELP_CONTENT.bandConditions.sections}
        />
      </>
    );
  }

  return (
    <>
      <Card className={`${className} h-full flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white">Band Conditions</h3>
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
          <div className="text-xs text-gray-500 font-mono">
            Kp={currentKp} SFI={currentSfi}
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 -mx-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-nebula-blue text-gray-400">
                <th className="px-1 py-1 text-left font-medium">Band</th>
                <th className="px-1 py-1 text-center font-medium">Status</th>
                {!compact && (
                  <>
                    <th className="px-1 py-1 text-center font-medium">
                      Signal
                    </th>
                    <th className="px-1 py-1 text-center font-medium">SNR</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bandConditions.map((condition) => (
                <BandConditionRow
                  key={condition.band}
                  condition={condition}
                  hasEnhancedData={!!enhancedBandConditions}
                  compact={compact}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer with path info */}
        <div className="flex-shrink-0 pt-2 mt-2 border-t border-white/5 text-[10px] text-gray-400">
          Path illumination: {Math.round(illumination)}%
        </div>
      </Card>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title={HELP_CONTENT.bandConditions.title}
        sections={HELP_CONTENT.bandConditions.sections}
      />
    </>
  );
}

/**
 * Band condition table row
 */
function BandConditionRow({
  condition,
  hasEnhancedData,
  compact,
}: {
  condition: PathBandCondition;
  hasEnhancedData: boolean;
  compact: boolean;
}) {
  const statusColor = getPathStatusColor(condition.status);
  const statusBgColor = getPathStatusBgColor(condition.status);
  const statusLabel =
    condition.status.charAt(0).toUpperCase() + condition.status.slice(1);

  const sUnitText = condition.sUnit?.text || "N/A";
  const sUnitColor = getSUnitColor(condition.sUnit);

  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="px-1 py-1">
        <div className="font-mono text-white text-sm">{condition.band}</div>
        <div className="text-gray-400 text-[10px]">{condition.frequency}</div>
      </td>
      <td className="px-1 py-1 text-center">
        <span
          className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColor} ${statusBgColor}`}
        >
          {statusLabel}
        </span>
      </td>
      {!compact && (
        <>
          <td className="px-1 py-1 text-center">
            <div className="flex items-center justify-center gap-0.5">
              <SMeterIndicator sUnit={condition.sUnit} />
              <span className={`font-mono text-[10px] ${sUnitColor}`}>
                {sUnitText}
              </span>
            </div>
          </td>
          <td className="px-1 py-1 text-center font-mono text-[10px]">
            <span
              className={
                condition.snrEstimate <= -24 ? "text-gray-500" : "text-white"
              }
            >
              {condition.snrEstimate}dB
            </span>
            {hasEnhancedData && condition.pathLoss !== undefined && (
              <div className="text-[9px] text-gray-400">
                {Math.round(condition.pathLoss)}dB loss
              </div>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

/**
 * Get color class for S-unit display
 */
function getSUnitColor(sUnit?: SUnit): string {
  if (!sUnit) return "text-gray-500";
  const value = sUnit.value;
  if (value >= 8) return "text-signal-green";
  if (value >= 5) return "text-caution-amber";
  return "text-alert-red";
}

/**
 * S-meter visual indicator
 */
function SMeterIndicator({ sUnit }: { sUnit?: SUnit }) {
  if (!sUnit) {
    return (
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-1 h-2 rounded-sm bg-gray-700" />
        ))}
      </div>
    );
  }

  const value = sUnit.value;
  const filledBars = Math.min(5, Math.max(1, Math.ceil(value / 2)));

  const getBarColor = (_barIndex: number, filled: boolean): string => {
    if (!filled) return "bg-gray-700";
    if (value >= 8) return "bg-signal-green";
    if (value >= 5) return "bg-caution-amber";
    return "bg-alert-red";
  };

  return (
    <div className="flex gap-0.5" title={`${sUnit.text} (${sUnit.dBm} dBm)`}>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-colors ${getBarColor(i, i < filledBars)}`}
          style={{ height: `${6 + i * 2}px` }}
        />
      ))}
    </div>
  );
}

export default BandConditionsPanel;

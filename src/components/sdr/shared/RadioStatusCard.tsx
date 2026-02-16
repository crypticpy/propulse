/**
 * RadioStatusCard -- Read-only frequency / mode / AGC status display.
 * Shared between Classic and Flexible skins.
 */

import { Card } from "@/components/ui";
import type { RadioState } from "@/lib/radio/protocol";
import { formatHz } from "@/components/sdr/skins/types";

export interface RadioStatusCardProps {
  effectiveState: RadioState | null;
}

export function RadioStatusCard({ effectiveState }: RadioStatusCardProps) {
  if (!effectiveState) return null;

  return (
    <Card className="p-4 space-y-1.5">
      <div className="text-sm font-semibold text-gray-200">Status</div>
      <div className="text-xs text-gray-500 flex justify-between">
        <span>Frequency</span>
        <span className="text-gray-300 font-mono">
          {formatHz(effectiveState.freq)}
        </span>
      </div>
      <div className="text-xs text-gray-500 flex justify-between">
        <span>Mode</span>
        <span className="text-gray-300 font-mono">{effectiveState.mode}</span>
      </div>
      <div className="text-xs text-gray-500 flex justify-between">
        <span>AGC</span>
        <span className="text-gray-300 font-mono">
          {effectiveState.agc ? "on" : "off"}
        </span>
      </div>
    </Card>
  );
}

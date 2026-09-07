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
      <div className="text-sm font-semibold text-su-text">Status</div>
      <div className="text-xs text-su-muted flex justify-between">
        <span>Frequency</span>
        <span className="text-su-muted font-mono">
          {formatHz(effectiveState.freq)}
        </span>
      </div>
      <div className="text-xs text-su-muted flex justify-between">
        <span>Mode</span>
        <span className="text-su-muted font-mono">{effectiveState.mode}</span>
      </div>
      <div className="text-xs text-su-muted flex justify-between">
        <span>AGC</span>
        <span className="text-su-muted font-mono">
          {effectiveState.agc ? "on" : "off"}
        </span>
      </div>
    </Card>
  );
}

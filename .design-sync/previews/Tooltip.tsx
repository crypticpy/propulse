import { Inline, Tooltip } from "propulse";

// Tooltip has no prop to force the popover open — visibility is internal
// hover/focus state. This card shows the trigger only. See learnings.
export function Trigger() {
  return (
    <Inline>
      <Tooltip content="Signal-to-noise ratio measured over the last 60 seconds">
        <span className="text-sm text-su-text border-b border-dotted border-su-line/40 cursor-help">
          SNR 12 dB
        </span>
      </Tooltip>
      <Tooltip content="Maidenhead grid square for DL2ABC">
        <span className="text-sm font-mono text-su-text">JO31</span>
      </Tooltip>
    </Inline>
  );
}

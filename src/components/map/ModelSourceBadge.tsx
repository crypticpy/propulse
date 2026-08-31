/**
 * ModelSourceBadge
 *
 * A small pill naming which engine produced the numbers next to it. The
 * descriptors themselves (and the reasoning behind them) live in
 * `@/lib/map/modelSource`.
 *
 * Per the panel title rule this belongs in a panel's status row, never in its
 * title row.
 */

import type {
  ModelSourceDescriptor,
  ModelSourceTone,
} from "@/lib/map/modelSource";

const TONE_CLASSES: Record<ModelSourceTone, string> = {
  physics: "border-white/15 bg-white/[0.06] text-gray-400",
  ml: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  degraded: "border-caution-amber/30 bg-caution-amber/10 text-caution-amber",
};

interface ModelSourceBadgeProps {
  source: ModelSourceDescriptor;
  className?: string;
}

export function ModelSourceBadge({ source, className }: ModelSourceBadgeProps) {
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border cursor-help whitespace-nowrap ${
        TONE_CLASSES[source.tone]
      } ${className ?? ""}`}
      title={`${source.label.toUpperCase()}\n${source.detail}`}
    >
      {source.label}
    </span>
  );
}

export default ModelSourceBadge;

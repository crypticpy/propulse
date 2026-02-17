/**
 * BandPlanOverlay — Renders ITU band plan segments as colored strips
 * on top of the spectrum/waterfall views.
 *
 * Semi-transparent regions show CW, PHONE, DATA, and FM allocations.
 * Positioned absolutely and requires a parent with position: relative.
 */

import { useMemo } from "react";
import { getSegmentForFrequency, getBandPlan } from "@/lib/data/bandplans";
import { getBandForFrequency } from "@/lib/data/bandRanges";
import type { BandSegment, ITURegion } from "@/types/bandplan";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BandPlanOverlayProps {
  /** Current waterfall view center in Hz */
  centerHz: number;
  /** Current waterfall view span in Hz */
  spanHz: number;
  /** ITU region for band plan lookup (default: ITU2) */
  region?: ITURegion;
  /** Show mode labels above segments */
  showLabels?: boolean;
  /** Overlay height mode: "full" stretches to parent, "top" renders as strip */
  position?: "full" | "top" | "bottom";
  className?: string;
}

// ─── Mode → color mapping ────────────────────────────────────────────────────

const MODE_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  CW: {
    bg: "rgba(59, 130, 246, 0.08)", // blue
    border: "rgba(59, 130, 246, 0.25)",
    text: "text-blue-400/60",
  },
  PHONE: {
    bg: "rgba(34, 197, 94, 0.08)", // green
    border: "rgba(34, 197, 94, 0.25)",
    text: "text-green-400/60",
  },
  DATA: {
    bg: "rgba(168, 85, 247, 0.08)", // purple
    border: "rgba(168, 85, 247, 0.25)",
    text: "text-purple-400/60",
  },
  RTTY: {
    bg: "rgba(168, 85, 247, 0.08)", // purple (same as DATA)
    border: "rgba(168, 85, 247, 0.25)",
    text: "text-purple-400/60",
  },
  FM: {
    bg: "rgba(249, 115, 22, 0.08)", // orange
    border: "rgba(249, 115, 22, 0.25)",
    text: "text-orange-400/60",
  },
  AM: {
    bg: "rgba(234, 179, 8, 0.08)", // yellow
    border: "rgba(234, 179, 8, 0.25)",
    text: "text-yellow-400/60",
  },
  IMAGE: {
    bg: "rgba(236, 72, 153, 0.08)", // pink
    border: "rgba(236, 72, 153, 0.25)",
    text: "text-pink-400/60",
  },
};

function getSegmentColor(segment: BandSegment) {
  // Use the primary mode for coloring
  const primaryMode = segment.modes[0];
  return MODE_COLORS[primaryMode] ?? MODE_COLORS.DATA;
}

function getSegmentLabel(segment: BandSegment): string {
  if (segment.modes.length === 1) return segment.modes[0];
  // Abbreviate multiple modes
  const has = (m: string) =>
    segment.modes.includes(m as BandSegment["modes"][number]);
  if (has("CW") && has("PHONE") && has("DATA")) return "ALL";
  if (has("CW") && has("PHONE")) return "CW+PH";
  if (has("CW") && has("DATA")) return "CW+DIG";
  return segment.modes.join("/");
}

// ─── Component ───────────────────────────────────────────────────────────────

interface VisibleSegment {
  segment: BandSegment;
  leftPct: number;
  widthPct: number;
  label: string;
}

export function BandPlanOverlay({
  centerHz,
  spanHz,
  region = "ITU2",
  showLabels = true,
  position = "full",
  className = "",
}: BandPlanOverlayProps) {
  const visibleSegments = useMemo(() => {
    if (!Number.isFinite(centerHz) || !Number.isFinite(spanHz) || spanHz <= 0) {
      return [];
    }

    const viewStartHz = centerHz - spanHz / 2;
    const viewEndHz = centerHz + spanHz / 2;
    // Find which band we're in
    const midKHz = centerHz / 1000;
    const band = getBandForFrequency(midKHz);
    if (!band) return [];

    const bandPlan = getBandPlan(band, region);
    if (!bandPlan) return [];

    // Filter segments visible in current view
    const result: VisibleSegment[] = [];
    for (const seg of bandPlan.segments) {
      const segStartHz = seg.startKHz * 1000;
      const segEndHz = seg.endKHz * 1000;

      // Skip if completely outside view
      if (segEndHz < viewStartHz || segStartHz > viewEndHz) continue;

      // Clamp to view
      const clampedStart = Math.max(segStartHz, viewStartHz);
      const clampedEnd = Math.min(segEndHz, viewEndHz);

      const leftPct = ((clampedStart - viewStartHz) / spanHz) * 100;
      const widthPct = ((clampedEnd - clampedStart) / spanHz) * 100;

      // Skip tiny segments (< 0.5% of view)
      if (widthPct < 0.5) continue;

      result.push({
        segment: seg,
        leftPct,
        widthPct,
        label: getSegmentLabel(seg),
      });
    }

    return result;
  }, [centerHz, spanHz, region]);

  // Also check edge-of-band markers (band boundaries might be visible)
  const bandEdge = useMemo(() => {
    if (!Number.isFinite(centerHz) || !Number.isFinite(spanHz)) return null;

    const viewStartHz = centerHz - spanHz / 2;
    const midKHz = centerHz / 1000;
    const band = getBandForFrequency(midKHz);
    if (!band) return null;

    // Check if we have a matching segment at the center frequency
    const seg = getSegmentForFrequency(midKHz, region);
    if (!seg) return null;

    // If band edges are visible, mark them
    const bandPlan = getBandPlan(band, region);
    if (!bandPlan) return null;

    const bandStartHz = bandPlan.startMHz * 1e6;
    const bandEndHz = bandPlan.endMHz * 1e6;
    const viewEndHz = centerHz + spanHz / 2;

    const edges: Array<{ pct: number; label: string }> = [];

    if (bandStartHz >= viewStartHz && bandStartHz <= viewEndHz) {
      edges.push({
        pct: ((bandStartHz - viewStartHz) / spanHz) * 100,
        label: `${bandPlan.band} ▸`,
      });
    }
    if (bandEndHz >= viewStartHz && bandEndHz <= viewEndHz) {
      edges.push({
        pct: ((bandEndHz - viewStartHz) / spanHz) * 100,
        label: `◂ ${bandPlan.band}`,
      });
    }

    return edges.length > 0 ? edges : null;
  }, [centerHz, spanHz, region]);

  if (visibleSegments.length === 0 && !bandEdge) return null;

  const posClass =
    position === "top"
      ? "absolute top-0 left-0 right-0 h-5"
      : position === "bottom"
        ? "absolute bottom-0 left-0 right-0 h-5"
        : "absolute inset-0";

  return (
    <div className={`${posClass} pointer-events-none z-[1] ${className}`}>
      {/* Segment regions */}
      {visibleSegments.map((vs, i) => {
        const color = getSegmentColor(vs.segment);
        return (
          <div
            key={`${vs.segment.startKHz}-${vs.segment.endKHz}-${i}`}
            className="absolute top-0 bottom-0"
            style={{
              left: `${vs.leftPct}%`,
              width: `${vs.widthPct}%`,
              backgroundColor: color.bg,
              borderLeft: `1px solid ${color.border}`,
              borderRight: `1px solid ${color.border}`,
            }}
          >
            {/* Label — only when segment is wide enough (>3%) and labels enabled */}
            {showLabels && vs.widthPct > 3 && (
              <div
                className={`absolute top-0.5 left-1 text-[8px] font-semibold uppercase tracking-wider ${color.text}`}
              >
                {vs.label}
              </div>
            )}
          </div>
        );
      })}

      {/* Band edge markers */}
      {bandEdge?.map((edge, i) => (
        <div
          key={`edge-${i}`}
          className="absolute top-0 bottom-0 w-px"
          style={{ left: `${edge.pct}%` }}
        >
          <div className="w-px h-full bg-caution-amber/40" />
          <div className="absolute top-1 left-0 -translate-x-1/2 text-[7px] font-mono text-caution-amber/50 whitespace-nowrap">
            {edge.label}
          </div>
        </div>
      ))}
    </div>
  );
}

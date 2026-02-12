/**
 * ContactThisStation — Main panel assembling contact analysis for visitor view.
 * Shows path info (distance, bearing), band conditions, shared bands/modes,
 * schedule overlap, and a "best recommendation" card.
 */

import type { PublicProfile } from "@/types/social";
import { useContactAnalysis } from "@/hooks/useContactAnalysis";
import { BandConditionsBar } from "./BandConditionsBar";
import { ScheduleOverlap } from "./ScheduleOverlap";

interface ContactThisStationProps {
  /** Target station's public profile */
  profile: PublicProfile;
  /** Viewer's latitude */
  viewerLat?: number;
  /** Viewer's longitude */
  viewerLon?: number;
  /** Viewer's Maidenhead grid */
  viewerGrid?: string;
  /** Viewer's stats cache (contains qsosByBand, qsosByMode) */
  viewerStats?: Record<string, unknown>;
  /** Viewer's 24-element operating hours */
  viewerHours?: number[];
}

/**
 * Small SVG compass arrow rotated to the given bearing.
 */
function CompassArrow({ bearing }: { bearing: number }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="inline-block flex-shrink-0"
      style={{ transform: `rotate(${bearing}deg)` }}
      aria-label={`Bearing ${Math.round(bearing)} degrees`}
    >
      <path
        d="M8 2L10.5 12H5.5L8 2Z"
        fill="currentColor"
        className="text-plasma-orange"
      />
    </svg>
  );
}

export function ContactThisStation({
  profile,
  viewerLat,
  viewerLon,
  viewerGrid,
  viewerStats,
  viewerHours,
}: ContactThisStationProps) {
  // Hooks must be called unconditionally — guard after the hook call
  const hasCoords =
    !!profile.lat && !!profile.lon && !!viewerLat && !!viewerLon;

  const analysis = useContactAnalysis({
    viewerLat: viewerLat ?? 0,
    viewerLon: viewerLon ?? 0,
    targetLat: profile.lat ?? 0,
    targetLon: profile.lon ?? 0,
    viewerStats,
    targetStats: profile.statsCache,
    viewerHours,
    targetHours: profile.operatingHours,
  });

  if (!hasCoords || !analysis) return null;

  const {
    distance,
    bearing,
    bandConditions,
    sharedBands,
    sharedModes,
    overlapHours,
    bestBand,
    bestTimeRange,
  } = analysis;

  const hasScheduleData =
    viewerHours &&
    viewerHours.length === 24 &&
    profile.operatingHours &&
    profile.operatingHours.length === 24;

  // Build recommendation text
  const recommendations: string[] = [];
  if (bestBand) {
    const modeStr =
      sharedModes.length > 0 ? ` ${sharedModes[0].toUpperCase()}` : "";
    const timeStr = bestTimeRange ? ` around ${bestTimeRange}` : "";
    recommendations.push(
      `Try ${bestBand}${modeStr}${timeStr} for best conditions`,
    );
  }

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-5 space-y-4">
      {/* Section header */}
      <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
        Contact This Station
      </h3>

      {/* Header: callsign, distance, bearing */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">
            Contact {profile.callsign}
          </span>
          <CompassArrow bearing={bearing} />
        </div>
        <p className="text-sm text-gray-400 font-mono">
          {Math.round(distance).toLocaleString()} km &middot;{" "}
          {bearing.toFixed(0)}&deg;
        </p>

        {/* Grid path */}
        {(viewerGrid || profile.grid) && (
          <p className="text-xs text-gray-500 font-mono">
            {viewerGrid ?? "---"} &rarr; {profile.grid ?? "---"}
          </p>
        )}
      </div>

      {/* Band conditions bar chart */}
      <div className="space-y-1.5">
        <h4 className="text-[10px] uppercase tracking-widest text-gray-500">
          Band Conditions
        </h4>
        <BandConditionsBar
          conditions={bandConditions}
          sharedBands={sharedBands}
          bestBand={bestBand}
        />
      </div>

      {/* Shared bands & modes pills */}
      {(sharedBands.length > 0 || sharedModes.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {sharedBands.map((band) => (
            <span
              key={`band-${band}`}
              className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30"
            >
              {band}
            </span>
          ))}
          {sharedModes.map((mode) => (
            <span
              key={`mode-${mode}`}
              className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30"
            >
              {mode}
            </span>
          ))}
        </div>
      )}

      {/* Schedule overlap */}
      {hasScheduleData && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] uppercase tracking-widest text-gray-500">
            Schedule Overlap
          </h4>
          <ScheduleOverlap
            viewerHours={viewerHours!}
            targetHours={profile.operatingHours!}
            targetCallsign={profile.callsign}
            overlapHours={overlapHours}
          />
        </div>
      )}

      {/* Best recommendation card */}
      {recommendations.length > 0 && (
        <div className="bg-plasma-orange/10 border border-plasma-orange/20 rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-plasma-orange/70 mb-1">
            Recommendation
          </div>
          {recommendations.map((rec, i) => (
            <p key={i} className="text-sm text-gray-200">
              {rec}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

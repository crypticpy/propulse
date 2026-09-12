/**
 * ContactThisStation — Main panel assembling contact analysis for visitor view.
 * Shows path info (distance, bearing), band conditions, shared bands/modes,
 * schedule overlap, and a "best recommendation" card.
 */

import type { PublicProfile } from "@/types/social";
import { useContactAnalysis } from "@/hooks/useContactAnalysis";
import { BandConditionsBar } from "./BandConditionsBar";
import { ScheduleOverlap } from "./ScheduleOverlap";
import { useChainPerformance } from "@/hooks/useChainPerformance";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import {
  dualEnvelopeCopy,
  farEndGainDbiFromPublicErp,
  parsePublicEquipmentSummary,
} from "@/lib/station/stationIdentity";
import { isSectionVisibleToViewer } from "@/lib/profile/visibility";
import { physicsArgsForPath } from "@/lib/station/stationPhysics";
import { calculateGreatCircleDistance } from "@/lib/utils/bands";

function isValidLatitude(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && Math.abs(value) <= 90;
}

function isValidLongitude(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && Math.abs(value) <= 180;
}

/**
 * A callsign-only station is stored with an explicit `(0, 0)` sentinel and no
 * grid (see `ProfilePage` handleSaveProfile), and profileSync publishes that
 * pair as-is. So the exact null-island pair only counts as a location when a
 * grid backs it up. A zero in one coordinate alone is a real place (the
 * equator, or the prime meridian) and stays accepted either way.
 */
function hasStationLocation(
  lat: number | undefined,
  lon: number | undefined,
  grid: string | undefined,
): boolean {
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) return false;
  if (lat === 0 && lon === 0) return (grid ?? "").trim().length > 0;
  return true;
}

interface ContactCoordinates {
  viewerLat: number;
  viewerLon: number;
  targetLat: number;
  targetLon: number;
}

function readContactCoordinates(
  profileLat: number | undefined,
  profileLon: number | undefined,
  profileGrid: string | undefined,
  viewerLat: number | undefined,
  viewerLon: number | undefined,
  viewerGrid: string | undefined,
): ContactCoordinates | null {
  if (
    !isValidLatitude(profileLat) ||
    !isValidLongitude(profileLon) ||
    !isValidLatitude(viewerLat) ||
    !isValidLongitude(viewerLon) ||
    !hasStationLocation(profileLat, profileLon, profileGrid) ||
    !hasStationLocation(viewerLat, viewerLon, viewerGrid)
  ) {
    return null;
  }
  return {
    viewerLat,
    viewerLon,
    targetLat: profileLat,
    targetLon: profileLon,
  };
}

interface ContactThisStationProps {
  /** Target station's public profile */
  profile: PublicProfile;
  /** Viewer's latitude */
  viewerLat?: number;
  /** Viewer's longitude */
  viewerLon?: number;
  /** Viewer's Maidenhead grid */
  viewerGrid?: string;
  /** Whether the viewer follows this operator, for friends-only sections. */
  viewerIsFriend?: boolean;
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
  viewerIsFriend = false,
  viewerStats,
  viewerHours,
}: ContactThisStationProps) {
  // The target's coordinates are a published profile section. This panel is
  // rendered unconditionally by ProfilePage, so it enforces the disclosure
  // rule itself rather than trusting the call site: an unauthorized viewer
  // gets no coordinates, and therefore no distance, bearing, grid line or
  // contact analysis over them.
  const locationDisclosed = isSectionVisibleToViewer(
    profile.visibilitySettings,
    "location",
    viewerIsFriend,
  );
  const coords = !locationDisclosed
    ? null
    : readContactCoordinates(
        profile.lat,
        profile.lon,
        profile.grid,
        viewerLat,
        viewerLon,
        viewerGrid,
      );

  const ourPerf = useChainPerformance();
  const stationGain = useActiveStationGain();
  const theirKit = parsePublicEquipmentSummary(profile.statsCache?.equipment);
  const distanceKm = coords
    ? calculateGreatCircleDistance(
        coords.viewerLat,
        coords.viewerLon,
        coords.targetLat,
        coords.targetLon,
      )
    : 0;
  const physics = physicsArgsForPath(
    stationGain.antennaType,
    distanceKm,
    stationGain.systemLossDb,
    stationGain.txPowerWatts,
    stationGain.physicsMode,
  );
  const analysis = useContactAnalysis({
    viewerLat: coords?.viewerLat ?? 0,
    viewerLon: coords?.viewerLon ?? 0,
    targetLat: coords?.targetLat ?? 0,
    targetLon: coords?.targetLon ?? 0,
    viewerStats,
    targetStats: profile.statsCache,
    viewerHours,
    targetHours: profile.operatingHours,
    txPowerWatts: physics.txPowerWatts,
    mode: physics.mode,
    antennaGainDbi: physics.antennaGainDbi,
    farEndGainDbi: (band) => farEndGainDbiFromPublicErp(theirKit, band),
  });

  if (!coords || !analysis) return null;

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
    const envelopeBand = bestBand === "40m" ? "40m" : "20m";
    const ourErp = ourPerf.bands.find(
      (band) => band.band === envelopeBand,
    )?.erpWatts;
    const envelope = dualEnvelopeCopy(ourErp, theirKit, envelopeBand);
    if (envelope) recommendations.push(envelope);
  }

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-5 space-y-4">
      {/* Section header */}
      <h3 className="text-[10px] uppercase tracking-widest text-su-muted">
        Contact This Station
      </h3>

      {/* Header: callsign, distance, bearing */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-su-text">
            Contact {profile.callsign}
          </span>
          <CompassArrow bearing={bearing} />
        </div>
        <p className="text-sm text-su-muted font-mono">
          {Math.round(distance).toLocaleString()} km &middot;{" "}
          {bearing.toFixed(0)}&deg;
        </p>

        {/* Grid path */}
        {(viewerGrid || profile.grid) && (
          <p className="text-xs text-su-muted font-mono">
            {viewerGrid ?? "---"} &rarr; {profile.grid ?? "---"}
          </p>
        )}
      </div>

      {/* Band conditions bar chart */}
      <div className="space-y-1.5">
        <h4 className="text-[10px] uppercase tracking-widest text-su-muted">
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
          <h4 className="text-[10px] uppercase tracking-widest text-su-muted">
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
            <p key={i} className="text-sm text-su-text">
              {rec}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

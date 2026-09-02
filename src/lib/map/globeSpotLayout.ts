import {
  formatActivationFrequency,
  type MappableActivationSpot,
} from "@/lib/map/activationMarkers";
import {
  presentActivationSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import type {
  SpotLayoutCandidate,
  SpotLayoutResult,
  SpotLayoutRole,
} from "@/lib/map/screenSpaceSpotLayout";
import {
  spotLayoutCandidateId,
  spotLayoutReportId,
} from "@/lib/map/screenSpaceSpotLayout";
import {
  getBandColor,
  getBandFromFrequency,
  getSpotColor,
  SPOT_REPLAY_COLOR,
  type SpotColorMode,
} from "@/lib/utils/spotColors";
import type { LiveSpot } from "@/types/livespot";

/** Payload retained by the projection-neutral layout for globe rendering. */
export interface GlobeSpotLayoutPayload {
  spot: PresentableSpot;
  role: SpotLayoutRole;
  color: string;
}

export type GlobeSpotLayoutResult = SpotLayoutResult<GlobeSpotLayoutPayload>;

/**
 * The coordinate-bearing subset of LiveSpotArcs' resolved report contract.
 * Keeping this structural type in the map library avoids importing a React
 * renderer into the deterministic candidate builder.
 */
export interface GlobeResolvedLiveSpot {
  spotterLat: number;
  spotterLon: number;
  dxLat: number;
  dxLon: number;
  callsign: string;
  spotter?: string;
  frequency: number;
  mode: string;
  band?: string;
  snr?: number;
  time: Date;
  originalSpot: LiveSpot;
}

export interface BuildGlobeSpotLayoutCandidatesOptions {
  includeLiveActivity: boolean;
  /** Live labels render only when the normal spots layer is visible. */
  renderLiveLabels: boolean;
  includeActivations: boolean;
  resolvedLiveSpots: readonly GlobeResolvedLiveSpot[];
  includeReplayActivity?: boolean;
  resolvedReplaySpots?: readonly GlobeResolvedLiveSpot[];
  activationSpots: readonly MappableActivationSpot[];
  selectedSpotId?: string;
  matchedSpotIds: ReadonlySet<string>;
  activeBand?: string;
  labelScale: number;
  showSpotCallsignLabels: boolean;
  showSpotterLabels: boolean;
  colorMode: SpotColorMode;
  now?: number;
}

function toTime(value: Date | string): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function labelSize(text: string, scale: number, extraWidth = 0) {
  return {
    width: Math.max(46, text.length * 7 + 18 + extraWidth) * scale,
    height: 22 * scale,
  };
}

function sourcePriority(source: LiveSpot["source"]): number {
  switch (source) {
    case "WSJT-X":
      return 4;
    case "Cluster":
      return 3;
    case "RBN":
      return 2;
    case "PSKReporter":
      return 1;
  }
}

/** Match the compact frequency text painted by SpotLabel. */
export function formatLiveSpotLayoutFrequency(frequencyKHz: number): string {
  if (!Number.isFinite(frequencyKHz)) return "";
  return frequencyKHz >= 1_000
    ? (frequencyKHz / 1_000).toFixed(3)
    : frequencyKHz.toString();
}

function liveContentRevision(
  resolved: GlobeResolvedLiveSpot,
  color: string,
): string {
  return [
    resolved.callsign,
    resolved.spotter ?? "",
    resolved.frequency,
    resolved.mode,
    resolved.band ?? "",
    resolved.snr ?? "",
    color,
  ].join(":");
}

function activationContentRevision(
  activation: MappableActivationSpot,
  color: string,
): string {
  return [
    activation.callsign,
    activation.frequencyKHz,
    activation.mode,
    activation.program,
    activation.reference,
    activation.referenceName,
    color,
  ].join(":");
}

/**
 * Build every screen-space collision surface from one report snapshot. The
 * projection adapter remains responsible for visibility and viewport pixels;
 * this pure step owns stable IDs, measured label bounds, and semantic rank.
 */
export function buildGlobeSpotLayoutCandidates({
  includeLiveActivity,
  renderLiveLabels,
  includeActivations,
  resolvedLiveSpots,
  includeReplayActivity = false,
  resolvedReplaySpots = [],
  activationSpots,
  selectedSpotId,
  matchedSpotIds,
  activeBand,
  labelScale,
  showSpotCallsignLabels,
  showSpotterLabels,
  colorMode,
  now = Date.now(),
}: BuildGlobeSpotLayoutCandidatesOptions): SpotLayoutCandidate<GlobeSpotLayoutPayload>[] {
  const candidates: SpotLayoutCandidate<GlobeSpotLayoutPayload>[] = [];
  const activeBandLower = activeBand?.toLowerCase();

  if (includeLiveActivity) {
    for (const resolved of resolvedLiveSpots) {
      const spot = resolved.originalSpot;
      const reportId = spotLayoutReportId(spot.source, spot.id);
      const band = spot.band ?? getBandFromFrequency(spot.frequency);
      const color = getSpotColor(resolved, colorMode, now);
      const contentRevision = liveContentRevision(resolved, color);
      const shared = {
        reportId,
        selected: spot.id === selectedSpotId,
        watched: matchedSpotIds.has(spot.id),
        activeBand: !activeBandLower || band.toLowerCase() === activeBandLower,
        observedAt: toTime(spot.time),
        sourcePriority: sourcePriority(spot.source),
        contentRevision,
      };
      const showDxLabel = renderLiveLabels && showSpotCallsignLabels;
      const dxText = `${resolved.callsign} ${formatLiveSpotLayoutFrequency(resolved.frequency)}`;
      candidates.push({
        ...shared,
        id: spotLayoutCandidateId(reportId, "dx"),
        kind: showDxLabel ? "dx-label" : "endpoint",
        lat: resolved.dxLat,
        lon: resolved.dxLon,
        ...(showDxLabel
          ? labelSize(dxText, labelScale)
          : { width: 28, height: 28 }),
        payload: { spot, role: "dx", color },
      });

      if (resolved.spotter) {
        const showSpotterLabel =
          renderLiveLabels && showSpotCallsignLabels && showSpotterLabels;
        candidates.push({
          ...shared,
          id: spotLayoutCandidateId(reportId, "spotter"),
          kind: showSpotterLabel ? "spotter-label" : "endpoint",
          lat: resolved.spotterLat,
          lon: resolved.spotterLon,
          ...(showSpotterLabel
            ? labelSize(resolved.spotter, labelScale)
            : { width: 24, height: 24 }),
          payload: { spot, role: "spotter", color },
        });
      }
    }
  }

  if (includeReplayActivity) {
    for (const resolved of resolvedReplaySpots) {
      const spot = resolved.originalSpot;
      // Replay can contain the same provider ID as the live feed while its
      // historical path is still fading. Give that visual snapshot a separate
      // report identity so neither renderer steals the other's endpoint.
      const reportId = spotLayoutReportId(`replay-${spot.source}`, spot.id);
      const band = spot.band ?? getBandFromFrequency(spot.frequency);
      const contentRevision = liveContentRevision(
        resolved,
        SPOT_REPLAY_COLOR,
      );
      const shared = {
        reportId,
        selected: spot.id === selectedSpotId,
        watched: matchedSpotIds.has(spot.id),
        activeBand: !activeBandLower || band.toLowerCase() === activeBandLower,
        observedAt: toTime(spot.time),
        sourcePriority: 0,
        contentRevision,
      };
      candidates.push({
        ...shared,
        id: spotLayoutCandidateId(reportId, "dx"),
        kind: "endpoint",
        lat: resolved.dxLat,
        lon: resolved.dxLon,
        width: 28,
        height: 28,
        payload: { spot, role: "dx", color: SPOT_REPLAY_COLOR },
      });
      if (resolved.spotter) {
        candidates.push({
          ...shared,
          id: spotLayoutCandidateId(reportId, "spotter"),
          kind: "endpoint",
          lat: resolved.spotterLat,
          lon: resolved.spotterLon,
          width: 24,
          height: 24,
          payload: {
            spot,
            role: "spotter",
            color: SPOT_REPLAY_COLOR,
          },
        });
      }
    }
  }

  if (includeActivations) {
    for (const activation of activationSpots) {
      const spot = presentActivationSpot(activation);
      const reportId = spotLayoutReportId("activation", activation.id);
      const color = getBandColor(activation.frequencyKHz);
      const displayText = `${activation.callsign} ${formatActivationFrequency(activation.frequencyKHz)}`;
      const band = getBandFromFrequency(activation.frequencyKHz);
      candidates.push({
        id: spotLayoutCandidateId(reportId, "activation"),
        reportId,
        kind: "activation-label",
        lat: activation.latitude,
        lon: activation.longitude,
        ...labelSize(
          displayText,
          labelScale,
          activation.program.length * 6 + 10,
        ),
        selected: activation.id === selectedSpotId,
        watched: matchedSpotIds.has(activation.id),
        activeBand:
          !activeBandLower || band.toLowerCase() === activeBandLower,
        observedAt: toTime(activation.spottedAt),
        sourcePriority: 3,
        contentRevision: activationContentRevision(activation, color),
        payload: {
          spot,
          role: "activation",
          color,
        },
      });
    }
  }

  return candidates;
}

/** Revision checked before doing any globe projection work. */
export function globeSpotCandidateRevision(
  candidates: readonly SpotLayoutCandidate<GlobeSpotLayoutPayload>[],
): string {
  return candidates
    .map(
      (candidate) =>
        `${candidate.id}:${candidate.lat.toFixed(5)}:${candidate.lon.toFixed(5)}:${candidate.width.toFixed(1)}:${candidate.height.toFixed(1)}:${candidate.selected ? 1 : 0}:${candidate.watched ? 1 : 0}:${candidate.activeBand ? 1 : 0}:${candidate.observedAt ?? 0}:${candidate.contentRevision ?? ""}`,
    )
    .join("|");
}

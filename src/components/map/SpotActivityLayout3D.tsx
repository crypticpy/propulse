/**
 * Shared globe layout boundary for live DX paths and activation markers.
 *
 * Both feeds used to run independent geographic grouping passes, so labels
 * from different layers could overlap and a dense screen region could still
 * produce dozens of hit targets. This component projects one combined
 * candidate list and makes one deterministic placement/aggregation decision.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import type { SpotCluster as SpotClusterData } from "@/hooks/useSpotClustering";
import type { SpotHoverInteraction } from "@/hooks/useSpotHoverArbitration";
import {
  createGlobeOcclusionFrame,
  getGlobeOcclusionOpacity,
} from "@/lib/map/globeOcclusion";
import type {
  GlobeSpotLayoutPayload,
  GlobeSpotLayoutResult,
} from "@/lib/map/globeSpotLayout";
import {
  buildGlobeSpotLayoutCandidates,
  globeSpotCandidateRevision,
} from "@/lib/map/globeSpotLayout";
import {
  layoutProjectedSpotCandidates,
  spotLayoutSignature,
  type ProjectedSpotLayoutCandidate,
  type SpotLayoutCandidate,
} from "@/lib/map/screenSpaceSpotLayout";
import {
  normalizePresentableSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import {
  useSpotClusteringPrefs,
  useUIInteractionPrefs,
} from "@/stores/userStore";
import { useWatchStore } from "@/stores/watchStore";
import { useReplayStore } from "@/stores/replayStore";
import type { MappableActivationSpot } from "@/lib/map/activationMarkers";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { LiveSpot } from "@/types/livespot";
import { AnimatedSpotTraces } from "./AnimatedSpotTraces";
import { ActivationMarkers3D } from "./layers/ActivationMarkers3D";
import {
  LiveSpotArcs,
  resolveSpotLocations,
  type ResolvedSpot,
} from "./LiveSpotArcs";
import { SpotCluster } from "./SpotCluster";

interface SpotActivityLayout3DProps {
  showLiveSpots: boolean;
  showSpotTraces: boolean;
  showActivations: boolean;
  traceFeedSpots: LiveSpot[];
  liveSpots: LiveSpot[];
  resolvedLiveSpots: ResolvedSpot[];
  liveSpotsLoading: boolean;
  liveSpotsFeedReady: boolean;
  liveSpotsFeedScopeKey: string;
  activationSpots: MappableActivationSpot[];
  stationGrid?: string;
  onSpotHover?: (
    spot: PresentableSpot,
    screenPos: ScreenAnchor,
    interaction: SpotHoverInteraction,
  ) => void;
  onSpotHoverEnd?: (
    spot?: PresentableSpot,
    interaction?: SpotHoverInteraction,
  ) => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
  onClusterClick?: (
    cluster: SpotClusterData,
    screenPos: { x: number; y: number },
  ) => void;
}

const EMPTY_LAYOUT: GlobeSpotLayoutResult = {
  placements: [],
  aggregates: [],
  rejectedIds: [],
};
const LAYOUT_INTERVAL_SECONDS = 0.12;

function latLonToVector(lat: number, lon: number, target: THREE.Vector3) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return target.set(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
}

function aggregateCluster(
  aggregate: GlobeSpotLayoutResult["aggregates"][number],
): SpotClusterData {
  const unique = new Map<string, LiveSpot>();
  for (const member of aggregate.members) {
    if (!unique.has(member.reportId)) {
      unique.set(member.reportId, normalizePresentableSpot(member.payload.spot));
    }
  }
  const spots = [...unique.values()];
  return {
    id: aggregate.id,
    center: aggregate.center,
    spots,
    count: aggregate.count,
    primarySpot: normalizePresentableSpot(aggregate.primary.payload.spot),
  };
}

export function SpotActivityLayout3D({
  showLiveSpots,
  showSpotTraces,
  showActivations,
  traceFeedSpots,
  liveSpots,
  resolvedLiveSpots,
  liveSpotsLoading,
  liveSpotsFeedReady,
  liveSpotsFeedScopeKey,
  activationSpots,
  stationGrid,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
  onClusterClick,
}: SpotActivityLayout3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const selectedSpotId = useDXStore((state) => state.selectedSpot?.id);
  const matchedSpotIds = useWatchStore((state) => state.matchedSpotIds);
  const uiPrefs = useUIInteractionPrefs();
  const clusteringPrefs = useSpotClusteringPrefs();
  const activeBand = useActiveBand();
  const replayEnabled = useMapStore((state) => state.replayEnabled);
  const replaySpots = useReplayStore((state) => state.replaySpots);
  const resolvedReplaySpots = useMemo(
    () => (replayEnabled ? resolveSpotLocations(replaySpots) : []),
    [replayEnabled, replaySpots],
  );
  const labelScale = uiPrefs.labelScale ?? 1;
  const [activeTraceSpots, setActiveTraceSpots] = useState<ResolvedSpot[]>([]);
  const handleActiveTracesChange = useCallback(
    (spots: ResolvedSpot[]) => setActiveTraceSpots(spots),
    [],
  );
  const layoutLiveSpots = showLiveSpots
    ? resolvedLiveSpots
    : activeTraceSpots;

  const candidates = useMemo<
    SpotLayoutCandidate<GlobeSpotLayoutPayload>[]
  >(() =>
    buildGlobeSpotLayoutCandidates({
      includeLiveActivity: showLiveSpots || showSpotTraces,
      renderLiveLabels: showLiveSpots,
      includeActivations: showActivations,
      // A trace-only view must describe the animations that actually made it
      // through hydration and queueing, not the inactive feed snapshot. This
      // keeps baseline reports from manufacturing clickable aggregates.
      resolvedLiveSpots: layoutLiveSpots,
      includeReplayActivity: showLiveSpots && replayEnabled,
      resolvedReplaySpots,
      activationSpots,
      selectedSpotId,
      matchedSpotIds,
      activeBand,
      labelScale,
      showSpotCallsignLabels: uiPrefs.showSpotCallsignLabels,
      showSpotterLabels: uiPrefs.showSpotterLabels,
      colorMode: uiPrefs.spotColorMode ?? "mode",
    }), [
    activationSpots,
    activeBand,
    labelScale,
    matchedSpotIds,
    replayEnabled,
    layoutLiveSpots,
    resolvedReplaySpots,
    selectedSpotId,
    showActivations,
    showLiveSpots,
    showSpotTraces,
    uiPrefs.showSpotCallsignLabels,
    uiPrefs.showSpotterLabels,
    uiPrefs.spotColorMode,
  ]);
  const revision = useMemo(
    () =>
      [
        globeSpotCandidateRevision(candidates),
        `cluster:${clusteringPrefs.enabled ? 1 : 0}`,
        `spacing:${clusteringPrefs.gridSize ?? 6}`,
        `minimum:${clusteringPrefs.minClusterSize ?? 3}`,
      ].join("|"),
    [
      candidates,
      clusteringPrefs.enabled,
      clusteringPrefs.gridSize,
      clusteringPrefs.minClusterSize,
    ],
  );
  const candidatesRef = useRef(candidates);
  const revisionRef = useRef(revision);
  candidatesRef.current = candidates;
  revisionRef.current = revision;

  const [layout, setLayout] = useState<GlobeSpotLayoutResult>(EMPTY_LAYOUT);
  const layoutSignatureRef = useRef("");
  const lastRevisionRef = useRef("");
  const lastRunRef = useRef(Number.NEGATIVE_INFINITY);
  const lastCameraPositionRef = useRef(new THREE.Vector3(Number.NaN, 0, 0));
  const lastCameraQuaternionRef = useRef(new THREE.Quaternion());
  const lastWorldMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const lastViewportRef = useRef({ width: 0, height: 0 });
  const localPosition = useMemo(() => new THREE.Vector3(), []);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);

  // The callback runs with the renderer, but the expensive projection/layout
  // pass and React update only occur after meaningful input/camera changes.
  useFrame(({ camera, clock, size }) => {
    const group = groupRef.current;
    if (!group) return;
    group.updateWorldMatrix(true, false);

    const inputChanged = lastRevisionRef.current !== revisionRef.current;
    const viewportChanged =
      lastViewportRef.current.width !== size.width ||
      lastViewportRef.current.height !== size.height;
    const cameraMoved =
      !Number.isFinite(lastCameraPositionRef.current.x) ||
      lastCameraPositionRef.current.distanceToSquared(camera.position) > 1e-7 ||
      1 -
        Math.abs(lastCameraQuaternionRef.current.dot(camera.quaternion)) >
        1e-7;
    const worldMatrixChanged =
      lastWorldMatrixRef.current === null ||
      !lastWorldMatrixRef.current.equals(group.matrixWorld);
    if (
      !inputChanged &&
      !viewportChanged &&
      !cameraMoved &&
      !worldMatrixChanged
    ) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    if (
      !inputChanged &&
      !viewportChanged &&
      elapsed - lastRunRef.current < LAYOUT_INTERVAL_SECONDS
    ) {
      return;
    }

    const occlusionFrame = createGlobeOcclusionFrame(
      camera.position,
      useMapStore.getState().rotation.x,
    );
    if (!occlusionFrame) return;

    const projected: ProjectedSpotLayoutCandidate<GlobeSpotLayoutPayload>[] =
      candidatesRef.current.map((candidate) => {
        latLonToVector(candidate.lat, candidate.lon, localPosition);
        worldPosition.copy(localPosition).applyMatrix4(group.matrixWorld);
        projectedPosition.copy(worldPosition).project(camera);
        return {
          ...candidate,
          x: ((projectedPosition.x + 1) / 2) * size.width,
          y: ((1 - projectedPosition.y) / 2) * size.height,
          clipZ: projectedPosition.z,
          visible:
            getGlobeOcclusionOpacity(
              candidate.lat,
              candidate.lon,
              occlusionFrame,
            ) >= 0.05,
        };
      });
    const next = layoutProjectedSpotCandidates(projected, {
      viewport: size,
      viewportMarginPx: 80,
      // Retain the existing user control, but reinterpret its old degree-cell
      // value as visible pixel breathing room now that grouping is correctly
      // projection-aware. Its persisted 5–15 range maps cleanly to pixels.
      collisionPaddingPx: Math.max(4, clusteringPrefs.gridSize ?? 6),
      // The UI preference is explicitly a report threshold. A report may own
      // two endpoint surfaces, so applying it to candidate count creates a
      // one-report beacon and violates the control's meaning.
      minAggregateReportCount: clusteringPrefs.enabled
        ? Math.max(1, clusteringPrefs.minClusterSize ?? 3)
        : Number.MAX_SAFE_INTEGER,
      // With clustering explicitly disabled we honor that preference by
      // continuing the deterministic fan instead of capping offsets until
      // labels overlap again.
      maxStackOffsetPx: clusteringPrefs.enabled
        ? 40
        : Number.MAX_SAFE_INTEGER,
    });
    const signature = spotLayoutSignature(next);
    if (signature !== layoutSignatureRef.current) {
      layoutSignatureRef.current = signature;
      setLayout(next);
    }

    lastRevisionRef.current = revisionRef.current;
    lastRunRef.current = elapsed;
    lastCameraPositionRef.current.copy(camera.position);
    lastCameraQuaternionRef.current.copy(camera.quaternion);
    if (lastWorldMatrixRef.current) {
      lastWorldMatrixRef.current.copy(group.matrixWorld);
    } else {
      lastWorldMatrixRef.current = group.matrixWorld.clone();
    }
    lastViewportRef.current = { width: size.width, height: size.height };
  });

  const renderAggregates = useMemo(
    () =>
      layout.aggregates.map((aggregate) => ({
        aggregate,
        cluster: aggregateCluster(aggregate),
      })),
    [layout.aggregates],
  );

  return (
    <group ref={groupRef} name="shared-spot-activity-layout">
      {renderAggregates.map(({ aggregate, cluster }) => (
        <SpotCluster
          key={aggregate.id}
          cluster={cluster}
          color={aggregate.primary.payload.color}
          sizeScale={aggregate.sizeScale}
          ariaLabel={`Open ${cluster.count} active reports near ${cluster.center.lat.toFixed(1)}, ${cluster.center.lon.toFixed(1)}`}
          onClick={onClusterClick}
        />
      ))}

      {showLiveSpots && (
        <LiveSpotArcs
          grid={stationGrid}
          spots={liveSpots}
          resolvedSpots={resolvedLiveSpots}
          resolvedReplaySpots={resolvedReplaySpots}
          layout={layout}
          isLoading={liveSpotsLoading}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
        />
      )}

      {showActivations && (
        <ActivationMarkers3D
          spots={activationSpots}
          layout={layout}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
        />
      )}

      {showSpotTraces && (
        <AnimatedSpotTraces
          grid={stationGrid}
          maxTraces={40}
          feedSpots={traceFeedSpots}
          candidateSpots={liveSpots}
          resolvedSpots={resolvedLiveSpots}
          layout={layout}
          isFeedReady={liveSpotsFeedReady}
          hydrationKey={liveSpotsFeedScopeKey}
          onActiveTracesChange={
            showLiveSpots ? undefined : handleActiveTracesChange
          }
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
        />
      )}
    </group>
  );
}

export default SpotActivityLayout3D;

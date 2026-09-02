/**
 * LiveSpotArcs Component
 *
 * Renders arcs on the globe showing live spot paths from
 * PSKReporter, RBN, and other sources.
 *
 * Arcs are colored by operating mode (FT8, CW, SSB, etc.)
 * for quick visual identification of activity.
 *
 * Features spot clustering for cleaner visualization when many spots
 * are present in the same geographic area.
 */

import React, { useMemo, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { getPathPoints } from "@/lib/utils/path";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import {
  useSpotClusteringPrefs,
  useSpotAgePrefs,
  useUIInteractionPrefs,
} from "@/stores/userStore";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";
import {
  useSpotClustering,
  type SpotCluster as SpotClusterData,
} from "@/hooks/useSpotClustering";
import { SpotCluster } from "./SpotCluster";
import { SpotLabel } from "./SpotLabel";
import { SpotEndpointHitArea } from "./SpotEndpointHitArea";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import {
  getSpotColor,
  getBandFromFrequency,
  SPOT_REPLAY_COLOR,
  type SpotColorMode,
} from "@/lib/utils/spotColors";
import { getMultiHopArcPoints } from "@/lib/utils/arcHeight";
import { useReplayStore } from "@/stores/replayStore";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { getScreenSpaceWorldSize } from "@/lib/map/screenSpaceScale";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { getArcOpacity } from "@/lib/map/arcAppearance";
import {
  getEndpointInstanceCount,
  MAX_ENDPOINT_INSTANCES,
} from "@/lib/map/spotEndpointCapacity";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { SpotHoverInteraction } from "@/hooks/useSpotHoverArbitration";

// ==========================================================================
// Spot Age Types and Utilities
// ==========================================================================

/** Legibility floor for the screen-space stroke width of spot arcs. */
const MIN_ARC_LINE_WIDTH = 2.0;

/** Nominal stroke width at sizeScale 1. */
const ARC_BASE_LINE_WIDTH = 2.2;

/**
 * Age category for visual styling
 */
export type SpotAgeCategory = "fresh" | "recent" | "aging" | "stale" | "old";

/**
 * Spot age information for visual decay styling
 */
export interface SpotAgeInfo {
  /** Age in minutes */
  ageMinutes: number;
  /** Category for styling decisions */
  ageCategory: SpotAgeCategory;
  /** Opacity value (0.4 - 1.0) */
  opacity: number;
  /** Scale factor (0.5 - 1.0) */
  scale: number;
  /** Saturation factor (0.3 - 1.0) */
  saturation: number;
}

/**
 * Calculate spot age information for visual decay styling
 * @param spotTime - Time when the spot was created
 * @param currentTime - Current time (defaults to now)
 * @returns SpotAgeInfo with age category and visual parameters
 */
export function getSpotAgeInfo(
  spotTime: Date,
  currentTime: Date = new Date(),
): SpotAgeInfo {
  const ageMinutes = (currentTime.getTime() - spotTime.getTime()) / 60000;

  // 0-2 minutes: fresh - full visibility
  if (ageMinutes < 2) {
    return {
      ageMinutes,
      ageCategory: "fresh",
      opacity: 1.0,
      scale: 1.0,
      saturation: 1.0,
    };
  }

  // 2-5 minutes: recent - slight decay
  if (ageMinutes < 5) {
    return {
      ageMinutes,
      ageCategory: "recent",
      opacity: 0.9,
      scale: 0.9,
      saturation: 0.95,
    };
  }

  // 5-10 minutes: aging - moderate decay
  if (ageMinutes < 10) {
    return {
      ageMinutes,
      ageCategory: "aging",
      opacity: 0.75,
      scale: 0.75,
      saturation: 0.7,
    };
  }

  // 10-15 minutes: stale - significant decay
  if (ageMinutes < 15) {
    return {
      ageMinutes,
      ageCategory: "stale",
      opacity: 0.6,
      scale: 0.6,
      saturation: 0.5,
    };
  }

  // 15+ minutes: old - maximum decay
  return {
    ageMinutes,
    ageCategory: "old",
    opacity: 0.4,
    scale: 0.5,
    saturation: 0.3,
  };
}

/**
 * Format spot age for display (e.g., "2:45" for 2 minutes 45 seconds)
 * @param spotTime - Time when the spot was created
 * @param currentTime - Current time (defaults to now)
 * @returns Formatted age string
 */
export function formatSpotAge(
  spotTime: Date,
  currentTime: Date = new Date(),
): string {
  const ageMs = currentTime.getTime() - spotTime.getTime();
  const totalSeconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes}m`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get short age label for compact display (e.g., "2m", "15m", "1h")
 * @param spotTime - Time when the spot was created
 * @param currentTime - Current time (defaults to now)
 * @returns Short age label
 */
export function getShortAgeLabel(
  spotTime: Date,
  currentTime: Date = new Date(),
): string {
  const ageMs = currentTime.getTime() - spotTime.getTime();
  const minutes = Math.floor(ageMs / 60000);

  if (minutes < 1) {
    return "<1m";
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Get color for age badge based on category
 * @param ageCategory - The age category
 * @returns Tailwind-compatible color classes
 */
export function getAgeBadgeColors(ageCategory: SpotAgeCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (ageCategory) {
    case "fresh":
      return {
        bg: "bg-green-500/20",
        text: "text-green-400",
        border: "border-green-500/30",
      };
    case "recent":
      return {
        bg: "bg-cyan-500/20",
        text: "text-cyan-400",
        border: "border-cyan-500/30",
      };
    case "aging":
      return {
        bg: "bg-yellow-500/20",
        text: "text-yellow-400",
        border: "border-yellow-500/30",
      };
    case "stale":
      return {
        bg: "bg-orange-500/20",
        text: "text-orange-400",
        border: "border-orange-500/30",
      };
    case "old":
      return {
        bg: "bg-gray-500/20",
        text: "text-gray-400",
        border: "border-gray-500/30",
      };
  }
}

// ==========================================================================
// Mode Colors - re-exported from shared module for backward compatibility
// ==========================================================================
export { getModeColor, MODE_COLORS } from "@/lib/utils/spotColors";

// ==========================================================================
// Great Circle Path Utilities
// ==========================================================================

/**
 * Calculate great circle points between two coordinates
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @param numPoints - Number of points along the path (default: 30)
 * @returns Array of lat/lon points along the great circle
 */
export function getGreatCirclePoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints: number = 30,
): Array<{ lat: number; lon: number }> {
  return getPathPoints(lat1, lon1, lat2, lon2, numPoints).map((p) => ({
    lat: p.lat,
    lon: p.lon,
  }));
}

// ==========================================================================
// Spot Location Resolution
// ==========================================================================

export interface ResolvedSpot {
  id: string;
  spotterLat: number;
  spotterLon: number;
  dxLat: number;
  dxLon: number;
  mode: string;
  frequency: number;
  time: Date;
  callsign: string;
  /** Spotter (reporting station) callsign */
  spotter?: string;
  source: SpotSource;
  /** Signal-to-noise ratio in dB, when the source reports one (RBN, PSKReporter) */
  snr?: number;
  /** True when the spotter position is a callsign-prefix centroid, not a real locator */
  spotterLocApprox: boolean;
  /** True when the DX position is a callsign-prefix centroid, not a real locator */
  dxLocApprox: boolean;
  /** Exact feed report used to paint this spot; retained for reliable hit ownership. */
  originalSpot: LiveSpot;
}

/**
 * Try to get location from a grid locator
 */
function getLocationFromGrid(
  grid: string | undefined,
): { lat: number; lon: number } | null {
  if (!grid || !isValidGrid(grid)) {
    return null;
  }
  try {
    return gridToLatLon(grid);
  } catch {
    return null;
  }
}

/**
 * Try to get location from a callsign using prefix lookup
 */
function getLocationFromCallsign(
  callsign: string,
): { lat: number; lon: number } | null {
  const prefix = extractPrefixFromCallsign(callsign);
  const location = getLocationFromPrefix(prefix);
  if (location) {
    return { lat: location.lat, lon: location.lon };
  }
  return null;
}

function normalizeSpotDate(value: unknown): Date | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Resolve spot locations from grid/callsign with fallback chain
 * Priority: grid locator > callsign prefix > continent
 */
export function resolveSpotLocations(spots: LiveSpot[]): ResolvedSpot[] {
  const resolved: ResolvedSpot[] = [];

  for (const spot of spots) {
    const time = normalizeSpotDate(spot.time);
    if (!time) continue;

    // Try to resolve spotter location — locator-derived positions are exact;
    // callsign-prefix centroids (resolved here, or pre-baked upstream and
    // flagged on the LiveSpot) are country-level approximations.
    const spotterCoords =
      spot.spotterLat !== undefined && spot.spotterLon !== undefined
        ? { lat: spot.spotterLat, lon: spot.spotterLon }
        : null;
    const spotterGridLoc = spotterCoords
      ? null
      : getLocationFromGrid(spot.spotterGrid);
    const spotterLoc =
      spotterCoords || spotterGridLoc || getLocationFromCallsign(spot.spotter);
    const spotterApprox = spotterCoords
      ? spot.spotterLocApprox === true
      : !spotterGridLoc;

    // Try to resolve DX location
    const dxCoords =
      spot.dxLat !== undefined && spot.dxLon !== undefined
        ? { lat: spot.dxLat, lon: spot.dxLon }
        : null;
    const dxGridLoc = dxCoords ? null : getLocationFromGrid(spot.dxGrid);
    const dxLoc = dxCoords || dxGridLoc || getLocationFromCallsign(spot.dx);
    const dxApprox = dxCoords ? spot.dxLocApprox === true : !dxGridLoc;

    // Skip if we couldn't resolve both locations
    if (!spotterLoc || !dxLoc) {
      continue;
    }

    resolved.push({
      id: spot.id,
      spotterLat: spotterLoc.lat,
      spotterLon: spotterLoc.lon,
      dxLat: dxLoc.lat,
      dxLon: dxLoc.lon,
      mode: spot.mode || "UNKNOWN",
      frequency: spot.frequency,
      time,
      callsign: spot.dx,
      spotter: spot.spotter,
      source: spot.source,
      // Carried through so "By SNR" coloring has something to read -- the
      // renderers only ever see the resolved spot.
      snr: spot.snr,
      spotterLocApprox: spotterApprox,
      dxLocApprox: dxApprox,
      originalSpot: spot,
    });
  }

  return resolved;
}

// ==========================================================================
// 3D Rendering Utilities (for Globe View)
// ==========================================================================

interface LiveSpotArcsProps {
  /** User's grid locator for fetching relevant spots */
  grid?: string;
  /** Maximum number of arcs to render */
  maxArcs?: number;
  /** Shared, already-filtered feed supplied by the map host. */
  spots?: LiveSpot[];
  /** Loading state for a supplied shared feed. */
  isLoading?: boolean;
  /** Minimum opacity for arc lines */
  minOpacity?: number;
  /** Callback when a spot is hovered */
  onSpotHover?: (
    spot: LiveSpot,
    screenPos: ScreenAnchor,
    interaction: SpotHoverInteraction,
  ) => void;
  /** Callback when spot hover ends */
  onSpotHoverEnd?: (
    spot?: LiveSpot,
    interaction?: SpotHoverInteraction,
  ) => void;
  /** Callback when a spot label or endpoint is selected. */
  onSpotSelect?: (spot: LiveSpot, screenPos: ScreenAnchor) => void;
  /** Callback when a cluster is clicked */
  onClusterClick?: (
    cluster: SpotClusterData,
    screenPos: { x: number; y: number },
  ) => void;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = 1.005,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Calculate age-based opacity (newer spots are more visible)
 */
export function getAgeOpacity(
  spotTime: Date,
  maxAgeMinutes: number = 15,
): number {
  const ageMs = Date.now() - spotTime.getTime();
  const ageMinutes = ageMs / 60000;
  return Math.max(0.2, 1 - ageMinutes / maxAgeMinutes);
}

/**
 * Individual spot arc component for 3D globe
 */
const SpotArc = React.memo(function SpotArc({
  spot,
  segments = 30,
  ageVisualizationEnabled = true,
  colorMode = "mode",
  sizeScale = 1.0,
  filterOpacityMultiplier = 1.0,
  bandHeightArcs = false,
  band,
  colorOverride,
}: {
  spot: ResolvedSpot;
  segments?: number;
  /** Whether to apply age-based visual decay */
  ageVisualizationEnabled?: boolean;
  /** Spot color mode: "mode" or "band" */
  colorMode?: SpotColorMode;
  /** Scale multiplier for line width (from spotDotScale) */
  sizeScale?: number;
  /** Opacity multiplier for profile-based spot filtering (0.2 for dimmed, 1.0 for normal) */
  filterOpacityMultiplier?: number;
  /** Whether to use band-dependent arc heights */
  bandHeightArcs?: boolean;
  /** Band name for arc height lookup (e.g. "20m", "40m") */
  band?: string;
  /** Fixed semantic color for non-live routes such as historical replay. */
  colorOverride?: string;
}) {
  // Validate coordinates to prevent NaN errors in THREE.js
  const hasValidCoords =
    Number.isFinite(spot.spotterLat) &&
    Number.isFinite(spot.spotterLon) &&
    Number.isFinite(spot.dxLat) &&
    Number.isFinite(spot.dxLon);

  const points = useMemo(() => {
    if (!hasValidCoords) {
      return [];
    }
    try {
      let result: Array<[number, number, number]>;

      if (bandHeightArcs && band) {
        // Multi-hop ionospheric skip arcs — bounce count based on distance + band
        result = getMultiHopArcPoints(
          spot.spotterLat,
          spot.spotterLon,
          spot.dxLat,
          spot.dxLon,
          band,
          1.005,
        );
      } else {
        // Standard flat arcs on globe surface
        const pathPoints = getPathPoints(
          spot.spotterLat,
          spot.spotterLon,
          spot.dxLat,
          spot.dxLon,
          segments,
        );
        result = pathPoints.map((p) => latLonTo3D(p.lat, p.lon)) as Array<
          [number, number, number]
        >;
      }

      // Validate all points are finite numbers
      for (const pt of result) {
        if (
          !Number.isFinite(pt[0]) ||
          !Number.isFinite(pt[1]) ||
          !Number.isFinite(pt[2])
        ) {
          return [];
        }
      }
      return result;
    } catch {
      return [];
    }
  }, [
    spot.spotterLat,
    spot.spotterLon,
    spot.dxLat,
    spot.dxLon,
    segments,
    hasValidCoords,
    bandHeightArcs,
    band,
  ]);

  const color = colorOverride ?? getSpotColor(spot, colorMode);

  // Calculate age-based opacity using new getSpotAgeInfo
  const ageInfo = useMemo(() => getSpotAgeInfo(spot.time), [spot.time]);
  // Age decay used to hit opacity and stroke width at the same time: a 15-minute
  // old spot rendered at 0.4 alpha AND half width, i.e. a sub-pixel line at 40%
  // alpha. Across the globe's face that is invisible; near the limb, where arcs
  // are seen edge-on and dozens of strokes land in the same pixels, the alpha
  // accumulates and they reappear — which reads as the terminator "revealing"
  // them. Width now carries no age signal (opacity and saturation already do),
  // and neither term may drive the stroke below the legibility floor.
  const opacity = getArcOpacity(
    ageInfo.opacity,
    ageVisualizationEnabled,
    filterOpacityMultiplier,
  );
  const lineWidth = Math.max(
    MIN_ARC_LINE_WIDTH,
    ARC_BASE_LINE_WIDTH * sizeScale,
  );

  // Return null for invalid coordinates or insufficient points
  if (!hasValidCoords || points.length < 2) {
    return null;
  }

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={opacity}
      transparent
      renderOrder={GLOBE_LAYER_ORDER.arcs}
      depthTest={true}
      depthWrite={false}
    />
  );
});

// ==========================================================================
// Instanced Endpoint Rendering (batches all spot endpoints into 1 draw call)
// ==========================================================================

interface EndpointData {
  lat: number;
  lon: number;
  color: string;
  size: number;
}

/**
 * Batched endpoint renderer using THREE.InstancedMesh.
 * Replaces up to 400 individual <mesh> draw calls with a single instanced draw.
 */
const SpotEndpointInstances = React.memo(function SpotEndpointInstances({
  endpoints,
}: {
  endpoints: EndpointData[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Shared geometry and material — allocated once. depthTest stays on:
  // the endpoint spheres protrude above the surface, so the depth buffer
  // (opaque globe only) culls the far side for free.
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    [],
  );

  // Pre-allocate reusable objects to avoid GC pressure in the update loop
  const tmpMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpPosition = useMemo(() => new THREE.Vector3(), []);
  const tmpWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const tmpScale = useMemo(() => new THREE.Vector3(), []);
  const tmpQuaternion = useMemo(() => new THREE.Quaternion(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const count = getEndpointInstanceCount(endpoints.length);
    for (let i = 0; i < count; i++) {
      const ep = endpoints[i];

      if (!Number.isFinite(ep.lat) || !Number.isFinite(ep.lon)) {
        tmpColor.set("#000000");
      } else {
        tmpColor.set(ep.color);
      }
      mesh.setColorAt(i, tmpColor);
    }

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [endpoints, tmpColor]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = getEndpointInstanceCount(endpoints.length);
    mesh.count = count;
    mesh.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraWorldPosition);

    for (let i = 0; i < count; i++) {
      const ep = endpoints[i];

      if (!Number.isFinite(ep.lat) || !Number.isFinite(ep.lon)) {
        tmpMatrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, tmpMatrix);
        continue;
      }

      const [x, y, z] = latLonTo3D(ep.lat, ep.lon, 1.006);
      tmpPosition.set(x, y, z);
      tmpWorldPosition.copy(tmpPosition).applyMatrix4(mesh.matrixWorld);
      const size = getScreenSpaceWorldSize(
        ep.size,
        cameraWorldPosition.distanceTo(tmpWorldPosition),
      );
      tmpScale.setScalar(size);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_ENDPOINT_INSTANCES]}
      frustumCulled={false}
      count={0}
      renderOrder={GLOBE_LAYER_ORDER.markers}
    />
  );
});

/**
 * LiveSpotArcs Component for Globe View
 *
 * Fetches live spots and renders them as 3D arcs on the globe.
 * Supports spot clustering for cleaner visualization when many spots
 * are present in the same geographic area.
 * Applies age-based visual decay (opacity/scale) based on user preferences.
 */
export function LiveSpotArcs({
  grid,
  maxArcs: maxArcsProp,
  spots: suppliedSpots,
  isLoading: suppliedIsLoading,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
  onClusterClick,
}: LiveSpotArcsProps) {
  // Use displayDensity from mapStore, falling back to prop, then default 50
  const displayDensity = useMapStore((s) => s.displayDensity);
  const maxArcs = maxArcsProp ?? displayDensity ?? 50;
  // Get source filter from dxStore - shared with DXSpotList
  const filters = useDXStore((state) => state.filters);
  const selectedSpotId = useDXStore((state) => state.selectedSpot?.id);
  const sourcesFilter = filters.sources as SpotSource[] | undefined;

  // Get profile-based spot filters from mapStore
  const spotFilters = useMapStore((s) => s.spotFilters);

  // Pre-compute filter sets for case-insensitive matching
  const profileBandSet = useMemo(
    () =>
      spotFilters.bands.length > 0
        ? new Set(spotFilters.bands.map((b) => b.toLowerCase()))
        : null,
    [spotFilters.bands],
  );
  const profileModeSet = useMemo(
    () =>
      spotFilters.modes.length > 0
        ? new Set(spotFilters.modes.map((m) => m.toLowerCase()))
        : null,
    [spotFilters.modes],
  );

  // Get clustering preferences from user store
  const clusteringPrefs = useSpotClusteringPrefs();

  // Get spot age visualization preferences
  const spotAgePrefs = useSpotAgePrefs();

  // Get UI interaction preferences for callsign labels
  const uiPrefs = useUIInteractionPrefs();

  const ownedFeed = useLiveSpots({
    grid,
    enabled: suppliedSpots === undefined,
    refetchInterval: 60000,
    // Pass sources filter - when empty array, useLiveSpots shows all sources
    sources:
      sourcesFilter && sourcesFilter.length > 0 ? sourcesFilter : undefined,
  });
  const spots = suppliedSpots ?? ownedFeed.spots;
  const isLoading = suppliedIsLoading ?? ownedFeed.isLoading;

  // Apply clustering to spots
  const { clusters, singles } = useSpotClustering(spots.slice(0, maxArcs), {
    enabled: clusteringPrefs.enabled,
    gridSize: clusteringPrefs.gridSize,
    minClusterSize: clusteringPrefs.minClusterSize,
  });

  // Resolve locations for single (non-clustered) spots
  const resolvedSingles = useMemo(() => {
    return resolveSpotLocations(singles);
  }, [singles]);

  // Create a map from spot ID to original LiveSpot for additional data
  const singlesMap = useMemo(() => {
    const map = new Map<string, LiveSpot>();
    for (const spot of singles) {
      map.set(spot.id, spot);
    }
    return map;
  }, [singles]);

  // Active band from operating store — used to visually distinguish on-band arcs
  const activeBand = useActiveBand();

  // ── Replay spots (sepia-toned historical arcs) ──────────────────────────
  const replayEnabled = useMapStore((s) => s.replayEnabled);
  const replaySpots = useReplayStore((s) => s.replaySpots);
  const resolvedReplay = useMemo(
    // PropSphere clears the ephemeral store when replay turns off, but gate
    // here too so the canvas never renders a retained query snapshot during
    // the effect boundary between the toggle and that store update.
    () => (replayEnabled ? resolveSpotLocations(replaySpots) : []),
    [replayEnabled, replaySpots],
  );

  // ── Globe-side culling: skip arcs whose endpoints both face away ────────
  const { camera } = useThree();
  const tempVec1 = useMemo(() => new THREE.Vector3(), []);
  const tempVec2 = useMemo(() => new THREE.Vector3(), []);
  const tempCamDir = useMemo(() => new THREE.Vector3(), []);

  // ── Batch globe occlusion for all label positions ────────────────────────
  // Collects DX + spotter positions from live and replay reports so a single
  // useFrame callback replaces N individual per-label/use-target callbacks.
  // Replay routes used to remain visually present with no interactive source
  // at either end, which made the sepia route field impossible to identify.
  const labelPositionsForOcclusion = useMemo(() => {
    const out: Array<{ lat: number; lon: number }> = [];
    for (const spot of [...resolvedSingles, ...resolvedReplay]) {
      out.push({ lat: spot.dxLat, lon: spot.dxLon });
      if (spot.spotter) {
        out.push({ lat: spot.spotterLat, lon: spot.spotterLon });
      }
    }
    return out;
  }, [resolvedReplay, resolvedSingles]);

  const { getOpacity: getOcclusionOpacity } = useGlobeOcclusionBatch(
    labelPositionsForOcclusion,
  );

  if (
    isLoading ||
    (resolvedSingles.length === 0 &&
      clusters.length === 0 &&
      resolvedReplay.length === 0)
  ) {
    return null;
  }

  return (
    <group name="live-spot-arcs">
      {/* Render clustered spots as cluster markers */}
      {clusters.map((cluster) => (
        <SpotCluster
          key={cluster.id}
          cluster={cluster}
          onClick={onClusterClick}
        />
      ))}

      {/* Render non-clustered spots as individual arcs with age-based styling */}
      {(() => {
        // Track callsigns already labeled and positions for stacking
        const labeledCallsigns = new Set<string>();
        const labeledSpotters = new Set<string>();
        // Track occupied label positions to assign stack indices
        const labelPositions: Array<{ lat: number; lon: number }> = [];

        const colorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";
        const spotDotScale = uiPrefs.spotDotScale ?? 1.0;

        // Compute camera direction once for culling all spots
        tempCamDir.copy(camera.position).normalize();

        // Collect endpoint data for instanced rendering (replaces individual <SpotEndpoint>)
        const endpointData: EndpointData[] = [];

        const arcElements = resolvedSingles.map((spot) => {
          // Globe-side culling: skip if both endpoints face away from camera
          tempVec1
            .set(...latLonTo3D(spot.spotterLat, spot.spotterLon))
            .normalize();
          tempVec2.set(...latLonTo3D(spot.dxLat, spot.dxLon)).normalize();
          const spotterDot = tempVec1.dot(tempCamDir);
          const dxDot = tempVec2.dot(tempCamDir);
          if (spotterDot < -0.1 && dxDot < -0.1) return null;

          const color = getSpotColor(spot, colorMode);
          // Calculate age info for endpoint styling
          const ageInfo = getSpotAgeInfo(spot.time);

          // Determine if spot passes profile filter
          const orig = singlesMap.get(spot.id);
          const spotBand = orig?.band?.toLowerCase() ?? "";
          const spotMode = spot.mode?.toLowerCase() ?? "";
          // Treat missing metadata as "show anyway" — don't dim spots with unknown band/mode
          const passesBandFilter =
            !profileBandSet || !spotBand || profileBandSet.has(spotBand);
          const passesModeFilter =
            !profileModeSet || !spotMode || profileModeSet.has(spotMode);
          const passesFilter = passesBandFilter && passesModeFilter;
          // Active band emphasis: arcs on the active band get full opacity,
          // others get reduced opacity when an active band is set
          const activeBandLower = activeBand?.toLowerCase() ?? "";
          const matchesActiveBand =
            !activeBandLower || !spotBand || spotBand === activeBandLower;
          const activeBandOpacity = matchesActiveBand ? 1.0 : 0.3;
          const filterOpacity = passesFilter
            ? activeBandOpacity
            : 0.3 * activeBandOpacity;

          const endpointScale = spotAgePrefs.enabled ? ageInfo.scale : 1.0;

          // Collect endpoint data for instanced batch rendering
          endpointData.push({
            lat: spot.spotterLat,
            lon: spot.spotterLon,
            color,
            size: 0.006 * spotDotScale * endpointScale,
          });
          endpointData.push({
            lat: spot.dxLat,
            lon: spot.dxLon,
            color,
            size: 0.008 * spotDotScale * endpointScale,
          });

          // Compute stack index for this label position (proximity-based)
          let stackIndex = 0;
          if (
            uiPrefs.showSpotCallsignLabels &&
            !labeledCallsigns.has(spot.callsign)
          ) {
            for (const pos of labelPositions) {
              const dlat = Math.abs(pos.lat - spot.dxLat);
              const dlon = Math.abs(pos.lon - spot.dxLon);
              if (dlat < 3 && dlon < 3) {
                stackIndex++;
              }
            }
            labelPositions.push({ lat: spot.dxLat, lon: spot.dxLon });
          }

          return (
            <group key={spot.id}>
              <SpotArc
                spot={spot}
                ageVisualizationEnabled={spotAgePrefs.enabled}
                colorMode={colorMode}
                sizeScale={spotDotScale}
                filterOpacityMultiplier={filterOpacity}
                bandHeightArcs={uiPrefs.bandHeightArcs ?? true}
                band={orig?.band || getBandFromFrequency(spot.frequency)}
              />
              {/* Callsign label — deduplicated + stacked when nearby */}
              {uiPrefs.showSpotCallsignLabels &&
                !labeledCallsigns.has(spot.callsign) &&
                (() => {
                  labeledCallsigns.add(spot.callsign);
                  return (
                    <SpotLabel
                      lat={spot.dxLat}
                      lon={spot.dxLon}
                      callsign={spot.callsign}
                      mode={spot.mode}
                      frequency={spot.frequency}
                      stackIndex={stackIndex}
                      color={color}
                      occlusionOpacity={getOcclusionOpacity(
                        spot.dxLat,
                        spot.dxLon,
                      )}
                      onHover={
                        onSpotHover
                          ? (screenPos) =>
                              onSpotHover(
                                orig ?? spot.originalSpot,
                                screenPos,
                                {
                                  surface: "label",
                                  interactionId: `${spot.source}:${spot.id}:dx-label`,
                                },
                              )
                          : undefined
                      }
                      onHoverEnd={
                        onSpotHoverEnd
                          ? () =>
                              onSpotHoverEnd(orig ?? spot.originalSpot, {
                                surface: "label",
                                interactionId: `${spot.source}:${spot.id}:dx-label`,
                              })
                          : undefined
                      }
                      selected={orig?.id === selectedSpotId}
                      onSelect={
                        onSpotSelect && orig
                          ? (screenPos) => onSpotSelect(orig, screenPos)
                          : undefined
                      }
                    />
                  );
                })()}
              {/* Spotter label — shown when both master labels and spotter labels are enabled */}
              {uiPrefs.showSpotCallsignLabels &&
                uiPrefs.showSpotterLabels &&
                spot.spotter &&
                !labeledSpotters.has(spot.spotter) &&
                (() => {
                  labeledSpotters.add(spot.spotter!);
                  return (
                    <SpotLabel
                      lat={spot.spotterLat}
                      lon={spot.spotterLon}
                      callsign={spot.spotter!}
                      mode={spot.mode}
                      isSpotter
                      opacity={0.6}
                      color={color}
                      occlusionOpacity={getOcclusionOpacity(
                        spot.spotterLat,
                        spot.spotterLon,
                      )}
                      onHover={
                        onSpotHover
                          ? (screenPos) =>
                              onSpotHover(
                                orig ?? spot.originalSpot,
                                screenPos,
                                {
                                  surface: "label",
                                  interactionId: `${spot.source}:${spot.id}:spotter-label`,
                                },
                              )
                          : undefined
                      }
                      onHoverEnd={
                        onSpotHoverEnd
                          ? () =>
                              onSpotHoverEnd(orig ?? spot.originalSpot, {
                                surface: "label",
                                interactionId: `${spot.source}:${spot.id}:spotter-label`,
                              })
                          : undefined
                      }
                      onSelect={
                        onSpotSelect && orig
                          ? (screenPos) => onSpotSelect(orig, screenPos)
                          : undefined
                      }
                    />
                  );
                })()}
              {/* Both route endpoints are interactive. The receiver/DX end is
                  the contact target; the source end identifies who reported
                  the path and which live network supplied it. */}
              {(onSpotHover || (onSpotSelect && orig)) && (
                <>
                  <SpotEndpointHitArea
                    lat={spot.spotterLat}
                    lon={spot.spotterLon}
                    spot={spot}
                    hitRadius={0.025 * uiPrefs.spotHitRadiusMultiplier}
                    occlusionOpacity={getOcclusionOpacity(
                      spot.spotterLat,
                      spot.spotterLon,
                    )}
                    onHover={onSpotHover}
                    onHoverEnd={onSpotHoverEnd}
                    onSelect={
                      onSpotSelect && orig
                        ? (screenPos) => onSpotSelect(orig, screenPos)
                        : undefined
                    }
                  />
                  <SpotEndpointHitArea
                    lat={spot.dxLat}
                    lon={spot.dxLon}
                    spot={spot}
                    hitRadius={0.025 * uiPrefs.spotHitRadiusMultiplier}
                    occlusionOpacity={getOcclusionOpacity(
                      spot.dxLat,
                      spot.dxLon,
                    )}
                    onHover={onSpotHover}
                    onHoverEnd={onSpotHoverEnd}
                    onSelect={
                      onSpotSelect && orig
                        ? (screenPos) => onSpotSelect(orig, screenPos)
                        : undefined
                    }
                  />
                </>
              )}
            </group>
          );
        });

        return (
          <>
            {arcElements}
            <SpotEndpointInstances endpoints={endpointData} />
          </>
        );
      })()}

      {/* ── Replay arcs — sepia-toned historical spots ─────────────────── */}
      {(() => {
        const replaySlice = resolvedReplay.slice(0, maxArcs);
        const replayEndpoints: EndpointData[] = [];
        const replayArcs = replaySlice.map((spot) => {
          // Collect endpoints for batched instanced rendering
          replayEndpoints.push({
            lat: spot.spotterLat,
            lon: spot.spotterLon,
            color: SPOT_REPLAY_COLOR,
            size: 0.005,
          });
          replayEndpoints.push({
            lat: spot.dxLat,
            lon: spot.dxLon,
            color: SPOT_REPLAY_COLOR,
            size: 0.006,
          });
          const canInteract = Boolean(onSpotHover || onSpotSelect);
          return (
            <group key={`replay-${spot.id}`}>
              <SpotArc
                spot={spot}
                ageVisualizationEnabled={false}
                colorMode="mode"
                colorOverride={SPOT_REPLAY_COLOR}
                sizeScale={uiPrefs.spotDotScale ?? 1.0}
                filterOpacityMultiplier={0.6}
              />
              {canInteract && (
                <>
                  <SpotEndpointHitArea
                    lat={spot.spotterLat}
                    lon={spot.spotterLon}
                    spot={spot}
                    hitRadius={0.025 * uiPrefs.spotHitRadiusMultiplier}
                    occlusionOpacity={getOcclusionOpacity(
                      spot.spotterLat,
                      spot.spotterLon,
                    )}
                    onHover={onSpotHover}
                    onHoverEnd={onSpotHoverEnd}
                    onSelect={
                      onSpotSelect
                        ? (screenPos) =>
                            onSpotSelect(spot.originalSpot, screenPos)
                        : undefined
                    }
                  />
                  <SpotEndpointHitArea
                    lat={spot.dxLat}
                    lon={spot.dxLon}
                    spot={spot}
                    hitRadius={0.025 * uiPrefs.spotHitRadiusMultiplier}
                    occlusionOpacity={getOcclusionOpacity(
                      spot.dxLat,
                      spot.dxLon,
                    )}
                    onHover={onSpotHover}
                    onHoverEnd={onSpotHoverEnd}
                    onSelect={
                      onSpotSelect
                        ? (screenPos) =>
                            onSpotSelect(spot.originalSpot, screenPos)
                        : undefined
                    }
                  />
                </>
              )}
            </group>
          );
        });
        return (
          <>
            {replayArcs}
            {replayEndpoints.length > 0 && (
              <SpotEndpointInstances endpoints={replayEndpoints} />
            )}
          </>
        );
      })()}
    </group>
  );
}

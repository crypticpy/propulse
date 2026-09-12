/**
 * AzimuthalView Component
 *
 * Canvas-based azimuthal equidistant projection view centered on the user's QTH.
 * Great circle paths appear as straight lines in this projection, making it
 * extremely useful for ham radio operators to determine beam headings.
 *
 * Uses WebGL for the map background (NASA Blue Marble texture projected onto
 * azimuthal equidistant projection) with 2D canvas overlays for UI elements.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore, useUIInteractionPrefs } from "@/stores/userStore";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { getPathMetrics, getLongPathPoints } from "@/lib/utils/path";
import {
  azimuthalProject,
  azimuthalUnproject,
  getCenteredZoomViewport,
  type AzimuthalPoint,
} from "@/lib/utils/azimuthal";
import {
  buildCellColorLut,
  renderAzimuthalCellRaster,
} from "@/lib/map/azimuthalCellRaster";
import {
  getGreatCirclePoints,
  resolveSpotLocations,
  type ResolvedSpot,
} from "./LiveSpotArcs";
import {
  getBandColor,
  getSpotColor,
  type SpotColorMode,
} from "@/lib/utils/spotColors";
import { GridGlowRenderer } from "./GridGlowCanvas";
import type { GridGlowSpot } from "./GridGlowCanvas";
import { latLonToGrid } from "@/lib/utils/grid";
import {
  getDifficultyColor,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";
import { getSpotAgeOpacity } from "@/lib/utils/canvas";
import { AzimuthalRenderer, CANVAS_SIZE } from "@/lib/webgl/AzimuthalRenderer";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import { SpotHoverPreview } from "./SpotHoverPreview";
import { SelectedSpotCard } from "./SelectedSpotCard";
import { MapSurface } from "./MapSurface";
import { SpotCollectionPopover } from "./SpotCollectionPopover";
import {
  GridResearchPanel,
  type GridResearchAction,
  type GridResearchActionSubject,
} from "./GridResearchPanel";
import { AddPinDialog } from "./AddPinDialog";
import { MapSizeSliders } from "./MapSizeSliders";
import { MAP_PAGE_CHROME_Z } from "@/lib/map/globeRenderOrder";
import { createAzimuthalProjection } from "@/lib/map/projection";
import type { Projection } from "@/lib/map/projection";
import { AZIMUTHAL_LAYER_PROFILE } from "@/lib/map/mapLayerProfile";
import { drawFiresLayer } from "./layers/firesLayer";
import { drawEarthquakesLayer } from "./layers/earthquakesLayer";
import { drawWeatherAlertsLayer } from "./layers/weatherAlertsLayer";
import { drawLightningLayer } from "./layers/lightningLayer";
import {
  drawCountryBordersLayer,
  drawStateBordersLayer,
  drawNightBoostedBordersLayer,
} from "./layers/bordersLayer";
import { drawTerminatorLayer } from "./layers/terminatorLayer";
import type { TerminatorGeometry } from "./layers/terminatorLayer";
import {
  drawSpotArcsLayer,
  SPOT_ARC_SELECTED_COLOR,
  type SpotArcInput,
} from "./layers/spotArcsLayer";
import { getSpotLayerPolicy } from "@/lib/map/spotLayerPolicy";
import type { LiveSpot } from "@/types/livespot";
import { useMapHazardData } from "./hooks/useMapHazardData";
import { useOptimalMapSignal } from "./hooks/useOptimalMapSignal";
import { useAzimuthalMapSpots } from "./hooks/useAzimuthalMapSpots";
import {
  drawActivationPills,
  sameActivationPillScreenPlacements,
  type ActivationPillScreenPlacement,
} from "@/lib/map/activationMarkers";
import { ActivationPillButtons } from "./layers/ActivationPillButtons";
import {
  AzimuthalSpotEndpointButtons,
  AzimuthalSpotPillButtons,
} from "./layers/AzimuthalSpotPillButtons";
import {
  resolveAzimuthalTargetAnnotation,
  sameAzimuthalSpotPillScreenPlacements,
  spotDestinationMatchesTarget,
  type AzimuthalSpotPillScreenPlacement,
} from "@/lib/map/azimuthalSpotPillPlacement";
import { useViewSpotSelection } from "@/hooks/useMapSpotSelection";
import { useViewSpotFocus } from "@/hooks/useSpotFocus";
import {
  EMPTY_VIEW_SPOTS,
  useBoundVisualTarget,
} from "@/hooks/useBoundMapSelection";
import { useTargetPathPresentation } from "@/hooks/useTargetPathPresentation";
import type { BounceMarker } from "@/lib/map/targetPathPresentation";
import { pathEmphasis } from "@/lib/map/targetPathPresentation";
import { useScopedMapLayers } from "@/hooks/useMapOperationalContext";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import { useGridActivitySnapshot } from "@/hooks/useGridActivitySnapshot";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useThemeStore } from "@/stores/themeStore";
import { getSeasonalTextureCandidates } from "./hooks/useSeasonalDayTexture";
import { AzimuthalSpotClusterButtons } from "./layers/AzimuthalSpotClusterButtons";
import {
  buildAzimuthalSpotClusters,
  limitAzimuthalBackgroundTraces,
  type AzimuthalSpotCluster,
} from "@/lib/map/azimuthalSpotAggregation";
import { useWatchStore } from "@/stores/watchStore";
import { resolveGridResearchActionIntent } from "@/lib/map/gridResearchActions";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { PresentableSpot } from "@/lib/map/spotPresentation";
import { drawLunarSubpointMarker } from "@/lib/map/lunarSubpointMarker";
import { getSublunarPoint } from "@/lib/utils/moon";
import {
  gridActivityGridForCoordinate,
  gridActivityResolutionForView,
} from "@/lib/map/gridActivityModel";

interface AzimuthalViewProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
  /** Rows the host wants in the map's bottom-left corner. The view owns that
   * corner and renders the one column there, so a host contributes rows
   * instead of anchoring a second stack of its own (#930). */
  cornerSlot?: ReactNode;
  /** Forwarded to `SpotCollectionPopover` — true only when `HamClockView` is
   * the host (#846/#871 round 3). */
  isWallCanvas?: boolean;
}

// Canvas dimensions (square for circular projection)
// These are now used as defaults/internal references
const CENTER = CANVAS_SIZE / 2;
const RADIUS = CANVAS_SIZE / 2 - 40; // Leave margin for labels

// Distance rings in km
const DISTANCE_RINGS = [5000, 10000, 15000, 20000];

// Colors for overlay elements (map background is rendered via WebGL)
const COLORS = {
  background: "#0a0a1a",
  ring: "rgba(255, 255, 255, 0.15)",
  ringLabel: "rgba(255, 255, 255, 0.5)",
  bearingLabel: "rgba(255, 255, 255, 0.7)",
  bearingTick: "rgba(255, 255, 255, 0.3)",
  homeMarker: "#4488FF", // Blue for home station
  targetMarker: "#ff6b35", // Default fallback - usually overridden by difficulty
  path: "#ff6b35",
};

// Max distance in km (half Earth circumference)
const MAX_DISTANCE_KM = 20015;
const MAX_AZIMUTHAL_BACKGROUND_TRACES = 64;
const MAX_AZIMUTHAL_CALLSIGN_LABELS = 16;
// Mirrors FlatMapView.tsx's EMPTY_GROUPED_MEMBERS (#1247).
const EMPTY_GROUPED_MEMBERS: ReadonlySet<LiveSpot> = new Set<LiveSpot>();

/**
 * Convert normalized projection coordinates to canvas coordinates
 */
function projToCanvas(point: AzimuthalPoint): { x: number; y: number } {
  return {
    x: CENTER + point.x * RADIUS,
    y: CENTER + point.y * RADIUS,
  };
}

/**
 * Convert canvas coordinates to normalized projection coordinates
 */
function canvasToProj(
  canvasX: number,
  canvasY: number,
): { x: number; y: number } {
  return {
    x: (canvasX - CENTER) / RADIUS,
    y: (canvasY - CENTER) / RADIUS,
  };
}

/**
 * Resize a 2D overlay canvas's backing store to match its CSS display size
 * at the device pixel ratio (fixes blur on large/HiDPI screens), and apply a
 * transform so all existing draw code keeps working unchanged in the
 * logical CANVAS_SIZE x CANVAS_SIZE coordinate space.
 */
function applyCanvasDprTransform(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  displaySize: number,
  renderDevicePixelRatio: number,
): void {
  const backingSize = Math.round(displaySize * renderDevicePixelRatio);
  if (canvas.width !== backingSize || canvas.height !== backingSize) {
    canvas.width = backingSize;
    canvas.height = backingSize;
  }
  const scaleFactor = backingSize / CANVAS_SIZE;
  ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
}

/**
 * Draw distance rings at specified intervals
 */
function drawDistanceRings(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = COLORS.ring;
  ctx.lineWidth = 1;

  for (const distance of DISTANCE_RINGS) {
    const normalizedRadius = distance / MAX_DISTANCE_KM;
    const canvasRadius = normalizedRadius * RADIUS;

    ctx.beginPath();
    ctx.arc(CENTER, CENTER, canvasRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw distance label
    ctx.fillStyle = COLORS.ringLabel;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${distance / 1000}k km`, CENTER, CENTER - canvasRadius + 14);
  }

  // Draw outer edge (20,000 km)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draw bearing labels around the outer edge
 */
function drawBearingLabels(ctx: CanvasRenderingContext2D) {
  // Save/restore so the textBaseline = "middle" set below doesn't leak into
  // downstream draw calls that assume the default "alphabetic" baseline.
  ctx.save();
  const cardinalDirections = [
    { angle: 0, label: "N" },
    { angle: 45, label: "NE" },
    { angle: 90, label: "E" },
    { angle: 135, label: "SE" },
    { angle: 180, label: "S" },
    { angle: 225, label: "SW" },
    { angle: 270, label: "W" },
    { angle: 315, label: "NW" },
  ];

  // Draw tick marks every 10 degrees
  ctx.strokeStyle = COLORS.bearingTick;
  ctx.lineWidth = 1;

  for (let angle = 0; angle < 360; angle += 10) {
    const radians = ((angle - 90) * Math.PI) / 180; // -90 to make 0° at top
    const isCardinal = angle % 45 === 0;
    const isMajor = angle % 30 === 0;

    const tickLength = isCardinal ? 12 : isMajor ? 8 : 4;
    const outerRadius = RADIUS + 4;
    const innerRadius = outerRadius - tickLength;

    ctx.beginPath();
    ctx.moveTo(
      CENTER + Math.cos(radians) * innerRadius,
      CENTER + Math.sin(radians) * innerRadius,
    );
    ctx.lineTo(
      CENTER + Math.cos(radians) * outerRadius,
      CENTER + Math.sin(radians) * outerRadius,
    );
    ctx.stroke();
  }

  // Draw cardinal direction labels
  ctx.fillStyle = COLORS.bearingLabel;
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const { angle, label } of cardinalDirections) {
    const radians = ((angle - 90) * Math.PI) / 180;
    const labelRadius = RADIUS + 22;
    const x = CENTER + Math.cos(radians) * labelRadius;
    const y = CENTER + Math.sin(radians) * labelRadius;
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

/**
 * Draw the home marker at center
 */
function drawHomeMarker(ctx: CanvasRenderingContext2D, callsign?: string) {
  // Outer glow
  ctx.fillStyle = COLORS.homeMarker + "40";
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 12, 0, Math.PI * 2);
  ctx.fill();

  // Inner dot
  ctx.fillStyle = COLORS.homeMarker;
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 6, 0, Math.PI * 2);
  ctx.fill();

  // Crosshairs
  ctx.strokeStyle = COLORS.homeMarker + "80";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CENTER - 15, CENTER);
  ctx.lineTo(CENTER - 8, CENTER);
  ctx.moveTo(CENTER + 8, CENTER);
  ctx.lineTo(CENTER + 15, CENTER);
  ctx.moveTo(CENTER, CENTER - 15);
  ctx.lineTo(CENTER, CENTER - 8);
  ctx.moveTo(CENTER, CENTER + 8);
  ctx.lineTo(CENTER, CENTER + 15);
  ctx.stroke();

  // Label
  if (callsign) {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(CENTER - 30, CENTER + 18, 60, 16);
    ctx.strokeStyle = COLORS.homeMarker;
    ctx.lineWidth = 1;
    ctx.strokeRect(CENTER - 30, CENTER + 18, 60, 16);

    ctx.fillStyle = COLORS.homeMarker;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(callsign, CENTER, CENTER + 30);
  }
}

function drawAzimuthalPathLeg(
  ctx: CanvasRenderingContext2D,
  centerLat: number,
  centerLon: number,
  targetLat: number,
  targetLon: number,
  color: string,
  pathMode: "short" | "long",
  bounceMarkers: BounceMarker[],
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = pathMode === "long" ? 1.8 : 2.5;
  ctx.lineCap = "round";
  ctx.setLineDash(pathMode === "long" ? [8, 7] : [10, 6]);

  if (pathMode === "short") {
    const projected = azimuthalProject(
      targetLat,
      targetLon,
      centerLat,
      centerLon,
    );
    const { x, y } = projToCanvas(projected);
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.lineTo(x, y);
    ctx.stroke();
  } else {
    const points = getLongPathPoints(
      centerLat,
      centerLon,
      targetLat,
      targetLon,
      160,
    );
    ctx.beginPath();
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    for (const point of points) {
      const proj = azimuthalProject(point.lat, point.lon, centerLat, centerLon);
      const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);
      if (dist > 1) {
        drawing = false;
        continue;
      }
      const canvasPt = projToCanvas(proj);
      if (
        drawing &&
        Math.hypot(canvasPt.x - lastX, canvasPt.y - lastY) > RADIUS
      ) {
        drawing = false;
      }
      if (!drawing) {
        ctx.moveTo(canvasPt.x, canvasPt.y);
        drawing = true;
      } else {
        ctx.lineTo(canvasPt.x, canvasPt.y);
      }
      lastX = canvasPt.x;
      lastY = canvasPt.y;
    }
    ctx.stroke();
  }

  ctx.setLineDash([]);
  for (const marker of bounceMarkers) {
    const proj = azimuthalProject(marker.lat, marker.lon, centerLat, centerLon);
    const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);
    if (dist > 1) continue;
    const { x, y } = projToCanvas(proj);
    ctx.globalAlpha = Math.min(1, alpha + 0.3);
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw target marker and path
 */
function drawTargetAndPath(
  ctx: CanvasRenderingContext2D,
  centerLat: number,
  centerLon: number,
  targetLat: number,
  targetLon: number,
  targetLabel?: string,
  markerColor: string = COLORS.targetMarker,
  difficulty?: DifficultyLevel,
  legs: Array<{
    mode: "short" | "long";
    markers: BounceMarker[];
    alpha: number;
  }> = [{ mode: "short", markers: [], alpha: 1 }],
) {
  for (const leg of legs) {
    drawAzimuthalPathLeg(
      ctx,
      centerLat,
      centerLon,
      targetLat,
      targetLon,
      markerColor,
      leg.mode,
      leg.markers,
      leg.alpha,
    );
  }

  const projected = azimuthalProject(
    targetLat,
    targetLon,
    centerLat,
    centerLon,
  );
  const { x, y } = projToCanvas(projected);
  // Outer glow
  ctx.fillStyle = markerColor + "40";
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();

  // Inner dot
  ctx.fillStyle = markerColor;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Pulsing ring
  ctx.strokeStyle = markerColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.stroke();

  // Label with bearing and distance
  if (targetLabel) {
    const bearing = projected.bearing.toFixed(0);
    const distKm = projected.distance.toFixed(0);
    const labelText = `${targetLabel} (${bearing}° / ${distKm}km)`;

    ctx.fillStyle = COLORS.background;
    const textWidth = ctx.measureText(labelText).width + 10;
    ctx.fillRect(x - textWidth / 2, y - 32, textWidth, 18);
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - textWidth / 2, y - 32, textWidth, 18);

    ctx.fillStyle = markerColor;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(labelText, x, y - 18);

    // Difficulty tag below target label
    if (difficulty) {
      const difficultyLabel = DIFFICULTY_LABELS[difficulty];
      ctx.font = "10px sans-serif";
      const diffWidth = ctx.measureText(difficultyLabel).width + 8;

      // Background with difficulty color tint
      ctx.fillStyle = markerColor + "30"; // 30 = ~19% opacity
      ctx.fillRect(x - diffWidth / 2, y - 50, diffWidth, 14);
      ctx.strokeStyle = markerColor + "80"; // 80 = 50% opacity
      ctx.lineWidth = 1;
      ctx.strokeRect(x - diffWidth / 2, y - 50, diffWidth, 14);

      ctx.fillStyle = markerColor;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(difficultyLabel, x, y - 39);
    }
  }
}

/**
 * Draw a message when no QTH is set
 */
function drawNoQTHMessage(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw faded circle
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Draw message
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Set your QTH in settings", CENTER, CENTER - 10);
  ctx.fillText("to use azimuthal view", CENTER, CENTER + 14);

  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.font = "13px sans-serif";
  ctx.fillText("(Click the gear icon)", CENTER, CENTER + 40);
}

/**
 * Build the shared `spotArcsLayer`'s per-arc input from a resolved spot
 * (#1247). Mirrors `FlatMapView.tsx`'s `spotArcInput`.
 */
function spotArcInput(
  spot: ResolvedSpot,
  colorMode: SpotColorMode,
  options: {
    isWatched?: boolean;
    skipDxEndpoint?: boolean;
    skipSpotterEndpoint?: boolean;
    selected?: boolean;
  } = {},
): SpotArcInput {
  return {
    id: spot.id,
    from: { lat: spot.spotterLat, lon: spot.spotterLon },
    to: { lat: spot.dxLat, lon: spot.dxLon },
    colour: getSpotColor(spot, colorMode),
    isWatched: options.isWatched ?? true,
    ageOpacity: getSpotAgeOpacity(spot.time),
    skipDxEndpoint: options.skipDxEndpoint ?? false,
    skipSpotterEndpoint: options.skipSpotterEndpoint ?? false,
    selected: options.selected ?? false,
  };
}

/**
 * Draw live spot arcs on the azimuthal disc through the shared
 * `spotArcsLayer` (#1247), replacing the disc's own geometry
 * (`buildGreatCirclePath`) and its always-on per-spot glow. `drawEndpoints:
 * false` suppresses both endpoint glyphs -- the "Spot Traces" background
 * layer's pre-#1247 behaviour, kept unchanged.
 */
function drawSpotArcs(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  spots: ResolvedSpot[],
  colorMode: SpotColorMode = "mode",
  highViz = false,
  spotDotScale = 1.0,
  drawEndpoints = true,
  options: {
    watchDimming?: boolean;
    watchMatchedIds?: Set<string>;
    ageFade?: boolean;
    groupedMembers?: ReadonlySet<LiveSpot>;
  } = {},
) {
  const arcs: SpotArcInput[] = spots.map((spot) =>
    spotArcInput(spot, colorMode, {
      isWatched: options.watchMatchedIds?.has(spot.id) ?? true,
      skipDxEndpoint:
        !drawEndpoints ||
        (options.groupedMembers?.has(spot.originalSpot) ?? false),
      skipSpotterEndpoint: !drawEndpoints,
    }),
  );
  drawSpotArcsLayer(ctx, projection, arcs, {
    highViz,
    spotDotScale,
    watchDimming: options.watchDimming ?? false,
    ageFade: options.ageFade ?? false,
  });
}

interface AzimuthalSpotPillBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AzimuthalSpotPillCanvasPlacement {
  spot: LiveSpot;
  bounds: AzimuthalSpotPillBox;
}

function spotPillBoxesOverlap(
  left: AzimuthalSpotPillBox,
  right: AzimuthalSpotPillBox,
): boolean {
  return !(
    left.x + left.width < right.x ||
    right.x + right.width < left.x ||
    left.y + left.height < right.y ||
    right.y + right.height < left.y
  );
}

function drawSpotPillPath(
  ctx: CanvasRenderingContext2D,
  box: AzimuthalSpotPillBox,
  radius: number,
) {
  const { x, y, width, height } = box;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
    radius,
  );
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Render the callsign treatment already used by flat and globe projections:
 * one compact DX pill per callsign, keyed to its operating band. Candidate
 * positions and box collision checks keep dense openings readable.
 */
function drawSpotCallsignPills(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  centerLat: number,
  centerLon: number,
  labelScale: number,
  highViz: boolean,
  zoom: number,
  spotDotScale: number,
): AzimuthalSpotPillCanvasPlacement[] {
  const zoomDamp = Math.max(0.5, zoom);
  const viewport = getCenteredZoomViewport(CANVAS_SIZE, zoomDamp, 2);
  const placed: AzimuthalSpotPillBox[] = [];
  const placements: AzimuthalSpotPillCanvasPlacement[] = [];
  const endpointRadius = Math.round(4 * spotDotScale) + 2 / zoomDamp;
  const endpointZones = spots.flatMap((spot) =>
    [
      azimuthalProject(
        spot.spotterLat,
        spot.spotterLon,
        centerLat,
        centerLon,
      ),
      azimuthalProject(spot.dxLat, spot.dxLon, centerLat, centerLon),
    ]
      .filter((projected) => Math.hypot(projected.x, projected.y) <= 1)
      .map((projected) => {
        const point = projToCanvas(projected);
        return {
          x: point.x - endpointRadius,
          y: point.y - endpointRadius,
          width: endpointRadius * 2,
          height: endpointRadius * 2,
        };
      }),
  );
  const callsigns = new Set<string>();
  const fontSize = Math.max(
    1,
    Math.round(((highViz ? 12 : 10) * labelScale) / zoomDamp),
  );
  const verticalPadding = 8 / zoomDamp;
  const horizontalPadding = 12 / zoomDamp;
  const gap = endpointRadius + 4 / zoomDamp;
  const height = fontSize + verticalPadding;

  ctx.save();
  ctx.font = `700 ${fontSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const spot of spots) {
    if (!spot.callsign || callsigns.has(spot.callsign)) continue;

    const projected = azimuthalProject(
      spot.dxLat,
      spot.dxLon,
      centerLat,
      centerLon,
    );
    if (Math.hypot(projected.x, projected.y) > 0.98) continue;

    const point = projToCanvas(projected);
    const width = ctx.measureText(spot.callsign).width + horizontalPadding;
    const candidates: AzimuthalSpotPillBox[] = [
      { x: point.x - width / 2, y: point.y - height - gap, width, height },
      { x: point.x - width / 2, y: point.y + gap, width, height },
      { x: point.x + gap, y: point.y - height / 2, width, height },
      { x: point.x - width - gap, y: point.y - height / 2, width, height },
    ];
    const box = candidates.find(
      (candidate) =>
        candidate.x >= viewport.x &&
        candidate.y >= viewport.y &&
        candidate.x + candidate.width <= viewport.x + viewport.width &&
        candidate.y + candidate.height <= viewport.y + viewport.height &&
        !placed.some((existing) =>
          spotPillBoxesOverlap(candidate, existing),
        ) &&
        !endpointZones.some((endpoint) =>
          spotPillBoxesOverlap(candidate, endpoint),
        ),
    );
    if (!box) continue;

    callsigns.add(spot.callsign);
    placed.push(box);
    placements.push({ spot: spot.originalSpot, bounds: box });
    const bandColor = spot.frequency
      ? getBandColor(spot.frequency)
      : getSpotColor(spot, "band");
    const ageOpacity = Math.max(0.55, getSpotAgeOpacity(spot.time));

    ctx.globalAlpha = highViz ? 0.94 * ageOpacity : 0.84 * ageOpacity;
    ctx.fillStyle = "#0a0a1a";
    drawSpotPillPath(ctx, box, height / 2);
    ctx.fill();

    ctx.globalAlpha = 0.9 * ageOpacity;
    ctx.strokeStyle = bandColor;
    ctx.lineWidth = (highViz ? 2 : 1.25) / zoomDamp;
    drawSpotPillPath(ctx, box, height / 2);
    ctx.stroke();

    // Preserve the cross-projection label language: a dark readable pill
    // with a bright edge-to-edge band cue instead of color-washing the text.
    ctx.globalAlpha = ageOpacity;
    ctx.strokeStyle = bandColor;
    ctx.lineWidth = (highViz ? 3 : 2) / zoomDamp;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(
      box.x + height / 2,
      box.y + box.height - 2 / zoomDamp,
    );
    ctx.lineTo(
      box.x + box.width - height / 2,
      box.y + box.height - 2 / zoomDamp,
    );
    ctx.stroke();

    ctx.globalAlpha = ageOpacity;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 3 / zoomDamp;
    ctx.fillText(spot.callsign, box.x + box.width / 2, box.y + height / 2);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
  return placements;
}

/**
 * Draw a highlighted arc for the selected DX cluster spot through the shared
 * `spotArcsLayer` (#1247), plus its callsign label -- the label stays the
 * disc's own (out of scope for #1247; unlike the flat map's pill, the disc
 * has always drawn a plain outlined text label here).
 */
function drawSelectedSpotArc(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  spot: ResolvedSpot,
  spotDotScale: number,
) {
  drawSpotArcsLayer(
    ctx,
    projection,
    [spotArcInput(spot, "mode", { selected: true })],
    { highViz: false, spotDotScale, watchDimming: false, ageFade: false },
  );

  const dx = projection.project(spot.dxLat, spot.dxLon);
  if (!dx.visible || !spot.callsign) return;

  ctx.save();
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = SPOT_ARC_SELECTED_COLOR;
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.textAlign = "center";
  ctx.fillText(spot.callsign, dx.x, dx.y - 10);
  ctx.restore();
}

// Major cities for night lights display in azimuthal view
const AZIMUTHAL_LIGHT_CITIES = [
  { lat: 40.7128, lon: -74.006, size: 6 }, // New York
  { lat: 34.0522, lon: -118.2437, size: 5 }, // Los Angeles
  { lat: 51.5074, lon: -0.1278, size: 5 }, // London
  { lat: 48.8566, lon: 2.3522, size: 4 }, // Paris
  { lat: 35.6762, lon: 139.6503, size: 6 }, // Tokyo
  { lat: 39.9042, lon: 116.4074, size: 6 }, // Beijing
  { lat: -33.8688, lon: 151.2093, size: 4 }, // Sydney
  { lat: 55.7558, lon: 37.6173, size: 4 }, // Moscow
  { lat: 25.2048, lon: 55.2708, size: 4 }, // Dubai
  { lat: 19.076, lon: 72.8777, size: 5 }, // Mumbai
  { lat: 30.0444, lon: 31.2357, size: 4 }, // Cairo
  { lat: -22.9068, lon: -43.1729, size: 4 }, // Rio
  { lat: 37.5665, lon: 126.978, size: 5 }, // Seoul
  { lat: 22.3193, lon: 114.1694, size: 5 }, // Hong Kong
  { lat: 31.2304, lon: 121.4737, size: 5 }, // Shanghai
];

/**
 * Draw night lights on azimuthal projection
 */
function drawAzimuthalNightLights(
  ctx: CanvasRenderingContext2D,
  date: Date,
  centerLat: number,
  centerLon: number,
) {
  const subsolar = getSubsolarPoint(date);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const city of AZIMUTHAL_LIGHT_CITIES) {
    // Project city location
    const projected = azimuthalProject(
      city.lat,
      city.lon,
      centerLat,
      centerLon,
    );
    const dist = Math.sqrt(
      projected.x * projected.x + projected.y * projected.y,
    );

    // Skip if outside circle
    if (dist > 1) {
      continue;
    }

    // Calculate if city is on night side
    const phi1 = city.lat * (Math.PI / 180);
    const phi2 = subsolar.lat * (Math.PI / 180);
    const deltaLambda = (city.lon - subsolar.lon) * (Math.PI / 180);

    const cosAngle =
      Math.sin(phi1) * Math.sin(phi2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const angle =
      Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

    // Only show lights on night side
    if (angle > 85) {
      const canvas = projToCanvas(projected);
      const nightDepth = Math.min((angle - 85) / 30, 1);
      const intensity = nightDepth * 0.8;

      const gradient = ctx.createRadialGradient(
        canvas.x,
        canvas.y,
        0,
        canvas.x,
        canvas.y,
        city.size,
      );
      gradient.addColorStop(0, `rgba(255, 200, 100, ${intensity})`);
      gradient.addColorStop(0.3, `rgba(255, 180, 80, ${intensity * 0.6})`);
      gradient.addColorStop(1, "transparent");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(canvas.x, canvas.y, city.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// City labels for azimuthal view
const AZIMUTHAL_CITY_LABELS = [
  { name: "NYC", lat: 40.7128, lon: -74.006 },
  { name: "London", lat: 51.5074, lon: -0.1278 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Moscow", lat: 55.7558, lon: 37.6173 },
];

/**
 * Draw labels on azimuthal projection
 */
function drawAzimuthalLabels(
  ctx: CanvasRenderingContext2D,
  centerLat: number,
  centerLon: number,
) {
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";

  for (const city of AZIMUTHAL_CITY_LABELS) {
    const projected = azimuthalProject(
      city.lat,
      city.lon,
      centerLat,
      centerLon,
    );
    const dist = Math.sqrt(
      projected.x * projected.x + projected.y * projected.y,
    );

    // Skip if outside circle
    if (dist > 0.95) {
      continue;
    }

    const canvas = projToCanvas(projected);

    // Draw text with dark outline for visibility
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 3;
    ctx.strokeText(city.name, canvas.x, canvas.y - 8);

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(city.name, canvas.x, canvas.y - 8);

    // Small dot
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(canvas.x, canvas.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function AzimuthalView({
  displayTime,
  onLocationClick,
  cornerSlot,
  isWallCanvas,
}: AzimuthalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const contestOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AzimuthalRenderer | null>(null);
  const glowRendererRef = useRef<GridGlowRenderer>(new GridGlowRenderer());
  const prevGlowSpotIdsRef = useRef<Set<string>>(new Set());
  // Caller-owned terminator geometry cache (#1091 PR 8 follow-up, Codex P1):
  // the science effect below depends on `glowTick`, which advances on every
  // spot/grid glow animation frame, so without this the terminator would
  // re-sample and re-project every frame instead of once per `displayTime`
  // tick (`useMapDisplayTime` only advances it once a minute).
  const terminatorGeometryRef = useRef<TerminatorGeometry | null>(null);
  const [glowTick, setGlowTick] = useState(0);
  const [activationPillPlacements, setActivationPillPlacements] = useState<
    ActivationPillScreenPlacement[]
  >([]);
  const [spotPillPlacements, setSpotPillPlacements] = useState<
    AzimuthalSpotPillScreenPlacement[]
  >([]);
  const [hoveredSpotData, setHoveredSpotData] = useState<{
    spot: PresentableSpot;
    screenPos: ScreenAnchor;
  } | null>(null);
  const [selectedMapSpotData, setSelectedMapSpotData] = useState<{
    spot: PresentableSpot;
    screenPos: ScreenAnchor;
  } | null>(null);
  const [openSpotCollection, setOpenSpotCollection] = useState<{
    position: ScreenAnchor;
    title: string;
    subtitle: string;
    spots: LiveSpot[];
    groupId?: string;
  } | null>(null);
  const [researchPanelOpen, setResearchPanelOpen] = useState(false);
  const [researchGrid, setResearchGrid] = useState("");
  const [researchCallsign, setResearchCallsign] = useState<string | null>(null);
  const [addPinDialogOpen, setAddPinDialogOpen] = useState(false);
  const [addPinData, setAddPinData] = useState<{
    lat: number;
    lon: number;
    grid: string;
  } | null>(null);
  const spotHoverDismissRef = useRef<number | null>(null);
  const hoveredSpotOwnerRef = useRef<string | null>(null);
  const selectMapSpot = useViewSpotSelection();
  const glowRafRef = useRef<number>(0);
  const layers = useScopedMapLayers();
  const gridActivityEndpoint = useMapStore((s) => s.gridActivityEndpoint);
  const setTarget = useMapStore((s) => s.setTarget);
  const setWatch = useWatchStore((s) => s.setWatch);
  const watchEnabled = useWatchStore((s) => s.enabled);
  const matchedSpotIds = useWatchStore((s) => s.matchedSpotIds);

  const cancelSpotHoverDismiss = useCallback(() => {
    if (spotHoverDismissRef.current === null) return;
    window.clearTimeout(spotHoverDismissRef.current);
    spotHoverDismissRef.current = null;
  }, []);

  const scheduleSpotHoverDismiss = useCallback((spot?: PresentableSpot) => {
    const owner = spot
      ? `${spot.source ?? "Cluster"}:${spot.id}`
      : hoveredSpotOwnerRef.current;
    if (owner && hoveredSpotOwnerRef.current !== owner) return;
    if (spotHoverDismissRef.current !== null) return;
    spotHoverDismissRef.current = window.setTimeout(() => {
      if (!owner || hoveredSpotOwnerRef.current === owner) {
        hoveredSpotOwnerRef.current = null;
        setHoveredSpotData(null);
      }
      spotHoverDismissRef.current = null;
    }, 180);
  }, []);

  useEffect(
    () => () => {
      if (spotHoverDismissRef.current !== null) {
        window.clearTimeout(spotHoverDismissRef.current);
      }
    },
    [],
  );

  const handleSpotHover = useCallback(
    (spot: PresentableSpot, screenPos: ScreenAnchor) => {
      cancelSpotHoverDismiss();
      hoveredSpotOwnerRef.current = `${spot.source ?? "Cluster"}:${spot.id}`;
      setHoveredSpotData({ spot, screenPos });
    },
    [cancelSpotHoverDismiss],
  );

  const handleMapSpotSelect = useCallback(
    (spot: PresentableSpot, screenPos: ScreenAnchor) => {
      const selection = selectMapSpot(spot);
      cancelSpotHoverDismiss();
      hoveredSpotOwnerRef.current = null;
      setHoveredSpotData(null);
      setOpenSpotCollection(null);
      setHoveredTargetPos(null);
      setSelectedMapSpotData({
        spot: { ...spot, ...(selection?.spot ?? {}) },
        screenPos,
      });
    },
    [cancelSpotHoverDismiss, selectMapSpot],
  );

  // Persistent activity is supplied by the canonical model; arrival glows
  // retain their original short lifetime when activity is disabled.
  useEffect(() => {
    glowRendererRef.current.persistEdges = false;
  }, []);
  const mapTarget = useMapStore((s) => s.target);
  const target = useBoundVisualTarget(mapTarget);
  const pathPresentation = useTargetPathPresentation(displayTime);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const nightDarkness = useMapStore((s) => s.nightDarkness);
  const labelOptions = useMapStore((s) => s.labelOptions);
  const overlayLayers = useMapStore((s) => s.overlayLayers);
  const { station } = useUserStore();
  const { focusedSpot: selectedSpot } = useViewSpotFocus(EMPTY_VIEW_SPOTS);
  const uiPrefs = useUIInteractionPrefs();
  const spotColorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";
  const spotDotScale = uiPrefs.spotDotScale ?? 1.0;
  const spotLabelScale = uiPrefs.labelScale ?? 1.0;
  const showSpotCallsignLabels = uiPrefs.showSpotCallsignLabels ?? true;
  const highVizSpots = uiPrefs.visualStyle === "high-viz";
  // Mirrors FlatMapView.tsx's spotLayerPolicy (#1247): "Spots" now draws
  // arcs too, not just callsign pills, so path visibility is gated the same
  // way on both maps instead of the azimuthal-only `pathPresentation`.
  const spotLayerPolicy = useMemo(
    () =>
      getSpotLayerPolicy(
        {
          spots: layers.spots,
          spotTraces: layers.spotTraces,
          gridActivity: layers.gridActivity,
          activations: layers.activations,
        },
        {
          isolateTargetPath: pathPresentation.isolateTargetPath,
          hasTarget: Boolean(station && target),
        },
      ),
    [
      layers.activations,
      layers.gridActivity,
      layers.spotTraces,
      layers.spots,
      pathPresentation.isolateTargetPath,
      station,
      target,
    ],
  );
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const qualitySettings = useResolvedDisplayQuality(displayQuality);
  const hiResTexturePreference = useSettingsStore(
    (s) => s.globeHiResTextures,
  );
  const themeId = useThemeStore((s) => s.themeId);

  // Shared hazard boundary keeps layer-to-request gating identical in every
  // projection while each renderer retains its own draw implementation.
  const {
    earthquakeData,
    weatherAlerts,
    lightningStrikes,
    fireHotspots,
  } = useMapHazardData(layers);

  // Track container size for responsive scaling
  const [displaySize, setDisplaySize] = useState(CANVAS_SIZE);

  // Zoom state for scroll wheel zoom (1 = default, 0.5 = zoomed out, 3 = zoomed in)
  const [zoom, setZoom] = useState(1);

  // Track WebGL readiness
  const [webglReady, setWebglReady] = useState(false);

  // State for target hover tooltip (selected target marker)
  const [hoveredTargetPos, setHoveredTargetPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Initialize WebGL renderer. The renderer owns its <canvas> so dispose() can
  // lose the context and remove the node; a successor always gets a virgin element.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    setWebglReady(false);
    const useHiResTexture =
      hiResTexturePreference ||
      qualitySettings.effective === "uhd" ||
      qualitySettings.effective === "extreme";
    const renderer = new AzimuthalRenderer({
      highRes: true,
      dayTextureUrls: [
        ...getSeasonalTextureCandidates(useHiResTexture),
        "/textures/earth-day.jpg",
      ],
      standardTextureWidth:
        qualitySettings.effective === "extreme" ||
        qualitySettings.effective === "uhd"
          ? 4096
          : qualitySettings.effective === "data-saver"
            ? 1024
            : 2048,
      themeId,
      enableNight: true,
      onTextureLoad: () => {
        if (!cancelled) setWebglReady(true);
      },
      onError: (error) => {
        if (!cancelled) console.warn("WebGL error:", error.message);
      },
    });

    renderer.initialize(host).then((success) => {
      if (success && !cancelled) {
        rendererRef.current = renderer;
      }
    });

    return () => {
      cancelled = true;
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [
    hiResTexturePreference,
    qualitySettings.effective,
    themeId,
  ]);

  // Observe container resize for responsive display
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      // Use the smaller dimension to maintain square aspect ratio
      // No minimum - let it scale down, cap at 1200px for display
      const size = Math.min(Math.min(rect.width, rect.height) - 16, 1200);
      setDisplaySize(Math.max(size, 300)); // Minimum 300px for display
    };

    // Initial size
    updateSize();

    // Observe resize
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Memoize the center coordinates
  const center = useMemo(() => {
    if (!station) {
      return null;
    }
    return { lat: station.lat, lon: station.lon };
  }, [station]);

  useEffect(() => {
    if (center) return;
    cancelSpotHoverDismiss();
    hoveredSpotOwnerRef.current = null;
    setHoveredSpotData(null);
    setOpenSpotCollection(null);
    setSelectedMapSpotData(null);
  }, [cancelSpotHoverDismiss, center]);

  useEffect(() => {
    setOpenSpotCollection(null);
  }, [layers.gridActivity, layers.spotTraces, layers.spots]);

  useEffect(() => {
    setOpenSpotCollection(null);
  }, [center?.lat, center?.lon, displaySize, zoom]);

  // Rasterize probability-surface cells per pixel via inverse projection.
  // Cells far from the center distort so much that polygon corners are
  // meaningless (they sweep across the disk near the antipode).
  const cellRasterCanvas = useMemo(() => {
    if (!center) {
      return null;
    }
    const cells = Object.values(overlayLayers).flatMap((layer) =>
      layer.type === "cells"
        ? layer.cells
        : layer.type === "mixed"
          ? (layer.cells ?? [])
          : [],
    );
    if (cells.length === 0) {
      return null;
    }
    const raster = renderAzimuthalCellRaster(buildCellColorLut(cells), {
      sizePx: CANVAS_SIZE,
      centerPx: CENTER,
      radiusPx: RADIUS,
      centerLat: center.lat,
      centerLon: center.lon,
    });
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    canvas
      .getContext("2d")
      ?.putImageData(new ImageData(raster, CANVAS_SIZE, CANVAS_SIZE), 0, 0);
    return canvas;
  }, [center, overlayLayers]);

  // Draw renderer-agnostic overlay layers (contest overlays, etc.) on a separate canvas
  useEffect(() => {
    const canvas = contestOverlayCanvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    applyCanvasDprTransform(
      canvas,
      ctx,
      displaySize,
      qualitySettings.renderDevicePixelRatio,
    );

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (!center) {
      return;
    }

    // Apply the same zoom transform as the overlay canvas rendering
    ctx.save();
    ctx.translate(CENTER, CENTER);
    ctx.scale(zoom, zoom);
    ctx.translate(-CENTER, -CENTER);

    // Draw probability-surface cells below arcs and markers.
    if (cellRasterCanvas) {
      ctx.drawImage(cellRasterCanvas, 0, 0);
    }

    // Draw overlay arcs first (under markers)
    for (const layer of Object.values(overlayLayers)) {
      const arcs =
        layer.type === "arcs"
          ? layer.arcs
          : layer.type === "mixed"
            ? layer.arcs
            : [];

      for (const arc of arcs) {
        const points = getGreatCirclePoints(
          arc.fromLat,
          arc.fromLon,
          arc.toLat,
          arc.toLon,
          48,
        );
        if (points.length < 2) {
          continue;
        }

        ctx.save();
        ctx.globalAlpha = arc.opacity ?? 0.7;
        ctx.strokeStyle = arc.color;
        ctx.lineWidth = arc.width ?? 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();

        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const projected = azimuthalProject(
            pt.lat,
            pt.lon,
            center.lat,
            center.lon,
          );
          const canvasPt = projToCanvas(projected);
          if (i === 0) {
            ctx.moveTo(canvasPt.x, canvasPt.y);
          } else {
            ctx.lineTo(canvasPt.x, canvasPt.y);
          }
        }

        ctx.stroke();
        ctx.restore();
      }
    }

    for (const layer of Object.values(overlayLayers)) {
      const markers =
        layer.type === "markers"
          ? layer.markers
          : layer.type === "mixed"
            ? layer.markers
            : [];

      for (const marker of markers) {
        const projected = azimuthalProject(
          marker.lat,
          marker.lon,
          center.lat,
          center.lon,
        );
        const pt = projToCanvas(projected);
        const size = marker.size ?? 6;
        const opacity = marker.opacity ?? 0.9;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fillStyle = marker.color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }, [
    center,
    overlayLayers,
    zoom,
    cellRasterCanvas,
    displaySize,
    qualitySettings.renderDevicePixelRatio,
  ]);

  // Get subsolar point for day/night blending
  const subsolar = useMemo(() => getSubsolarPoint(displayTime), [displayTime]);

  // Resolve the common live feed once, capped for this canvas renderer. This
  // preserves the shared display-density contract without a local pipeline.
  const {
    resolvedSpots,
    resolvedSingles,
    allResolvedSpots,
    activationSpots,
    clusters,
    groupingEnabled,
    expandGroup,
  } = useAzimuthalMapSpots({
    grid: station?.grid,
    enabled: layers.spots || layers.spotTraces || layers.gridActivity,
    activationsEnabled: layers.activations,
  });
  const gridActivityResolution = gridActivityResolutionForView(
    "azimuthal",
    zoom,
  );
  const gridActivity = useGridActivitySnapshot(
    allResolvedSpots,
    gridActivityResolution,
    gridActivityEndpoint,
    layers.gridActivity,
  );

  // Resolve selected DX cluster spot location for highlight arc
  const resolvedSelectedSpot = useMemo(() => {
    if (!selectedSpot) return null;
    const selectedSpotSource =
      (selectedSpot as unknown as { source?: LiveSpot["source"] }).source ??
      "Cluster";
    const resolved = resolveSpotLocations([
      { ...selectedSpot, source: selectedSpotSource },
    ]);
    return resolved.length > 0 ? resolved[0] : null;
  }, [selectedSpot]);

  const selectedSpotMatchesTarget = useMemo(
    () => spotDestinationMatchesTarget(selectedSpot, target),
    [selectedSpot, target],
  );

  const selectedSpotHasVisibleTag = useMemo(() => {
    if (!selectedSpot || !selectedSpotMatchesTarget) return false;
    const matchesSelectedReport = (candidate: {
      id: string;
      callsign: string;
      frequency: number;
    }) =>
      candidate.id === selectedSpot.id &&
      candidate.callsign === selectedSpot.dx &&
      candidate.frequency === selectedSpot.frequency;

    const hasLiveSpotPill =
      layers.spots &&
      showSpotCallsignLabels &&
      spotPillPlacements.some(({ spot }) =>
        matchesSelectedReport({
          id: spot.id,
          callsign: spot.dx,
          frequency: spot.frequency,
        }),
      );
    const hasActivationPill =
      layers.activations &&
      activationPillPlacements.some(({ spot }) =>
        matchesSelectedReport({
          id: spot.id,
          callsign: spot.callsign,
          frequency: spot.frequencyKHz,
        }),
      );
    return hasLiveSpotPill || hasActivationPill;
  }, [
    activationPillPlacements,
    layers.activations,
    layers.spots,
    selectedSpot,
    selectedSpotMatchesTarget,
    showSpotCallsignLabels,
    spotPillPlacements,
  ]);

  const projectVisible = useCallback(
    (lat: number, lon: number) => {
      if (!center) return null;
      const projected = azimuthalProject(lat, lon, center.lat, center.lon);
      return Math.hypot(projected.x, projected.y) <= 1
        ? projToCanvas(projected)
        : null;
    },
    [center],
  );

  const geographicAzimuthalClusters = useMemo((): AzimuthalSpotCluster[] => {
    if (!center || !groupingEnabled || (!layers.spots && !layers.spotTraces)) {
      return [];
    }
    const cssScale = displaySize / CANVAS_SIZE;
    const size = 30;
    return clusters.flatMap((cluster) => {
      const point = projectVisible(cluster.center.lat, cluster.center.lon);
      if (!point) return [];
      const x = (CENTER + (point.x - CENTER) * zoom) * cssScale;
      const y = (CENTER + (point.y - CENTER) * zoom) * cssScale;
      if (x < 0 || x > displaySize || y < 0 || y > displaySize) return [];
      return [
        {
          key: cluster.id,
          groupId: cluster.id,
          x,
          y,
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          members: cluster.spots.map((spot) => ({
            dxLat: spot.dxLat ?? cluster.center.lat,
            dxLon: spot.dxLon ?? cluster.center.lon,
            originalSpot: spot,
          })),
        },
      ];
    });
  }, [
    center,
    clusters,
    displaySize,
    groupingEnabled,
    layers.spotTraces,
    layers.spots,
    projectVisible,
    zoom,
  ]);

  const azimuthalSpotClusters = useMemo(() => {
    if (!center || (!layers.spots && !layers.spotTraces)) {
      return geographicAzimuthalClusters;
    }
    const screenClusters = buildAzimuthalSpotClusters(
      resolvedSingles,
      projectVisible,
      {
        canvasSize: CANVAS_SIZE,
        center: CENTER,
        displaySize,
        zoom,
      },
    );
    return [...geographicAzimuthalClusters, ...screenClusters];
  }, [
    center,
    displaySize,
    geographicAzimuthalClusters,
    layers.spotTraces,
    layers.spots,
    projectVisible,
    resolvedSingles,
    zoom,
  ]);

  const unclusteredResolvedSpots = useMemo(() => {
    const singles = new Set(
      azimuthalSpotClusters
        .filter((cluster) => cluster.members.length === 1)
        .map((cluster) => cluster.members[0].originalSpot),
    );
    return resolvedSpots.filter((spot) => singles.has(spot.originalSpot));
  }, [azimuthalSpotClusters, resolvedSpots]);

  const labeledAzimuthalSpots = useMemo(
    () => unclusteredResolvedSpots.slice(0, MAX_AZIMUTHAL_CALLSIGN_LABELS),
    [unclusteredResolvedSpots],
  );

  const spotEndpointPlacements = useMemo(
    () =>
      azimuthalSpotClusters.flatMap((cluster) =>
        cluster.members.length === 1
          ? [
              {
                spot: cluster.members[0].originalSpot,
                left: cluster.left,
                top: cluster.top,
                width: cluster.width,
                height: cluster.height,
              },
            ]
          : [],
      ),
    [azimuthalSpotClusters],
  );

  const backgroundTraceSpots = useMemo(
    () =>
      limitAzimuthalBackgroundTraces(
        resolvedSpots,
        MAX_AZIMUTHAL_BACKGROUND_TRACES,
      ),
    [resolvedSpots],
  );

  // Grouped-endpoint suppression (#746) shared with the flat map's spot arcs
  // (#1247): a clustered spot's DX endpoint is drawn by the cluster glyph
  // instead, so the individual arc's endpoint marker is suppressed.
  const groupedMembers = useMemo(() => {
    if (!groupingEnabled) return EMPTY_GROUPED_MEMBERS;
    const members = new Set<LiveSpot>();
    for (const cluster of clusters) {
      for (const spot of cluster.spots) members.add(spot);
    }
    return members;
  }, [clusters, groupingEnabled]);

  const handleOpenSpotCluster = useCallback(
    (cluster: AzimuthalSpotCluster, position: ScreenAnchor) => {
      cancelSpotHoverDismiss();
      setHoveredSpotData(null);
      setSelectedMapSpotData(null);
      setOpenSpotCollection({
        position,
        title: cluster.groupId
          ? `${cluster.members.length} active spots`
          : `${cluster.members.length} nearby live spots`,
        subtitle: cluster.groupId
          ? "Geographic group on this azimuthal map"
          : "Azimuthal destinations combined to reduce map clutter",
        spots: cluster.members.map((member) => member.originalSpot),
        groupId: cluster.groupId,
      });
    },
    [cancelSpotHoverDismiss],
  );

  const startGridAnimation = useCallback(() => {
    if (glowRafRef.current) return;
    const tick = () => {
      // This state invalidates the 2D overlay only while recency or a legacy
      // arrival pulse changes. The terminal frame is painted before stopping.
      setGlowTick((value) => value + 1);
      if (glowRendererRef.current.getNextAnimationDelay(Date.now()) === 0) {
        glowRafRef.current = requestAnimationFrame(tick);
      } else {
        glowRafRef.current = 0;
      }
    };
    glowRafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    glowRendererRef.current.setActivityCells(
      gridActivity.cells,
      layers.gridActivity,
    );
    startGridAnimation();
  }, [gridActivity.cells, layers.gridActivity, startGridAnimation]);

  // Feed new spots into the grid glow renderer when spots arrive.
  useEffect(() => {
    const currentIds = new Set(resolvedSingles.map((spot) => spot.id));
    if (layers.gridActivity) {
      prevGlowSpotIdsRef.current = currentIds;
      return;
    }
    if (!layers.spots && !layers.spotTraces) return;
    const now = Date.now();
    const prevIds = prevGlowSpotIdsRef.current;
    const isInitialLoad = prevIds.size === 0 && resolvedSingles.length > 0;

    for (const spot of resolvedSingles) {
      if (prevIds.has(spot.id)) continue;

      const color = getSpotColor(spot, spotColorMode);
      const staggerOffset = isInitialLoad ? Math.random() * 1000 : 0;
      const timestamp = now - staggerOffset;

      // Prefix-centroid fallbacks are excluded — a country centroid can sit
      // in open ocean, so only real locators light 4-char grid squares.
      if (!spot.dxLocApprox) {
        try {
          const dxGrid4 = latLonToGrid(spot.dxLat, spot.dxLon, 4);
          glowRendererRef.current.addGlow({
            gridSquare: dxGrid4,
            color,
            timestamp,
          } satisfies GridGlowSpot);
        } catch {
          // Skip if coordinates out of range
        }
      }

    }

    prevGlowSpotIdsRef.current = currentIds;

    if (glowRendererRef.current.hasActiveGlows()) startGridAnimation();
  }, [
    resolvedSingles,
    layers.spots,
    layers.spotTraces,
    layers.gridActivity,
    spotColorMode,
    startGridAnimation,
  ]);

  // Clean up glow RAF on unmount
  useEffect(() => {
    return () => {
      if (glowRafRef.current) {
        cancelAnimationFrame(glowRafRef.current);
      }
    };
  }, []);

  // Calculate path difficulty for target marker coloring
  const pathDifficulty = useMemo((): DifficultyLevel | undefined => {
    if (!station || !target) {
      return undefined;
    }
    const metrics = getPathMetrics(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
    );
    return metrics.difficulty;
  }, [station, target]);

  // Get target marker color based on difficulty
  const targetMarkerColor = pathDifficulty
    ? getDifficultyColor(pathDifficulty)
    : COLORS.targetMarker;

  const optimalSignal = useOptimalMapSignal({
    station,
    target,
    displayTime,
  });

  const handleOpenOperatorPanel = useCallback(() => {
    if (!selectedMapSpotData) return;
    const selected = selectedMapSpotData.spot;
    let grid = selected.dxGrid || "";
    if (
      !grid &&
      Number.isFinite(selected.dxLat) &&
      Number.isFinite(selected.dxLon)
    ) {
      try {
        grid = latLonToGrid(selected.dxLat!, selected.dxLon!);
      } catch {
        // Callsign lookup remains useful without a derivable grid.
      }
    }
    setResearchCallsign(selected.dx);
    setResearchGrid(grid);
    setResearchPanelOpen(true);
    setSelectedMapSpotData(null);
  }, [selectedMapSpotData]);

  const handleResearchAction = useCallback(
    (action: GridResearchAction, subject: GridResearchActionSubject) => {
      const intent = resolveGridResearchActionIntent(action, subject);
      switch (intent.kind) {
        case "watch":
          setWatch(intent.criteria);
          break;
        case "pin":
          setAddPinData(intent.location);
          setAddPinDialogOpen(true);
          break;
        case "setTarget":
          setTarget(intent.target);
          setResearchPanelOpen(false);
          break;
        case "close":
          setResearchPanelOpen(false);
          break;
        case "invalid":
          // Keep the panel open so the operator can choose a valid action.
          break;
      }
    },
    [setTarget, setWatch],
  );

  const targetHitPoint = useMemo(() => {
    if (!center || !target) {
      return null;
    }
    const projected = azimuthalProject(
      target.lat,
      target.lon,
      center.lat,
      center.lon,
    );
    const base = projToCanvas(projected);
    const x = CENTER + (base.x - CENTER) * zoom;
    const y = CENTER + (base.y - CENTER) * zoom;
    return { x, y };
  }, [center, target, zoom]);

  // Listen on the shared map container so activation buttons layered over the
  // canvas do not create dead zones for wheel zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1; // Scroll down = zoom out, up = zoom in
      setZoom((prev) => Math.max(0.5, Math.min(3, prev * delta)));
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // Clear hover tooltip when target changes
  useEffect(() => {
    setHoveredTargetPos(null);
  }, [target]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!targetHitPoint) {
        if (hoveredTargetPos) {
          setHoveredTargetPos(null);
        }
        return;
      }

      const canvas = overlayCanvasRef.current;
      if (!canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      // Use the logical CANVAS_SIZE (not canvas.width/height, which are now
      // DPR-scaled backing-store pixels) so hit-testing stays in the same
      // coordinate space as the draw code.
      const scaleX = CANVAS_SIZE / rect.width;
      const scaleY = CANVAS_SIZE / rect.height;

      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      // Hit radius tracks zoom (marker grows/shrinks with zoom transform)
      const hitRadius = 18 * zoom;
      const dx = canvasX - targetHitPoint.x;
      const dy = canvasY - targetHitPoint.y;
      const hit = dx * dx + dy * dy < hitRadius * hitRadius;

      if (hit) {
        setHoveredTargetPos({ x: event.clientX, y: event.clientY });
      } else if (hoveredTargetPos) {
        setHoveredTargetPos(null);
      }
    },
    [targetHitPoint, zoom, hoveredTargetPos],
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredTargetPos(null);
  }, []);

  // Handle canvas click (on overlay canvas)
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas || !center) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      // Use the logical CANVAS_SIZE (not canvas.width/height, which are now
      // DPR-scaled backing-store pixels) so hit-testing stays in the same
      // coordinate space as the draw code.
      const scaleX = CANVAS_SIZE / rect.width;
      const scaleY = CANVAS_SIZE / rect.height;

      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      // Account for zoom transform (zoom is centered on CENTER)
      // The canvas drawing uses: translate(CENTER), scale(zoom), translate(-CENTER)
      // So we reverse this: translate(CENTER), scale(1/zoom), translate(-CENTER)
      const zoomAdjustedX = (canvasX - CENTER) / zoom + CENTER;
      const zoomAdjustedY = (canvasY - CENTER) / zoom + CENTER;

      // Convert to projection coordinates
      const proj = canvasToProj(zoomAdjustedX, zoomAdjustedY);

      // Check if click is within the map circle
      const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);
      if (dist > 1) {
        return;
      }

      // Unproject to lat/lon
      const { lat, lon } = azimuthalUnproject(
        proj.x,
        proj.y,
        center.lat,
        center.lon,
      );

      if (layers.gridActivity) {
        try {
          const grid = gridActivityGridForCoordinate(
            lat,
            lon,
            gridActivity.resolution,
          );
          const activityCell = gridActivity.cellsByGrid.get(grid);
          if (activityCell) {
            const spots = [...activityCell.reports];
            setSelectedMapSpotData(null);
            if (spots.length === 0) {
              setResearchGrid(grid);
              setResearchCallsign(null);
              setResearchPanelOpen(true);
              return;
            }
            setOpenSpotCollection({
              position: {
                x: event.clientX,
                y: event.clientY,
                width: 1,
                height: 1,
              },
              title: `${grid} live spots`,
              subtitle: "Select a station in this highlighted grid",
              spots,
            });
            return;
          }
        } catch {
          // Invalid edge coordinates fall through to ordinary targeting.
        }
      }

      onLocationClick?.(lat, lon);
    },
    [
      center,
      gridActivity,
      layers.gridActivity,
      onLocationClick,
      zoom,
    ],
  );

  // Render WebGL background
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !center) {
      return;
    }

    const backingSize = Math.round(
      displaySize * qualitySettings.renderDevicePixelRatio,
    );
    renderer.resize(backingSize, backingSize, displaySize);
    renderer.setMapStyle(mapStyle);
    renderer.render({
      centerLat: center.lat,
      centerLon: center.lon,
      zoom: zoom,
      subsolarLat: subsolar.lat,
      subsolarLon: subsolar.lon,
      showNight: layers.terminator,
      nightOpacity: nightDarkness,
    });
  }, [
    center,
    zoom,
    subsolar,
    layers.terminator,
    webglReady,
    mapStyle,
    nightDarkness,
    displaySize,
    qualitySettings.renderDevicePixelRatio,
  ]);

  // Render 2D overlay (UI elements, paths, markers)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    applyCanvasDprTransform(
      canvas,
      ctx,
      displaySize,
      qualitySettings.renderDevicePixelRatio,
    );

    // Clear overlay canvas (transparent background)
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // If no station is set, show message
    if (!center) {
      setSpotPillPlacements((current) =>
        current.length === 0 ? current : [],
      );
      setActivationPillPlacements((current) =>
        current.length === 0 ? current : [],
      );
      drawNoQTHMessage(ctx);
      return;
    }

    // Apply zoom transform (scale from center)
    ctx.save();
    ctx.translate(CENTER, CENTER);
    ctx.scale(zoom, zoom);
    ctx.translate(-CENTER, -CENTER);

    // zoomDamp is deliberately 1: the azimuthal hazard layers draw inside the
    // zoom transform above without additional damping today. The pill code's
    // Math.max(0.5, zoom) damping is a different, later decision (#1091).
    const projection = createAzimuthalProjection({
      centerLat: center.lat,
      centerLon: center.lon,
      centerX: CENTER,
      centerY: CENTER,
      radius: RADIUS,
      zoomScale: zoom,
      zoomDamp: 1,
    });

    // Draw terminator line (if terminator layer is enabled). The shared
    // layer's screenPx damping is meant to counteract the ctx.scale(zoom,
    // zoom) transform above so the terminator's width stays visually
    // constant across zoom levels -- unlike every other azimuthal layer
    // here (zoomDamp: 1), which scales with that canvas transform instead.
    // Dedicated projection instance so this one divergence doesn't change
    // `projection`'s damping for the borders passes below (#1091 PR 8).
    if (layers.terminator) {
      const terminatorProjection = createAzimuthalProjection({
        centerLat: center.lat,
        centerLon: center.lon,
        centerX: CENTER,
        centerY: CENTER,
        radius: RADIUS,
        zoomScale: zoom,
        zoomDamp: zoom,
      });
      drawTerminatorLayer(
        ctx,
        displayTime,
        terminatorProjection,
        {
          highViz: highVizSpots,
          dashed: labelOptions.terminatorDashed,
          // Zoom is applied by the ctx.scale transform above, not by
          // project(), so it stays out of the scope; the layer's sample
          // count (which does follow zoom) is already part of its key.
          cacheScope: `${center.lat}|${center.lon}`,
        },
        terminatorGeometryRef,
      );
    }

    // Draw night lights (city lights on dark side)
    if (layers.nightLights) {
      drawAzimuthalNightLights(ctx, displayTime, center.lat, center.lon);
    }

    // Draw distance rings
    drawDistanceRings(ctx);

    // Draw country borders (independent of labels toggle)
    if (labelOptions.borders) {
      const isStandard = mapStyle === "standard";
      drawCountryBordersLayer(ctx, projection, AZIMUTHAL_LAYER_PROFILE, {
        standardMode: isStandard,
        // The disc reads the theme store but has always drawn white
        // borders in the light theme; harmonising is tracked in #1173.
        lightTheme: false,
      });
    }

    // Draw state borders
    if (labelOptions.stateBorders) {
      const isStandard = mapStyle === "standard";
      drawStateBordersLayer(ctx, projection, AZIMUTHAL_LAYER_PROFILE, {
        standardMode: isStandard,
        // Same drift as the country pass above; harmonising is tracked
        // in #1173.
        lightTheme: false,
      });
    }

    // Night-boosted border pass
    if (
      layers.terminator &&
      (labelOptions.borders || labelOptions.stateBorders)
    ) {
      drawNightBoostedBordersLayer(
        ctx,
        displayTime,
        projection,
        AZIMUTHAL_LAYER_PROFILE,
        { country: labelOptions.borders, states: labelOptions.stateBorders },
      );
    }

    // Draw labels (city names)
    if (layers.labels) {
      drawAzimuthalLabels(ctx, center.lat, center.lon);
    }

    // Draw bearing labels
    drawBearingLabels(ctx);

    // Draw grid glow pulses (before spot arcs, after bearing labels)
    if (
      !pathPresentation.hideOtherPaths &&
      (layers.spots || layers.spotTraces || layers.gridActivity) &&
      (layers.gridActivity || glowRendererRef.current.hasActiveGlows())
    ) {
      const glowProject = (lat: number, lon: number) => {
        const proj = azimuthalProject(lat, lon, center.lat, center.lon);
        const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);
        const canvasPt = projToCanvas(proj);
        return { x: canvasPt.x, y: canvasPt.y, visible: dist <= 1 };
      };
      // "radial" mode projects every grid corner so persistent activity cells
      // follow the warped azimuthal footprint rather than an axis-aligned box.
      glowRendererRef.current.draw(ctx, glowProject, Date.now(), "radial");
    }

    // Full arcs for the "Spots" layer (#1247 -- new capability; previously
    // only callsign pills drew here, arcs were Spot-Traces-only). Takes
    // precedence over the Spot-Traces background cap below when both layers
    // are on, since it's a superset (uncapped, with endpoints).
    if (
      layers.spots &&
      spotLayerPolicy.pathsVisible &&
      !pathPresentation.hideOtherPaths &&
      resolvedSpots.length > 0
    ) {
      drawSpotArcs(
        ctx,
        projection,
        resolvedSpots,
        spotColorMode,
        highVizSpots,
        spotDotScale,
        true,
        {
          watchDimming: watchEnabled && matchedSpotIds.size > 0,
          watchMatchedIds: matchedSpotIds,
          ageFade: labelOptions.spotPathAgeFade,
          groupedMembers,
        },
      );
    } else if (
      layers.spotTraces &&
      !pathPresentation.hideOtherPaths &&
      backgroundTraceSpots.length > 0
    ) {
      // Background routes belong only to Spot Traces and are capped for this
      // compressed projection. Destination controls remain visible separately.
      drawSpotArcs(
        ctx,
        projection,
        [...backgroundTraceSpots],
        spotColorMode,
        highVizSpots,
        spotDotScale,
        false,
        { ageFade: labelOptions.spotPathAgeFade },
      );
    }

    // Keep a small number of canonical callsign tags in Live Spots mode so
    // hover/details parity survives without recreating the old label flood.
    if (layers.spots && !pathPresentation.hideOtherPaths && showSpotCallsignLabels) {
      const placements = drawSpotCallsignPills(
        ctx,
        labeledAzimuthalSpots,
        center.lat,
        center.lon,
        spotLabelScale,
        highVizSpots,
        zoom,
        spotDotScale,
      );
      const cssScale = displaySize / CANVAS_SIZE;
      const screenPlacements = placements.map(({ spot, bounds }) => ({
        spot,
        left: (CENTER + (bounds.x - CENTER) * zoom) * cssScale,
        top: (CENTER + (bounds.y - CENTER) * zoom) * cssScale,
        width: bounds.width * zoom * cssScale,
        height: bounds.height * zoom * cssScale,
      }));
      setSpotPillPlacements((current) =>
        sameAzimuthalSpotPillScreenPlacements(current, screenPlacements)
          ? current
          : screenPlacements,
      );
    } else {
      setSpotPillPlacements((current) =>
        current.length === 0 ? current : [],
      );
    }

    if (layers.activations && activationSpots.length > 0) {
      const placements = drawActivationPills(
        ctx,
        activationSpots,
        (lat, lon) => {
          const projected = azimuthalProject(lat, lon, center.lat, center.lon);
          return Math.hypot(projected.x, projected.y) <= 1
            ? projToCanvas(projected)
            : null;
        },
        {
          zoomScale: zoom,
          bounds: {
            x: CENTER - CENTER / zoom,
            y: CENTER - CENTER / zoom,
            width: CANVAS_SIZE / zoom,
            height: CANVAS_SIZE / zoom,
          },
        },
      );
      const cssScale = displaySize / CANVAS_SIZE;
      const screenPlacements = placements.map(({ spot, bounds }) => ({
        spot,
        left: (CENTER + (bounds.x - CENTER) * zoom) * cssScale,
        top: (CENTER + (bounds.y - CENTER) * zoom) * cssScale,
        width: bounds.width * zoom * cssScale,
        height: bounds.height * zoom * cssScale,
      }));
      setActivationPillPlacements((current) =>
        sameActivationPillScreenPlacements(current, screenPlacements)
          ? current
          : screenPlacements,
      );
    } else {
      setActivationPillPlacements((current) =>
        current.length === 0 ? current : [],
      );
    }

    if (layers.lunarSubpoint) {
      const point = getSublunarPoint(displayTime);
      const projected = azimuthalProject(
        point.lat,
        point.lon,
        center.lat,
        center.lon,
      );
      if (Math.hypot(projected.x, projected.y) <= 1) {
        drawLunarSubpointMarker(ctx, projToCanvas(projected), {
          zoomScale: zoom,
        });
      }
    }

    // Hazard layers
    if (layers.earthquakes && earthquakeData.length > 0) {
      drawEarthquakesLayer(
        ctx,
        earthquakeData,
        projection,
        AZIMUTHAL_LAYER_PROFILE,
      );
    }
    if (layers.weather && weatherAlerts.length > 0) {
      drawWeatherAlertsLayer(
        ctx,
        weatherAlerts,
        projection,
        AZIMUTHAL_LAYER_PROFILE,
      );
    }
    if (layers.lightning && lightningStrikes.length > 0) {
      drawLightningLayer(ctx, lightningStrikes, projection);
    }
    if (layers.fires && fireHotspots.length > 0) {
      drawFiresLayer(ctx, fireHotspots, projection, AZIMUTHAL_LAYER_PROFILE);
    }

    // Highlighted arc for selected DX cluster spot
    if (
      resolvedSelectedSpot &&
      !selectedSpotMatchesTarget &&
      !pathPresentation.hideOtherPaths
    ) {
      drawSelectedSpotArc(ctx, projection, resolvedSelectedSpot, spotDotScale);
    }

    // Draw target and path if set
    if (target) {
      const targetAnnotation = resolveAzimuthalTargetAnnotation(
        selectedSpotHasVisibleTag,
        target.name || target.grid,
        pathDifficulty,
      );
      drawTargetAndPath(
        ctx,
        center.lat,
        center.lon,
        target.lat,
        target.lon,
        targetAnnotation.label,
        targetMarkerColor,
        targetAnnotation.difficulty,
        pathPresentation.modes.map((mode) => ({
          mode,
          markers:
            mode === "short"
              ? pathPresentation.shortBounces
              : pathPresentation.longBounces,
          alpha:
            pathEmphasis(pathPresentation.pathMode, mode) === "secondary"
              ? 0.45
              : 1,
        })),
      );
    }

    // Draw home marker at center (always last so it's on top)
    drawHomeMarker(ctx, station?.callsign);

    // Restore transform
    ctx.restore();
  }, [
    displayTime,
    layers,
    station,
    target,
    center,
    backgroundTraceSpots,
    resolvedSpots,
    spotLayerPolicy,
    watchEnabled,
    matchedSpotIds,
    groupedMembers,
    labeledAzimuthalSpots,
    activationSpots,
    resolvedSelectedSpot,
    selectedSpotMatchesTarget,
    selectedSpotHasVisibleTag,
    targetMarkerColor,
    pathDifficulty,
    pathPresentation,
    zoom,
    spotColorMode,
    spotDotScale,
    spotLabelScale,
    showSpotCallsignLabels,
    highVizSpots,
    labelOptions,
    mapStyle,
    earthquakeData,
    weatherAlerts,
    lightningStrikes,
    fireHotspots,
    glowTick,
    displaySize,
    qualitySettings.renderDevicePixelRatio,
  ]);

  return (
    <MapSurface
      surfaceRef={containerRef}
      label="Azimuthal map"
      className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative flex items-center justify-center select-none"
    >
      {/* WebGL canvas is created and owned by AzimuthalRenderer. */}
      {/* Renderer-agnostic overlay canvas (contest overlays, etc.) — sits
          below the UI overlay canvas so it doesn't occlude the home marker
          and target label, which must stay on top. */}
      <canvas
        ref={contestOverlayCanvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="absolute pointer-events-none"
        style={{
          imageRendering: "auto",
          width: displaySize,
          height: displaySize,
        }}
      />
      {/* 2D canvas for overlays (on top of WebGL and the contest overlay) */}
      <canvas
        ref={overlayCanvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="absolute cursor-crosshair"
        aria-label="Azimuthal projection map centered on your location - click to select target, scroll to zoom"
        role="img"
        style={{
          imageRendering: "auto",
          width: displaySize,
          height: displaySize,
        }}
      />
      {center && layers.activations && !pathPresentation.hideOtherPaths && (
        <div
          className="pointer-events-none absolute"
          style={{ width: displaySize, height: displaySize, zIndex: 4 }}
        >
          <ActivationPillButtons
            placements={activationPillPlacements}
            onSpotHover={handleSpotHover}
            onSpotHoverEnd={scheduleSpotHoverDismiss}
            onSpotSelect={handleMapSpotSelect}
          />
        </div>
      )}
      {center &&
        (layers.spots || layers.spotTraces) &&
        !pathPresentation.hideOtherPaths && (
        <div
          className="pointer-events-none absolute"
          style={{ width: displaySize, height: displaySize, zIndex: 1 }}
        >
          <AzimuthalSpotEndpointButtons
            placements={spotEndpointPlacements}
            onSpotHover={handleSpotHover}
            onSpotHoverEnd={scheduleSpotHoverDismiss}
            onSpotSelect={handleMapSpotSelect}
          />
        </div>
      )}
      {center &&
        (layers.spots || layers.spotTraces) &&
        !pathPresentation.hideOtherPaths && (
        <div
          className="pointer-events-none absolute"
          style={{ width: displaySize, height: displaySize, zIndex: 2 }}
        >
          <AzimuthalSpotClusterButtons
            clusters={azimuthalSpotClusters}
            onOpen={handleOpenSpotCluster}
          />
        </div>
      )}
      {center &&
        layers.spots &&
        showSpotCallsignLabels &&
        !pathPresentation.hideOtherPaths && (
        <div
          className="pointer-events-none absolute"
          style={{ width: displaySize, height: displaySize, zIndex: 3 }}
        >
          <AzimuthalSpotPillButtons
            placements={spotPillPlacements}
            onSpotHover={handleSpotHover}
            onSpotHoverEnd={scheduleSpotHoverDismiss}
            onSpotSelect={handleMapSpotSelect}
          />
        </div>
      )}

      <SpotHoverPreview
        visible={!!hoveredSpotData && !selectedMapSpotData}
        position={hoveredSpotData?.screenPos || { x: 0, y: 0 }}
        displayTime={displayTime}
        spot={hoveredSpotData?.spot ?? null}
        onInteractStart={cancelSpotHoverDismiss}
        onInteractEnd={() => scheduleSpotHoverDismiss()}
        onActivate={() => {
          if (hoveredSpotData) {
            handleMapSpotSelect(
              hoveredSpotData.spot,
              hoveredSpotData.screenPos,
            );
          }
        }}
      />

      {selectedMapSpotData && (
        <SelectedSpotCard
          spot={selectedMapSpotData.spot}
          position={selectedMapSpotData.screenPos}
          difficulty={pathDifficulty}
          optimalSignal={optimalSignal}
          signalUnavailableReason={
            station ? undefined : "Set your QTH to model this path"
          }
          onOperator={handleOpenOperatorPanel}
          onViewPath={() => setSelectedMapSpotData(null)}
          onClose={() => setSelectedMapSpotData(null)}
        />
      )}

      <SpotCollectionPopover
        visible={openSpotCollection !== null}
        position={openSpotCollection?.position ?? { x: 0, y: 0 }}
        title={openSpotCollection?.title ?? "Live spots"}
        subtitle={openSpotCollection?.subtitle}
        spots={openSpotCollection?.spots ?? []}
        boundsHost={containerRef.current}
        isWallCanvas={isWallCanvas}
        onClose={() => setOpenSpotCollection(null)}
        onSpotSelect={(spot) => {
          const position = openSpotCollection?.position ?? { x: 0, y: 0 };
          setOpenSpotCollection(null);
          handleMapSpotSelect(spot, position);
        }}
        onMapTheseSpots={
          openSpotCollection?.groupId
            ? () => {
                expandGroup(openSpotCollection.groupId!);
                setOpenSpotCollection(null);
              }
            : undefined
        }
      />

      <TargetHoverTooltip
        visible={!!hoveredTargetPos}
        position={hoveredTargetPos || { x: 0, y: 0 }}
        label={target?.name || target?.grid || "Target"}
        grid={target?.grid}
        difficulty={pathDifficulty}
        optimalSignal={optimalSignal}
        signalUnavailableReason={
          station ? undefined : "Set your QTH to see optimal-band signal"
        }
      />

      {/* Loading indicator */}
      {!webglReady && center && mapStyle === "satellite" && (
        <div className="absolute inset-0 flex items-center justify-center bg-deep-space/80">
          <div className="text-su-muted text-sm">Loading map...</div>
        </div>
      )}
      <GridResearchPanel
        visible={researchPanelOpen}
        grid={researchGrid}
        initialCallsign={researchCallsign}
        onAction={handleResearchAction}
        onClose={() => {
          setResearchPanelOpen(false);
          setResearchCallsign(null);
        }}
      />

      <AddPinDialog
        visible={addPinDialogOpen}
        mode="add"
        location={addPinData || undefined}
        onClose={() => {
          setAddPinDialogOpen(false);
          setAddPinData(null);
        }}
        onSave={() => {
          setAddPinDialogOpen(false);
          setAddPinData(null);
        }}
      />

      {/* Bottom-left corner column. This view owns the corner: host rows
          arrive as `cornerSlot`, the legend reads under the map's overlay
          portal, and the shared size control sits above it, so none of the
          three can cover another (#930). */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-col items-start gap-1">
        {cornerSlot}
        <div
          className="relative text-xs text-su-muted bg-deep-space/80 px-2 py-1 rounded"
          style={{ zIndex: MAP_PAGE_CHROME_Z.legend }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-0.5 inline-block"
              style={{ backgroundColor: COLORS.path }}
            />
            <span>Great circle path (straight line = beam heading)</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-su-muted">
            <span>Scroll to zoom</span>
            {zoom !== 1 && (
              <span className="text-signal-green">({zoom.toFixed(1)}x)</span>
            )}
          </div>
        </div>
        <div
          className="relative"
          style={{ zIndex: MAP_PAGE_CHROME_Z.interactiveChrome }}
        >
          <MapSizeSliders />
        </div>
      </div>
    </MapSurface>
  );
}

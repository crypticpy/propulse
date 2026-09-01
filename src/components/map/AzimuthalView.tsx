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

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore, useUIInteractionPrefs } from "@/stores/userStore";
import { useDXStore } from "@/stores/dxStore";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { getPathMetrics, getPathPoints } from "@/lib/utils/path";
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
import { AzimuthalRenderer } from "@/lib/webgl/AzimuthalRenderer";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import { MapSizeSliders } from "./MapSizeSliders";
import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { US_STATES } from "@/lib/data/usStates.generated";
import type { EarthquakeEvent } from "@/lib/api/earthquakes";
import type { WeatherAlert } from "@/lib/api/weather";
import type { LightningStrike } from "@/lib/api/lightning";
import {
  LIGHTNING_COLOR_FLAT,
  LIGHTNING_COLOR_STRONG,
  LIGHTNING_STRONG_KA,
} from "@/lib/map/lightningColors";
import type { FireHotspot } from "@/lib/api/fires";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import { useMapHazardData } from "./hooks/useMapHazardData";
import { useOptimalMapSignal } from "./hooks/useOptimalMapSignal";
import { useResolvedMapSpots } from "./hooks/useResolvedMapSpots";
import {
  drawActivationPills,
  sameActivationPillScreenPlacements,
  type ActivationPillScreenPlacement,
} from "@/lib/map/activationMarkers";
import { ActivationPillButtons } from "./layers/ActivationPillButtons";
import { drawLunarSubpointMarker } from "@/lib/map/lunarSubpointMarker";
import { getSublunarPoint } from "@/lib/utils/moon";

interface AzimuthalViewProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
  /** Hide the local size panel when the host docks it with other controls */
  hideSizeSliders?: boolean;
}

// Canvas dimensions (square for circular projection)
// These are now used as defaults/internal references
const CANVAS_SIZE = 600;
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
  terminator: "#ff6b35",
  homeMarker: "#4488FF", // Blue for home station
  targetMarker: "#ff6b35", // Default fallback - usually overridden by difficulty
  path: "#ff6b35",
};

// Max distance in km (half Earth circumference)
const MAX_DISTANCE_KM = 20015;

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
): void {
  const dpr = window.devicePixelRatio || 1;
  const backingSize = Math.round(displaySize * dpr);
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
 * Draw terminator line
 */
function drawTerminator(
  ctx: CanvasRenderingContext2D,
  date: Date,
  centerLat: number,
  centerLon: number,
) {
  const subsolar = getSubsolarPoint(date);

  // Generate terminator points (circle at 90 degrees from subsolar)
  const terminatorPoints: Array<{ x: number; y: number }> = [];
  const numPoints = 180;

  const phi0 = subsolar.lat * (Math.PI / 180);
  const lambda0 = subsolar.lon * (Math.PI / 180);
  const angularDist = Math.PI / 2; // 90 degrees

  for (let i = 0; i < numPoints; i++) {
    const bearing = (i / numPoints) * 2 * Math.PI;

    // Calculate point at 90 degrees from subsolar
    const sinPhi0 = Math.sin(phi0);
    const cosPhi0 = Math.cos(phi0);
    const sinDist = Math.sin(angularDist);
    const cosDist = Math.cos(angularDist);

    const phi = Math.asin(
      sinPhi0 * cosDist + cosPhi0 * sinDist * Math.cos(bearing),
    );
    const lambda =
      lambda0 +
      Math.atan2(
        Math.sin(bearing) * sinDist * cosPhi0,
        cosDist - sinPhi0 * Math.sin(phi),
      );

    const lat = phi * (180 / Math.PI);
    let lon = lambda * (180 / Math.PI);
    while (lon > 180) {
      lon -= 360;
    }
    while (lon < -180) {
      lon += 360;
    }

    const projected = azimuthalProject(lat, lon, centerLat, centerLon);
    const canvas = projToCanvas(projected);
    terminatorPoints.push(canvas);
  }

  // Draw the terminator
  ctx.strokeStyle = COLORS.terminator;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLORS.terminator;
  ctx.shadowBlur = 6;

  ctx.beginPath();
  for (let i = 0; i < terminatorPoints.length; i++) {
    const point = terminatorPoints[i];
    if (i === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      // Check for wrap-around
      const prev = terminatorPoints[i - 1];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      if (dx * dx + dy * dy > RADIUS * RADIUS) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
  }
  ctx.closePath();
  ctx.stroke();

  ctx.shadowBlur = 0;
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
) {
  const projected = azimuthalProject(
    targetLat,
    targetLon,
    centerLat,
    centerLon,
  );
  const { x, y } = projToCanvas(projected);

  // Draw the path (straight line from center - this is the key feature!)
  // Path color matches the marker (difficulty-based)
  ctx.strokeStyle = markerColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.setLineDash([10, 6]);

  ctx.beginPath();
  ctx.moveTo(CENTER, CENTER);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.setLineDash([]);

  // Draw target marker
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
 * Build a Path2D tracing the great-circle path between two points under the
 * azimuthal projection. Only great circles that pass through the projection
 * center render as straight lines here; spotter/DX pairs almost never do, so
 * the path is approximated by sampling and projecting points along the true
 * great circle. Segments where a sample falls outside the visible disk
 * (dist > 1) are skipped, matching the existing endpoint-clip behavior.
 */
function buildGreatCirclePath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  centerLat: number,
  centerLon: number,
  numPoints = 32,
): Path2D {
  const path = new Path2D();
  const points = getPathPoints(lat1, lon1, lat2, lon2, numPoints);
  let inPath = false;

  for (const pt of points) {
    const proj = azimuthalProject(pt.lat, pt.lon, centerLat, centerLon);
    const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);

    if (dist > 1) {
      inPath = false;
      continue;
    }

    const canvasPt = projToCanvas(proj);
    if (!inPath) {
      path.moveTo(canvasPt.x, canvasPt.y);
      inPath = true;
    } else {
      path.lineTo(canvasPt.x, canvasPt.y);
    }
  }

  return path;
}

/**
 * Draw live spot arcs on the azimuthal projection.
 * Paths are sampled great circles (see buildGreatCirclePath) — they are only
 * straight lines when the path happens to pass through the projection center.
 */
function drawSpotArcs(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  centerLat: number,
  centerLon: number,
  colorMode: SpotColorMode = "mode",
  spotDotScale = 1.0,
) {
  for (const spot of spots) {
    const color = getSpotColor(spot, colorMode);
    const opacity = getSpotAgeOpacity(spot.time);

    // Project both endpoints
    const spotterProj = azimuthalProject(
      spot.spotterLat,
      spot.spotterLon,
      centerLat,
      centerLon,
    );
    const dxProj = azimuthalProject(
      spot.dxLat,
      spot.dxLon,
      centerLat,
      centerLon,
    );

    // Check if both points are within the map circle
    const spotterDist = Math.sqrt(
      spotterProj.x * spotterProj.x + spotterProj.y * spotterProj.y,
    );
    const dxDist = Math.sqrt(dxProj.x * dxProj.x + dxProj.y * dxProj.y);

    // Skip if both points are outside the circle
    if (spotterDist > 1 && dxDist > 1) {
      continue;
    }

    const spotterCanvas = projToCanvas(spotterProj);
    const dxCanvas = projToCanvas(dxProj);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.round(1.5 * spotDotScale);
    ctx.shadowColor = color;
    ctx.shadowBlur = 3;

    // Sample and project the true great-circle path (see buildGreatCirclePath)
    const path = buildGreatCirclePath(
      spot.spotterLat,
      spot.spotterLon,
      spot.dxLat,
      spot.dxLon,
      centerLat,
      centerLon,
    );
    ctx.stroke(path);

    // Draw endpoint dots
    ctx.fillStyle = color;

    // Spotter location (smaller, only if inside circle)
    if (spotterDist <= 1) {
      ctx.beginPath();
      ctx.arc(
        spotterCanvas.x,
        spotterCanvas.y,
        Math.round(3 * spotDotScale),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // DX location (larger, only if inside circle)
    if (dxDist <= 1) {
      ctx.beginPath();
      ctx.arc(
        dxCanvas.x,
        dxCanvas.y,
        Math.round(4 * spotDotScale),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.restore();
  }
}

interface AzimuthalSpotPillBox {
  x: number;
  y: number;
  width: number;
  height: number;
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
) {
  const zoomDamp = Math.max(0.5, zoom);
  const viewport = getCenteredZoomViewport(CANVAS_SIZE, zoomDamp, 2);
  const placed: AzimuthalSpotPillBox[] = [];
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
}

/**
 * Draw a highlighted arc for the selected DX cluster spot.
 * Path is a sampled great circle (see buildGreatCirclePath) — only straight
 * when it happens to pass through the projection center.
 */
function drawSelectedSpotArc(
  ctx: CanvasRenderingContext2D,
  spot: ResolvedSpot,
  centerLat: number,
  centerLon: number,
) {
  const spotterProj = azimuthalProject(
    spot.spotterLat,
    spot.spotterLon,
    centerLat,
    centerLon,
  );
  const dxProj = azimuthalProject(spot.dxLat, spot.dxLon, centerLat, centerLon);

  // Check if at least one endpoint is within view
  const spotterDist = Math.sqrt(
    spotterProj.x * spotterProj.x + spotterProj.y * spotterProj.y,
  );
  const dxDist = Math.sqrt(dxProj.x * dxProj.x + dxProj.y * dxProj.y);
  if (spotterDist > 1.1 && dxDist > 1.1) return;

  const sx = CENTER + spotterProj.x * RADIUS;
  const sy = CENTER + spotterProj.y * RADIUS;
  const ex = CENTER + dxProj.x * RADIUS;
  const ey = CENTER + dxProj.y * RADIUS;

  const highlightColor = "rgba(255, 107, 53, 1)";
  const glowColor = "rgba(255, 107, 53, 0.3)";

  ctx.save();

  // Sample and project the true great-circle path (see buildGreatCirclePath)
  const path = buildGreatCirclePath(
    spot.spotterLat,
    spot.spotterLon,
    spot.dxLat,
    spot.dxLon,
    centerLat,
    centerLon,
  );

  // Draw glow line
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 6;
  ctx.shadowColor = "rgba(255, 107, 53, 0.5)";
  ctx.shadowBlur = 12;
  ctx.stroke(path);

  // Draw main line
  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(255, 107, 53, 0.4)";
  ctx.shadowBlur = 8;
  ctx.stroke(path);

  // Draw spotter endpoint (ring)
  if (spotterDist <= 1) {
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 6;
    ctx.stroke();
  }

  // Draw DX endpoint (filled with white ring)
  if (dxDist <= 1) {
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fillStyle = highlightColor;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Draw DX callsign label
    if (spot.callsign) {
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.fillStyle = highlightColor;
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 4;
      ctx.textAlign = "center";
      ctx.fillText(spot.callsign, ex, ey - 10);
    }
  }

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

/**
 * Draw country borders on azimuthal projection
 */
function drawAzimuthalBorders(
  ctx: CanvasRenderingContext2D,
  centerLat: number,
  centerLon: number,
  opacity: number,
  lineWidth: number,
) {
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.lineWidth = lineWidth;

  for (const country of WORLD_COUNTRIES) {
    for (const ring of country.borders) {
      ctx.beginPath();
      let inPath = false;

      for (let i = 0; i < ring.length; i++) {
        const [lat, lon] = ring[i];
        const projected = azimuthalProject(lat, lon, centerLat, centerLon);
        const dist = Math.sqrt(
          projected.x * projected.x + projected.y * projected.y,
        );

        if (dist > 0.99) {
          // Outside visible circle — break the path
          inPath = false;
          continue;
        }

        const canvas = projToCanvas(projected);

        if (!inPath) {
          ctx.moveTo(canvas.x, canvas.y);
          inPath = true;
        } else {
          // Check for large jumps (anti-meridian or edge wrapping)
          const prev = ring[i - 1];
          if (prev) {
            const prevProj = azimuthalProject(
              prev[0],
              prev[1],
              centerLat,
              centerLon,
            );
            const prevCanvas = projToCanvas(prevProj);
            const dx = canvas.x - prevCanvas.x;
            const dy = canvas.y - prevCanvas.y;
            if (dx * dx + dy * dy > RADIUS * RADIUS * 0.25) {
              // Big jump — start new sub-path
              ctx.moveTo(canvas.x, canvas.y);
              continue;
            }
          }
          ctx.lineTo(canvas.x, canvas.y);
        }
      }
    }
  }
  ctx.stroke();
}

/**
 * Draw US state borders on azimuthal projection
 */
function drawAzimuthalStateBorders(
  ctx: CanvasRenderingContext2D,
  centerLat: number,
  centerLon: number,
  opacity: number,
  lineWidth: number,
) {
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.lineWidth = lineWidth;

  for (const state of US_STATES) {
    for (const ring of state.borders) {
      ctx.beginPath();
      let inPath = false;

      for (let i = 0; i < ring.length; i++) {
        const [lat, lon] = ring[i];
        const projected = azimuthalProject(lat, lon, centerLat, centerLon);
        const dist = Math.sqrt(
          projected.x * projected.x + projected.y * projected.y,
        );

        if (dist > 0.99) {
          inPath = false;
          continue;
        }

        const canvas = projToCanvas(projected);

        if (!inPath) {
          ctx.moveTo(canvas.x, canvas.y);
          inPath = true;
        } else {
          const prev = ring[i - 1];
          if (prev) {
            const prevProj = azimuthalProject(
              prev[0],
              prev[1],
              centerLat,
              centerLon,
            );
            const prevCanvas = projToCanvas(prevProj);
            const dx = canvas.x - prevCanvas.x;
            const dy = canvas.y - prevCanvas.y;
            if (dx * dx + dy * dy > RADIUS * RADIUS * 0.25) {
              ctx.moveTo(canvas.x, canvas.y);
              continue;
            }
          }
          ctx.lineTo(canvas.x, canvas.y);
        }
      }
    }
  }
  ctx.stroke();
}

/**
 * Draw borders with boosted opacity on the night side (clipped)
 */
function drawAzimuthalNightBoostedBorders(
  ctx: CanvasRenderingContext2D,
  date: Date,
  centerLat: number,
  centerLon: number,
  drawCountry: boolean,
  drawStates: boolean,
) {
  const subsolar = getSubsolarPoint(date);

  // Build a clip path for the night side
  // The terminator is a circle on the globe where sun angle = 90deg
  // Project terminator points into azimuthal coordinates
  ctx.save();
  ctx.beginPath();

  const subsolarLatRad = subsolar.lat * (Math.PI / 180);
  const subsolarLonRad = subsolar.lon * (Math.PI / 180);
  const tanSubsolarLat = Math.tan(subsolarLatRad);
  const isNearEquinox = Math.abs(tanSubsolarLat) < 0.001;

  const terminatorPoints: { x: number; y: number }[] = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    const lonRad = lon * (Math.PI / 180);
    const deltaLon = lonRad - subsolarLonRad;
    let lat: number;
    if (isNearEquinox) {
      lat = 0;
    } else {
      lat = Math.atan(-Math.cos(deltaLon) / tanSubsolarLat) * (180 / Math.PI);
    }
    const projected = azimuthalProject(lat, lon, centerLat, centerLon);
    terminatorPoints.push(projToCanvas(projected));
  }

  // Draw terminator as clip path boundary
  if (terminatorPoints.length > 0) {
    ctx.moveTo(terminatorPoints[0].x, terminatorPoints[0].y);
    for (let i = 1; i < terminatorPoints.length; i++) {
      ctx.lineTo(terminatorPoints[i].x, terminatorPoints[i].y);
    }
  }

  // Need to close the path around the night side
  // Determine which side of the terminator is night:
  // The anti-subsolar point is the center of night
  const antiSubsolarLat = -subsolar.lat;
  const antiSubsolarLon =
    subsolar.lon > 0 ? subsolar.lon - 180 : subsolar.lon + 180;
  const antiProj = azimuthalProject(
    antiSubsolarLat,
    antiSubsolarLon,
    centerLat,
    centerLon,
  );
  const antiCanvas = projToCanvas(antiProj);

  // Close the clip path by going around the outer circle on the night side
  // First, find the angle of the anti-subsolar point relative to center
  const antiAngle = Math.atan2(antiCanvas.y - CENTER, antiCanvas.x - CENTER);

  // Sweep an arc around the outside of the projection circle on the night side
  // This is approximate but effective for clipping
  const lastTerminator = terminatorPoints[terminatorPoints.length - 1];
  const firstTerminator = terminatorPoints[0];
  const endAngle = Math.atan2(
    lastTerminator.y - CENTER,
    lastTerminator.x - CENTER,
  );
  const startAngle = Math.atan2(
    firstTerminator.y - CENTER,
    firstTerminator.x - CENTER,
  );

  // Draw arc on the night side (the side containing the anti-subsolar point)
  // Use a large radius to go outside the visible area
  const bigR = RADIUS * 1.5;
  const steps = 36;
  // Determine sweep direction: go from endAngle to startAngle through the anti-subsolar side
  let sweepAngle = startAngle - endAngle;
  // Normalize to determine the shorter/longer arc
  if (Math.cos(antiAngle - (endAngle + sweepAngle / 2)) < 0) {
    // anti-subsolar is on the other side, sweep the other way
    if (sweepAngle > 0) sweepAngle -= 2 * Math.PI;
    else sweepAngle += 2 * Math.PI;
  }
  for (let i = 0; i <= steps; i++) {
    const a = endAngle + (sweepAngle * i) / steps;
    ctx.lineTo(CENTER + bigR * Math.cos(a), CENTER + bigR * Math.sin(a));
  }

  ctx.closePath();
  ctx.clip();

  // Now draw borders at boosted opacity within the clip
  if (drawCountry) {
    drawAzimuthalBorders(ctx, centerLat, centerLon, 0.55, 1.0);
  }
  if (drawStates) {
    drawAzimuthalStateBorders(ctx, centerLat, centerLon, 0.4, 0.7);
  }

  ctx.restore();
}

/**
 * Draw earthquake markers on azimuthal projection
 */
function drawAzEarthquakes(
  ctx: CanvasRenderingContext2D,
  earthquakes: EarthquakeEvent[],
  centerLat: number,
  centerLon: number,
) {
  ctx.save();
  for (const eq of earthquakes) {
    const point = azimuthalProject(eq.lat, eq.lon, centerLat, centerLon);
    if (!point.visible) continue;

    const sx = CENTER + point.x * RADIUS;
    const sy = CENTER + point.y * RADIUS;

    // Size based on magnitude
    const radius = Math.max(3, Math.min(15, (eq.magnitude - 1) * 2.5));

    // Color by magnitude
    let color: string;
    if (eq.magnitude >= 7) color = "#ff2020";
    else if (eq.magnitude >= 5) color = "#ff8800";
    else if (eq.magnitude >= 4) color = "#ffcc00";
    else color = "#88cc44";

    // Outer glow
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner circle
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Outline
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label for M5+
    if (eq.magnitude >= 5) {
      ctx.globalAlpha = 1;
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeText(`M${eq.magnitude.toFixed(1)}`, sx, sy - radius - 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`M${eq.magnitude.toFixed(1)}`, sx, sy - radius - 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw weather alert markers on azimuthal projection
 */
function drawAzWeatherAlerts(
  ctx: CanvasRenderingContext2D,
  alerts: WeatherAlert[],
  centerLat: number,
  centerLon: number,
) {
  ctx.save();
  for (const alert of alerts) {
    const point = azimuthalProject(alert.lat, alert.lon, centerLat, centerLon);
    if (!point.visible) continue;

    const sx = CENTER + point.x * RADIUS;
    const sy = CENTER + point.y * RADIUS;

    let color: string;
    switch (alert.severity) {
      case "Extreme":
        color = "#ff0040";
        break;
      case "Severe":
        color = "#ff6600";
        break;
      case "Moderate":
        color = "#ffaa00";
        break;
      default:
        color = "#ffdd44";
        break;
    }

    const size = 8;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx, sy - size);
    ctx.lineTo(sx + size, sy + size * 0.6);
    ctx.lineTo(sx - size, sy + size * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = "#000000";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", sx, sy);

    // Event type label below triangle
    const label =
      alert.event.length > 16
        ? alert.event.slice(0, 16) + "\u2026"
        : alert.event;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 2;
    ctx.fillText(label, sx, sy + size * 0.6 + 2);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw lightning strike markers on azimuthal projection
 * Strike size and colour vary by peak current (currentKA)
 */
function drawAzLightning(
  ctx: CanvasRenderingContext2D,
  strikes: LightningStrike[],
  centerLat: number,
  centerLon: number,
) {
  ctx.save();
  const now = Date.now();
  for (const strike of strikes) {
    const point = azimuthalProject(
      strike.lat,
      strike.lon,
      centerLat,
      centerLon,
    );
    if (!point.visible) continue;

    const sx = CENTER + point.x * RADIUS;
    const sy = CENTER + point.y * RADIUS;

    const age = now - strike.time;
    const alpha = Math.max(0.1, 1 - age / (10 * 60 * 1000));

    // Intensity based on peak current (200 kA max, 0.3 floor)
    const intensity = Math.max(0.3, Math.min(1.0, strike.currentKA / 200));

    // Outer glow — scaled by intensity
    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    ctx.arc(sx, sy, 6 * intensity, 0, Math.PI * 2);
    ctx.fillStyle = LIGHTNING_COLOR_FLAT;
    ctx.fill();

    // Inner core — scaled by intensity, brighter white for strong strikes
    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath();
    ctx.arc(sx, sy, 3 * intensity, 0, Math.PI * 2);
    ctx.fillStyle =
      strike.currentKA > LIGHTNING_STRONG_KA
        ? LIGHTNING_COLOR_STRONG
        : LIGHTNING_COLOR_FLAT;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw fire hotspot markers on azimuthal projection
 */
function drawAzFires(
  ctx: CanvasRenderingContext2D,
  hotspots: FireHotspot[],
  centerLat: number,
  centerLon: number,
) {
  ctx.save();
  for (const hp of hotspots) {
    if (hp.confidence === "low") continue;

    const point = azimuthalProject(hp.lat, hp.lon, centerLat, centerLon);
    if (!point.visible) continue;

    const sx = CENTER + point.x * RADIUS;
    const sy = CENTER + point.y * RADIUS;

    const radius = Math.max(1.5, Math.min(5, hp.frp / 100));

    // Outer glow
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ff6600";
    ctx.fill();

    // Inner core
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2200";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function AzimuthalView({
  displayTime,
  onLocationClick,
  hideSizeSliders = false,
}: AzimuthalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const contestOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AzimuthalRenderer | null>(null);
  const glowRendererRef = useRef<GridGlowRenderer>(new GridGlowRenderer());
  const prevGlowSpotIdsRef = useRef<Set<string>>(new Set());
  const [glowTick, setGlowTick] = useState(0);
  const [activationPillPlacements, setActivationPillPlacements] = useState<
    ActivationPillScreenPlacement[]
  >([]);
  const glowRafRef = useRef<number>(0);
  const layers = useMapStore((s) => s.layers);

  // Grid Activity layer: glows leave a persistent cell-edge outline (~90s)
  useEffect(() => {
    glowRendererRef.current.persistEdges = layers.gridActivity;
  }, [layers.gridActivity]);
  const target = useMapStore((s) => s.target);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const nightDarkness = useMapStore((s) => s.nightDarkness);
  const displayDensity = useMapStore((s) => s.displayDensity);
  const spotFilters = useMapStore((s) => s.spotFilters);
  const spotSourceFilters = useDXStore(
    (s) => s.filters.sources as SpotSource[] | undefined,
  );
  const labelOptions = useMapStore((s) => s.labelOptions);
  const overlayLayers = useMapStore((s) => s.overlayLayers);
  const { station } = useUserStore();
  const selectedSpot = useDXStore((s) => s.selectedSpot);
  const uiPrefs = useUIInteractionPrefs();
  const spotColorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";
  const spotDotScale = uiPrefs.spotDotScale ?? 1.0;
  const spotLabelScale = uiPrefs.labelScale ?? 1.0;
  const showSpotCallsignLabels = uiPrefs.showSpotCallsignLabels ?? true;
  const highVizSpots = uiPrefs.visualStyle === "high-viz";

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

  // Initialize WebGL renderer
  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas) {
      return;
    }

    const renderer = new AzimuthalRenderer({
      highRes: true,
      enableNight: true,
      onTextureLoad: () => setWebglReady(true),
      onError: (error) => console.warn("WebGL error:", error.message),
    });

    renderer.initialize(canvas).then((success) => {
      if (success) {
        rendererRef.current = renderer;
      }
    });

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

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

    applyCanvasDprTransform(canvas, ctx, displaySize);

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
  }, [center, overlayLayers, zoom, cellRasterCanvas, displaySize]);

  // Get subsolar point for day/night blending
  const subsolar = useMemo(() => getSubsolarPoint(displayTime), [displayTime]);

  // Resolve the common live feed once, capped for this canvas renderer. This
  // preserves the shared display-density contract without a local pipeline.
  const { resolvedSpots, activationSpots } = useResolvedMapSpots({
    grid: station?.grid,
    enabled: layers.spots || layers.spotTraces || layers.gridActivity,
    activationsEnabled: layers.activations,
    maxSpots: displayDensity,
    sources: spotSourceFilters,
    spotFilters,
  });

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

  // Feed new spots into the grid glow renderer when spots arrive.
  useEffect(() => {
    if (!layers.spots && !layers.spotTraces && !layers.gridActivity) return;
    const now = Date.now();
    const currentIds = new Set<string>();
    const prevIds = prevGlowSpotIdsRef.current;
    const isInitialLoad = prevIds.size === 0 && resolvedSpots.length > 0;

    for (const spot of resolvedSpots) {
      currentIds.add(spot.id);
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

      if (!spot.spotterLocApprox) {
        try {
          const spGrid4 = latLonToGrid(spot.spotterLat, spot.spotterLon, 4);
          glowRendererRef.current.addGlow({
            gridSquare: spGrid4,
            color,
            timestamp,
          } satisfies GridGlowSpot);
        } catch {
          // Skip if coordinates out of range
        }
      }
    }

    prevGlowSpotIdsRef.current = currentIds;

    if (glowRendererRef.current.hasActiveGlows() && !glowRafRef.current) {
      const tick = () => {
        if (glowRendererRef.current.hasActiveGlows()) {
          setGlowTick((t) => t + 1);
          glowRafRef.current = requestAnimationFrame(tick);
        } else {
          glowRafRef.current = 0;
        }
      };
      glowRafRef.current = requestAnimationFrame(tick);
    }
  }, [
    resolvedSpots,
    layers.spots,
    layers.spotTraces,
    layers.gridActivity,
    spotColorMode,
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
      if (!canvas || !onLocationClick || !center) {
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

      onLocationClick(lat, lon);
    },
    [onLocationClick, center, zoom],
  );

  // Render WebGL background
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !center) {
      return;
    }

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

    applyCanvasDprTransform(canvas, ctx, displaySize);

    // Clear overlay canvas (transparent background)
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // If no station is set, show message
    if (!center) {
      drawNoQTHMessage(ctx);
      return;
    }

    // Apply zoom transform (scale from center)
    ctx.save();
    ctx.translate(CENTER, CENTER);
    ctx.scale(zoom, zoom);
    ctx.translate(-CENTER, -CENTER);

    // Draw terminator line (if terminator layer is enabled)
    if (layers.terminator) {
      drawTerminator(ctx, displayTime, center.lat, center.lon);
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
      drawAzimuthalBorders(
        ctx,
        center.lat,
        center.lon,
        isStandard ? 0.65 : 0.3,
        isStandard ? 1.0 : 0.8,
      );
    }

    // Draw state borders
    if (labelOptions.stateBorders) {
      const isStandard = mapStyle === "standard";
      drawAzimuthalStateBorders(
        ctx,
        center.lat,
        center.lon,
        isStandard ? 0.45 : 0.2,
        isStandard ? 0.7 : 0.5,
      );
    }

    // Night-boosted border pass
    if (
      layers.terminator &&
      (labelOptions.borders || labelOptions.stateBorders)
    ) {
      drawAzimuthalNightBoostedBorders(
        ctx,
        displayTime,
        center.lat,
        center.lon,
        labelOptions.borders,
        labelOptions.stateBorders,
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
      (layers.spots || layers.spotTraces || layers.gridActivity) &&
      glowRendererRef.current.hasActiveGlows()
    ) {
      const glowProject = (lat: number, lon: number) => {
        const proj = azimuthalProject(lat, lon, center.lat, center.lon);
        const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);
        const canvasPt = projToCanvas(proj);
        return { x: canvasPt.x, y: canvasPt.y, visible: dist <= 1 };
      };
      // "radial" mode: azimuthal grid cells are warped quads, not axis-
      // aligned rects, so the renderer draws a projected-center circle
      // instead of a rect built from two corners.
      glowRendererRef.current.draw(ctx, glowProject, Date.now(), "radial");
    }

    // Draw live spot arcs (sampled great circles). Traces-alone (spotTraces
    // without spots) still shows the arcs — traces isn't a separate layer.
    if ((layers.spots || layers.spotTraces) && resolvedSpots.length > 0) {
      drawSpotArcs(
        ctx,
        resolvedSpots,
        center.lat,
        center.lon,
        spotColorMode,
        spotDotScale,
      );
      if (layers.spots && showSpotCallsignLabels) {
        drawSpotCallsignPills(
          ctx,
          resolvedSpots,
          center.lat,
          center.lon,
          spotLabelScale,
          highVizSpots,
          zoom,
          spotDotScale,
        );
      }
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
      drawAzEarthquakes(ctx, earthquakeData, center.lat, center.lon);
    }
    if (layers.weather && weatherAlerts.length > 0) {
      drawAzWeatherAlerts(ctx, weatherAlerts, center.lat, center.lon);
    }
    if (layers.lightning && lightningStrikes.length > 0) {
      drawAzLightning(ctx, lightningStrikes, center.lat, center.lon);
    }
    if (layers.fires && fireHotspots.length > 0) {
      drawAzFires(ctx, fireHotspots, center.lat, center.lon);
    }

    // Highlighted arc for selected DX cluster spot
    if (resolvedSelectedSpot) {
      drawSelectedSpotArc(ctx, resolvedSelectedSpot, center.lat, center.lon);
    }

    // Draw target and path if set
    if (target) {
      drawTargetAndPath(
        ctx,
        center.lat,
        center.lon,
        target.lat,
        target.lon,
        target.name || target.grid,
        targetMarkerColor,
        pathDifficulty,
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
    resolvedSpots,
    activationSpots,
    resolvedSelectedSpot,
    targetMarkerColor,
    pathDifficulty,
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
  ]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative flex items-center justify-center select-none"
    >
      {/* WebGL canvas for map background */}
      <canvas
        ref={webglCanvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="absolute"
        style={{
          imageRendering: "auto",
          width: displaySize,
          height: displaySize,
        }}
      />
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
      {layers.activations && (
        <div
          className="pointer-events-none absolute"
          style={{ width: displaySize, height: displaySize }}
        >
          <ActivationPillButtons placements={activationPillPlacements} />
        </div>
      )}

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
          <div className="text-gray-400 text-sm">Loading map...</div>
        </div>
      )}
      {/* Spot & pin size sliders - bottom left corner */}
      {!hideSizeSliders && <MapSizeSliders />}

      {/* Legend overlay */}
      <div className="absolute bottom-14 left-4 text-xs text-gray-500 bg-deep-space/80 px-2 py-1 rounded">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-0.5 inline-block"
            style={{ backgroundColor: COLORS.path }}
          />
          <span>Great circle path (straight line = beam heading)</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-gray-400">
          <span>Scroll to zoom</span>
          {zoom !== 1 && (
            <span className="text-signal-green">({zoom.toFixed(1)}x)</span>
          )}
        </div>
      </div>
    </div>
  );
}

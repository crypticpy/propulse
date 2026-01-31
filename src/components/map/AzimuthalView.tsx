/**
 * AzimuthalView Component
 *
 * Canvas-based azimuthal equidistant projection view centered on the user's QTH.
 * Great circle paths appear as straight lines in this projection, making it
 * extremely useful for ham radio operators to determine beam headings.
 */

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { getSubsolarPoint } from "@/lib/utils/sun";
import {
  azimuthalProject,
  azimuthalUnproject,
  type AzimuthalPoint,
} from "@/lib/utils/azimuthal";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import {
  resolveSpotLocations,
  getModeColor,
  type ResolvedSpot,
} from "./LiveSpotArcs";

// Simplified world coastline data (major landmass outlines)
// Each array is a continuous coastline segment [lat, lon, lat, lon, ...]
import { WORLD_COASTLINES } from "./coastlineData";

interface AzimuthalViewProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
}

// Canvas dimensions (square for circular projection)
const CANVAS_SIZE = 600;
const CENTER = CANVAS_SIZE / 2;
const RADIUS = CANVAS_SIZE / 2 - 40; // Leave margin for labels

// Distance rings in km
const DISTANCE_RINGS = [5000, 10000, 15000, 20000];

// Colors
const COLORS = {
  background: "#0a0a1a",
  ring: "rgba(255, 255, 255, 0.15)",
  ringLabel: "rgba(255, 255, 255, 0.5)",
  bearingLabel: "rgba(255, 255, 255, 0.7)",
  bearingTick: "rgba(255, 255, 255, 0.3)",
  land: "rgba(100, 130, 160, 0.4)",
  landStroke: "rgba(100, 130, 160, 0.6)",
  night: "rgba(0, 0, 20, 0.5)",
  terminator: "#ff6b35",
  greyline: "rgba(255, 180, 100, 0.2)",
  homeMarker: "#00ff88",
  targetMarker: "#ff6b35",
  path: "#ff6b35",
  grid: "rgba(255, 255, 255, 0.08)",
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
}

/**
 * Draw coastlines/land masses
 */
function drawCoastlines(
  ctx: CanvasRenderingContext2D,
  centerLat: number,
  centerLon: number,
) {
  ctx.fillStyle = COLORS.land;
  ctx.strokeStyle = COLORS.landStroke;
  ctx.lineWidth = 0.5;

  for (const coastline of WORLD_COASTLINES) {
    if (coastline.length < 4) continue;

    ctx.beginPath();
    let firstPoint = true;
    let lastCanvasX = 0;
    let lastCanvasY = 0;

    for (let i = 0; i < coastline.length; i += 2) {
      const lat = coastline[i];
      const lon = coastline[i + 1];
      const projected = azimuthalProject(lat, lon, centerLat, centerLon);

      // Skip points outside the map circle
      const dist = Math.sqrt(
        projected.x * projected.x + projected.y * projected.y,
      );
      if (dist > 1.05) {
        firstPoint = true;
        continue;
      }

      const { x, y } = projToCanvas(projected);

      // Skip if there's a large jump (wrap around)
      if (!firstPoint) {
        const dx = x - lastCanvasX;
        const dy = y - lastCanvasY;
        if (dx * dx + dy * dy > RADIUS * RADIUS) {
          firstPoint = true;
        }
      }

      if (firstPoint) {
        ctx.moveTo(x, y);
        firstPoint = false;
      } else {
        ctx.lineTo(x, y);
      }

      lastCanvasX = x;
      lastCanvasY = y;
    }

    ctx.stroke();
  }
}

/**
 * Draw night side overlay based on subsolar point
 */
function drawNightSide(
  ctx: CanvasRenderingContext2D,
  date: Date,
  centerLat: number,
  centerLon: number,
) {
  const subsolar = getSubsolarPoint(date);

  // The terminator is a great circle 90 degrees from the subsolar point
  // In azimuthal equidistant projection, this will be a circle (or ellipse-like curve)
  // Note: subsolar point is used for zenith angle calculations in the loop below

  // Draw night overlay using sampling
  const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const data = imageData.data;

  for (let py = 0; py < CANVAS_SIZE; py++) {
    for (let px = 0; px < CANVAS_SIZE; px++) {
      const proj = canvasToProj(px, py);
      const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);

      // Skip points outside the circle
      if (dist > 1) continue;

      // Unproject to get lat/lon
      const { lat, lon } = azimuthalUnproject(
        proj.x,
        proj.y,
        centerLat,
        centerLon,
      );

      // Calculate angular distance from subsolar point
      const phi1 = subsolar.lat * (Math.PI / 180);
      const phi2 = lat * (Math.PI / 180);
      const deltaLambda = (lon - subsolar.lon) * (Math.PI / 180);

      const cosAngle =
        Math.sin(phi1) * Math.sin(phi2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
      const angle =
        Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

      const idx = (py * CANVAS_SIZE + px) * 4;

      if (angle > 90) {
        // Night side - darken
        const darkness = Math.min(0.6, ((angle - 90) / 30) * 0.6);
        data[idx] = Math.floor(data[idx] * (1 - darkness));
        data[idx + 1] = Math.floor(data[idx + 1] * (1 - darkness));
        data[idx + 2] = Math.floor(data[idx + 2] * (1 - darkness * 0.7));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
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
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;

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
) {
  const projected = azimuthalProject(
    targetLat,
    targetLon,
    centerLat,
    centerLon,
  );
  const { x, y } = projToCanvas(projected);

  // Draw the path (straight line from center - this is the key feature!)
  ctx.strokeStyle = COLORS.path;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLORS.path;
  ctx.shadowBlur = 6;
  ctx.setLineDash([8, 4]);

  ctx.beginPath();
  ctx.moveTo(CENTER, CENTER);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // Draw target marker
  // Outer glow
  ctx.fillStyle = COLORS.targetMarker + "40";
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();

  // Inner dot
  ctx.fillStyle = COLORS.targetMarker;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Pulsing ring
  ctx.strokeStyle = COLORS.targetMarker;
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
    ctx.strokeStyle = COLORS.targetMarker;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - textWidth / 2, y - 32, textWidth, 18);

    ctx.fillStyle = COLORS.targetMarker;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(labelText, x, y - 18);
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
 * Calculate age-based opacity (newer spots are more visible)
 */
function getSpotAgeOpacity(spotTime: Date, maxAgeMinutes: number = 15): number {
  const ageMs = Date.now() - spotTime.getTime();
  const ageMinutes = ageMs / 60000;
  return Math.max(0.3, 1 - ageMinutes / maxAgeMinutes);
}

/**
 * Draw live spot arcs on the azimuthal projection
 * In azimuthal equidistant projection, great circles appear as straight lines!
 */
function drawSpotArcs(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  centerLat: number,
  centerLon: number,
) {
  for (const spot of spots) {
    const color = getModeColor(spot.mode);
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
    if (spotterDist > 1 && dxDist > 1) continue;

    const spotterCanvas = projToCanvas(spotterProj);
    const dxCanvas = projToCanvas(dxProj);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 3;

    // In azimuthal projection, great circles are straight lines!
    ctx.beginPath();
    ctx.moveTo(spotterCanvas.x, spotterCanvas.y);
    ctx.lineTo(dxCanvas.x, dxCanvas.y);
    ctx.stroke();

    // Draw endpoint dots
    ctx.fillStyle = color;

    // Spotter location (smaller, only if inside circle)
    if (spotterDist <= 1) {
      ctx.beginPath();
      ctx.arc(spotterCanvas.x, spotterCanvas.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // DX location (larger, only if inside circle)
    if (dxDist <= 1) {
      ctx.beginPath();
      ctx.arc(dxCanvas.x, dxCanvas.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export function AzimuthalView({
  displayTime,
  onLocationClick,
}: AzimuthalViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { layers, target } = useMapStore();
  const { station } = useUserStore();

  // Memoize the center coordinates
  const center = useMemo(() => {
    if (!station) return null;
    return { lat: station.lat, lon: station.lon };
  }, [station]);

  // Fetch live spots when spots layer is enabled
  const { spots } = useLiveSpots({
    grid: station?.grid,
    enabled: layers.spots,
    refetchInterval: 60000,
  });

  // Resolve spot locations and limit to 50 for performance
  const resolvedSpots = useMemo(() => {
    if (!layers.spots) return [];
    return resolveSpotLocations(spots).slice(0, 50);
  }, [spots, layers.spots]);

  // Handle canvas click
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !onLocationClick || !center) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      // Convert to projection coordinates
      const proj = canvasToProj(canvasX, canvasY);

      // Check if click is within the map circle
      const dist = Math.sqrt(proj.x * proj.x + proj.y * proj.y);
      if (dist > 1) return;

      // Unproject to lat/lon
      const { lat, lon } = azimuthalUnproject(
        proj.x,
        proj.y,
        center.lat,
        center.lon,
      );

      onLocationClick(lat, lon);
    },
    [onLocationClick, center],
  );

  // Render map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // If no station is set, show message
    if (!center) {
      drawNoQTHMessage(ctx);
      return;
    }

    // Draw coastlines first (as background)
    drawCoastlines(ctx, center.lat, center.lon);

    // Draw night side and terminator
    if (layers.terminator) {
      drawNightSide(ctx, displayTime, center.lat, center.lon);
      drawTerminator(ctx, displayTime, center.lat, center.lon);
    }

    // Draw distance rings
    drawDistanceRings(ctx);

    // Draw bearing labels
    drawBearingLabels(ctx);

    // Draw live spot arcs (straight lines in azimuthal projection)
    if (layers.spots && resolvedSpots.length > 0) {
      drawSpotArcs(ctx, resolvedSpots, center.lat, center.lon);
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
      );
    }

    // Draw home marker at center (always last so it's on top)
    drawHomeMarker(ctx, station?.callsign);
  }, [displayTime, layers, station, target, center, resolvedSpots]);

  return (
    <div className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={handleClick}
        className="max-w-full max-h-full cursor-crosshair"
        style={{ imageRendering: "auto" }}
      />
      {/* Legend overlay */}
      <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-deep-space/80 px-2 py-1 rounded">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-0.5 inline-block"
            style={{ backgroundColor: COLORS.path }}
          />
          <span>Great circle path (straight line = beam heading)</span>
        </div>
      </div>
    </div>
  );
}

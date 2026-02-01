/**
 * FlatMapView Component
 *
 * 2D equirectangular map view with NASA Blue Marble texture
 * and terminator/greyline overlays.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { getPathPoints, getPathMetrics } from "@/lib/utils/path";
import { useAuroraData } from "@/hooks/useAuroraData";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { estimateMUF, getMUFColor } from "@/lib/api/muf";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import {
  resolveSpotLocations,
  getGreatCirclePoints,
  getModeColor,
  type ResolvedSpot,
} from "./LiveSpotArcs";
import {
  getDifficultyColor,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";
import { getSpotAgeOpacity } from "@/lib/utils/canvas";
import type { AuroraData } from "@/lib/api/aurora";

interface FlatMapViewProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
}

// Map dimensions
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 512;

// Colors
const COLORS = {
  terminator: "#ff6b35",
  night: "rgba(0, 0, 20, 0.6)",
  grid: "rgba(255, 255, 255, 0.15)",
  homeMarker: "#4488FF", // Blue for home station
  targetMarker: "#ff6b35", // Default fallback - usually overridden by difficulty
  path: "#ff6b35",
};

/**
 * Convert lat/lon to canvas coordinates
 */
function latLonToCanvas(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x, y };
}

/**
 * Convert canvas coordinates to lat/lon
 */
function canvasToLatLon(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
): { lat: number; lon: number } {
  const lon = (x / canvasWidth) * 360 - 180;
  const lat = 90 - (y / canvasHeight) * 180;
  return { lat, lon };
}

/**
 * Draw grid lines
 */
function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;

  // Latitude lines every 30°
  for (let lat = -60; lat <= 60; lat += 30) {
    const { y } = latLonToCanvas(lat, 0);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(MAP_WIDTH, y);
    ctx.stroke();
  }

  // Longitude lines every 30°
  for (let lon = -150; lon <= 180; lon += 30) {
    const { x } = latLonToCanvas(0, lon);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, MAP_HEIGHT);
    ctx.stroke();
  }

  // Equator highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  const { y: equatorY } = latLonToCanvas(0, 0);
  ctx.beginPath();
  ctx.moveTo(0, equatorY);
  ctx.lineTo(MAP_WIDTH, equatorY);
  ctx.stroke();
}

/**
 * Draw night side overlay based on subsolar point
 */
function drawNightSide(ctx: CanvasRenderingContext2D, date: Date) {
  const subsolar = getSubsolarPoint(date);

  // Create night overlay pixel by pixel for accuracy
  const imageData = ctx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
  const data = imageData.data;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const lon = (x / MAP_WIDTH) * 360 - 180;
      const lat = 90 - (y / MAP_HEIGHT) * 180;

      // Calculate angular distance from subsolar point
      const phi1 = lat * (Math.PI / 180);
      const phi2 = subsolar.lat * (Math.PI / 180);
      const deltaLambda = (lon - subsolar.lon) * (Math.PI / 180);

      const cosAngle =
        Math.sin(phi1) * Math.sin(phi2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
      const angle =
        Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

      const idx = (y * MAP_WIDTH + x) * 4;

      if (angle > 90) {
        // Night side - darken
        const darkness = Math.min(0.7, ((angle - 90) / 30) * 0.7);
        data[idx] = Math.floor(data[idx] * (1 - darkness));
        data[idx + 1] = Math.floor(data[idx + 1] * (1 - darkness));
        data[idx + 2] = Math.floor(data[idx + 2] * (1 - darkness * 0.8));
      } else if (angle > 85) {
        // Twilight zone - slight darkening with orange tint
        const twilight = ((angle - 85) / 5) * 0.2;
        data[idx] = Math.min(
          255,
          Math.floor(data[idx] * (1 - twilight * 0.3) + 30 * twilight),
        );
        data[idx + 1] = Math.floor(data[idx + 1] * (1 - twilight * 0.5));
        data[idx + 2] = Math.floor(data[idx + 2] * (1 - twilight * 0.6));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draw terminator line
 *
 * The terminator is the line where the sun angle is exactly 90°.
 * Formula derived from: 0 = sin(lat)*sin(subsolarLat) + cos(lat)*cos(subsolarLat)*cos(Δlon)
 * Solving for lat: lat = atan(-cos(Δlon) / tan(subsolarLat))
 */
function drawTerminator(ctx: CanvasRenderingContext2D, date: Date) {
  const subsolar = getSubsolarPoint(date);

  ctx.strokeStyle = COLORS.terminator;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLORS.terminator;
  ctx.shadowBlur = 4;

  ctx.beginPath();

  const subsolarLatRad = subsolar.lat * (Math.PI / 180);
  const subsolarLonRad = subsolar.lon * (Math.PI / 180);

  // Handle equinox edge case (subsolar lat near 0)
  const tanSubsolarLat = Math.tan(subsolarLatRad);
  const isNearEquinox = Math.abs(tanSubsolarLat) < 0.001;

  // Draw terminator by finding 90° points from subsolar
  for (let lon = -180; lon <= 180; lon += 1) {
    const lonRad = lon * (Math.PI / 180);
    const deltaLon = lonRad - subsolarLonRad;

    let lat: number;
    if (isNearEquinox) {
      // Near equinox: terminator runs north-south at 90° from subsolar longitude
      // Just draw a vertical line offset by 90° from subsolar point
      const offset = subsolar.lon + 90;
      const normalizedOffset = ((offset + 180) % 360) - 180;
      lat =
        Math.abs(lon - normalizedOffset) < 1 ||
        Math.abs(lon - normalizedOffset + 360) < 1
          ? 0
          : deltaLon > 0
            ? 90
            : -90;
    } else {
      // Normal formula: lat = atan(-cos(deltaLon) / tan(subsolarLat))
      lat = Math.atan(-Math.cos(deltaLon) / tanSubsolarLat) * (180 / Math.PI);
    }

    const { x, y } = latLonToCanvas(lat, lon);

    if (lon === -180) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.shadowBlur = 0;
}

/**
 * Draw greyline band (twilight zone around the terminator)
 * The greyline is the area within ±15° of the terminator where
 * enhanced propagation conditions exist
 */
function drawGreyline(ctx: CanvasRenderingContext2D, date: Date) {
  const subsolar = getSubsolarPoint(date);

  // Create greyline overlay by marking twilight pixels
  const imageData = ctx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
  const data = imageData.data;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const lon = (x / MAP_WIDTH) * 360 - 180;
      const lat = 90 - (y / MAP_HEIGHT) * 180;

      // Calculate angular distance from subsolar point
      const phi1 = lat * (Math.PI / 180);
      const phi2 = subsolar.lat * (Math.PI / 180);
      const deltaLambda = (lon - subsolar.lon) * (Math.PI / 180);

      const cosAngle =
        Math.sin(phi1) * Math.sin(phi2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
      const angle =
        Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

      const idx = (y * MAP_WIDTH + x) * 4;

      // Greyline band: 75° to 105° from subsolar point (±15° from terminator)
      if (angle >= 75 && angle <= 105) {
        // Golden/amber tint for greyline
        // Stronger effect closer to terminator (90°)
        const distFromTerminator = Math.abs(angle - 90);
        const intensity = 1 - distFromTerminator / 15;

        // Add golden overlay
        data[idx] = Math.min(255, data[idx] + Math.floor(60 * intensity)); // R
        data[idx + 1] = Math.min(
          255,
          data[idx + 1] + Math.floor(40 * intensity),
        ); // G
        data[idx + 2] = Math.max(0, data[idx + 2] - Math.floor(20 * intensity)); // B (reduce for warmer tone)
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draw a location marker with optional path info
 */
function drawMarker(
  ctx: CanvasRenderingContext2D,
  lat: number,
  lon: number,
  color: string,
  label?: string,
  isHome: boolean = false,
  difficulty?: DifficultyLevel,
  pathInfo?: { bearing: number; distance: number },
) {
  const { x, y } = latLonToCanvas(lat, lon);

  // Outer glow
  ctx.fillStyle = color + "40";
  ctx.beginPath();
  ctx.arc(x, y, isHome ? 10 : 14, 0, Math.PI * 2);
  ctx.fill();

  // Inner dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, isHome ? 5 : 7, 0, Math.PI * 2);
  ctx.fill();

  // Pulsing ring for target
  if (!isHome) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Label with optional path info
  if (label || pathInfo) {
    // Build label text: "CALLSIGN (45° / 9500km)" or just "CALLSIGN"
    let labelText = label || "";
    if (pathInfo && !isHome) {
      const bearing = Math.round(pathInfo.bearing);
      const distKm = Math.round(pathInfo.distance);
      labelText = label
        ? `${label} (${bearing}° / ${distKm}km)`
        : `${bearing}° / ${distKm}km`;
    }

    ctx.font = "bold 11px monospace";
    const textWidth = ctx.measureText(labelText).width + 12;
    const boxWidth = Math.max(60, textWidth);

    // Label background
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(x - boxWidth / 2, y - 28, boxWidth, 16);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - boxWidth / 2, y - 28, boxWidth, 16);

    // Label text
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(labelText, x, y - 16);

    // Difficulty tag above label for target markers
    if (!isHome && difficulty) {
      const difficultyLabel = DIFFICULTY_LABELS[difficulty];
      ctx.font = "bold 10px sans-serif";
      const tagWidth = ctx.measureText(difficultyLabel).width + 10;

      // Background for difficulty tag
      ctx.fillStyle = color + "20";
      ctx.fillRect(x - tagWidth / 2, y - 46, tagWidth, 14);
      ctx.strokeStyle = color + "50";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - tagWidth / 2, y - 46, tagWidth, 14);

      // Difficulty label text
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(difficultyLabel, x, y - 35);
    }
  }
}

/**
 * Draw path between two points
 */
function drawPath(
  ctx: CanvasRenderingContext2D,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  color: string = COLORS.path,
) {
  const points = getPathPoints(startLat, startLon, endLat, endLon, 100);

  // Draw path with crisp lines (no shadow blur for sharpness)
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([10, 6]);

  ctx.beginPath();
  let lastX = -1;

  for (const point of points) {
    const { x, y } = latLonToCanvas(point.lat, point.lon);

    // Handle wrap-around at date line
    if (lastX >= 0 && Math.abs(x - lastX) > MAP_WIDTH / 2) {
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (lastX < 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    lastX = x;
  }

  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Get aurora color based on probability
 * Low: purple glow, Medium: purple-green, High: bright green
 */
function getAuroraColor(probability: number): string {
  if (probability >= 60) {
    // High aurora: bright green
    return "#00ff88";
  } else if (probability >= 30) {
    // Medium aurora: purple-green blend
    const t = (probability - 30) / 30;
    const r = Math.floor(102 * (1 - t));
    const g = Math.floor(255 * t + 68 * (1 - t));
    const b = Math.floor(136 * (1 - t) + 136 * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Low aurora: subtle purple
    return "#8844ff";
  }
}

/**
 * Get aurora opacity based on probability
 */
function getAuroraOpacity(probability: number): number {
  if (probability >= 60) {
    return 0.7;
  } else if (probability >= 30) {
    return 0.5;
  } else {
    return 0.3;
  }
}

/**
 * Draw aurora overlay on the 2D map
 * Renders aurora probability data as colored circles with glow effect
 */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  auroraData: AuroraData,
  minProbability: number = 10,
) {
  // Filter coordinates with aurora above threshold
  const filteredCoords = auroraData.coordinates.filter(
    (coord) => coord.aurora >= minProbability,
  );

  // Save current context state
  ctx.save();

  // Enable additive blending for glow effect
  ctx.globalCompositeOperation = "lighter";

  for (const coord of filteredCoords) {
    const { x, y } = latLonToCanvas(coord.lat, coord.lon);
    const color = getAuroraColor(coord.aurora);
    const opacity = getAuroraOpacity(coord.aurora);

    // Draw glowing point
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 8);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, "transparent");

    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Restore context state
  ctx.restore();
}

/**
 * Draw MUF overlay on the 2D map
 * Renders MUF values as colored regions with smooth gradients
 */
function drawMUF(
  ctx: CanvasRenderingContext2D,
  sfi: number,
  date: Date,
  opacity: number = 0.45,
) {
  // Create a temporary canvas for the MUF overlay
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = MAP_WIDTH;
  tempCanvas.height = MAP_HEIGHT;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return;

  // Calculate MUF at lower resolution for performance, then scale up
  const resolution = 10; // degrees
  const cellWidth = MAP_WIDTH / (360 / resolution);
  const cellHeight = MAP_HEIGHT / (180 / resolution);

  for (let lat = 90; lat >= -90; lat -= resolution) {
    for (let lon = -180; lon < 180; lon += resolution) {
      // Calculate MUF at center of cell
      const centerLat = lat - resolution / 2;
      const centerLon = lon + resolution / 2;
      const muf = estimateMUF(centerLat, centerLon, sfi, date);

      // Get color for this MUF value
      const { color } = getMUFColor(muf);

      // Calculate canvas position
      const { x, y } = latLonToCanvas(lat, lon);

      // Draw cell with color
      tempCtx.fillStyle = color;
      tempCtx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
    }
  }

  // Apply slight blur for smoother appearance
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = "blur(4px)";
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw a curved arc between two points using bezier curves
 * Creates a visually pleasing arc that curves away from the map surface
 */
function drawSpotArc(ctx: CanvasRenderingContext2D, spot: ResolvedSpot) {
  const color = getModeColor(spot.mode);
  const opacity = getSpotAgeOpacity(spot.time);

  // Get start and end points
  const start = latLonToCanvas(spot.spotterLat, spot.spotterLon);
  const end = latLonToCanvas(spot.dxLat, spot.dxLon);

  // Calculate control point for bezier curve
  // The arc height is based on distance between points
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Handle wrap-around at date line
  let wrapAround = false;
  if (Math.abs(dx) > MAP_WIDTH / 2) {
    wrapAround = true;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";

  if (wrapAround) {
    // Draw two segments for wrap-around paths
    // Use great circle points for more accurate path
    const points = getGreatCirclePoints(
      spot.spotterLat,
      spot.spotterLon,
      spot.dxLat,
      spot.dxLon,
      50,
    );

    ctx.beginPath();
    let lastX = -1;

    for (const point of points) {
      const { x, y } = latLonToCanvas(point.lat, point.lon);

      if (lastX >= 0 && Math.abs(x - lastX) > MAP_WIDTH / 2) {
        // Break at wrap point
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else if (lastX < 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      lastX = x;
    }
    ctx.stroke();
  } else {
    // Draw a curved bezier arc for non-wrapping paths
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    // Arc curves upward (toward poles) - height based on distance
    const arcHeight = Math.min(distance * 0.3, 80);
    const controlY = midY - arcHeight;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(midX, controlY, end.x, end.y);
    ctx.stroke();
  }

  // Draw endpoint dots
  // Spotter location (smaller)
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(start.x, start.y, 3, 0, Math.PI * 2);
  ctx.fill();

  // DX location (larger)
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw all spot arcs on the 2D map
 */
function drawSpotArcs(ctx: CanvasRenderingContext2D, spots: ResolvedSpot[]) {
  for (const spot of spots) {
    drawSpotArc(ctx, spot);
  }
}

// Major cities for night lights display
const NIGHT_LIGHT_CITIES = [
  { lat: 40.7128, lon: -74.006, size: 8 }, // New York
  { lat: 34.0522, lon: -118.2437, size: 7 }, // Los Angeles
  { lat: 51.5074, lon: -0.1278, size: 7 }, // London
  { lat: 48.8566, lon: 2.3522, size: 6 }, // Paris
  { lat: 35.6762, lon: 139.6503, size: 8 }, // Tokyo
  { lat: 39.9042, lon: 116.4074, size: 8 }, // Beijing
  { lat: -33.8688, lon: 151.2093, size: 6 }, // Sydney
  { lat: 55.7558, lon: 37.6173, size: 6 }, // Moscow
  { lat: 25.2048, lon: 55.2708, size: 5 }, // Dubai
  { lat: 1.3521, lon: 103.8198, size: 5 }, // Singapore
  { lat: 19.076, lon: 72.8777, size: 7 }, // Mumbai
  { lat: 30.0444, lon: 31.2357, size: 5 }, // Cairo
  { lat: -22.9068, lon: -43.1729, size: 6 }, // Rio
  { lat: 43.6532, lon: -79.3832, size: 5 }, // Toronto
  { lat: 52.52, lon: 13.405, size: 5 }, // Berlin
  { lat: 37.5665, lon: 126.978, size: 6 }, // Seoul
  { lat: 19.4326, lon: -99.1332, size: 6 }, // Mexico City
  { lat: 41.9028, lon: 12.4964, size: 5 }, // Rome
  { lat: -34.6037, lon: -58.3816, size: 5 }, // Buenos Aires
  { lat: 13.7563, lon: 100.5018, size: 5 }, // Bangkok
  { lat: 22.3193, lon: 114.1694, size: 6 }, // Hong Kong
  { lat: 31.2304, lon: 121.4737, size: 7 }, // Shanghai
  { lat: 28.6139, lon: 77.209, size: 6 }, // Delhi
  { lat: -6.2088, lon: 106.8456, size: 5 }, // Jakarta
  { lat: 14.5995, lon: 120.9842, size: 5 }, // Manila
  { lat: 23.8103, lon: 90.4125, size: 5 }, // Dhaka
  { lat: 33.6844, lon: 73.0479, size: 4 }, // Islamabad
  { lat: -23.5505, lon: -46.6333, size: 6 }, // Sao Paulo
  { lat: 6.5244, lon: 3.3792, size: 5 }, // Lagos
  { lat: -1.2921, lon: 36.8219, size: 4 }, // Nairobi
];

/**
 * Draw night lights (city lights on dark side)
 */
function drawNightLights(ctx: CanvasRenderingContext2D, date: Date) {
  const subsolar = getSubsolarPoint(date);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const city of NIGHT_LIGHT_CITIES) {
    // Calculate if city is on night side
    const phi1 = city.lat * (Math.PI / 180);
    const phi2 = subsolar.lat * (Math.PI / 180);
    const deltaLambda = (city.lon - subsolar.lon) * (Math.PI / 180);

    const cosAngle =
      Math.sin(phi1) * Math.sin(phi2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const angle =
      Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

    // Only show lights on night side (angle > 90 from subsolar)
    if (angle > 85) {
      const { x, y } = latLonToCanvas(city.lat, city.lon);

      // Calculate intensity based on how deep into night
      const nightDepth = Math.min((angle - 85) / 30, 1);
      const intensity = nightDepth * 0.8;

      // Draw glowing city light
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, city.size);
      gradient.addColorStop(0, `rgba(255, 200, 100, ${intensity})`);
      gradient.addColorStop(0.3, `rgba(255, 180, 80, ${intensity * 0.6})`);
      gradient.addColorStop(1, "transparent");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, city.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// Simplified country border data for 2D map
const BORDER_SEGMENTS = [
  // North America West Coast
  [
    [48.4, -124.7],
    [42.0, -124.2],
    [34.4, -120.5],
    [32.5, -117.1],
    [23.0, -110.0],
  ],
  // North America East Coast
  [
    [47.0, -67.0],
    [42.0, -70.0],
    [35.0, -75.5],
    [25.0, -80.0],
    [30.0, -88.0],
  ],
  // Europe
  [
    [58.0, -6.0],
    [50.0, -5.0],
    [43.0, -9.0],
    [36.0, -6.0],
  ],
  // Africa West
  [
    [35.0, -6.0],
    [14.0, -17.0],
    [-5.0, 12.0],
    [-34.0, 18.0],
  ],
  // Asia - India outline
  [
    [23.0, 68.0],
    [8.0, 77.0],
    [22.0, 88.0],
  ],
  // Australia
  [
    [-12.0, 130.0],
    [-20.0, 118.0],
    [-35.0, 117.0],
    [-38.0, 145.0],
    [-28.0, 153.0],
    [-12.0, 142.0],
  ],
];

// City labels for 2D map
const CITY_LABELS = [
  { name: "New York", lat: 40.7128, lon: -74.006 },
  { name: "London", lat: 51.5074, lon: -0.1278 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Moscow", lat: 55.7558, lon: 37.6173 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Cairo", lat: 30.0444, lon: 31.2357 },
  { name: "Rio", lat: -22.9068, lon: -43.1729 },
  { name: "LA", lat: 34.0522, lon: -118.2437 },
];

/**
 * Draw labels (country borders and city names)
 */
function drawLabels(ctx: CanvasRenderingContext2D) {
  // Draw country borders
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;

  for (const segment of BORDER_SEGMENTS) {
    ctx.beginPath();
    for (let i = 0; i < segment.length; i++) {
      const [lat, lon] = segment[i];
      const { x, y } = latLonToCanvas(lat, lon);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  // Draw city labels
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";

  for (const city of CITY_LABELS) {
    const { x, y } = latLonToCanvas(city.lat, city.lon);

    // Draw text with dark outline for visibility on both light and dark backgrounds
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 3;
    ctx.strokeText(city.name, x, y - 8);

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(city.name, x, y - 8);

    // Small dot for city location
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Zoom state type
interface ZoomState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function FlatMapView({
  displayTime,
  onLocationClick,
}: FlatMapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const { layers, target } = useMapStore();
  const { station } = useUserStore();
  const { data: auroraData } = useAuroraData();
  const currentSFI = useCurrentSFI();

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

  // Calculate path metrics for target marker display
  const pathMetrics = useMemo(() => {
    if (!station || !target) return null;
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
  }, [station, target]);

  // Extract difficulty for convenience
  const pathDifficulty = pathMetrics?.difficulty;

  // Get target marker color based on difficulty
  const targetMarkerColor = pathDifficulty
    ? getDifficultyColor(pathDifficulty)
    : COLORS.targetMarker;

  // Handle scroll wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // Mouse position relative to canvas (in display coordinates)
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Scale mouse position to canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasMouseX = mouseX * scaleX;
    const canvasMouseY = mouseY * scaleY;

    // Zoom factor
    const delta = e.deltaY > 0 ? 0.9 : 1.1;

    setZoom((prev) => {
      const newScale = Math.max(0.5, Math.min(4, prev.scale * delta));

      // Calculate new offset to zoom toward mouse position
      // The point under the mouse should stay in the same place
      const scaleFactor = newScale / prev.scale;
      const newOffsetX =
        canvasMouseX - (canvasMouseX - prev.offsetX) * scaleFactor;
      const newOffsetY =
        canvasMouseY - (canvasMouseY - prev.offsetY) * scaleFactor;

      // Clamp offsets to prevent panning too far
      const maxOffsetX = MAP_WIDTH * (newScale - 1);
      const maxOffsetY = MAP_HEIGHT * (newScale - 1);
      const clampedOffsetX = Math.max(-maxOffsetX, Math.min(0, newOffsetX));
      const clampedOffsetY = Math.max(-maxOffsetY, Math.min(0, newOffsetY));

      return {
        scale: newScale,
        offsetX: clampedOffsetX,
        offsetY: clampedOffsetY,
      };
    });
  }, []);

  // Attach wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  // Load map image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setMapImage(img);
    img.src = "/textures/earth-flat.jpg";
  }, []);

  // Handle canvas click (accounting for zoom transform)
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !onLocationClick) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      // Get click position in canvas coordinates
      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;

      // Reverse the zoom transform to get the actual map coordinates
      // The zoom transform is: translate(offsetX, offsetY) then scale(zoom.scale)
      // So we need to: un-translate by offset, then un-scale
      const mapX = (canvasX - zoom.offsetX) / zoom.scale;
      const mapY = (canvasY - zoom.offsetY) / zoom.scale;

      const { lat, lon } = canvasToLatLon(mapX, mapY, MAP_WIDTH, MAP_HEIGHT);
      onLocationClick(lat, lon);
    },
    [onLocationClick, zoom],
  );

  // Render map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapImage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply zoom transform
    ctx.save();
    ctx.translate(zoom.offsetX, zoom.offsetY);
    ctx.scale(zoom.scale, zoom.scale);

    // Draw base map image
    ctx.drawImage(mapImage, 0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw MUF overlay (before night side so it's properly darkened)
    if (layers.muf && currentSFI) {
      drawMUF(ctx, currentSFI, displayTime, 0.45);
    }

    // Draw night side and terminator
    if (layers.terminator) {
      drawNightSide(ctx, displayTime);
      drawTerminator(ctx, displayTime);
    }

    // Draw greyline band (twilight zone with enhanced propagation)
    if (layers.greyline) {
      drawGreyline(ctx, displayTime);
    }

    // Draw aurora overlay
    if (layers.aurora && auroraData) {
      drawAurora(ctx, auroraData, 10);
    }

    // Draw night lights (city lights on dark side)
    if (layers.nightLights) {
      drawNightLights(ctx, displayTime);
    }

    // Draw grid
    drawGrid(ctx);

    // Draw labels (country borders and city names)
    if (layers.labels) {
      drawLabels(ctx);
    }

    // Draw live spot arcs
    if (layers.spots && resolvedSpots.length > 0) {
      drawSpotArcs(ctx, resolvedSpots);
    }

    // Draw path if both home and target exist (use difficulty color)
    if (station && target) {
      drawPath(
        ctx,
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        targetMarkerColor,
      );
    }

    // Draw markers
    if (station) {
      drawMarker(
        ctx,
        station.lat,
        station.lon,
        COLORS.homeMarker,
        station.callsign,
        true,
      );
    }

    if (target) {
      drawMarker(
        ctx,
        target.lat,
        target.lon,
        targetMarkerColor,
        target.name || target.grid,
        false,
        pathDifficulty,
        pathMetrics
          ? {
              bearing: pathMetrics.shortPath.bearing,
              distance: pathMetrics.shortPath.distance,
            }
          : undefined,
      );
    }

    // Restore context after zoom transform
    ctx.restore();
  }, [
    displayTime,
    layers,
    station,
    target,
    mapImage,
    auroraData,
    currentSFI,
    resolvedSpots,
    targetMarkerColor,
    pathDifficulty,
    pathMetrics,
    zoom,
  ]);

  return (
    <div className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative flex items-center justify-center">
      {!mapImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-deep-space">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-plasma-orange border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 text-sm">Loading map...</span>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        onClick={handleClick}
        className="cursor-crosshair max-w-full max-h-full"
        aria-label="Interactive propagation map - click to select target location"
        role="img"
        style={{
          imageRendering: "auto",
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          objectFit: "contain",
        }}
      />
    </div>
  );
}

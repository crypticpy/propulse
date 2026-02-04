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
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { estimateMUF, getMUFColor } from "@/lib/api/muf";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import {
  resolveSpotLocations,
  getGreatCirclePoints,
  type ResolvedSpot,
} from "./LiveSpotArcs";
import { getSpotColor, type SpotColorMode } from "@/lib/utils/spotColors";
import {
  getDifficultyColor,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";
import { getSpotAgeOpacity } from "@/lib/utils/canvas";
import type { AuroraData } from "@/lib/api/aurora";
import { useFlatMapClickHandler } from "./FlatMapClickHandler";
import { MapTooltip } from "./MapTooltip";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import { MapFlyout, type MapFlyoutAction } from "./MapFlyout";
import { AddPinDialog } from "./AddPinDialog";
import {
  GridResearchPanel,
  type GridResearchAction,
} from "./GridResearchPanel";
import { WatchListPanel } from "./WatchListPanel";
import { WatchIndicator } from "./WatchIndicator";
import { latLonToGrid, gridToLatLon } from "@/lib/utils/grid";
import { usePinStore } from "@/stores/pinStore";
import { useWatchStore } from "@/stores/watchStore";
import { useDXStore } from "@/stores/dxStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import { getCategoryMeta } from "@/types/pin";
import type { MapPin } from "@/types/pin";
import { PinFlyout } from "./PinFlyout";
import { useSpotFocus } from "@/hooks/useSpotFocus";
import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { getEnhancedBandConditions } from "@/lib/utils/bands";
import { pickOptimalBandCondition } from "@/lib/utils/optimalBand";
import type { LabelOptions } from "@/stores/mapStore";
import {
  getMaidenheadFields,
  MAIDENHEAD_LON_LINES,
  MAIDENHEAD_LAT_LINES,
} from "@/lib/utils/maidenheadGrid";

interface FlatMapViewProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
}

// Map dimensions
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 512;

// Hit-testing (screen-space) radii for hover interactions
const PIN_HIT_RADIUS_SQ = 14 * 14;
const TARGET_HIT_RADIUS_SQ = 18 * 18;

// Module-level night texture for city lights (loaded once, cached permanently)
let nightTextureImage: HTMLImageElement | null = null;
let nightTextureLoading = false;
let nightTextureRetries = 0;
const MAX_TEXTURE_RETRIES = 3;

function ensureNightTextureLoaded(): HTMLImageElement | null {
  if (nightTextureImage) {
    return nightTextureImage;
  }
  if (nightTextureLoading || nightTextureRetries >= MAX_TEXTURE_RETRIES) {
    return null;
  }
  nightTextureLoading = true;
  const img = new Image();
  img.onload = () => {
    nightTextureImage = img;
    nightTextureLoading = false;
    nightTextureRetries = 0;
  };
  img.onerror = () => {
    nightTextureLoading = false;
    nightTextureRetries++;
  };
  img.src = "/textures/earth-night.jpg";
  return null;
}

// Night overlay cache: stores the three blend-mode overlay canvases
let nightOverlayCache: {
  desatCanvas: HTMLCanvasElement;
  darkCanvas: HTMLCanvasElement;
  blueCanvas: HTMLCanvasElement;
  minute: number;
  width: number;
  height: number;
} | null = null;

// Night lights cache: stores the composite result and the minute it was computed for
let nightLightsCache: {
  canvas: HTMLCanvasElement;
  minute: number;
  width: number;
  height: number;
} | null = null;

/**
 * Get the minute-level timestamp for cache comparison.
 * Night overlay only needs to update when time changes by >= 1 minute.
 */
function getTimeMinute(date: Date): number {
  return Math.floor(date.getTime() / 60000);
}

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
function latLonToCanvas(
  lat: number,
  lon: number,
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
): { x: number; y: number } {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

/**
 * Draw grid lines
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  highViz = false,
) {
  ctx.strokeStyle = highViz ? "rgba(255, 255, 255, 0.25)" : COLORS.grid;
  ctx.lineWidth = 0.5;

  // Latitude lines every 30°
  for (let lat = -60; lat <= 60; lat += 30) {
    const { y } = latLonToCanvas(lat, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Longitude lines every 30°
  for (let lon = -150; lon <= 180; lon += 30) {
    const { x } = latLonToCanvas(0, lon, width, height);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Equator highlight
  ctx.strokeStyle = highViz
    ? "rgba(255, 255, 255, 0.5)"
    : "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = highViz ? 1.5 : 1;
  const { y: equatorY } = latLonToCanvas(0, 0, width, height);
  ctx.beginPath();
  ctx.moveTo(0, equatorY);
  ctx.lineTo(width, equatorY);
  ctx.stroke();
}

/**
 * Draw enhanced night side overlay with grayscale desaturation, blue color shift,
 * and smooth twilight gradient. Uses multi-pass compositing with CSS blend modes
 * for realistic day/night visualization.
 *
 * Pass 1: Desaturate night-side pixels via 'saturation' blend mode
 * Pass 2: Darken and blue-tint via 'multiply' blend mode
 * Pass 3: Additional cold blue atmosphere via 'screen' blend mode
 *
 * Uses offscreen canvases since getImageData/putImageData bypass canvas transforms
 * (DPR scaling, zoom) and would produce incorrect results on HiDPI displays.
 */
function drawNightSide(
  ctx: CanvasRenderingContext2D,
  date: Date,
  width: number,
  height: number,
) {
  // Check cache: reuse overlay canvases if time hasn't changed by >= 1 minute
  const currentMinute = getTimeMinute(date);
  if (
    nightOverlayCache &&
    nightOverlayCache.minute === currentMinute &&
    nightOverlayCache.width === width &&
    nightOverlayCache.height === height
  ) {
    // Apply cached overlays with their respective blend modes
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.drawImage(nightOverlayCache.desatCanvas, 0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(nightOverlayCache.darkCanvas, 0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(nightOverlayCache.blueCanvas, 0, 0, width, height);
    ctx.restore();
    return;
  }

  const subsolar = getSubsolarPoint(date);

  // Precompute subsolar trig values for the inner loop
  const subsolarLatRad = subsolar.lat * (Math.PI / 180);
  const subsolarLonRad = subsolar.lon * (Math.PI / 180);
  const sinSubLat = Math.sin(subsolarLatRad);
  const cosSubLat = Math.cos(subsolarLatRad);

  // Precompute latitude trig values (rows share the same latitude)
  const latSin = new Float32Array(height);
  const latCos = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    const latRad = (90 - (y / height) * 180) * (Math.PI / 180);
    latSin[y] = Math.sin(latRad);
    latCos[y] = Math.cos(latRad);
  }

  // Precompute longitude delta cos values (columns share the same longitude)
  const lonDeltaCos = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const lonRad = ((x / width) * 360 - 180) * (Math.PI / 180);
    lonDeltaCos[x] = Math.cos(lonRad - subsolarLonRad);
  }

  // --- Pass 1: Desaturation overlay using 'saturation' blend mode ---
  // A gray overlay composited with 'saturation' mode removes color from the destination
  const desatCanvas = document.createElement("canvas");
  desatCanvas.width = width;
  desatCanvas.height = height;
  const desatCtx = desatCanvas.getContext("2d");
  if (!desatCtx) {
    return;
  }

  const desatData = desatCtx.createImageData(width, height);
  const desatPixels = desatData.data;

  // --- Pass 2: Darkening + blue tint overlay using 'multiply' blend mode ---
  const darkCanvas = document.createElement("canvas");
  darkCanvas.width = width;
  darkCanvas.height = height;
  const darkCtx = darkCanvas.getContext("2d");
  if (!darkCtx) {
    return;
  }

  const darkData = darkCtx.createImageData(width, height);
  const darkPixels = darkData.data;

  // --- Pass 3: Blue atmosphere screen overlay ---
  const blueCanvas = document.createElement("canvas");
  blueCanvas.width = width;
  blueCanvas.height = height;
  const blueCtx = blueCanvas.getContext("2d");
  if (!blueCtx) {
    return;
  }

  const blueData = blueCtx.createImageData(width, height);
  const bluePixels = blueData.data;

  // Twilight zone spans solar angles 85-95 degrees with smooth hermite interpolation
  const TWILIGHT_START = 85;
  const TWILIGHT_END = 95;
  const TWILIGHT_RANGE = TWILIGHT_END - TWILIGHT_START;

  for (let y = 0; y < height; y++) {
    const sinLat = latSin[y];
    const cosLat = latCos[y];
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      // Solar angle: 0 = noon, 90 = terminator, 180 = midnight
      const cosAngle = sinLat * sinSubLat + cosLat * cosSubLat * lonDeltaCos[x];
      const angle =
        Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

      const idx = (rowOffset + x) * 4;

      if (angle <= TWILIGHT_START) {
        // Full daylight - no overlay needed (alpha = 0)
        continue;
      }

      // Smooth hermite interpolation for twilight transition (0 at 85deg, 1 at 95deg)
      let nightBlend: number;
      if (angle >= TWILIGHT_END) {
        nightBlend = 1.0;
      } else {
        // Hermite smoothstep for ultra-smooth twilight gradient
        const t = (angle - TWILIGHT_START) / TWILIGHT_RANGE;
        nightBlend = t * t * (3 - 2 * t);
      }

      // Deepening darkness beyond the twilight zone (95-150 degrees)
      const deepNight =
        angle > TWILIGHT_END ? Math.min(1.0, (angle - TWILIGHT_END) / 55) : 0;

      // --- Desaturation layer ---
      // Gray at full alpha removes all saturation via 'saturation' blend
      const desatAlpha = Math.floor(255 * nightBlend * 0.85);
      desatPixels[idx] = 128;
      desatPixels[idx + 1] = 128;
      desatPixels[idx + 2] = 128;
      desatPixels[idx + 3] = desatAlpha;

      // --- Darkening + blue tint layer ---
      // Multiply blend: destination * source/255
      // Values < 255 darken; blue channel slightly higher preserves blue
      const baseDark = 0.55 + deepNight * 0.2; // 0.55 -> 0.75 darkness factor
      const darkAlpha = Math.floor(255 * nightBlend);
      // Multiply factors: lower = darker. Blue channel stays higher for tint
      darkPixels[idx] = Math.floor(255 * (1 - baseDark * 0.85)); // R darkened most
      darkPixels[idx + 1] = Math.floor(255 * (1 - baseDark * 0.8)); // G slightly less
      darkPixels[idx + 2] = Math.floor(255 * (1 - baseDark * 0.55)); // B preserved more
      darkPixels[idx + 3] = darkAlpha;

      // --- Blue atmosphere screen layer ---
      // Screen blend adds a subtle cold blue glow, stronger in deep night.
      // RGB channels define the hue (cold blue), alpha controls intensity.
      const blueIntensity = nightBlend * (0.06 + deepNight * 0.08);
      bluePixels[idx] = 15;
      bluePixels[idx + 1] = 25;
      bluePixels[idx + 2] = 60;
      bluePixels[idx + 3] = Math.floor(255 * blueIntensity);
    }
  }

  // Finalize overlay canvases
  desatCtx.putImageData(desatData, 0, 0);
  darkCtx.putImageData(darkData, 0, 0);
  blueCtx.putImageData(blueData, 0, 0);

  // Cache the three overlay canvases for reuse
  nightOverlayCache = {
    desatCanvas,
    darkCanvas,
    blueCanvas,
    minute: currentMinute,
    width,
    height,
  };

  // Composite Pass 1: Desaturation
  ctx.save();
  ctx.globalCompositeOperation = "saturation";
  ctx.drawImage(desatCanvas, 0, 0, width, height);
  ctx.restore();

  // Composite Pass 2: Darkening with blue tint
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(darkCanvas, 0, 0, width, height);
  ctx.restore();

  // Composite Pass 3: Blue atmosphere glow
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(blueCanvas, 0, 0, width, height);
  ctx.restore();
}

/**
 * Draw terminator line
 *
 * The terminator is the line where the sun angle is exactly 90°.
 * Formula derived from: 0 = sin(lat)*sin(subsolarLat) + cos(lat)*cos(subsolarLat)*cos(Δlon)
 * Solving for lat: lat = atan(-cos(Δlon) / tan(subsolarLat))
 */
function drawTerminator(
  ctx: CanvasRenderingContext2D,
  date: Date,
  width: number,
  height: number,
  highViz = false,
  dashed = false,
) {
  const subsolar = getSubsolarPoint(date);

  ctx.strokeStyle = COLORS.terminator;
  ctx.lineWidth = highViz ? 3 : 2;
  ctx.shadowColor = COLORS.terminator;
  ctx.shadowBlur = highViz ? 8 : 4;
  if (dashed) ctx.setLineDash([8, 4]);

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

    const { x, y } = latLonToCanvas(lat, lon, width, height);

    if (lon === -180) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.shadowBlur = 0;
  if (dashed) ctx.setLineDash([]);
}

/**
 * Draw greyline band (twilight zone around the terminator).
 * The greyline is the area within ±15° of the terminator where
 * enhanced propagation conditions exist.
 * Uses an offscreen canvas for pixel manipulation since getImageData/putImageData
 * bypass canvas transforms (DPR scaling, zoom).
 */
function drawGreyline(
  ctx: CanvasRenderingContext2D,
  date: Date,
  width: number,
  height: number,
  highViz = false,
) {
  const subsolar = getSubsolarPoint(date);

  // Create offscreen canvas for pixel manipulation
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) {
    return;
  }

  // Build greyline overlay with additive golden tint
  const imageData = offCtx.createImageData(width, height);
  const { data } = imageData;

  // High-viz mode increases golden tint intensity and alpha
  const tintMultiplier = highViz ? 1.5 : 1;
  const alphaMultiplier = highViz ? 255 : 200;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * 360 - 180;
      const lat = 90 - (y / height) * 180;

      // Calculate angular distance from subsolar point
      const phi1 = lat * (Math.PI / 180);
      const phi2 = subsolar.lat * (Math.PI / 180);
      const deltaLambda = (lon - subsolar.lon) * (Math.PI / 180);

      const cosAngle =
        Math.sin(phi1) * Math.sin(phi2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
      const angle =
        Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

      const idx = (y * width + x) * 4;

      // Greyline band: 75° to 105° from subsolar point (±15° from terminator)
      if (angle >= 75 && angle <= 105) {
        const distFromTerminator = Math.abs(angle - 90);
        const intensity = 1 - distFromTerminator / 15;

        // Golden/amber overlay
        data[idx] = Math.floor(60 * intensity * tintMultiplier);
        data[idx + 1] = Math.floor(40 * intensity * tintMultiplier);
        data[idx + 2] = 0;
        data[idx + 3] = Math.floor(alphaMultiplier * intensity);
      }
    }
  }

  offCtx.putImageData(imageData, 0, 0);

  // Composite with additive blending for golden glow
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(offscreen, 0, 0, width, height);
  ctx.restore();
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
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
  highViz = false,
) {
  const { x, y } = latLonToCanvas(lat, lon, width, height);

  // Outer glow
  ctx.fillStyle = color + "40";
  ctx.beginPath();
  ctx.arc(
    x,
    y,
    isHome ? (highViz ? 14 : 10) : highViz ? 18 : 14,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Inner dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, isHome ? (highViz ? 7 : 5) : highViz ? 10 : 7, 0, Math.PI * 2);
  ctx.fill();

  // Pulsing ring for target
  if (!isHome) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, highViz ? 16 : 12, 0, Math.PI * 2);
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

    ctx.font = highViz ? "bold 13px monospace" : "bold 11px monospace";
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
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
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
    const { x, y } = latLonToCanvas(point.lat, point.lon, width, height);

    // Handle wrap-around at date line
    if (lastX >= 0 && Math.abs(x - lastX) > width / 2) {
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
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
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
    const { x, y } = latLonToCanvas(coord.lat, coord.lon, width, height);
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
  width: number = MAP_WIDTH,
  height: number = MAP_HEIGHT,
) {
  // Create a temporary canvas for the MUF overlay
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) {
    return;
  }

  // Calculate MUF at lower resolution for performance, then scale up
  const resolution = 10; // degrees
  const cellWidth = width / (360 / resolution);
  const cellHeight = height / (180 / resolution);

  for (let lat = 90; lat >= -90; lat -= resolution) {
    for (let lon = -180; lon < 180; lon += resolution) {
      // Calculate MUF at center of cell
      const centerLat = lat - resolution / 2;
      const centerLon = lon + resolution / 2;
      const muf = estimateMUF(centerLat, centerLon, sfi, date);

      // Get color for this MUF value
      const { color } = getMUFColor(muf);

      // Calculate canvas position
      const { x, y } = latLonToCanvas(lat, lon, width, height);

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
function drawSpotArc(
  ctx: CanvasRenderingContext2D,
  spot: ResolvedSpot,
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
) {
  const color = getSpotColor(spot, colorMode);
  const opacity = getSpotAgeOpacity(spot.time);

  // Get start and end points
  const start = latLonToCanvas(spot.spotterLat, spot.spotterLon, width, height);
  const end = latLonToCanvas(spot.dxLat, spot.dxLon, width, height);

  // Calculate control point for bezier curve
  // The arc height is based on distance between points
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Handle wrap-around at date line
  let wrapAround = false;
  if (Math.abs(dx) > width / 2) {
    wrapAround = true;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = highViz ? 3 : 1.5;
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
      const { x, y } = latLonToCanvas(point.lat, point.lon, width, height);

      if (lastX >= 0 && Math.abs(x - lastX) > width / 2) {
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
  ctx.arc(start.x, start.y, highViz ? 5 : 3, 0, Math.PI * 2);
  ctx.fill();

  // DX location (larger)
  ctx.beginPath();
  ctx.arc(end.x, end.y, highViz ? 6 : 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw all spot arcs on the 2D map
 */
function drawSpotArcs(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
) {
  for (const spot of spots) {
    drawSpotArc(ctx, spot, width, height, colorMode, highViz);
  }
}

/**
 * Ease-out cubic easing function: 1 - (1 - t)^3
 * Provides smooth deceleration for animations.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Animation state for smooth zoom/pan transitions */
interface ZoomAnimation {
  startTime: number;
  startScale: number;
  targetScale: number;
  startOffsetX: number;
  startOffsetY: number;
  targetOffsetX: number;
  targetOffsetY: number;
  duration: number;
}

/**
 * Draw a compass rose at the home station QTH location.
 * Shows N/E/S/W cardinal directions and optionally a bearing line to the target.
 */
function drawCompassRose(
  ctx: CanvasRenderingContext2D,
  homeLat: number,
  homeLon: number,
  bearing: number | null,
  width: number,
  height: number,
) {
  const { x: cx, y: cy } = latLonToCanvas(homeLat, homeLon, width, height);
  const radius = 22;

  // Semi-transparent background circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 10, 26, 0.65)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw tick marks for cardinal directions
  const cardinals: Array<{ label: string; angle: number; isNorth: boolean }> = [
    { label: "N", angle: -Math.PI / 2, isNorth: true },
    { label: "E", angle: 0, isNorth: false },
    { label: "S", angle: Math.PI / 2, isNorth: false },
    { label: "W", angle: Math.PI, isNorth: false },
  ];

  for (const { label, angle, isNorth } of cardinals) {
    // Tick line from edge inward
    const outerR = radius - 2;
    const innerR = radius - 7;
    const ox = cx + Math.cos(angle) * outerR;
    const oy = cy + Math.sin(angle) * outerR;
    const ix = cx + Math.cos(angle) * innerR;
    const iy = cy + Math.sin(angle) * innerR;

    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ix, iy);
    ctx.strokeStyle = isNorth ? "#22D3EE" : "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = isNorth ? 2 : 1;
    ctx.stroke();

    // Cardinal direction label
    const labelR = radius - 12;
    const lx = cx + Math.cos(angle) * labelR;
    const ly = cy + Math.sin(angle) * labelR;

    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isNorth ? "#22D3EE" : "rgba(255, 255, 255, 0.85)";
    ctx.fillText(label, lx, ly);
  }

  // Draw bearing line to target if available
  if (bearing !== null) {
    // Convert bearing (0=N, clockwise) to canvas angle (0=E, clockwise)
    const bearingRad = (bearing - 90) * (Math.PI / 180);
    const lineEnd = radius - 3;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(bearingRad) * lineEnd,
      cy + Math.sin(bearingRad) * lineEnd,
    );
    ctx.strokeStyle = "#FF6B35";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();

    // Arrowhead at the end
    const arrowLen = 5;
    const arrowAngle = 0.4;
    const tipX = cx + Math.cos(bearingRad) * lineEnd;
    const tipY = cy + Math.sin(bearingRad) * lineEnd;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - Math.cos(bearingRad - arrowAngle) * arrowLen,
      tipY - Math.sin(bearingRad - arrowAngle) * arrowLen,
    );
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - Math.cos(bearingRad + arrowAngle) * arrowLen,
      tipY - Math.sin(bearingRad + arrowAngle) * arrowLen,
    );
    ctx.strokeStyle = "#FF6B35";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw pulsing concentric ring effect at the focused spot's position.
 * Uses sine-wave based expansion for smooth animation.
 */
function drawSpotHighlight(
  ctx: CanvasRenderingContext2D,
  lat: number,
  lon: number,
  width: number,
  height: number,
) {
  const { x, y } = latLonToCanvas(lat, lon, width, height);
  const now = Date.now();

  ctx.save();

  // Draw 3 concentric rings with staggered phase offsets
  for (let i = 0; i < 3; i++) {
    const phaseOffset = (i * Math.PI * 2) / 3;
    // Sine-wave expansion: radius oscillates over time
    const t = (now / 800 + phaseOffset) % (Math.PI * 2);
    const expansion = (Math.sin(t) + 1) / 2; // 0 to 1
    const ringRadius = 8 + expansion * 20;
    const opacity = 0.6 - i * 0.15 - expansion * 0.3;

    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 107, 53, ${Math.max(0.05, opacity)})`;
    ctx.lineWidth = 2 - i * 0.4;
    ctx.stroke();
  }

  // Central glow dot
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 107, 53, 0.8)";
  ctx.fill();

  ctx.restore();
}

/**
 * Simple bounding box for label overlap detection
 */
interface LabelBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function bboxOverlaps(a: LabelBBox, b: LabelBBox): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/**
 * Draw callsign labels near DX spot endpoint positions.
 * Includes simple overlap avoidance via bounding box checks.
 */
function drawCallsignLabels(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
) {
  const placedLabels: LabelBBox[] = [];
  const fontSize = highViz ? 12 : 10;
  ctx.save();
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "bottom";

  for (const spot of spots) {
    const { callsign } = spot;
    if (!callsign) {
      continue;
    }

    const { x, y } = latLonToCanvas(spot.dxLat, spot.dxLon, width, height);
    const textMetrics = ctx.measureText(callsign);
    const textW = textMetrics.width + 6; // padding
    const textH = fontSize + 4;

    // Position label above the spot endpoint
    const labelX = x - textW / 2;
    const labelY = y - 10 - textH;

    const bbox: LabelBBox = { x: labelX, y: labelY, w: textW, h: textH };

    // Skip if overlapping with an already-placed label
    if (placedLabels.some((existing) => bboxOverlaps(existing, bbox))) {
      continue;
    }
    placedLabels.push(bbox);

    const modeColor = getSpotColor(spot, colorMode);
    const opacity = getSpotAgeOpacity(spot.time);

    ctx.globalAlpha = opacity;

    // Background pill with mode color accent
    ctx.fillStyle = highViz
      ? "rgba(10, 10, 26, 0.9)"
      : "rgba(10, 10, 26, 0.75)";
    ctx.beginPath();
    const pillRadius = 3;
    // Rounded rect
    ctx.moveTo(labelX + pillRadius, labelY);
    ctx.lineTo(labelX + textW - pillRadius, labelY);
    ctx.arcTo(
      labelX + textW,
      labelY,
      labelX + textW,
      labelY + pillRadius,
      pillRadius,
    );
    ctx.lineTo(labelX + textW, labelY + textH - pillRadius);
    ctx.arcTo(
      labelX + textW,
      labelY + textH,
      labelX + textW - pillRadius,
      labelY + textH,
      pillRadius,
    );
    ctx.lineTo(labelX + pillRadius, labelY + textH);
    ctx.arcTo(
      labelX,
      labelY + textH,
      labelX,
      labelY + textH - pillRadius,
      pillRadius,
    );
    ctx.lineTo(labelX, labelY + pillRadius);
    ctx.arcTo(labelX, labelY, labelX + pillRadius, labelY, pillRadius);
    ctx.closePath();
    ctx.fill();

    // Mode color underline accent
    ctx.fillStyle = modeColor;
    ctx.fillRect(labelX + 2, labelY + textH - 2, textW - 4, 1.5);

    // Callsign text with shadow for readability
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.fillText(callsign, x, labelY + textH - 3);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw texture-based night lights (city lights on dark side).
 * Uses the NASA Black Marble style earth-night.jpg texture for realistic city lights.
 * The texture is equirectangular, matching the flat map projection 1:1.
 *
 * Processing pipeline:
 * 1. Draw the night texture onto an offscreen canvas at render dimensions
 * 2. Read pixel data and apply warm color tint (yellowish-orange glow)
 * 3. Mask to night-side pixels only with smooth twilight fade
 * 4. Composite with additive blending for glow effect
 *
 * Results are cached and only recalculated when time changes by >= 1 minute.
 */
function drawNightLights(
  ctx: CanvasRenderingContext2D,
  date: Date,
  width: number,
  height: number,
) {
  // Ensure texture is loaded (triggers async load on first call)
  const nightTexture = ensureNightTextureLoaded();
  if (!nightTexture) {
    return;
  }

  // Check cache: reuse if time hasn't changed by >= 1 minute and dimensions match
  const currentMinute = getTimeMinute(date);
  if (
    nightLightsCache &&
    nightLightsCache.minute === currentMinute &&
    nightLightsCache.width === width &&
    nightLightsCache.height === height
  ) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(nightLightsCache.canvas, 0, 0, width, height);
    ctx.restore();
    return;
  }

  const subsolar = getSubsolarPoint(date);

  // Precompute subsolar trig values
  const subsolarLatRad = subsolar.lat * (Math.PI / 180);
  const subsolarLonRad = subsolar.lon * (Math.PI / 180);
  const sinSubLat = Math.sin(subsolarLatRad);
  const cosSubLat = Math.cos(subsolarLatRad);

  // Precompute latitude trig values
  const latSin = new Float32Array(height);
  const latCos = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    const latRad = (90 - (y / height) * 180) * (Math.PI / 180);
    latSin[y] = Math.sin(latRad);
    latCos[y] = Math.cos(latRad);
  }

  // Precompute longitude delta cos values
  const lonDeltaCos = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const lonRad = ((x / width) * 360 - 180) * (Math.PI / 180);
    lonDeltaCos[x] = Math.cos(lonRad - subsolarLonRad);
  }

  // Draw the night texture onto an offscreen canvas at render dimensions
  const texCanvas = document.createElement("canvas");
  texCanvas.width = width;
  texCanvas.height = height;
  const texCtx = texCanvas.getContext("2d");
  if (!texCtx) {
    return;
  }

  texCtx.drawImage(nightTexture, 0, 0, width, height);
  const texData = texCtx.getImageData(0, 0, width, height);
  const texPixels = texData.data;

  // Create output canvas for the tinted, masked night lights
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) {
    return;
  }

  const outData = outCtx.createImageData(width, height);
  const outPixels = outData.data;

  // Warm color tint multipliers (yellowish-orange glow matching 3D globe shader)
  const warmR = 1.0;
  const warmG = 0.85;
  const warmB = 0.6;

  // Contrast power curve to boost city visibility (matching 3D globe: pow(brightness, 0.6) * 1.5)
  const contrastPower = 0.6;
  const brightnessBoost = 1.5;

  for (let y = 0; y < height; y++) {
    const sinLat = latSin[y];
    const cosLat = latCos[y];
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;

      // Read texture pixel brightness (max of RGB for city light intensity)
      const texR = texPixels[idx];
      const texG = texPixels[idx + 1];
      const texB = texPixels[idx + 2];
      const lightBrightness = Math.max(texR, texG, texB) / 255;

      // Skip very dark pixels (no city lights here)
      if (lightBrightness < 0.02) {
        continue;
      }

      // Solar angle for night masking
      const cosAngle = sinLat * sinSubLat + cosLat * cosSubLat * lonDeltaCos[x];
      const angle =
        Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

      // Only show lights on night side: fade in during twilight (85-95 degrees)
      if (angle <= 85) {
        continue;
      }

      let nightFade: number;
      if (angle >= 95) {
        nightFade = 1.0;
      } else {
        // Smooth fade-in during twilight
        const t = (angle - 85) / 10;
        nightFade = t * t * (3 - 2 * t);
      }

      // Apply contrast boost (power curve + brightness multiplier)
      const boosted = Math.min(
        1.0,
        Math.pow(lightBrightness, contrastPower) * brightnessBoost,
      );

      // Apply warm color tint
      outPixels[idx] = Math.min(255, Math.floor(boosted * warmR * 255));
      outPixels[idx + 1] = Math.min(255, Math.floor(boosted * warmG * 255));
      outPixels[idx + 2] = Math.min(255, Math.floor(boosted * warmB * 255));
      outPixels[idx + 3] = Math.floor(boosted * nightFade * 255);
    }
  }

  outCtx.putImageData(outData, 0, 0);

  // Cache the result
  nightLightsCache = {
    canvas: outCanvas,
    minute: currentMinute,
    width,
    height,
  };

  // Composite with additive blending so lights glow on top of the darkened base
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(outCanvas, 0, 0, width, height);
  ctx.restore();
}

// City labels for 2D map
const CITY_LABELS_2D = [
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
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Beijing", lat: 39.9042, lon: 116.4074 },
  { name: "Mumbai", lat: 19.076, lon: 72.8777 },
  { name: "Toronto", lat: 43.6532, lon: -79.3832 },
  { name: "Berlin", lat: 52.52, lon: 13.405 },
  { name: "Seoul", lat: 37.5665, lon: 126.978 },
  { name: "Mexico City", lat: 19.4326, lon: -99.1332 },
  { name: "Cape Town", lat: -33.9249, lon: 18.4241 },
  { name: "Buenos Aires", lat: -34.6037, lon: -58.3816 },
  { name: "Bangkok", lat: 13.7563, lon: 100.5018 },
];

// Area threshold — only render country name labels for countries above this size
const LABEL_AREA_THRESHOLD = 100_000; // km²

/**
 * Draw labels (country borders from WORLD_COUNTRIES data and city/country names)
 */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: LabelOptions,
) {
  // Draw country border polygons
  if (opts.borders) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 0.8;
    for (const country of WORLD_COUNTRIES) {
      for (const ring of country.borders) {
        if (ring.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [lat, lon] = ring[i];
          const { x, y } = latLonToCanvas(lat, lon, width, height);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  // Draw country name labels
  if (opts.countryNames) {
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const country of WORLD_COUNTRIES) {
      if (country.area < LABEL_AREA_THRESHOLD) continue;
      const { x, y } = latLonToCanvas(
        country.centroidLat,
        country.centroidLon,
        width,
        height,
      );
      ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
      ctx.lineWidth = 2;
      ctx.strokeText(country.name, x, y);
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fillText(country.name, x, y);
    }
  }

  // Draw city labels
  if (opts.cities) {
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const city of CITY_LABELS_2D) {
      const { x, y } = latLonToCanvas(city.lat, city.lon, width, height);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 3;
      ctx.strokeText(city.name, x, y - 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillText(city.name, x, y - 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw Maidenhead grid
  if (opts.maidenheadGrid) {
    ctx.save();
    ctx.strokeStyle = "rgba(0, 204, 204, 0.25)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    for (const lon of MAIDENHEAD_LON_LINES) {
      const { x } = latLonToCanvas(0, lon, width, height);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (const lat of MAIDENHEAD_LAT_LINES) {
      const { y } = latLonToCanvas(lat, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fields = getMaidenheadFields();
    for (const field of fields) {
      const { x, y } = latLonToCanvas(
        field.latCenter,
        field.lonCenter,
        width,
        height,
      );
      ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeText(field.label, x, y);
      ctx.fillStyle = "rgba(0, 204, 204, 0.5)";
      ctx.fillText(field.label, x, y);
    }
    ctx.restore();
  }
}

/**
 * Draw a pin marker on the 2D map
 */
function drawPin(
  ctx: CanvasRenderingContext2D,
  lat: number,
  lon: number,
  icon: string,
  color: string,
  name: string | undefined,
  isHovered: boolean,
  width: number,
  height: number,
) {
  const { x, y } = latLonToCanvas(lat, lon, width, height);

  // Outer glow (larger when hovered)
  const glowRadius = isHovered ? 10 : 7;
  ctx.fillStyle = color + "30";
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Inner filled circle
  const innerRadius = isHovered ? 5 : 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
  ctx.fill();

  // Border ring
  ctx.strokeStyle = isHovered ? "#fff" : color;
  ctx.lineWidth = isHovered ? 2 : 1;
  ctx.beginPath();
  ctx.arc(x, y, innerRadius + 1, 0, Math.PI * 2);
  ctx.stroke();

  // Icon above
  ctx.font = isHovered ? "14px sans-serif" : "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(icon, x, y - 12);

  // Name label below (if present)
  if (name) {
    ctx.save();
    ctx.font = "bold 9px -apple-system, sans-serif";
    ctx.textAlign = "center";
    const metrics = ctx.measureText(name);
    const labelY = y + glowRadius + 10;

    // Background pill
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    const pad = 3;
    const lw = metrics.width + pad * 2;
    const lh = 12;
    ctx.beginPath();
    ctx.roundRect(x - lw / 2, labelY - lh + 2, lw, lh, 3);
    ctx.fill();

    // Text
    ctx.fillStyle = isHovered ? "#fff" : "rgba(255, 255, 255, 0.8)";
    ctx.fillText(name, x, labelY);
    ctx.restore();
  }
}

// Re-use shared zoom state type
import type { FlatMapZoomState } from "@/types/map";

export function FlatMapView({
  displayTime,
  onLocationClick,
}: FlatMapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  // Grayscale variant of the map image for standard mode (computed once from mapImage)
  const grayscaleImage = useMemo(() => {
    if (!mapImage) return null;
    const offscreen = document.createElement("canvas");
    offscreen.width = mapImage.naturalWidth;
    offscreen.height = mapImage.naturalHeight;
    const octx = offscreen.getContext("2d");
    if (!octx) return null;
    octx.filter = "grayscale(1) contrast(1.1) brightness(1.05)";
    octx.drawImage(mapImage, 0, 0);
    return offscreen;
  }, [mapImage]);

  const [displaySize, setDisplaySize] = useState({
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
  });
  const [zoom, setZoom] = useState<FlatMapZoomState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  // Zoom animation ref for smooth transitions
  const zoomAnimationRef = useRef<ZoomAnimation | null>(null);
  const zoomRafRef = useRef<number>(0);

  // Always-current zoom ref for animations that bypass React state
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Spot highlight overlay canvas (avoids full canvas re-render at 60fps)
  const highlightCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Spot highlight animation ref
  const spotHighlightRafRef = useRef<number>(0);

  // Track previous preset ID for detecting changes
  const prevPresetIdRef = useRef<string | null>(null);

  const {
    layers,
    labelOptions,
    mapStyle,
    target,
    tooltipPosition,
    setTooltipPosition,
    flyoutPosition,
    setFlyoutPosition,
    setTarget,
    setCenterLocation,
  } = useMapStore();
  const centerLocation = useMapStore((s) => s.centerLocation);
  const clearCenterLocation = useMapStore((s) => s.clearCenterLocation);
  const activePresetId = useMapStore((s) => s.activePresetId);
  const regionPresets = useMapStore((s) => s.regionPresets);
  const { station, preferences } = useUserStore();
  const { data: auroraData } = useAuroraData();
  const currentSFI = useCurrentSFI();
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();

  // Spot focus for pulsing ring effect
  const { isFocusing, focusedSpot } = useSpotFocus();

  // User preferences for compass rose and callsign labels
  const compassRoseEnabled = preferences?.compassRose?.enabled ?? false;
  const showCallsignLabels =
    preferences?.uiInteraction?.showSpotCallsignLabels ?? true;
  const spotColorMode: SpotColorMode =
    preferences?.uiInteraction?.spotColorMode ?? "mode";
  const highViz = preferences?.uiInteraction?.visualStyle === "high-viz";

  // Pin store
  const { addPin } = usePinStore();
  const pins = usePinStore((state) => state.pins);

  // DX stores
  const { updateFilter } = useDXStore();
  const { allSpots } = useDXCluster();

  // Watch store
  const addWatch = useWatchStore((state) => state.addWatch);
  const checkForActivity = useWatchStore((state) => state.checkForActivity);

  // State for AddPinDialog
  const [addPinDialogOpen, setAddPinDialogOpen] = useState(false);
  const [addPinData, setAddPinData] = useState<{
    lat: number;
    lon: number;
    grid: string;
  } | null>(null);
  const [editingPin, setEditingPin] = useState<MapPin | null>(null);

  // State for pin hover flyout
  const [hoveredPinData, setHoveredPinData] = useState<{
    pin: MapPin;
    screenPos: { x: number; y: number };
  } | null>(null);

  // State for target hover tooltip (selected target marker)
  const [hoveredTargetPos, setHoveredTargetPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // State for GridResearchPanel
  const [researchPanelOpen, setResearchPanelOpen] = useState(false);
  const [researchGrid, setResearchGrid] = useState<string | null>(null);

  // State for WatchListPanel
  const [watchListOpen, setWatchListOpen] = useState(false);

  // Fetch live spots when spots layer is enabled
  const { spots } = useLiveSpots({
    grid: station?.grid,
    enabled: layers.spots,
    refetchInterval: 60000,
  });

  // Resolve spot locations and limit to 50 for performance
  const resolvedSpots = useMemo(() => {
    if (!layers.spots) {
      return [];
    }
    return resolveSpotLocations(spots).slice(0, 50);
  }, [spots, layers.spots]);

  // Calculate path metrics for target marker display
  const pathMetrics = useMemo(() => {
    if (!station || !target) {
      return null;
    }
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
  }, [station, target]);

  // Extract difficulty for convenience
  const pathDifficulty = pathMetrics?.difficulty;

  // Get target marker color based on difficulty
  const targetMarkerColor = pathDifficulty
    ? getDifficultyColor(pathDifficulty)
    : COLORS.targetMarker;

  const currentKp = useMemo(() => {
    const last = kIndexQuery.data?.[kIndexQuery.data.length - 1];
    return last?.kp_index ?? 3;
  }, [kIndexQuery.data]);

  const currentSfi = useMemo(() => {
    const last = solarFluxQuery.data?.[solarFluxQuery.data.length - 1];
    return last?.flux ?? 100;
  }, [solarFluxQuery.data]);

  const isEstimatedConditions =
    kIndexQuery.isPlaceholderData ||
    solarFluxQuery.isPlaceholderData ||
    !kIndexQuery.data?.length ||
    !solarFluxQuery.data?.length;

  const optimalSignal = useMemo(() => {
    if (!station || !target) {
      return null;
    }
    try {
      const conditions = getEnhancedBandConditions(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        currentKp,
        currentSfi,
        displayTime,
        100,
        "FT8",
      );
      const best = pickOptimalBandCondition(conditions);
      if (!best) {
        return null;
      }
      return {
        band: best.band,
        status: best.status,
        sUnit: best.sUnit,
        snrEstimate: best.snrEstimate,
        confidence: best.signalPrediction?.confidence,
        notes: best.notes,
        isEstimated: isEstimatedConditions,
      };
    } catch {
      return null;
    }
  }, [
    station,
    target,
    currentKp,
    currentSfi,
    displayTime,
    isEstimatedConditions,
  ]);

  // Check watch activity when spots change
  useEffect(() => {
    if (allSpots.length > 0) {
      checkForActivity(allSpots);
    }
  }, [allSpots, checkForActivity]);

  // Get spots in the hovered grid for tooltip
  // Matches if either DX or spotter grid starts with the hovered 4-char prefix
  const tooltipSpots = useMemo(() => {
    if (!tooltipPosition?.grid) {
      return [];
    }
    const gridPrefix = tooltipPosition.grid.toUpperCase().slice(0, 4);
    return allSpots.filter((spot) => {
      const dxGrid = (spot.dxGrid || "").toUpperCase();
      const spotterGrid = (spot.spotterGrid || "").toUpperCase();
      return (
        dxGrid.startsWith(gridPrefix) || spotterGrid.startsWith(gridPrefix)
      );
    });
  }, [tooltipPosition?.grid, allSpots]);

  // Handle map click - show flyout
  const handleMapClick = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      const grid = latLonToGrid(lat, lon);
      setFlyoutPosition({ x: screenPos.x, y: screenPos.y, lat, lon, grid });
      setTooltipPosition(null); // Hide tooltip when flyout opens
      setHoveredTargetPos(null);
      onLocationClick?.(lat, lon);
    },
    [setFlyoutPosition, setTooltipPosition, onLocationClick],
  );

  // Handle double-click - center view without setting target
  const handleDoubleClick = useCallback(
    (lat: number, lon: number) => {
      // Close any open flyout/tooltip
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setHoveredTargetPos(null);
      // Center the view on this location
      setCenterLocation(lat, lon);
    },
    [setFlyoutPosition, setTooltipPosition, setCenterLocation],
  );

  // Pin hit-testing: check if screen position is near any pin
  const findPinAtScreenPos = useCallback(
    (screenPos: { x: number; y: number }): MapPin | null => {
      const canvas = canvasRef.current;
      if (!canvas || pins.length === 0) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      const z = zoomRef.current;

      for (const pin of pins) {
        const cp = latLonToCanvas(
          pin.lat,
          pin.lon,
          displaySize.width,
          displaySize.height,
        );
        const sx = rect.left + cp.x * z.scale + z.offsetX;
        const sy = rect.top + cp.y * z.scale + z.offsetY;
        const dx = screenPos.x - sx;
        const dy = screenPos.y - sy;
        if (dx * dx + dy * dy < PIN_HIT_RADIUS_SQ) {
          return pin;
        }
      }
      return null;
    },
    [pins, displaySize],
  );

  // Target hit-testing: check if screen position is near the selected target
  const isTargetAtScreenPos = useCallback(
    (screenPos: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas || !target) {
        return false;
      }
      const rect = canvas.getBoundingClientRect();
      const z = zoomRef.current;

      const cp = latLonToCanvas(
        target.lat,
        target.lon,
        displaySize.width,
        displaySize.height,
      );
      const sx = rect.left + cp.x * z.scale + z.offsetX;
      const sy = rect.top + cp.y * z.scale + z.offsetY;
      const dx = screenPos.x - sx;
      const dy = screenPos.y - sy;
      return dx * dx + dy * dy < TARGET_HIT_RADIUS_SQ;
    },
    [target, displaySize],
  );

  // Handle map hover - show tooltip or pin flyout
  const handleMapHover = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      // Check pin proximity first
      const hitPin = findPinAtScreenPos(screenPos);
      if (hitPin) {
        setHoveredPinData({ pin: hitPin, screenPos });
        setTooltipPosition(null);
        setHoveredTargetPos(null);
        return;
      }
      // Clear pin hover if we moved away from a pin
      if (hoveredPinData) {
        setHoveredPinData(null);
      }

      // Don't show tooltip if flyout is open
      if (flyoutPosition) {
        return;
      }

      // Selected target hover takes precedence over grid tooltip
      if (isTargetAtScreenPos(screenPos)) {
        setHoveredTargetPos(screenPos);
        setTooltipPosition(null);
        return;
      }
      if (hoveredTargetPos) {
        setHoveredTargetPos(null);
      }

      const grid = latLonToGrid(lat, lon);
      setTooltipPosition({ x: screenPos.x, y: screenPos.y, grid });
    },
    [
      flyoutPosition,
      setTooltipPosition,
      findPinAtScreenPos,
      hoveredPinData,
      isTargetAtScreenPos,
      hoveredTargetPos,
    ],
  );

  // Handle hover end
  const handleHoverEnd = useCallback(() => {
    setTooltipPosition(null);
    setHoveredPinData(null);
    setHoveredTargetPos(null);
  }, [setTooltipPosition]);

  // Handle flyout close
  const handleFlyoutClose = useCallback(() => {
    setFlyoutPosition(null);
  }, [setFlyoutPosition]);

  // Handle pin flyout close (auto-dismiss handles most cases)
  const handlePinFlyoutClose = useCallback(() => {
    setHoveredPinData(null);
  }, []);

  // Handle edit pin from PinFlyout
  const handleEditPinFromFlyout = useCallback((pin: MapPin) => {
    setEditingPin(pin);
    setAddPinDialogOpen(true);
    setAddPinData({ lat: pin.lat, lon: pin.lon, grid: pin.grid });
    setHoveredPinData(null);
  }, []);

  // Handle set target from PinFlyout
  const handleSetTargetFromFlyout = useCallback(
    (lat: number, lon: number, grid: string) => {
      setTarget({ lat, lon, grid });
      setHoveredPinData(null);
    },
    [setTarget],
  );

  // Handle opening AddPinDialog from flyout
  const handleOpenAddPinDialog = useCallback(
    (lat: number, lon: number, grid: string) => {
      setAddPinData({ lat, lon, grid });
      setAddPinDialogOpen(true);
      setFlyoutPosition(null);
    },
    [setFlyoutPosition],
  );

  // Handle opening GridResearchPanel from flyout
  const handleOpenResearchPanel = useCallback(
    (grid: string) => {
      setResearchGrid(grid);
      setResearchPanelOpen(true);
      setFlyoutPosition(null);
    },
    [setFlyoutPosition],
  );

  // Handle adding a grid to watch list
  const handleWatchGrid = useCallback(
    (grid: string) => {
      // Watch the 4-char grid prefix for broader matching
      const gridPrefix = grid.slice(0, 4).toUpperCase();
      addWatch("grid", gridPrefix);
      setFlyoutPosition(null);
    },
    [addWatch, setFlyoutPosition],
  );

  // Handle GridResearchPanel actions
  const handleResearchAction = useCallback(
    (action: GridResearchAction, grid: string) => {
      switch (action) {
        case "watch":
          handleWatchGrid(grid);
          break;
        case "pin": {
          // Need to compute lat/lon from grid
          try {
            const { lat, lon } = gridToLatLon(grid);
            handleOpenAddPinDialog(lat, lon, grid);
          } catch {
            // Grid conversion failed, ignore
          }
          break;
        }
        case "setTarget": {
          try {
            const { lat, lon } = gridToLatLon(grid);
            setTarget({ lat, lon, grid });
            setResearchPanelOpen(false);
          } catch {
            // Grid conversion failed, ignore
          }
          break;
        }
        case "close":
          setResearchPanelOpen(false);
          break;
      }
    },
    [handleWatchGrid, handleOpenAddPinDialog, setTarget],
  );

  // Handle flyout actions (fallback for unhandled actions)
  const handleFlyoutAction = useCallback(
    (action: MapFlyoutAction) => {
      if (!flyoutPosition) {
        return;
      }

      switch (action) {
        case "setTarget":
          setTarget({
            lat: flyoutPosition.lat,
            lon: flyoutPosition.lon,
            grid: flyoutPosition.grid,
          });
          break;
        case "addPin":
          // Fallback to simple add (dialog callback should handle this)
          addPin(flyoutPosition.lat, flyoutPosition.lon, flyoutPosition.grid);
          break;
        case "researchGrid":
          // Fallback to filter (panel callback should handle this)
          updateFilter("gridFilter", flyoutPosition.grid);
          break;
        case "watchGrid":
          // Fallback - should be handled by callback
          handleWatchGrid(flyoutPosition.grid);
          break;
      }
    },
    [flyoutPosition, setTarget, addPin, updateFilter, handleWatchGrid],
  );

  // Clamp zoom offsets to prevent panning beyond map bounds
  const clampOffsets = useCallback(
    (scale: number, offX: number, offY: number) => {
      const maxOffsetX = displaySize.width * (scale - 1);
      const maxOffsetY = displaySize.height * (scale - 1);
      return {
        offsetX: Math.max(-maxOffsetX, Math.min(0, offX)),
        offsetY: Math.max(-maxOffsetY, Math.min(0, offY)),
      };
    },
    [displaySize],
  );

  // Smooth zoom animation loop driven by requestAnimationFrame
  const runZoomAnimation = useCallback(() => {
    const anim = zoomAnimationRef.current;
    if (!anim) {
      return;
    }

    const elapsed = performance.now() - anim.startTime;
    const t = Math.min(1, elapsed / anim.duration);
    const eased = easeOutCubic(t);

    const currentScale =
      anim.startScale + (anim.targetScale - anim.startScale) * eased;
    const currentOffsetX =
      anim.startOffsetX + (anim.targetOffsetX - anim.startOffsetX) * eased;
    const currentOffsetY =
      anim.startOffsetY + (anim.targetOffsetY - anim.startOffsetY) * eased;

    const clamped = clampOffsets(currentScale, currentOffsetX, currentOffsetY);

    setZoom({
      scale: currentScale,
      offsetX: clamped.offsetX,
      offsetY: clamped.offsetY,
    });

    if (t < 1) {
      zoomRafRef.current = requestAnimationFrame(runZoomAnimation);
    } else {
      zoomAnimationRef.current = null;
    }
  }, [clampOffsets]);

  // Handle scroll wheel zoom with smooth 300ms animation
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

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

      // Cancel any in-progress animation
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }

      // Compute current visual zoom position and base for target computation
      const currentAnim = zoomAnimationRef.current;
      let visualScale: number;
      let visualOffsetX: number;
      let visualOffsetY: number;
      let baseScale: number;
      let baseOffsetX: number;
      let baseOffsetY: number;

      if (currentAnim) {
        // Interpolate where the animation currently IS (for smooth start)
        const elapsed = performance.now() - currentAnim.startTime;
        const t = Math.min(1, elapsed / currentAnim.duration);
        const eased = easeOutCubic(t);
        visualScale =
          currentAnim.startScale +
          (currentAnim.targetScale - currentAnim.startScale) * eased;
        visualOffsetX =
          currentAnim.startOffsetX +
          (currentAnim.targetOffsetX - currentAnim.startOffsetX) * eased;
        visualOffsetY =
          currentAnim.startOffsetY +
          (currentAnim.targetOffsetY - currentAnim.startOffsetY) * eased;
        // Compound zoom deltas from animation target
        baseScale = currentAnim.targetScale;
        baseOffsetX = currentAnim.targetOffsetX;
        baseOffsetY = currentAnim.targetOffsetY;
      } else {
        const z = zoomRef.current;
        visualScale = z.scale;
        visualOffsetX = z.offsetX;
        visualOffsetY = z.offsetY;
        baseScale = z.scale;
        baseOffsetX = z.offsetX;
        baseOffsetY = z.offsetY;
      }

      const targetScale = Math.max(0.5, Math.min(4, baseScale * delta));

      // Calculate new offset to zoom toward mouse position
      const scaleFactor = targetScale / baseScale;
      const targetOffsetX =
        canvasMouseX - (canvasMouseX - baseOffsetX) * scaleFactor;
      const targetOffsetY =
        canvasMouseY - (canvasMouseY - baseOffsetY) * scaleFactor;

      const clamped = clampOffsets(targetScale, targetOffsetX, targetOffsetY);

      zoomAnimationRef.current = {
        startTime: performance.now(),
        startScale: visualScale,
        targetScale,
        startOffsetX: visualOffsetX,
        startOffsetY: visualOffsetY,
        targetOffsetX: clamped.offsetX,
        targetOffsetY: clamped.offsetY,
        duration: 300,
      };

      zoomRafRef.current = requestAnimationFrame(runZoomAnimation);
    },
    [clampOffsets, runZoomAnimation],
  );

  // Attach wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

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

  // Pre-load night lights texture (module-level singleton, loaded once)
  useEffect(() => {
    ensureNightTextureLoaded();
  }, []);

  // Observe container resize for responsive display (debounced via rAF)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let rafId = 0;
    const updateSize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const containerWidth = Math.max(300, Math.floor(rect.width));
        const containerHeight = Math.max(150, Math.floor(rect.height));
        // Fit the 2:1 map within both width AND height constraints
        const width = Math.min(containerWidth, Math.floor(containerHeight * 2));
        const height = Math.floor(width / 2);
        setDisplaySize({ width, height });
      });
    };

    // Initial synchronous size read
    const rect = container.getBoundingClientRect();
    const containerWidth = Math.max(300, Math.floor(rect.width));
    const containerHeight = Math.max(150, Math.floor(rect.height));
    // Fit the 2:1 map within both width AND height constraints
    const initWidth = Math.min(containerWidth, Math.floor(containerHeight * 2));
    const initHeight = Math.floor(initWidth / 2);
    setDisplaySize({ width: initWidth, height: initHeight });

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  // Smooth pan-to-preset animation (500ms ease-out)
  // When activePresetId changes, animate from current zoom to the preset view
  useEffect(() => {
    if (activePresetId === prevPresetIdRef.current) {
      return;
    }
    prevPresetIdRef.current = activePresetId;

    if (!activePresetId) {
      return;
    }

    const preset = regionPresets.find((p) => p.id === activePresetId);
    if (!preset) {
      return;
    }

    // Convert preset center lat/lon to map-space pixel position (equirectangular projection)
    const mapX = ((preset.center.lon + 180) / 360) * displaySize.width;
    const mapY = ((90 - preset.center.lat) / 180) * displaySize.height;

    // Calculate offset to center the preset point in the viewport at the target scale
    const targetScale = Math.max(0.5, Math.min(4, preset.zoom));
    const targetOffsetX = displaySize.width / 2 - mapX * targetScale;
    const targetOffsetY = displaySize.height / 2 - mapY * targetScale;

    const clamped = clampOffsets(targetScale, targetOffsetX, targetOffsetY);

    // Cancel any existing zoom animation
    if (zoomRafRef.current) {
      cancelAnimationFrame(zoomRafRef.current);
    }

    const z = zoomRef.current;
    zoomAnimationRef.current = {
      startTime: performance.now(),
      startScale: z.scale,
      targetScale,
      startOffsetX: z.offsetX,
      startOffsetY: z.offsetY,
      targetOffsetX: clamped.offsetX,
      targetOffsetY: clamped.offsetY,
      duration: 500,
    };

    zoomRafRef.current = requestAnimationFrame(runZoomAnimation);
  }, [
    activePresetId,
    regionPresets,
    displaySize,
    clampOffsets,
    runZoomAnimation,
  ]);

  // Double-click centering animation (500ms ease-out)
  // When centerLocation changes, animate to center that lat/lon in the viewport
  useEffect(() => {
    if (!centerLocation) {
      return;
    }

    // Convert lat/lon to map-space pixel position (equirectangular projection)
    const mapX = ((centerLocation.lon + 180) / 360) * displaySize.width;
    const mapY = ((90 - centerLocation.lat) / 180) * displaySize.height;

    // Use current zoom scale (or bump to 2x if at 1x for a meaningful center)
    const z = zoomRef.current;
    const targetScale = Math.max(2, z.scale);

    // Calculate offset to center the target point in the viewport
    const targetOffsetX = displaySize.width / 2 - mapX * targetScale;
    const targetOffsetY = displaySize.height / 2 - mapY * targetScale;

    const clamped = clampOffsets(targetScale, targetOffsetX, targetOffsetY);

    // Cancel any existing zoom animation
    if (zoomRafRef.current) {
      cancelAnimationFrame(zoomRafRef.current);
    }

    zoomAnimationRef.current = {
      startTime: performance.now(),
      startScale: z.scale,
      targetScale,
      startOffsetX: z.offsetX,
      startOffsetY: z.offsetY,
      targetOffsetX: clamped.offsetX,
      targetOffsetY: clamped.offsetY,
      duration: 500,
    };

    zoomRafRef.current = requestAnimationFrame(runZoomAnimation);

    // Clear the center location after processing so the same location can be re-centered
    clearCenterLocation();
  }, [
    centerLocation,
    displaySize,
    clampOffsets,
    runZoomAnimation,
    clearCenterLocation,
  ]);

  // Spot highlight pulsing ring animation via overlay canvas
  // Draws directly to a transparent overlay canvas at 60fps without triggering React re-renders
  useEffect(() => {
    if (
      !isFocusing ||
      focusedSpot?.dxLat == null ||
      focusedSpot?.dxLon == null
    ) {
      // Clear overlay canvas when not focusing
      const hCanvas = highlightCanvasRef.current;
      if (hCanvas) {
        const hCtx = hCanvas.getContext("2d");
        if (hCtx) {
          hCtx.clearRect(0, 0, hCanvas.width, hCanvas.height);
        }
      }
      if (spotHighlightRafRef.current) {
        cancelAnimationFrame(spotHighlightRafRef.current);
        spotHighlightRafRef.current = 0;
      }
      return;
    }

    const { dxLat } = focusedSpot;
    const { dxLon } = focusedSpot;
    let running = true;

    const animate = () => {
      if (!running) {
        return;
      }
      const hCanvas = highlightCanvasRef.current;
      if (!hCanvas) {
        spotHighlightRafRef.current = requestAnimationFrame(animate);
        return;
      }
      const hCtx = hCanvas.getContext("2d");
      if (!hCtx) {
        spotHighlightRafRef.current = requestAnimationFrame(animate);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const { width: rw, height: rh } = displaySize;

      // Match main canvas buffer size
      if (hCanvas.width !== rw * dpr || hCanvas.height !== rh * dpr) {
        hCanvas.width = rw * dpr;
        hCanvas.height = rh * dpr;
      }

      hCtx.clearRect(0, 0, hCanvas.width, hCanvas.height);
      hCtx.save();
      hCtx.scale(dpr, dpr);

      // Apply same zoom transform as main canvas
      const z = zoomRef.current;
      hCtx.translate(z.offsetX, z.offsetY);
      hCtx.scale(z.scale, z.scale);

      drawSpotHighlight(hCtx, dxLat, dxLon, rw, rh);

      hCtx.restore();
      spotHighlightRafRef.current = requestAnimationFrame(animate);
    };

    spotHighlightRafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      if (spotHighlightRafRef.current) {
        cancelAnimationFrame(spotHighlightRafRef.current);
        spotHighlightRafRef.current = 0;
      }
    };
  }, [isFocusing, focusedSpot?.dxLat, focusedSpot?.dxLon, displaySize]);

  // Cleanup animation refs on unmount
  useEffect(() => {
    return () => {
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
      }
      if (spotHighlightRafRef.current) {
        cancelAnimationFrame(spotHighlightRafRef.current);
      }
    };
  }, []);

  // Integrate gesture-based interaction (press-and-hold, double-click, hover)
  useFlatMapClickHandler({
    canvasRef,
    zoom,
    displaySize,
    onLocationClick: handleMapClick,
    onDoubleClick: handleDoubleClick,
    onLocationHover: handleMapHover,
    onHoverEnd: handleHoverEnd,
    holdDurationMs: 500,
  });

  // Render map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapImage) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const renderWidth = displaySize.width;
    const renderHeight = displaySize.height;

    // Set canvas buffer size (accounting for DPR) - only resize when dimensions change
    const bufferWidth = renderWidth * dpr;
    const bufferHeight = renderHeight * dpr;
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }

    // Clear canvas before drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale context for DPR
    ctx.save();
    ctx.scale(dpr, dpr);

    // Apply zoom transform
    ctx.save();
    ctx.translate(zoom.offsetX, zoom.offsetY);
    ctx.scale(zoom.scale, zoom.scale);

    // Draw base map image (grayscale variant in standard mode)
    const baseImage =
      mapStyle === "standard" && grayscaleImage ? grayscaleImage : mapImage;
    ctx.drawImage(baseImage, 0, 0, renderWidth, renderHeight);

    // Draw MUF overlay (before night side so it's properly darkened)
    if (layers.muf && currentSFI) {
      drawMUF(ctx, currentSFI, displayTime, 0.45, renderWidth, renderHeight);
    }

    // Draw night side and terminator
    if (layers.terminator) {
      drawNightSide(ctx, displayTime, renderWidth, renderHeight);
      drawTerminator(
        ctx,
        displayTime,
        renderWidth,
        renderHeight,
        highViz,
        mapStyle === "standard",
      );
    }

    // Draw greyline band (twilight zone with enhanced propagation)
    if (layers.greyline) {
      drawGreyline(ctx, displayTime, renderWidth, renderHeight, highViz);
    }

    // Draw aurora overlay
    if (layers.aurora && auroraData) {
      drawAurora(ctx, auroraData, 10, renderWidth, renderHeight);
    }

    // Draw night lights (city lights on dark side)
    if (layers.nightLights) {
      drawNightLights(ctx, displayTime, renderWidth, renderHeight);
    }

    // Draw grid
    drawGrid(ctx, renderWidth, renderHeight, highViz);

    // Draw labels (country borders, names, cities, Maidenhead grid)
    if (layers.labels) {
      drawLabels(ctx, renderWidth, renderHeight, labelOptions);
    }

    // Draw live spot arcs
    if (layers.spots && resolvedSpots.length > 0) {
      drawSpotArcs(
        ctx,
        resolvedSpots,
        renderWidth,
        renderHeight,
        spotColorMode,
        highViz,
      );
    }

    // Draw callsign labels at DX spot positions (after arcs, before markers)
    if (showCallsignLabels && layers.spots && resolvedSpots.length > 0) {
      drawCallsignLabels(
        ctx,
        resolvedSpots,
        renderWidth,
        renderHeight,
        spotColorMode,
        highViz,
      );
    }

    // Spot highlight pulsing rings are drawn on a separate overlay canvas
    // (see highlightCanvasRef) to avoid forcing full canvas re-renders at 60fps

    // Draw path if both home and target exist (use difficulty color)
    if (station && target) {
      drawPath(
        ctx,
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        targetMarkerColor,
        renderWidth,
        renderHeight,
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
        undefined,
        undefined,
        renderWidth,
        renderHeight,
        highViz,
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
        renderWidth,
        renderHeight,
        highViz,
      );
    }

    // Draw pinned locations
    if (pins.length > 0) {
      for (const pin of pins) {
        const catMeta = getCategoryMeta(pin.category);
        drawPin(
          ctx,
          pin.lat,
          pin.lon,
          catMeta.icon,
          pin.color || catMeta.color,
          pin.name || pin.grid,
          hoveredPinData?.pin.id === pin.id,
          renderWidth,
          renderHeight,
        );
      }
    }

    // Draw compass rose at home station QTH (after markers, on top)
    if (compassRoseEnabled && station) {
      const compassBearing = pathMetrics?.shortPath.bearing ?? null;
      drawCompassRose(
        ctx,
        station.lat,
        station.lon,
        compassBearing,
        renderWidth,
        renderHeight,
      );
    }

    // Restore context after zoom transform
    ctx.restore();

    // Restore DPR context
    ctx.restore();
  }, [
    displayTime,
    layers,
    labelOptions,
    station,
    target,
    mapImage,
    auroraData,
    currentSFI,
    resolvedSpots,
    targetMarkerColor,
    pathDifficulty,
    pathMetrics,
    pins,
    hoveredPinData,
    zoom,
    displaySize,
    compassRoseEnabled,
    showCallsignLabels,
    spotColorMode,
    highViz,
    mapStyle,
    grayscaleImage,
  ]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative flex items-center justify-center"
    >
      {!mapImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-deep-space">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-plasma-orange border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 text-sm">Loading map...</span>
          </div>
        </div>
      )}
      <div
        className="relative"
        style={{ width: displaySize.width, height: displaySize.height }}
      >
        <canvas
          ref={canvasRef}
          className={hoveredPinData ? "cursor-pointer" : "cursor-crosshair"}
          aria-label="Interactive propagation map - click to select target location"
          role="img"
          style={{
            width: displaySize.width,
            height: displaySize.height,
            imageRendering: "auto",
            touchAction: "none",
          }}
        />
        {/* Spot highlight overlay canvas (animates at 60fps independently) */}
        <canvas
          ref={highlightCanvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            width: displaySize.width,
            height: displaySize.height,
          }}
        />
      </div>

      {/* Tooltip overlay */}
      <MapTooltip
        visible={
          !!tooltipPosition &&
          !flyoutPosition &&
          !hoveredPinData &&
          !hoveredTargetPos
        }
        position={tooltipPosition || { x: 0, y: 0 }}
        grid={tooltipPosition?.grid || ""}
        spots={tooltipSpots}
      />

      <TargetHoverTooltip
        visible={!!hoveredTargetPos && !flyoutPosition && !hoveredPinData}
        position={hoveredTargetPos || { x: 0, y: 0 }}
        label={target?.name || target?.grid || "Target"}
        grid={target?.grid}
        difficulty={pathDifficulty}
        optimalSignal={optimalSignal}
        signalUnavailableReason={
          station ? undefined : "Set your QTH to see optimal-band signal"
        }
      />

      {/* Flyout menu overlay */}
      <MapFlyout
        visible={!!flyoutPosition && !hoveredPinData}
        position={flyoutPosition || { x: 0, y: 0 }}
        lat={flyoutPosition?.lat || 0}
        lon={flyoutPosition?.lon || 0}
        grid={flyoutPosition?.grid || ""}
        onAction={handleFlyoutAction}
        onClose={handleFlyoutClose}
        onOpenAddPinDialog={handleOpenAddPinDialog}
        onOpenResearchPanel={handleOpenResearchPanel}
        onWatchGrid={handleWatchGrid}
      />

      {/* Watch activity indicator */}
      <div className="absolute top-3 right-3 z-10">
        <WatchIndicator onClick={() => setWatchListOpen(true)} />
      </div>

      {/* Pin flyout - shown when hovering over an existing pin */}
      {hoveredPinData && (
        <PinFlyout
          visible
          position={hoveredPinData.screenPos}
          pin={hoveredPinData.pin}
          spots={allSpots}
          currentTargetGrid={target?.grid}
          onSetTarget={handleSetTargetFromFlyout}
          onEditPin={handleEditPinFromFlyout}
          onClose={handlePinFlyoutClose}
        />
      )}

      {/* AddPinDialog modal */}
      <AddPinDialog
        visible={addPinDialogOpen}
        mode={editingPin ? "edit" : "add"}
        pin={editingPin || undefined}
        location={addPinData || undefined}
        onClose={() => {
          setAddPinDialogOpen(false);
          setAddPinData(null);
          setEditingPin(null);
        }}
        onSave={() => {
          setAddPinDialogOpen(false);
          setAddPinData(null);
          setEditingPin(null);
        }}
      />

      {/* GridResearchPanel slide-out */}
      <GridResearchPanel
        visible={researchPanelOpen}
        grid={researchGrid || ""}
        onAction={handleResearchAction}
        onClose={() => setResearchPanelOpen(false)}
      />

      {/* WatchListPanel slide-out */}
      <WatchListPanel
        visible={watchListOpen}
        onClose={() => setWatchListOpen(false)}
      />
    </div>
  );
}

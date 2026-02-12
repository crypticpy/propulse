/**
 * FlatMapView Component
 *
 * 2D equirectangular map view with NASA Blue Marble texture
 * and terminator/greyline overlays.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { useSettingsStore } from "@/stores/settingsStore";
import { getSubsolarPoint } from "@/lib/utils/sun";
import {
  getPathPoints,
  getPathMetrics,
  getDistance,
  getBearing,
  formatBearing,
} from "@/lib/utils/path";
import { useAuroraData } from "@/hooks/useAuroraData";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { estimateMUF, getMUFColor } from "@/lib/api/muf";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import type { LiveSpot } from "@/types/livespot";
import {
  resolveSpotLocations,
  getGreatCirclePoints,
  type ResolvedSpot,
} from "./LiveSpotArcs";
import {
  getSpotColor,
  getBandColor,
  type SpotColorMode,
} from "@/lib/utils/spotColors";
import {
  getDifficultyColor,
  DIFFICULTY_LABELS,
  type DifficultyLevel,
} from "./LocationMarker";
import type { AuroraData } from "@/lib/api/aurora";
import { useSatellites } from "@/hooks/useSatellites";
import type { SatelliteInfo, SatelliteCategory } from "@/types/satellite";
import { useFlatMapClickHandler } from "./FlatMapClickHandler";
import { useFlatMapGestures } from "@/hooks/useFlatMapGestures";
import { MapTooltip } from "./MapTooltip";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import { MapFlyout, type MapFlyoutAction } from "./MapFlyout";
import { AddPinDialog } from "./AddPinDialog";
import {
  GridResearchPanel,
  type GridResearchAction,
} from "./GridResearchPanel";
import { latLonToGrid, gridToLatLon } from "@/lib/utils/grid";
import { usePinStore } from "@/stores/pinStore";
import { useUndoStore } from "@/stores/undoStore";
import { useWatchStore } from "@/stores/watchStore";
import { useDXStore } from "@/stores/dxStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import { getCategoryMeta } from "@/types/pin";
import type { MapPin } from "@/types/pin";
import { PinFlyout } from "./PinFlyout";
import { MapSizeSliders } from "./MapSizeSliders";
import { SpotDetailsFlyout, type SpotDetailsData } from "./SpotDetailsFlyout";
import { useSpotFocus } from "@/hooks/useSpotFocus";
import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { US_STATES } from "@/lib/data/usStates.generated";
import { getEnhancedBandConditions } from "@/lib/utils/bands";
import {
  useAwardProgress,
  STATE_NAME_TO_ABBR,
  type AwardEntityStatus,
} from "@/hooks/useAwardProgress";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import { pickOptimalBandCondition } from "@/lib/utils/optimalBand";
import type { LabelOptions } from "@/stores/mapStore";
import { getStandardMapCanvas } from "@/lib/utils/standardMap";
import {
  getMaidenheadFields,
  MAIDENHEAD_LON_LINES,
  MAIDENHEAD_LAT_LINES,
  getGridLevelForZoom,
  getMaidenheadSquaresInViewport,
  getMaidenheadSubsquaresInViewport,
  getSquareLonLines,
  getSquareLatLines,
  getSubsquareLonLines,
  getSubsquareLatLines,
} from "@/lib/utils/maidenheadGrid";
import { GridGlowRenderer } from "./GridGlowCanvas";
import type { GridGlowSpot } from "./GridGlowCanvas";
import { useEarthquakes } from "@/hooks/useEarthquakes";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { useLightning } from "@/hooks/useLightning";
import { useFires } from "@/hooks/useFires";
import { useWsprSpots } from "@/hooks/useWspr";
import type { EarthquakeEvent } from "@/lib/api/earthquakes";
import type { WeatherAlert } from "@/lib/api/weather";
import type { LightningStrike } from "@/lib/api/lightning";
import type { FireHotspot } from "@/lib/api/fires";
import type { WsprSpot } from "@/lib/api/wspr";
import {
  useContestQsoLocations,
  type ContestQsoOverlayData,
} from "@/hooks/useContestQsoLocations";
import {
  useLoggedQsoLocations,
  type LogQsoOverlayData,
} from "@/hooks/useLoggedQsoLocations";
import { AspectRatioSlider } from "./AspectRatioSlider";

interface FlatMapViewProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
  /** When true, canvas fills the entire container instead of maintaining 2:1 letterbox */
  fillContainer?: boolean;
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
  variant: "satellite" | "standard";
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

function addWrappedRingPath2D(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  width: number,
  height: number,
): void {
  if (ring.length < 2) return;

  const baseXs: number[] = new Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    const lon = ring[i][1];
    baseXs[i] = ((lon + 180) / 360) * width;
  }

  let maxDelta = 0;
  let rotateStart = 0;
  for (let i = 0; i < ring.length; i++) {
    const next = (i + 1) % ring.length;
    const delta = Math.abs(baseXs[next] - baseXs[i]);
    if (delta > maxDelta) {
      maxDelta = delta;
      rotateStart = i;
    }
  }

  const needsRotation = maxDelta > width / 2 && rotateStart !== 0;
  const points = needsRotation
    ? [...ring.slice(rotateStart), ...ring.slice(0, rotateStart)]
    : ring;
  const pointsBaseXs = needsRotation
    ? [...baseXs.slice(rotateStart), ...baseXs.slice(0, rotateStart)]
    : baseXs;

  const xs: number[] = new Array(points.length);
  let prevX = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    let x = pointsBaseXs[i];
    if (i > 0) {
      const delta = x - prevX;
      if (delta > width / 2) x -= width;
      else if (delta < -width / 2) x += width;
    }
    xs[i] = x;
    prevX = x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  const offsets = [-width, 0, width] as const;
  for (const offset of offsets) {
    if (maxX + offset < 0 || minX + offset > width) continue;
    for (let i = 0; i < points.length; i++) {
      const [lat] = points[i];
      const y = ((90 - lat) / 180) * height;
      const x = xs[i] + offset;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
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
  variant: "satellite" | "standard",
) {
  // Check cache: reuse overlay canvases if time hasn't changed by >= 1 minute
  const currentMinute = getTimeMinute(date);
  if (
    nightOverlayCache &&
    nightOverlayCache.variant === variant &&
    nightOverlayCache.minute === currentMinute &&
    nightOverlayCache.width === width &&
    nightOverlayCache.height === height
  ) {
    // Apply cached overlays with their respective blend modes
    if (variant === "satellite") {
      ctx.save();
      ctx.globalCompositeOperation = "saturation";
      ctx.drawImage(nightOverlayCache.desatCanvas, 0, 0, width, height);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(nightOverlayCache.darkCanvas, 0, 0, width, height);
    ctx.restore();

    if (variant === "satellite") {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(nightOverlayCache.blueCanvas, 0, 0, width, height);
      ctx.restore();
    }
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

  // Twilight zone spans solar angles 88-93 degrees with smooth hermite interpolation
  const TWILIGHT_START = 88;
  const TWILIGHT_END = 93;
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
        // Day-side softening to reduce eye strain on bright satellite imagery
        if (variant === "satellite") {
          darkPixels[idx] = Math.floor(255 * 0.88); // red reduction
          darkPixels[idx + 1] = Math.floor(255 * 0.88); // green reduction
          darkPixels[idx + 2] = Math.floor(255 * 0.93); // preserve blue more (sky feel)
          darkPixels[idx + 3] = Math.floor(255 * 0.26); // moderate overlay
        }
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

      // --- Desaturation layer (satellite only) ---
      if (variant === "satellite") {
        // Gray at full alpha removes all saturation via 'saturation' blend
        const desatAlpha = Math.floor(255 * nightBlend * 0.85);
        desatPixels[idx] = 128;
        desatPixels[idx + 1] = 128;
        desatPixels[idx + 2] = 128;
        desatPixels[idx + 3] = desatAlpha;
      }

      // --- Darkening + blue tint layer ---
      // Multiply blend: destination * source/255
      // Values < 255 darken; blue channel slightly higher preserves blue
      const baseDark =
        variant === "standard"
          ? 0.68 + deepNight * 0.25
          : 0.55 + deepNight * 0.2; // 0.55 -> 0.75 darkness factor
      const darkAlpha = Math.floor(255 * nightBlend);
      // Multiply factors: lower = darker. Blue channel stays higher for tint
      const bluePreserve = variant === "standard" ? 0.7 : 0.55;
      darkPixels[idx] = Math.floor(255 * (1 - baseDark * 0.85)); // R darkened most
      darkPixels[idx + 1] = Math.floor(255 * (1 - baseDark * 0.8)); // G slightly less
      darkPixels[idx + 2] = Math.floor(255 * (1 - baseDark * bluePreserve)); // B preserved more
      darkPixels[idx + 3] = darkAlpha;

      // --- Blue atmosphere screen layer ---
      // Screen blend adds a subtle cold blue glow, stronger in deep night.
      // RGB channels define the hue (cold blue), alpha controls intensity.
      if (variant === "satellite") {
        const blueIntensity = nightBlend * (0.06 + deepNight * 0.08);
        bluePixels[idx] = 15;
        bluePixels[idx + 1] = 25;
        bluePixels[idx + 2] = 60;
        bluePixels[idx + 3] = Math.floor(255 * blueIntensity);
      }
    }
  }

  // Finalize overlay canvases
  if (variant === "satellite") {
    desatCtx.putImageData(desatData, 0, 0);
  }
  darkCtx.putImageData(darkData, 0, 0);
  if (variant === "satellite") {
    blueCtx.putImageData(blueData, 0, 0);
  }

  // Cache the three overlay canvases for reuse
  nightOverlayCache = {
    desatCanvas,
    darkCanvas,
    blueCanvas,
    variant,
    minute: currentMinute,
    width,
    height,
  };

  // Composite Pass 1: Desaturation
  if (variant === "satellite") {
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.drawImage(desatCanvas, 0, 0, width, height);
    ctx.restore();
  }

  // Composite Pass 2: Darkening with blue tint
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(darkCanvas, 0, 0, width, height);
  ctx.restore();

  // Composite Pass 3: Blue atmosphere glow
  if (variant === "satellite") {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(blueCanvas, 0, 0, width, height);
    ctx.restore();
  }
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

  ctx.save();
  ctx.strokeStyle = COLORS.terminator;
  ctx.lineWidth = highViz ? 2.5 : 1.5;
  ctx.shadowColor = COLORS.terminator;
  ctx.shadowBlur = highViz ? 2 : 1;
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
  ctx.restore();
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
  const tintMultiplier = highViz ? 1.0 : 0.7;
  const alphaMultiplier = highViz ? 180 : 120;

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
  pinScale = 1.0,
  zoomScale = 1.0,
) {
  const { x, y } = latLonToCanvas(lat, lon, width, height);
  const zoomDamp = Math.max(1, zoomScale);

  // Outer glow
  ctx.fillStyle = color + "40";
  ctx.beginPath();
  ctx.arc(
    x,
    y,
    Math.round(
      ((isHome ? (highViz ? 14 : 10) : highViz ? 18 : 14) * pinScale) /
        zoomDamp,
    ),
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Inner dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(
    x,
    y,
    Math.round(
      ((isHome ? (highViz ? 7 : 5) : highViz ? 10 : 7) * pinScale) / zoomDamp,
    ),
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Pulsing ring for target
  if (!isHome) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / zoomDamp;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      Math.round(((highViz ? 16 : 12) * pinScale) / zoomDamp),
      0,
      Math.PI * 2,
    );
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

    const s = 1 / zoomDamp; // uniform scale factor for label elements
    const labelFontSize = Math.max(1, Math.round((highViz ? 13 : 11) * s));
    ctx.font = `bold ${labelFontSize}px monospace`;
    const textWidth = ctx.measureText(labelText).width;
    const padX = 6 * s;
    const boxWidth = Math.max(60 * s, textWidth + padX * 2);
    const boxH = 16 * s;
    const gap = 12 * s; // gap between marker center and bottom of label box

    // Label background
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(x - boxWidth / 2, y - gap - boxH, boxWidth, boxH);
    ctx.strokeStyle = color;
    ctx.lineWidth = s;
    ctx.strokeRect(x - boxWidth / 2, y - gap - boxH, boxWidth, boxH);

    // Label text (vertically centered in the box)
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, x, y - gap - boxH / 2);
    ctx.textBaseline = "alphabetic";

    // Difficulty tag above label for target markers
    if (!isHome && difficulty) {
      const difficultyLabel = DIFFICULTY_LABELS[difficulty];
      const diffFontSize = Math.max(1, Math.round(10 * s));
      ctx.font = `bold ${diffFontSize}px sans-serif`;
      const tagTextW = ctx.measureText(difficultyLabel).width;
      const tagPad = 5 * s;
      const tagWidth = tagTextW + tagPad * 2;
      const tagH = 14 * s;
      const tagGap = 4 * s; // gap between label box and difficulty tag
      const tagBottom = y - gap - boxH - tagGap;

      // Background for difficulty tag
      ctx.fillStyle = color + "20";
      ctx.fillRect(x - tagWidth / 2, tagBottom - tagH, tagWidth, tagH);
      ctx.strokeStyle = color + "50";
      ctx.lineWidth = s;
      ctx.strokeRect(x - tagWidth / 2, tagBottom - tagH, tagWidth, tagH);

      // Difficulty label text
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(difficultyLabel, x, tagBottom - tagH / 2);
      ctx.textBaseline = "alphabetic";
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
  zoomScale = 1.0,
) {
  const zoomDamp = Math.max(1, zoomScale);
  const points = getPathPoints(startLat, startLon, endLat, endLon, 100);

  // Draw path with crisp lines (no shadow blur for sharpness)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8 / zoomDamp;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([6 / zoomDamp, 5 / zoomDamp]);
  ctx.globalAlpha = 0.55;

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
  ctx.globalAlpha = 1.0;
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
 * Draw earthquake markers on the 2D map
 * Renders recent earthquakes as magnitude-scaled colored circles with glow
 */
function drawEarthquakes(
  ctx: CanvasRenderingContext2D,
  earthquakes: EarthquakeEvent[],
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  const zoomDamp = Math.max(1, zoomScale);
  ctx.save();
  for (const eq of earthquakes) {
    const { x, y } = latLonToCanvas(eq.lat, eq.lon, width, height);

    // Size based on magnitude (M2.5-M9 mapped to 3-20px radius)
    const radius = Math.max(3, Math.min(20, (eq.magnitude - 1) * 3)) / zoomDamp;

    // Color based on magnitude
    let color: string;
    if (eq.magnitude >= 7)
      color = "#ff2020"; // Major: red
    else if (eq.magnitude >= 5)
      color = "#ff8800"; // Strong: orange
    else if (eq.magnitude >= 4)
      color = "#ffcc00"; // Moderate: yellow
    else color = "#88cc44"; // Light: green-yellow

    // Outer glow ring
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner filled circle
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Outline
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / zoomDamp;
    ctx.stroke();

    // Magnitude label for M5+
    if (eq.magnitude >= 5) {
      const fontSize = Math.max(1, Math.round(7 / zoomDamp));
      ctx.globalAlpha = 1;
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2 / zoomDamp;
      ctx.strokeText(
        `M${eq.magnitude.toFixed(1)}`,
        x,
        y - radius - 2 / zoomDamp,
      );
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`M${eq.magnitude.toFixed(1)}`, x, y - radius - 2 / zoomDamp);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw weather alert markers on the 2D map
 * Renders active weather warnings as severity-colored triangles
 */
function drawWeatherAlerts(
  ctx: CanvasRenderingContext2D,
  alerts: WeatherAlert[],
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  const zoomDamp = Math.max(1, zoomScale);
  ctx.save();
  for (const alert of alerts) {
    const { x, y } = latLonToCanvas(alert.lat, alert.lon, width, height);

    // Color by severity
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

    // Warning triangle
    const size = 6 / zoomDamp;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - size); // top
    ctx.lineTo(x + size, y + size * 0.6); // bottom right
    ctx.lineTo(x - size, y + size * 0.6); // bottom left
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.5 / zoomDamp;
    ctx.stroke();

    // Exclamation mark inside triangle
    ctx.fillStyle = "#000000";
    const fontSize = Math.max(1, Math.round(7 / zoomDamp));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw lightning strike markers on the 2D map
 * Renders recent strikes as small bright dots with fade based on age
 */
function drawLightning(
  ctx: CanvasRenderingContext2D,
  strikes: LightningStrike[],
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  const zoomDamp = Math.max(1, zoomScale);
  ctx.save();
  const now = Date.now();
  for (const strike of strikes) {
    const { x, y } = latLonToCanvas(strike.lat, strike.lon, width, height);

    // Fade based on age (full opacity for recent, fade over 10 minutes)
    const age = now - strike.time;
    const alpha = Math.max(0.1, 1 - age / (10 * 60 * 1000));

    // Bright bolt dot
    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 4 / zoomDamp, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe566";
    ctx.fill();

    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 / zoomDamp, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw fire hotspot markers on the 2D map
 * Renders NASA FIRMS fire detections as orange/red dots scaled by FRP
 */
function drawFires(
  ctx: CanvasRenderingContext2D,
  hotspots: FireHotspot[],
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  const zoomDamp = Math.max(1, zoomScale);
  ctx.save();
  for (const hp of hotspots) {
    if (hp.confidence === "low") continue;

    const { x, y } = latLonToCanvas(hp.lat, hp.lon, width, height);
    const radius = Math.max(1.5, Math.min(6, hp.frp / 80)) / zoomDamp;

    // Outer glow
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ff6600";
    ctx.fill();

    // Inner core
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2200";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw WSPR propagation paths on the 2D map
 * Renders TX→RX great-circle arcs with band-based coloring
 */
function drawWsprPaths(
  ctx: CanvasRenderingContext2D,
  spots: WsprSpot[],
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  const zd = Math.max(1, zoomScale);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.8 / zd;

  for (const spot of spots) {
    const tx = latLonToCanvas(spot.txLat, spot.txLon, width, height);
    const rx = latLonToCanvas(spot.rxLat, spot.rxLon, width, height);

    // Skip if the path wraps around the map edge (long horizontal lines)
    if (Math.abs(tx.x - rx.x) > width * 0.8) continue;

    // Color by band
    let color: string;
    if (spot.band <= 1.8)
      color = "#ff6688"; // 160m
    else if (spot.band <= 3.5)
      color = "#ff8844"; // 80m
    else if (spot.band <= 7)
      color = "#ffaa22"; // 40m
    else if (spot.band <= 14)
      color = "#ffdd00"; // 20m
    else if (spot.band <= 21)
      color = "#88ee44"; // 15m
    else if (spot.band <= 28)
      color = "#44ccff"; // 10m
    else color = "#aa88ff"; // 6m+

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(tx.x, tx.y);
    ctx.lineTo(rx.x, rx.y);
    ctx.stroke();

    // Small TX dot
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(tx.x, tx.y, 1.5 / zd, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 0.35;
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw contest QSO arcs on the 2D map
 * Renders arcs from home station to each worked DX station, colored by band
 */
function drawContestQsos(
  ctx: CanvasRenderingContext2D,
  data: ContestQsoOverlayData,
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  const zd = Math.max(1, zoomScale);
  ctx.save();
  const home = latLonToCanvas(data.homeLat, data.homeLon, width, height);

  for (const qso of data.qsos) {
    const dx = latLonToCanvas(qso.lat, qso.lon, width, height);

    // Skip antimeridian wraps
    if (Math.abs(home.x - dx.x) > width * 0.8) continue;

    // Color by band
    const color = getQsoBandColor(qso.band);

    // Arc line
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 / zd;
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(dx.x, dx.y);
    ctx.stroke();

    // DX endpoint dot
    ctx.globalAlpha = qso.isMultiplier ? 0.9 : 0.7;
    ctx.beginPath();
    ctx.arc(dx.x, dx.y, (qso.isMultiplier ? 3 : 2) / zd, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Multiplier ring
    if (qso.isMultiplier) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1 / zd;
      ctx.beginPath();
      ctx.arc(dx.x, dx.y, 4.5 / zd, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw logged QSO arcs on the 2D map
 * Renders arcs from home station to each logged contact, colored by band
 */
function drawLoggedQsos(
  ctx: CanvasRenderingContext2D,
  data: LogQsoOverlayData,
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  const zd = Math.max(1, zoomScale);
  ctx.save();
  const home = latLonToCanvas(data.homeLat, data.homeLon, width, height);

  for (const qso of data.qsos) {
    const dx = latLonToCanvas(qso.lat, qso.lon, width, height);

    // Skip antimeridian wraps
    if (Math.abs(home.x - dx.x) > width * 0.8) continue;

    // Color by band (same palette as contest)
    const color = getQsoBandColor(qso.band);

    // Thinner, more transparent arcs for logged QSOs (can be many)
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6 / zd;
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(dx.x, dx.y);
    ctx.stroke();

    // Small DX dot
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(dx.x, dx.y, 1.5 / zd, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Band-to-color mapping for QSO overlays */
function getQsoBandColor(band: string): string {
  const b = band.toLowerCase().replace(/[^0-9.]/g, "");
  switch (b) {
    case "160":
      return "#ff6688";
    case "80":
      return "#ff8844";
    case "60":
      return "#ff9933";
    case "40":
      return "#ffaa22";
    case "30":
      return "#ffcc00";
    case "20":
      return "#ffdd00";
    case "17":
      return "#ccee22";
    case "15":
      return "#88ee44";
    case "12":
      return "#44dd88";
    case "10":
      return "#44ccff";
    case "6":
      return "#6688ff";
    case "2":
      return "#aa66ff";
    default:
      return "#aa88ff"; // VHF/UHF+
  }
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
  spotDotScale = 1.0,
  opacity = 1,
  zoomScale = 1.0,
) {
  const color = getSpotColor(spot, colorMode);
  const zoomDamp = Math.max(1, zoomScale);

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
  ctx.lineWidth = ((highViz ? 3 : 1.5) * spotDotScale) / zoomDamp;
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

  // Draw endpoint markers with distinct source/target styling
  // Spotter (source): hollow ring — reads as origin/transmitter
  ctx.beginPath();
  ctx.arc(
    start.x,
    start.y,
    ((highViz ? 5 : 3.5) * spotDotScale) / zoomDamp,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = ((highViz ? 2 : 1.5) * spotDotScale) / zoomDamp;
  ctx.stroke();

  // DX (target): filled circle with white outer ring — reads as destination
  ctx.beginPath();
  ctx.arc(
    end.x,
    end.y,
    ((highViz ? 5 : 4) * spotDotScale) / zoomDamp,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(
    end.x,
    end.y,
    ((highViz ? 7 : 5.5) * spotDotScale) / zoomDamp,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = ((highViz ? 1.5 : 1) * spotDotScale) / zoomDamp;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw all spot arcs on the 2D map.
 * When watchEnabled is true, matched spots render at full opacity
 * and non-matched spots are dimmed to 0.3.
 */
function drawSpotArcs(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
  spotDotScale = 1.0,
  watchActive = false,
  watchMatchedIds?: Set<string>,
  zoomScale = 1.0,
) {
  for (const spot of spots) {
    const opacity =
      watchActive && watchMatchedIds
        ? watchMatchedIds.has(spot.id)
          ? 1
          : 0.3
        : 1;
    drawSpotArc(
      ctx,
      spot,
      width,
      height,
      colorMode,
      highViz,
      spotDotScale,
      opacity,
      zoomScale,
    );
  }
}

/**
 * Draw a highlighted arc for the selected DX cluster spot.
 * Persistent while the spot is selected — plasma orange with glow.
 * Also draws a callsign label at the DX endpoint.
 */
function drawSelectedSpotArc(
  ctx: CanvasRenderingContext2D,
  spot: ResolvedSpot,
  width: number,
  height: number,
  spotDotScale: number,
  zoomScale: number,
  labelScale: number,
) {
  const start = latLonToCanvas(spot.spotterLat, spot.spotterLon, width, height);
  const end = latLonToCanvas(spot.dxLat, spot.dxLon, width, height);

  const highlightColor = "rgba(255, 107, 53, 1)";
  const glowColor = "rgba(255, 107, 53, 0.3)";
  const zoomDamp = Math.max(1, zoomScale);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const wrapAround = Math.abs(dx) > width / 2;

  ctx.save();

  // --- Helper to stroke the arc path (reused for glow + main line) ---
  const strokeArcPath = () => {
    if (wrapAround) {
      const points = getGreatCirclePoints(
        spot.spotterLat,
        spot.spotterLon,
        spot.dxLat,
        spot.dxLon,
        50,
      );
      ctx.beginPath();
      let lastX = -1;
      for (const pt of points) {
        const { x, y } = latLonToCanvas(pt.lat, pt.lon, width, height);
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
    } else {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const arcHeight = Math.min(distance * 0.3, 80);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(midX, midY - arcHeight, end.x, end.y);
      ctx.stroke();
    }
  };

  // Glow arc (wider, blurred)
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = (6 * spotDotScale) / zoomDamp;
  ctx.shadowColor = "rgba(255, 107, 53, 0.5)";
  ctx.shadowBlur = 12 / zoomDamp;
  ctx.lineCap = "round";
  strokeArcPath();

  // Main arc (thinner, solid)
  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = (3 * spotDotScale) / zoomDamp;
  ctx.shadowColor = "rgba(255, 107, 53, 0.4)";
  ctx.shadowBlur = 8 / zoomDamp;
  strokeArcPath();

  // Reset shadow for endpoints
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // Spotter endpoint — hollow ring (larger than normal arcs)
  const spotterRadius = (5 * spotDotScale) / zoomDamp;
  ctx.beginPath();
  ctx.arc(start.x, start.y, spotterRadius, 0, Math.PI * 2);
  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = (2 * spotDotScale) / zoomDamp;
  ctx.shadowColor = "rgba(255, 107, 53, 0.4)";
  ctx.shadowBlur = 6 / zoomDamp;
  ctx.stroke();

  // DX endpoint — filled circle with white outer ring
  const dxRadius = (6 * spotDotScale) / zoomDamp;
  ctx.beginPath();
  ctx.arc(end.x, end.y, dxRadius, 0, Math.PI * 2);
  ctx.fillStyle = highlightColor;
  ctx.shadowColor = "rgba(255, 107, 53, 0.5)";
  ctx.shadowBlur = 8 / zoomDamp;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(end.x, end.y, dxRadius + 2 / zoomDamp, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = (1.5 * spotDotScale) / zoomDamp;
  ctx.stroke();

  // --- Callsign label at DX endpoint ---
  const fontSize = Math.max(1, Math.round((12 * labelScale) / zoomDamp));
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = "bottom";
  const labelText = spot.callsign;
  const textMetrics = ctx.measureText(labelText);
  const textW = textMetrics.width + 8 / zoomDamp;
  const textH = fontSize + 6 / zoomDamp;
  const labelX = end.x - textW / 2;
  const labelY = end.y - dxRadius - 6 / zoomDamp;

  // Background pill
  ctx.fillStyle = "rgba(10, 10, 26, 0.85)";
  ctx.beginPath();
  const pillR = 3 / zoomDamp;
  ctx.roundRect(labelX, labelY - textH, textW, textH, pillR);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 107, 53, 0.6)";
  ctx.lineWidth = 1 / zoomDamp;
  ctx.stroke();

  // Label text
  ctx.fillStyle = highlightColor;
  ctx.textAlign = "center";
  ctx.fillText(labelText, end.x, labelY - 2);

  ctx.restore();
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
 * Highlight Maidenhead grid squares containing active spots.
 * Zoom-adaptive: 4-char squares (2° × 1°) at low zoom, 6-char subsquares (5' × 2.5') at zoom >= 3.
 */
function drawSpotGridHighlights(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  width: number,
  height: number,
  zoomScale = 1.0,
) {
  // Use subsquare precision (6-char, 5'×2.5') at zoom >= 3, otherwise square (4-char, 2°×1°)
  const useSubsquare = zoomScale >= 3;

  const gridKeys = new Set<string>();
  for (const spot of spots) {
    if (useSubsquare) {
      // 6-char subsquare: 5 minutes lon (1/12°) × 2.5 minutes lat (1/24°)
      const dxLonIdx = Math.floor((spot.dxLon + 180) * 12);
      const dxLatIdx = Math.floor((spot.dxLat + 90) * 24);
      gridKeys.add(`${dxLonIdx},${dxLatIdx}`);

      const spLonIdx = Math.floor((spot.spotterLon + 180) * 12);
      const spLatIdx = Math.floor((spot.spotterLat + 90) * 24);
      gridKeys.add(`${spLonIdx},${spLatIdx}`);
    } else {
      // 4-char square: 2° lon × 1° lat
      const dxLonIdx = Math.floor((spot.dxLon + 180) / 2);
      const dxLatIdx = Math.floor(spot.dxLat + 90);
      gridKeys.add(`${dxLonIdx},${dxLatIdx}`);

      const spLonIdx = Math.floor((spot.spotterLon + 180) / 2);
      const spLatIdx = Math.floor(spot.spotterLat + 90);
      gridKeys.add(`${spLonIdx},${spLatIdx}`);
    }
  }

  // Cell dimensions in degrees
  const cellLonDeg = useSubsquare ? 1 / 12 : 2;
  const cellLatDeg = useSubsquare ? 1 / 24 : 1;

  ctx.save();
  // Set canvas state once outside the loop (Canvas 2D best practice)
  ctx.fillStyle = useSubsquare
    ? "rgba(0, 204, 204, 0.10)" // slightly brighter for tiny subsquares
    : "rgba(0, 204, 204, 0.06)";
  ctx.strokeStyle = useSubsquare
    ? "rgba(0, 204, 204, 0.20)"
    : "rgba(0, 204, 204, 0.15)";
  ctx.lineWidth = 0.5;

  for (const key of gridKeys) {
    const [lonIdx, latIdx] = key.split(",").map(Number);
    const lonStart = lonIdx * cellLonDeg - 180;
    const latStart = latIdx * cellLatDeg - 90;

    const topLeft = latLonToCanvas(
      latStart + cellLatDeg,
      lonStart,
      width,
      height,
    );
    const bottomRight = latLonToCanvas(
      latStart,
      lonStart + cellLonDeg,
      width,
      height,
    );
    const w = bottomRight.x - topLeft.x;
    const h = bottomRight.y - topLeft.y;

    // Skip degenerate or off-screen rectangles
    if (w <= 0 || h <= 0) continue;

    ctx.fillRect(topLeft.x, topLeft.y, w, h);
    ctx.strokeRect(topLeft.x, topLeft.y, w, h);
  }
  ctx.restore();
}

/**
 * Bounding box for label overlap and hit-testing
 */
interface LabelBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Placed label metadata for connector lines and hover hit-testing */
interface PlacedLabel {
  bbox: LabelBBox;
  spot: ResolvedSpot;
  /** Which side the connector line anchors from */
  anchorSide:
    | "above"
    | "below"
    | "right"
    | "left"
    | "above-right"
    | "above-left";
  /** DX endpoint canvas position */
  spotX: number;
  spotY: number;
}

/** Module-level storage so the hover handler can hit-test placed labels */
let lastPlacedLabels: PlacedLabel[] = [];

function bboxOverlaps(a: LabelBBox, b: LabelBBox): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** Count how many boxes in the list overlap with the candidate */
function countOverlaps(candidate: LabelBBox, boxes: LabelBBox[]): number {
  let count = 0;
  for (const box of boxes) {
    if (bboxOverlaps(candidate, box)) {
      count++;
    }
  }
  return count;
}

/**
 * Generate candidate label positions around a DX endpoint.
 * Returns positions in priority order: above, below, right, left, above-right, above-left.
 */
function getLabelCandidates(
  spotX: number,
  spotY: number,
  textW: number,
  textH: number,
  gap: number,
): Array<{ bbox: LabelBBox; anchorSide: PlacedLabel["anchorSide"] }> {
  return [
    {
      bbox: {
        x: spotX - textW / 2,
        y: spotY - gap - textH,
        w: textW,
        h: textH,
      },
      anchorSide: "above" as const,
    },
    {
      bbox: { x: spotX - textW / 2, y: spotY + gap, w: textW, h: textH },
      anchorSide: "below" as const,
    },
    {
      bbox: { x: spotX + gap, y: spotY - textH / 2, w: textW, h: textH },
      anchorSide: "right" as const,
    },
    {
      bbox: {
        x: spotX - gap - textW,
        y: spotY - textH / 2,
        w: textW,
        h: textH,
      },
      anchorSide: "left" as const,
    },
    {
      bbox: { x: spotX + gap / 2, y: spotY - gap - textH, w: textW, h: textH },
      anchorSide: "above-right" as const,
    },
    {
      bbox: {
        x: spotX - gap / 2 - textW,
        y: spotY - gap - textH,
        w: textW,
        h: textH,
      },
      anchorSide: "above-left" as const,
    },
  ];
}

/** Get the connector line anchor point on the label edge for a given placement side */
function getConnectorAnchor(
  bbox: LabelBBox,
  anchorSide: PlacedLabel["anchorSide"],
): { x: number; y: number } {
  switch (anchorSide) {
    case "above":
      return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h };
    case "below":
      return { x: bbox.x + bbox.w / 2, y: bbox.y };
    case "right":
      return { x: bbox.x, y: bbox.y + bbox.h / 2 };
    case "left":
      return { x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 };
    case "above-right":
      return { x: bbox.x, y: bbox.y + bbox.h };
    case "above-left":
      return { x: bbox.x + bbox.w, y: bbox.y + bbox.h };
  }
}

/** Draw a rounded rectangle path (pill shape) */
function drawPillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Draw callsign labels near DX spot endpoints with multi-position collision
 * avoidance and connector lines from displaced labels to their endpoints.
 *
 * Position candidates (tried in priority order):
 * 1. Above  2. Below  3. Right  4. Left  5. Above-right  6. Above-left
 *
 * Stores placed label metadata in lastPlacedLabels for hover hit-testing.
 */
function drawCallsignLabels(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
  labelScale = 1.0,
  zoomScale = 1.0,
) {
  const placed: PlacedLabel[] = [];
  const placedBoxes: LabelBBox[] = [];
  const zoomDamp = Math.max(1, zoomScale);
  const fontSize = Math.max(
    1,
    Math.round(((highViz ? 12 : 10) * labelScale) / zoomDamp),
  );
  const gap = Math.max(
    1,
    Math.round(((highViz ? 12 : 10) * labelScale) / zoomDamp),
  );
  const pillRadius = 3;

  // Build exclusion zones for ALL spot endpoint dots (prevents labels covering dots)
  const endpointZones: LabelBBox[] = [];
  for (const spot of spots) {
    const dx = latLonToCanvas(spot.dxLat, spot.dxLon, width, height);
    const sp = latLonToCanvas(spot.spotterLat, spot.spotterLon, width, height);
    const r = Math.round((highViz ? 8 : 6) / zoomDamp);
    endpointZones.push({ x: dx.x - r, y: dx.y - r, w: r * 2, h: r * 2 });
    endpointZones.push({ x: sp.x - r, y: sp.y - r, w: r * 2, h: r * 2 });
  }

  ctx.save();
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "bottom";

  // --- Pass 1: Determine placement for all labels ---
  for (const spot of spots) {
    const { callsign } = spot;
    if (!callsign) {
      continue;
    }

    const { x, y } = latLonToCanvas(spot.dxLat, spot.dxLon, width, height);
    const textW = ctx.measureText(callsign).width + 6;
    const textH = fontSize + 4;

    const candidates = getLabelCandidates(x, y, textW, textH, gap);

    // Find first non-overlapping candidate
    let bestCandidate = candidates[0]; // fallback to "above"
    let bestOverlaps = Infinity;
    let foundClean = false;

    for (const candidate of candidates) {
      // Clamp to canvas bounds
      candidate.bbox.x = Math.max(0, Math.min(width - textW, candidate.bbox.x));
      candidate.bbox.y = Math.max(
        0,
        Math.min(height - textH, candidate.bbox.y),
      );

      const labelOverlaps = countOverlaps(candidate.bbox, placedBoxes);
      const endpointOverlaps = countOverlaps(candidate.bbox, endpointZones);
      const totalOverlaps = labelOverlaps + endpointOverlaps;

      if (totalOverlaps === 0) {
        bestCandidate = candidate;
        foundClean = true;
        break;
      }

      if (totalOverlaps < bestOverlaps) {
        bestOverlaps = totalOverlaps;
        bestCandidate = candidate;
      }
    }

    // If all candidates overlap other labels heavily, skip this label entirely
    if (!foundClean && bestOverlaps > 2) {
      continue;
    }

    placedBoxes.push(bestCandidate.bbox);
    placed.push({
      bbox: bestCandidate.bbox,
      spot,
      anchorSide: bestCandidate.anchorSide,
      spotX: x,
      spotY: y,
    });
  }

  // --- Pass 2: Draw connector lines (behind labels) ---
  for (const label of placed) {
    // Only draw connector for displaced labels (not default "above" position)
    // or when label is far from the endpoint
    const anchor = getConnectorAnchor(label.bbox, label.anchorSide);
    const dist = Math.sqrt(
      (anchor.x - label.spotX) ** 2 + (anchor.y - label.spotY) ** 2,
    );

    if (label.anchorSide !== "above" || dist > gap + 4) {
      const modeColor = getSpotColor(label.spot, colorMode);
      const opacity = 1;

      ctx.save();
      ctx.globalAlpha = opacity * 0.4;
      ctx.strokeStyle = modeColor;
      ctx.lineWidth = 1 / zoomDamp;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(label.spotX, label.spotY);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- Pass 3: Draw label pills and text ---
  for (const label of placed) {
    const { bbox, spot } = label;
    const modeColor = getSpotColor(spot, colorMode);
    const opacity = 1;

    ctx.globalAlpha = opacity;

    // Background pill
    ctx.fillStyle = highViz
      ? "rgba(10, 10, 26, 0.9)"
      : "rgba(10, 10, 26, 0.75)";
    drawPillPath(ctx, bbox.x, bbox.y, bbox.w, bbox.h, pillRadius);
    ctx.fill();

    // Band-color underline — solid, bright, edge-to-edge.
    const bandColor = spot.frequency ? getBandColor(spot.frequency) : modeColor;
    const underlineH = Math.max(1, 3 / zoomDamp);
    ctx.fillStyle = bandColor;
    ctx.fillRect(bbox.x, bbox.y + bbox.h - underlineH, bbox.w, underlineH);

    // Callsign text with shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 2 / zoomDamp;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.fillText(
      spot.callsign,
      bbox.x + bbox.w / 2,
      bbox.y + bbox.h - Math.max(2, 5 / zoomDamp),
    );
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  // Store for hover hit-testing
  lastPlacedLabels = placed;
}

/**
 * Draw spotter (reporting station) callsign labels at the spotter endpoint
 * of each arc. Rendered dimmer and slightly smaller than DX labels to
 * visually distinguish them.
 */
function drawSpotterLabels(
  ctx: CanvasRenderingContext2D,
  spots: ResolvedSpot[],
  width: number,
  height: number,
  colorMode: SpotColorMode = "mode",
  highViz = false,
  labelScale = 1.0,
  zoomScale = 1.0,
) {
  const zoomDamp = Math.max(1, zoomScale);
  const fontSize = Math.max(
    1,
    Math.round(((highViz ? 10 : 9) * labelScale) / zoomDamp),
  );
  const pillRadius = 3;
  const spotterOpacity = 0.6;

  // Deduplicate: only draw one label per spotter callsign
  const seen = new Set<string>();

  ctx.save();
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "bottom";

  for (const spot of spots) {
    const spotter = spot.spotter;
    if (!spotter || seen.has(spotter)) {
      continue;
    }
    seen.add(spotter);

    const { x, y } = latLonToCanvas(
      spot.spotterLat,
      spot.spotterLon,
      width,
      height,
    );
    const textW = ctx.measureText(spotter).width + 6;
    const textH = fontSize + 4;
    const bx = x - textW / 2;
    const by = y - textH - 6; // place above spotter dot

    const modeColor = getSpotColor(spot, colorMode);

    ctx.globalAlpha = spotterOpacity;

    // Background pill
    ctx.fillStyle = highViz ? "rgba(10, 10, 26, 0.8)" : "rgba(10, 10, 26, 0.6)";
    drawPillPath(ctx, bx, by, textW, textH, pillRadius);
    ctx.fill();

    // Band-color underline — solid, bright, edge-to-edge.
    const bandColor = spot.frequency ? getBandColor(spot.frequency) : modeColor;
    const ulH = Math.max(1, 3 / zoomDamp);
    ctx.fillStyle = bandColor;
    ctx.fillRect(bx, by + textH - ulH, textW, ulH);

    // Spotter callsign text
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 2 / zoomDamp;
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.textAlign = "center";
    ctx.fillText(
      spotter,
      bx + textW / 2,
      by + textH - Math.max(2, 5 / zoomDamp),
    );
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
  standardMode = false,
  zoomScale = 1,
  zoomOffsetX = 0,
  zoomOffsetY = 0,
  viewportWidth = 0,
  viewportHeight = 0,
) {
  // Draw country border polygons
  if (opts.borders) {
    ctx.strokeStyle = standardMode
      ? "rgba(255, 255, 255, 0.65)"
      : "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = standardMode ? 1.0 : 0.8;
    ctx.beginPath();
    for (const country of WORLD_COUNTRIES) {
      for (const ring of country.borders) {
        addWrappedRingPath2D(ctx, ring, width, height);
      }
    }
    ctx.stroke();
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

  // Draw Maidenhead grid — zoom-adaptive with 2-char, 4-char, and 6-char levels
  if (opts.maidenheadGrid) {
    ctx.save();
    const gridLevel = getGridLevelForZoom(zoomScale);

    // --- Always draw 2-char field grid lines ---
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

    // --- 2-char field labels (always shown) ---
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

    // --- Viewport culling for sub-grids ---
    // Compute the visible lat/lon extent from zoom parameters.
    // Inside the zoom transform, map-space coords run 0..width / 0..height.
    // Visible map-space rect: top-left = (-offsetX/scale, -offsetY/scale),
    // bottom-right = ((-offsetX + vpW) / scale, (-offsetY + vpH) / scale)
    // Then convert map-space → lat/lon via inverse equirectangular.
    const vpW = viewportWidth || width;
    const vpH = viewportHeight || height;
    const visLeft = zoomScale > 1 ? -zoomOffsetX / zoomScale : 0;
    const visTop = zoomScale > 1 ? -zoomOffsetY / zoomScale : 0;
    const visRight = zoomScale > 1 ? (-zoomOffsetX + vpW) / zoomScale : width;
    const visBottom = zoomScale > 1 ? (-zoomOffsetY + vpH) / zoomScale : height;
    // Inverse equirectangular: lon = (x / width) * 360 - 180, lat = 90 - (y / height) * 180
    const vLonMin = Math.max(-180, (visLeft / width) * 360 - 180 - 2);
    const vLonMax = Math.min(180, (visRight / width) * 360 - 180 + 2);
    const vLatMax = Math.min(90, 90 - (visTop / height) * 180 + 1);
    const vLatMin = Math.max(-90, 90 - (visBottom / height) * 180 - 1);

    // --- 4-char square grid (zoom >= 1.5) ---
    if (gridLevel === "square" || gridLevel === "subsquare") {
      // Draw 4-char grid lines (thinner, more transparent) — viewport culled, batched
      ctx.strokeStyle = "rgba(0, 204, 204, 0.12)";
      ctx.lineWidth = 0.3;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      const sqLonLines = getSquareLonLines(vLonMin, vLonMax);
      for (const lon of sqLonLines) {
        const { x } = latLonToCanvas(0, lon, width, height);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      const sqLatLines = getSquareLatLines(vLatMin, vLatMax);
      for (const lat of sqLatLines) {
        const { y } = latLonToCanvas(lat, 0, width, height);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 4-char labels (shown at zoom >= 3) — viewport culled
      if (zoomScale >= 3) {
        const viewport = {
          lonMin: vLonMin,
          lonMax: vLonMax,
          latMin: vLatMin,
          latMax: vLatMax,
        };
        const squares = getMaidenheadSquaresInViewport(viewport);
        ctx.font = "5px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const sq of squares) {
          const { x, y } = latLonToCanvas(
            sq.latCenter,
            sq.lonCenter,
            width,
            height,
          );
          ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
          ctx.lineWidth = 1;
          ctx.strokeText(sq.label, x, y);
          ctx.fillStyle = "rgba(0, 204, 204, 0.35)";
          ctx.fillText(sq.label, x, y);
        }
      }
    }

    // --- 6-char subsquare grid (zoom >= 5) — viewport culled ---
    if (gridLevel === "subsquare") {
      // Batched subsquare grid lines
      ctx.strokeStyle = "rgba(0, 204, 204, 0.06)";
      ctx.lineWidth = 0.2;
      ctx.setLineDash([1, 2]);
      ctx.beginPath();
      const subLonLines = getSubsquareLonLines(vLonMin, vLonMax);
      for (const lon of subLonLines) {
        const { x } = latLonToCanvas(0, lon, width, height);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      const subLatLines = getSubsquareLatLines(vLatMin, vLatMax);
      for (const lat of subLatLines) {
        const { y } = latLonToCanvas(lat, 0, width, height);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 6-char labels (shown at zoom >= 8) — viewport culled with density cap
      if (zoomScale >= 8) {
        const lonSpan = vLonMax - vLonMin;
        const latSpan = vLatMax - vLatMin;
        // Only render labels if viewport area < 200 sq degrees (~5,760 subsquares max)
        if (lonSpan * latSpan < 200) {
          const viewport = {
            lonMin: vLonMin,
            lonMax: vLonMax,
            latMin: vLatMin,
            latMax: vLatMax,
          };
          const subsquares = getMaidenheadSubsquaresInViewport(viewport);
          ctx.font = "3px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(0, 204, 204, 0.25)";
          for (const sub of subsquares) {
            const { x, y } = latLonToCanvas(
              sub.latCenter,
              sub.lonCenter,
              width,
              height,
            );
            ctx.fillText(sub.label, x, y);
          }
        }
      }
    }

    ctx.restore();
  }
}

/**
 * Draw US state borders
 */
function drawStateBorders(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  standardMode: boolean,
) {
  ctx.strokeStyle = standardMode
    ? "rgba(255, 255, 255, 0.45)"
    : "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = standardMode ? 0.7 : 0.5;
  ctx.beginPath();
  for (const state of US_STATES) {
    for (const ring of state.borders) {
      addWrappedRingPath2D(ctx, ring, width, height);
    }
  }
  ctx.stroke();
}

/**
 * Draw WAS (Worked All States) award overlay on the map.
 * Fills each US state polygon with a color based on worked/confirmed status.
 */
function drawWASOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  wasStates: Map<string, AwardEntityStatus>,
) {
  // Batch states by color to minimize canvas fill() calls
  type StateData = (typeof US_STATES)[number];
  const confirmed: StateData[] = [];
  const worked: StateData[] = [];
  const unworked: StateData[] = [];
  const territory: StateData[] = [];

  for (const state of US_STATES) {
    const abbr = STATE_NAME_TO_ABBR.get(state.name);
    if (!abbr) {
      territory.push(state); // DC, PR, GU, etc. — not part of WAS
      continue;
    }
    const status = wasStates.get(abbr);
    if (status?.confirmed) confirmed.push(state);
    else if (status?.worked) worked.push(state);
    else unworked.push(state);
  }

  ctx.save();
  const batches: [StateData[], string][] = [
    [territory, "rgba(148, 163, 184, 0.12)"], // slate — N/A
    [unworked, "rgba(239, 68, 68, 0.18)"], // red — needed
    [worked, "rgba(251, 191, 36, 0.30)"], // amber — worked
    [confirmed, "rgba(34, 197, 94, 0.35)"], // green — confirmed
  ];

  for (const [states, color] of batches) {
    if (states.length === 0) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const state of states) {
      for (const ring of state.borders) {
        addWrappedRingPath2D(ctx, ring, width, height);
        ctx.closePath();
      }
    }
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw borders with boosted opacity within the night-side clip region.
 * Uses the terminator to build a clip path, then re-draws country and/or
 * state borders at higher opacity so they remain visible on the dark side.
 */
function drawNightBoostedBorders(
  ctx: CanvasRenderingContext2D,
  date: Date,
  width: number,
  height: number,
  drawCountry: boolean,
  drawStates: boolean,
) {
  const subsolar = getSubsolarPoint(date);
  const subsolarLatRad = subsolar.lat * (Math.PI / 180);
  const subsolarLonRad = subsolar.lon * (Math.PI / 180);

  // Build clip path for the night side using the terminator
  ctx.save();
  ctx.beginPath();

  // Generate terminator boundary points
  const tanSubsolarLat = Math.tan(subsolarLatRad);
  const isNearEquinox = Math.abs(tanSubsolarLat) < 0.001;

  const terminatorPoints: { x: number; y: number }[] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const lonRad = lon * (Math.PI / 180);
    const deltaLon = lonRad - subsolarLonRad;
    let lat: number;
    if (isNearEquinox) {
      lat = 0;
    } else {
      lat = Math.atan(-Math.cos(deltaLon) / tanSubsolarLat) * (180 / Math.PI);
    }
    terminatorPoints.push(latLonToCanvas(lat, lon, width, height));
  }

  // Determine which side is the night side
  // The anti-subsolar point is the center of the night side
  const antiSubsolarLat = -subsolar.lat;
  const antiSubsolarLon =
    subsolar.lon > 0 ? subsolar.lon - 180 : subsolar.lon + 180;
  const antiPoint = latLonToCanvas(
    antiSubsolarLat,
    antiSubsolarLon,
    width,
    height,
  );

  // Draw terminator as a path
  for (let i = 0; i < terminatorPoints.length; i++) {
    const p = terminatorPoints[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }

  // Close the night side: extend to the edge that contains the anti-subsolar point
  if (antiPoint.y < height / 2) {
    // Night side is at the top
    const lastP = terminatorPoints[terminatorPoints.length - 1];
    ctx.lineTo(width, lastP.y);
    ctx.lineTo(width, 0);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, terminatorPoints[0].y);
  } else {
    // Night side is at the bottom
    const lastP = terminatorPoints[terminatorPoints.length - 1];
    ctx.lineTo(width, lastP.y);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.lineTo(0, terminatorPoints[0].y);
  }
  ctx.closePath();
  ctx.clip();

  // Draw boosted country borders within the night clip
  if (drawCountry) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    for (const country of WORLD_COUNTRIES) {
      for (const ring of country.borders) {
        addWrappedRingPath2D(ctx, ring, width, height);
      }
    }
    ctx.stroke();
  }

  // Draw boosted state borders within the night clip
  if (drawStates) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const state of US_STATES) {
      for (const ring of state.borders) {
        addWrappedRingPath2D(ctx, ring, width, height);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
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
  pinScale = 1.0,
  zoomScale = 1.0,
) {
  const { x, y } = latLonToCanvas(lat, lon, width, height);
  const zoomDamp = Math.max(1, zoomScale);

  // Outer glow (larger when hovered)
  const glowRadius = Math.round(((isHovered ? 10 : 7) * pinScale) / zoomDamp);
  ctx.fillStyle = color + "30";
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Inner filled circle
  const innerRadius = Math.round(((isHovered ? 5 : 4) * pinScale) / zoomDamp);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
  ctx.fill();

  // Border ring
  ctx.strokeStyle = isHovered ? "#fff" : color;
  ctx.lineWidth = (isHovered ? 2 : 1) / zoomDamp;
  ctx.beginPath();
  ctx.arc(x, y, innerRadius + 1, 0, Math.PI * 2);
  ctx.stroke();

  // Icon above
  const iconSize = Math.max(1, Math.round((isHovered ? 14 : 12) / zoomDamp));
  ctx.font = `${iconSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(icon, x, y - Math.round(12 / zoomDamp));

  // Name label below (if present)
  if (name) {
    ctx.save();
    const s = 1 / zoomDamp;
    const fontSize = Math.max(1, Math.round(9 * s));
    ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(name);
    const pad = 3 * s;
    const lw = metrics.width + pad * 2;
    const lh = 12 * s;
    const labelTop = y + glowRadius + 4 * s;

    // Background pill
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(x - lw / 2, labelTop, lw, lh, 3 * s);
    ctx.fill();

    // Text (centered in pill)
    ctx.fillStyle = isHovered ? "#fff" : "rgba(255, 255, 255, 0.8)";
    ctx.fillText(name, x, labelTop + lh / 2);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Satellite markers (2D canvas)
// ---------------------------------------------------------------------------

/** Category colors matching the 3D SatelliteOverlay */
const SAT_CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  iss: "#ffffff",
  fm: "#00ff88",
  linear: "#00ccff",
  digital: "#ff9933",
  weather: "#cc88ff",
  other: "#888888",
};

/**
 * Draw satellite diamond markers on the 2D flat map.
 * Visible satellites use their category color; below-horizon satellites are dim gray.
 * The selected satellite gets a larger marker, white outline, glow, and name label.
 */
function drawSatellites(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  satellites: SatelliteInfo[],
  selectedSat: SatelliteInfo | null,
  zoomScale = 1.0,
) {
  const zoomDamp = Math.max(1, zoomScale);
  const HALF_SIZE = 4 / zoomDamp; // normal diamond half-size in px
  const HALF_SIZE_SEL = 6 / zoomDamp; // selected diamond half-size
  const DIM_COLOR = "#555";

  ctx.save();

  // Draw non-selected satellites first, selected last (on top)
  for (const sat of satellites) {
    if (selectedSat !== null && sat.noradId === selectedSat.noradId) continue;
    const { lat, lon } = sat.position;
    const { x, y } = latLonToCanvas(lat, lon, width, height);
    const color = sat.isVisible ? SAT_CATEGORY_COLORS[sat.category] : DIM_COLOR;

    ctx.beginPath();
    ctx.moveTo(x, y - HALF_SIZE);
    ctx.lineTo(x + HALF_SIZE, y);
    ctx.lineTo(x, y + HALF_SIZE);
    ctx.lineTo(x - HALF_SIZE, y);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.globalAlpha = sat.isVisible ? 0.9 : 0.4;
    ctx.fill();
  }

  // Draw selected satellite on top with glow + label
  if (selectedSat) {
    const { lat, lon } = selectedSat.position;
    const { x, y } = latLonToCanvas(lat, lon, width, height);
    const color = selectedSat.isVisible
      ? SAT_CATEGORY_COLORS[selectedSat.category]
      : DIM_COLOR;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 / zoomDamp;
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(x, y - HALF_SIZE_SEL);
    ctx.lineTo(x + HALF_SIZE_SEL, y);
    ctx.lineTo(x, y + HALF_SIZE_SEL);
    ctx.lineTo(x - HALF_SIZE_SEL, y);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 / zoomDamp;
    ctx.stroke();
    ctx.restore();

    // Name label
    const fontSize = Math.max(1, Math.round(8 / zoomDamp));
    ctx.globalAlpha = 1;
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelY = y + HALF_SIZE_SEL + 3 / zoomDamp;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5 / zoomDamp;
    ctx.lineJoin = "round";
    ctx.strokeText(selectedSat.name, x, labelY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(selectedSat.name, x, labelY);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// Re-use shared zoom state type
import type { FlatMapZoomState } from "@/types/map";

export function FlatMapView({
  displayTime,
  onLocationClick,
  fillContainer = false,
}: FlatMapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

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
  // Contest/renderer-agnostic overlay canvas (drawn on demand)
  const contestOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Spot highlight animation ref
  const spotHighlightRafRef = useRef<number>(0);

  // Track previous preset ID for detecting changes
  const prevPresetIdRef = useRef<string | null>(null);

  // Grid glow renderer (single instance, persists across renders)
  const glowRendererRef = useRef<GridGlowRenderer>(new GridGlowRenderer());
  // Track which spot IDs have already triggered glows (avoid re-firing on every render)
  const prevGlowSpotIdsRef = useRef<Set<string>>(new Set());
  // Tick counter to force canvas re-renders while glows are animating
  const [glowTick, setGlowTick] = useState(0);
  const glowRafRef = useRef<number>(0);

  const {
    layers,
    labelOptions,
    mapStyle,
    target,
    overlayLayers,
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
  const displayDensity = useMapStore((s) => s.displayDensity);
  const isLiteMode = useMapStore((s) => s.isLiteMode);
  const { station, preferences } = useUserStore();
  const { antennaType } = useActiveStationGain();
  const noiseEnvironment = useSettingsStore((s) => s.noiseEnvironment);
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
  const showSpotterLabels =
    preferences?.uiInteraction?.showSpotterLabels ?? false;
  const spotColorMode: SpotColorMode =
    preferences?.uiInteraction?.spotColorMode ?? "mode";
  const highViz = preferences?.uiInteraction?.visualStyle === "high-viz";
  const holdDurationMs = preferences?.uiInteraction?.holdDurationMs ?? 500;
  const spotDotScale = preferences?.uiInteraction?.spotDotScale ?? 1.0;
  const mapPinScale = preferences?.uiInteraction?.mapPinScale ?? 1.0;
  const labelScale = preferences?.uiInteraction?.labelScale ?? 1.0;
  const mapAspectRatio = preferences?.uiInteraction?.mapAspectRatio ?? 2.0;

  // Award progress for WAS overlay (only compute when enabled)
  const { wasStates } = useAwardProgress(labelOptions.wasOverlay);

  // Pin store
  const { addPin, removePin, getPinById } = usePinStore();
  const { pushAction } = useUndoStore();
  const pins = usePinStore((state) => state.pins);

  // DX stores
  const { updateFilter } = useDXStore();
  const selectedSpot = useDXStore((s) => s.selectedSpot);
  const { allSpots } = useDXCluster();

  // Satellite positions for 2D overlay
  const { satellites: satPositions, selectedSatellite: selectedSat } =
    useSatellites();

  // Hazard overlay data — hooks only fetch when layer is enabled
  const { earthquakes: earthquakeData } = useEarthquakes(layers.earthquakes);
  const { alerts: weatherAlerts } = useWeatherAlerts(layers.weather);
  const { strikes: lightningStrikes } = useLightning(layers.lightning);
  const { hotspots: fireHotspots } = useFires(layers.fires);
  const { spots: wsprSpots } = useWsprSpots(layers.wspr);

  // QSO overlay data — hooks only compute when layer is enabled
  const contestQsoData = useContestQsoLocations(layers.contestQsos);
  const loggedQsoData = useLoggedQsoLocations(layers.loggedQsos);

  // Watch store v2
  const watchEnabled = useWatchStore((state) => state.enabled);
  const matchedSpotIds = useWatchStore((state) => state.matchedSpotIds);
  const checkSpots = useWatchStore((state) => state.checkSpots);

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

  // State for spot label hover flyout
  const [hoveredSpotData, setHoveredSpotData] = useState<{
    spot: ResolvedSpot;
    screenPos: { x: number; y: number };
  } | null>(null);

  // Build SpotDetailsData from hovered spot label
  const hoveredSpotDetails = useMemo((): SpotDetailsData | null => {
    if (!hoveredSpotData) return null;
    const spot = hoveredSpotData.spot;
    const liveSpot = allSpots.find(
      (s) => s.id === spot.id || s.dx === spot.callsign,
    ) as LiveSpot | undefined;
    return {
      callsign: spot.callsign,
      dxGrid: liveSpot?.dxGrid,
      dxLat: spot.dxLat,
      dxLon: spot.dxLon,
      spotter: liveSpot?.spotter,
      spotterGrid: liveSpot?.spotterGrid,
      frequency: spot.frequency,
      band: liveSpot?.band,
      mode: spot.mode,
      time: spot.time,
      source: spot.source,
      snr: liveSpot?.snr,
      wpm: liveSpot?.wpm,
    };
  }, [hoveredSpotData, allSpots]);

  // State for GridResearchPanel
  const [researchPanelOpen, setResearchPanelOpen] = useState(false);
  const [researchGrid, setResearchGrid] = useState<string | null>(null);

  // State for continuous bearing/distance on hover
  const [hoverCoords, setHoverCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  // Fetch live spots when spots or spot traces layer is enabled
  const { spots } = useLiveSpots({
    grid: station?.grid,
    enabled: layers.spots || layers.spotTraces,
    refetchInterval: 60000,
  });

  // Resolve spot locations and limit by display density setting
  const resolvedSpots = useMemo(() => {
    if (!layers.spots && !layers.spotTraces) {
      return [];
    }
    return resolveSpotLocations(spots).slice(0, displayDensity);
  }, [spots, layers.spots, layers.spotTraces, displayDensity]);

  // Resolve the selected DX cluster spot into a ResolvedSpot for arc highlighting
  const resolvedSelectedSpot = useMemo((): ResolvedSpot | null => {
    if (!selectedSpot) return null;
    // DXSpot may have lat/lon directly, or we resolve via grid/callsign
    const spotterLat = selectedSpot.spotterLat;
    const spotterLon = selectedSpot.spotterLon;
    const dxLat = selectedSpot.dxLat;
    const dxLon = selectedSpot.dxLon;
    if (
      spotterLat === undefined ||
      spotterLon === undefined ||
      dxLat === undefined ||
      dxLon === undefined
    ) {
      // Try resolving via resolveSpotLocations (cast to LiveSpot-like)
      const resolved = resolveSpotLocations([selectedSpot as any]);
      return resolved.length > 0 ? resolved[0] : null;
    }
    return {
      id: selectedSpot.id,
      spotterLat,
      spotterLon,
      dxLat,
      dxLon,
      mode: selectedSpot.mode || "UNKNOWN",
      frequency: selectedSpot.frequency,
      time: selectedSpot.time,
      callsign: selectedSpot.dx,
      spotter: selectedSpot.spotter,
      source: (selectedSpot as any).source ?? "Cluster",
    };
  }, [selectedSpot]);

  // Feed new spots into the grid glow renderer when spots arrive.
  // Uses resolvedSpots (not raw spots) so the glow grid matches where the dot lands.
  useEffect(() => {
    if (!layers.spots && !layers.spotTraces) return;
    const now = Date.now();
    const currentIds = new Set<string>();
    const prevIds = prevGlowSpotIdsRef.current;
    const isInitialLoad = prevIds.size === 0 && resolvedSpots.length > 0;

    let newCount = 0;
    for (const spot of resolvedSpots) {
      currentIds.add(spot.id);
      if (prevIds.has(spot.id)) continue;

      const color = getSpotColor(spot, spotColorMode);

      // On initial page load, stagger glows over ~6 seconds so they ripple in
      // instead of all popping at once. Subsequent refetch batches fire immediately.
      const staggerOffset = isInitialLoad ? Math.random() * 6000 : 0;
      const timestamp = now - staggerOffset;

      try {
        const dxGrid4 = latLonToGrid(spot.dxLat, spot.dxLon, 4);
        glowRendererRef.current.addGlow({
          gridSquare: dxGrid4,
          color,
          timestamp,
        } satisfies GridGlowSpot);
      } catch {
        // Skip glow if coordinates are out of range
      }

      try {
        const spGrid4 = latLonToGrid(spot.spotterLat, spot.spotterLon, 4);
        glowRendererRef.current.addGlow({
          gridSquare: spGrid4,
          color,
          timestamp,
        } satisfies GridGlowSpot);
      } catch {
        // Skip glow if coordinates are out of range
      }
      newCount++;
    }

    prevGlowSpotIdsRef.current = currentIds;

    // Start the glow animation loop if there are active glows
    if (
      newCount > 0 &&
      glowRendererRef.current.hasActiveGlows() &&
      !glowRafRef.current
    ) {
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
  }, [resolvedSpots, layers.spots, layers.spotTraces, spotColorMode]);

  // Clean up glow RAF on unmount
  useEffect(() => {
    return () => {
      if (glowRafRef.current) {
        cancelAnimationFrame(glowRafRef.current);
        glowRafRef.current = 0;
      }
    };
  }, []);

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
      const distance = getDistance(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
      );
      const antennaGainDbi = getAntennaGainForPath(antennaType, distance);
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
        antennaGainDbi,
        noiseEnvironment,
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
    antennaType,
    noiseEnvironment,
  ]);

  // Check watch activity when spots change
  useEffect(() => {
    if (allSpots.length > 0) {
      checkSpots(allSpots);
    }
  }, [allSpots, checkSpots]);

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
      // Use actual CSS dimensions for screen-space mapping
      const cssScaleX = rect.width / displaySize.width;
      const cssScaleY = rect.height / displaySize.height;

      for (const pin of pins) {
        const cp = latLonToCanvas(
          pin.lat,
          pin.lon,
          displaySize.width,
          displaySize.height,
        );
        const sx = rect.left + (cp.x * z.scale + z.offsetX) * cssScaleX;
        const sy = rect.top + (cp.y * z.scale + z.offsetY) * cssScaleY;
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
      // Use actual CSS dimensions for screen-space mapping
      const cssScaleX = rect.width / displaySize.width;
      const cssScaleY = rect.height / displaySize.height;

      const cp = latLonToCanvas(
        target.lat,
        target.lon,
        displaySize.width,
        displaySize.height,
      );
      const sx = rect.left + (cp.x * z.scale + z.offsetX) * cssScaleX;
      const sy = rect.top + (cp.y * z.scale + z.offsetY) * cssScaleY;
      const dx = screenPos.x - sx;
      const dy = screenPos.y - sy;
      return dx * dx + dy * dy < TARGET_HIT_RADIUS_SQ;
    },
    [target, displaySize],
  );

  // Spot label hit-testing: check if screen position is inside any placed label
  const findSpotLabelAtScreenPos = useCallback(
    (screenPos: { x: number; y: number }): ResolvedSpot | null => {
      const canvas = canvasRef.current;
      if (!canvas || lastPlacedLabels.length === 0) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      const z = zoomRef.current;
      // Use actual CSS dimensions for screen-space mapping
      const cssScaleX = rect.width / displaySize.width;
      const cssScaleY = rect.height / displaySize.height;

      for (const label of lastPlacedLabels) {
        const { bbox } = label;
        // Convert canvas-space bbox to screen-space
        const sx = rect.left + (bbox.x * z.scale + z.offsetX) * cssScaleX;
        const sy = rect.top + (bbox.y * z.scale + z.offsetY) * cssScaleY;
        const sw = bbox.w * z.scale * cssScaleX;
        const sh = bbox.h * z.scale * cssScaleY;

        if (
          screenPos.x >= sx &&
          screenPos.x <= sx + sw &&
          screenPos.y >= sy &&
          screenPos.y <= sy + sh
        ) {
          return label.spot;
        }
      }
      return null;
    },
    [displaySize],
  );

  // Handle map hover - show tooltip or pin flyout
  const handleMapHover = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      // Always track hovered coordinates for bearing/distance overlay
      setHoverCoords({ lat, lon });

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

      // Check spot label hover (between pin and target checks)
      const hitSpotLabel = findSpotLabelAtScreenPos(screenPos);
      if (hitSpotLabel) {
        setHoveredSpotData({ spot: hitSpotLabel, screenPos });
        setTooltipPosition(null);
        setHoveredTargetPos(null);
        return;
      }
      if (hoveredSpotData) {
        setHoveredSpotData(null);
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
      findSpotLabelAtScreenPos,
      hoveredSpotData,
      isTargetAtScreenPos,
      hoveredTargetPos,
    ],
  );

  // Handle hover end
  const handleHoverEnd = useCallback(() => {
    setTooltipPosition(null);
    setHoveredPinData(null);
    setHoveredTargetPos(null);
    setHoveredSpotData(null);
    setHoverCoords(null);
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

  // Handle delete pin from PinFlyout
  const handleDeletePinFromFlyout = useCallback(() => {
    if (!hoveredPinData) return;
    const pin = getPinById(hoveredPinData.pin.id);
    if (pin) {
      pushAction({
        type: "DELETE_PIN",
        pinId: pin.id,
        pinData: pin,
        description: `Deleted pin "${pin.name || pin.grid}"`,
      });
      removePin(pin.id);
    }
    setHoveredPinData(null);
  }, [hoveredPinData, getPinById, pushAction, removePin]);

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
      useWatchStore.getState().setWatch({ gridPrefix, txOrRx: "either" });
      setFlyoutPosition(null);
    },
    [setFlyoutPosition],
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

      // Zoom offsets are in CSS/display coordinate space (applied after
      // ctx.scale(dpr)), so use CSS mouse coordinates directly — no DPR scaling.
      const canvasMouseX = mouseX;
      const canvasMouseY = mouseY;

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

      const targetScale = Math.max(1, Math.min(10, baseScale * delta));

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

    const computeSize = (rect: DOMRect) => {
      const containerWidth = Math.max(300, Math.floor(rect.width));
      const containerHeight = Math.max(150, Math.floor(rect.height));
      if (fillContainer) {
        // Fill the entire container — map draws at container size,
        // internally auto-adjusting zoom to fill vertically
        return { width: containerWidth, height: containerHeight };
      }
      // Configurable aspect ratio letterbox — fit within both width AND height constraints
      const ratio = Math.max(1.0, Math.min(3.0, mapAspectRatio));
      const width = Math.min(
        containerWidth,
        Math.floor(containerHeight * ratio),
      );
      const height = Math.floor(width / ratio);
      return { width, height };
    };

    // Track last known display size for viewport center preservation on resize
    const initialRect = container.getBoundingClientRect();
    let lastSize = computeSize(initialRect);

    const updateSize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const newSize = computeSize(rect);

        // Preserve viewport center when zoomed in during resize
        const z = zoomRef.current;
        if (z.scale > 1) {
          const oldW = lastSize.width;
          const oldH = lastSize.height;
          // Current viewport center in map-space coordinates
          const centerMapX = (-z.offsetX + oldW / 2) / z.scale;
          const centerMapY = (-z.offsetY + oldH / 2) / z.scale;
          // Recompute offsets to center the same map point in new viewport
          const newOffsetX = newSize.width / 2 - centerMapX * z.scale;
          const newOffsetY = newSize.height / 2 - centerMapY * z.scale;
          // Clamp offsets to valid range
          const maxOffsetX = newSize.width * (z.scale - 1);
          const maxOffsetY = newSize.height * (z.scale - 1);
          setZoom({
            scale: z.scale,
            offsetX: Math.max(-maxOffsetX, Math.min(0, newOffsetX)),
            offsetY: Math.max(-maxOffsetY, Math.min(0, newOffsetY)),
          });
        }

        lastSize = newSize;
        setDisplaySize(newSize);
      });
    };

    // Initial synchronous size read
    const rect = container.getBoundingClientRect();
    setDisplaySize(computeSize(rect));

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillContainer, mapAspectRatio]);

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
    const targetScale = Math.max(1, Math.min(10, preset.zoom));
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

  // Draw renderer-agnostic overlay layers (e.g., contest markers) on demand
  useEffect(() => {
    const oCanvas = contestOverlayCanvasRef.current;
    if (!oCanvas) {
      return;
    }

    const oCtx = oCanvas.getContext("2d");
    if (!oCtx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const { width: rw, height: rh } = displaySize;

    if (oCanvas.width !== rw * dpr || oCanvas.height !== rh * dpr) {
      oCanvas.width = rw * dpr;
      oCanvas.height = rh * dpr;
    }

    oCtx.clearRect(0, 0, oCanvas.width, oCanvas.height);
    oCtx.save();
    oCtx.scale(dpr, dpr);

    // Apply the same zoom transform as the main canvas
    const z = zoomRef.current;
    oCtx.translate(z.offsetX, z.offsetY);
    oCtx.scale(z.scale, z.scale);

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

        oCtx.save();
        oCtx.globalAlpha = arc.opacity ?? 0.7;
        oCtx.strokeStyle = arc.color;
        oCtx.lineWidth = arc.width ?? 2;
        oCtx.lineCap = "round";
        oCtx.lineJoin = "round";
        oCtx.beginPath();

        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const { x, y } = latLonToCanvas(pt.lat, pt.lon, rw, rh);
          if (i === 0) {
            oCtx.moveTo(x, y);
          } else {
            oCtx.lineTo(x, y);
          }
        }

        oCtx.stroke();
        oCtx.restore();
      }
    }

    // Draw overlay markers (on top)
    for (const layer of Object.values(overlayLayers)) {
      const markers =
        layer.type === "markers"
          ? layer.markers
          : layer.type === "mixed"
            ? layer.markers
            : [];

      for (const marker of markers) {
        const x = ((marker.lon + 180) / 360) * rw;
        const y = ((90 - marker.lat) / 180) * rh;
        const size = marker.size ?? 6;
        const opacity = marker.opacity ?? 0.9;

        oCtx.save();
        oCtx.globalAlpha = opacity;
        oCtx.beginPath();
        oCtx.arc(x, y, size, 0, Math.PI * 2);
        oCtx.fillStyle = marker.color;
        oCtx.fill();
        oCtx.lineWidth = 1;
        oCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        oCtx.stroke();
        oCtx.restore();
      }
    }

    oCtx.restore();
  }, [displaySize, overlayLayers, zoom]);

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

  // Touch gesture handling: single-finger pan + two-finger pinch-zoom
  const handleGesturePan = useCallback(
    (deltaX: number, deltaY: number) => {
      setZoom((prev) => {
        const clamped = clampOffsets(
          prev.scale,
          prev.offsetX + deltaX,
          prev.offsetY + deltaY,
        );
        return { ...prev, offsetX: clamped.offsetX, offsetY: clamped.offsetY };
      });
    },
    [clampOffsets],
  );

  const handleGesturePinchZoom = useCallback(
    (scaleDelta: number, centerX: number, centerY: number) => {
      setZoom((prev) => {
        const newScale = Math.max(1, Math.min(10.0, prev.scale * scaleDelta));
        // Zoom toward the pinch center point
        const factor = newScale / prev.scale;
        const newOffsetX = centerX - factor * (centerX - prev.offsetX);
        const newOffsetY = centerY - factor * (centerY - prev.offsetY);
        const clamped = clampOffsets(newScale, newOffsetX, newOffsetY);
        return {
          scale: newScale,
          offsetX: clamped.offsetX,
          offsetY: clamped.offsetY,
        };
      });
    },
    [clampOffsets],
  );

  const { isGesturing } = useFlatMapGestures({
    canvasRef,
    onPan: handleGesturePan,
    onPinchZoom: handleGesturePinchZoom,
    enabled: true,
  });

  // Integrate gesture-based interaction (press-and-hold, double-click, hover)
  // Pass isGesturing to suppress click detection during multi-touch pinch gestures
  useFlatMapClickHandler({
    canvasRef,
    zoom,
    displaySize,
    onLocationClick: handleMapClick,
    onDoubleClick: handleDoubleClick,
    onLocationHover: handleMapHover,
    onHoverEnd: handleHoverEnd,
    holdDurationMs,
    isGesturing,
  });

  // Render map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const isStandard = mapStyle === "standard";
    if (!isStandard && !mapImage) {
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

    // Draw base map (vector-like standard map, or satellite imagery)
    const baseImage: CanvasImageSource = isStandard
      ? getStandardMapCanvas()
      : mapImage!;
    ctx.drawImage(baseImage, 0, 0, renderWidth, renderHeight);

    // Draw MUF overlay (before night side so it's properly darkened)
    if (layers.muf && currentSFI) {
      drawMUF(ctx, currentSFI, displayTime, 0.45, renderWidth, renderHeight);
    }

    // Draw night side and terminator
    if (layers.terminator) {
      drawNightSide(
        ctx,
        displayTime,
        renderWidth,
        renderHeight,
        isStandard ? "standard" : "satellite",
      );
      drawTerminator(
        ctx,
        displayTime,
        renderWidth,
        renderHeight,
        highViz,
        isStandard,
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

    // Draw earthquake markers
    if (layers.earthquakes && earthquakeData.length > 0) {
      drawEarthquakes(
        ctx,
        earthquakeData,
        renderWidth,
        renderHeight,
        zoom.scale,
      );
    }

    // Draw weather alert markers
    if (layers.weather && weatherAlerts.length > 0) {
      drawWeatherAlerts(
        ctx,
        weatherAlerts,
        renderWidth,
        renderHeight,
        zoom.scale,
      );
    }

    // Draw lightning strikes
    if (layers.lightning && lightningStrikes.length > 0) {
      drawLightning(
        ctx,
        lightningStrikes,
        renderWidth,
        renderHeight,
        zoom.scale,
      );
    }

    // Draw fire hotspots
    if (layers.fires && fireHotspots.length > 0) {
      drawFires(ctx, fireHotspots, renderWidth, renderHeight, zoom.scale);
    }

    // Draw WSPR propagation paths
    if (layers.wspr && wsprSpots.length > 0) {
      drawWsprPaths(ctx, wsprSpots, renderWidth, renderHeight, zoom.scale);
    }

    // Draw logged QSO arcs (behind contest QSOs — more transparent)
    if (layers.loggedQsos && loggedQsoData) {
      drawLoggedQsos(ctx, loggedQsoData, renderWidth, renderHeight, zoom.scale);
    }

    // Draw contest QSO arcs (on top — more opaque, multiplier rings)
    if (layers.contestQsos && contestQsoData) {
      drawContestQsos(
        ctx,
        contestQsoData,
        renderWidth,
        renderHeight,
        zoom.scale,
      );
    }

    // Draw night lights (city lights on dark side)
    if (!isStandard && layers.nightLights) {
      drawNightLights(ctx, displayTime, renderWidth, renderHeight);
    }

    // Draw grid
    drawGrid(ctx, renderWidth, renderHeight, highViz);

    // Draw country borders (always when enabled, independent of labels toggle)
    if (labelOptions.borders) {
      drawLabels(
        ctx,
        renderWidth,
        renderHeight,
        {
          borders: true,
          stateBorders: false,
          countryNames: false,
          cities: false,
          maidenheadGrid: false,
          wasOverlay: false,
        },
        isStandard,
      );
    }

    // Draw WAS award overlay (behind state borders)
    if (labelOptions.wasOverlay) {
      drawWASOverlay(ctx, renderWidth, renderHeight, wasStates);
    }

    // Draw state borders
    if (labelOptions.stateBorders) {
      drawStateBorders(ctx, renderWidth, renderHeight, isStandard);
    }

    // Night-boosted border pass (clipped to night side)
    if (
      layers.terminator &&
      (labelOptions.borders || labelOptions.stateBorders)
    ) {
      drawNightBoostedBorders(
        ctx,
        displayTime,
        renderWidth,
        renderHeight,
        labelOptions.borders,
        labelOptions.stateBorders,
      );
    }

    // Draw text labels (country names, cities, maidenhead grid — only when labels layer is on)
    const shouldDrawTextLabels = layers.labels || isStandard;
    if (shouldDrawTextLabels) {
      drawLabels(
        ctx,
        renderWidth,
        renderHeight,
        {
          borders: false,
          stateBorders: false,
          countryNames: layers.labels ? labelOptions.countryNames : false,
          cities: layers.labels ? labelOptions.cities : false,
          maidenheadGrid: layers.labels ? labelOptions.maidenheadGrid : false,
          wasOverlay: false,
        },
        isStandard,
        zoom.scale,
        zoom.offsetX,
        zoom.offsetY,
        displaySize.width,
        displaySize.height,
      );
    }

    // Draw grid glow pulses (after base map / terminator / labels, before spot arcs)
    if (
      (layers.spots || layers.spotTraces) &&
      glowRendererRef.current.hasActiveGlows()
    ) {
      const glowProject = (lat: number, lon: number) =>
        latLonToCanvas(lat, lon, renderWidth, renderHeight);
      glowRendererRef.current.draw(ctx, glowProject, Date.now());
    }

    // Highlight Maidenhead grid squares containing active spots
    if (
      layers.labels &&
      labelOptions.maidenheadGrid &&
      layers.spots &&
      resolvedSpots.length > 0
    ) {
      drawSpotGridHighlights(
        ctx,
        resolvedSpots,
        renderWidth,
        renderHeight,
        zoom.scale,
      );
    }

    // Draw live spot arcs (dimmed for non-matched when watch is active)
    if (layers.spots && resolvedSpots.length > 0) {
      drawSpotArcs(
        ctx,
        resolvedSpots,
        renderWidth,
        renderHeight,
        spotColorMode,
        highViz,
        spotDotScale,
        watchEnabled && matchedSpotIds.size > 0,
        matchedSpotIds,
        zoom.scale,
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
        labelScale,
        zoom.scale,
      );
    }

    // Draw spotter labels at spotter positions (only when both toggles are on)
    if (
      showCallsignLabels &&
      showSpotterLabels &&
      layers.spots &&
      resolvedSpots.length > 0
    ) {
      drawSpotterLabels(
        ctx,
        resolvedSpots,
        renderWidth,
        renderHeight,
        spotColorMode,
        highViz,
        labelScale,
        zoom.scale,
      );
    }

    // Draw satellite positions (2D canvas markers)
    if (layers.satellites && satPositions.length > 0) {
      drawSatellites(
        ctx,
        renderWidth,
        renderHeight,
        satPositions,
        selectedSat,
        zoom.scale,
      );
    }

    // Draw highlight for hovered spot arc
    if (hoveredSpotData && layers.spots) {
      const hoveredSpot = resolvedSpots.find(
        (s) => s.id === hoveredSpotData.spot.id,
      );
      if (hoveredSpot) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.shadowColor = getSpotColor(hoveredSpot, spotColorMode);
        ctx.shadowBlur = 8;
        drawSpotArc(
          ctx,
          hoveredSpot,
          renderWidth,
          renderHeight,
          spotColorMode,
          true, // force high-viz style for highlight
          spotDotScale,
          1, // full opacity for highlight
          zoom.scale,
        );
        ctx.restore();
      }
    }

    // Draw highlighted arc for selected DX cluster spot (persistent while selected)
    if (resolvedSelectedSpot && layers.spots) {
      drawSelectedSpotArc(
        ctx,
        resolvedSelectedSpot,
        renderWidth,
        renderHeight,
        spotDotScale,
        zoom.scale,
        labelScale,
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
        zoom.scale,
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
        mapPinScale,
        zoom.scale,
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
        mapPinScale,
        zoom.scale,
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
          mapPinScale,
          zoom.scale,
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

    // DEBUG: Draw crosshairs at known US cities to verify projection accuracy
    // Denver CO (39.74°N, 104.99°W) and center of map (0°, 0°)
    if (import.meta.env.DEV) {
      const debugPoints = [
        { lat: 39.74, lon: -104.99, label: "Denver", color: "#ff0000" },
        { lat: 0, lon: 0, label: "0,0", color: "#00ff00" },
      ];
      for (const dp of debugPoints) {
        const pos = latLonToCanvas(dp.lat, dp.lon, renderWidth, renderHeight);
        ctx.strokeStyle = dp.color;
        ctx.lineWidth = 2 / zoom.scale;
        ctx.beginPath();
        ctx.moveTo(pos.x - 10 / zoom.scale, pos.y);
        ctx.lineTo(pos.x + 10 / zoom.scale, pos.y);
        ctx.moveTo(pos.x, pos.y - 10 / zoom.scale);
        ctx.lineTo(pos.x, pos.y + 10 / zoom.scale);
        ctx.stroke();
        ctx.fillStyle = dp.color;
        ctx.font = `bold ${11 / zoom.scale}px sans-serif`;
        ctx.fillText(dp.label, pos.x + 8 / zoom.scale, pos.y - 5 / zoom.scale);
      }

      // Log canvas vs displaySize mismatch (once)
      const rect = canvas.getBoundingClientRect();
      if (
        Math.abs(rect.width - renderWidth) > 1 ||
        Math.abs(rect.height - renderHeight) > 1
      ) {
        console.warn(
          `[MapDebug] SIZE MISMATCH! canvas rect=${rect.width.toFixed(0)}x${rect.height.toFixed(0)} displaySize=${renderWidth}x${renderHeight} buffer=${canvas.width}x${canvas.height}`,
        );
      }
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
    resolvedSelectedSpot,
    targetMarkerColor,
    pathDifficulty,
    pathMetrics,
    pins,
    hoveredPinData,
    hoveredSpotData,
    zoom,
    displaySize,
    compassRoseEnabled,
    showCallsignLabels,
    showSpotterLabels,
    spotColorMode,
    highViz,
    spotDotScale,
    mapPinScale,
    labelScale,
    mapStyle,
    wasStates,
    watchEnabled,
    matchedSpotIds,
    glowTick,
    satPositions,
    selectedSat,
    earthquakeData,
    weatherAlerts,
    lightningStrikes,
    fireHotspots,
    wsprSpots,
    contestQsoData,
    loggedQsoData,
  ]);

  // Compute bearing and distance from user's home QTH to hovered point
  const hoverBearingDistance = useMemo(() => {
    if (!hoverCoords || !station) return null;
    const dist = getDistance(
      station.lat,
      station.lon,
      hoverCoords.lat,
      hoverCoords.lon,
    );
    const bearing = getBearing(
      station.lat,
      station.lon,
      hoverCoords.lat,
      hoverCoords.lon,
    );
    return {
      bearing: Math.round(bearing),
      compassDir: formatBearing(bearing),
      distanceKm: Math.round(dist),
    };
  }, [hoverCoords, station]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full min-h-[400px] bg-deep-space overflow-hidden relative select-none ${
        fillContainer ? "" : "rounded-xl flex items-center justify-center"
      }`}
    >
      {!mapImage && mapStyle === "satellite" && (
        <div className="absolute inset-0 flex items-center justify-center bg-deep-space">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-plasma-orange border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 text-sm">Loading map...</span>
          </div>
        </div>
      )}
      <div
        className="relative flex-shrink-0"
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
        {/* Renderer-agnostic overlay canvas (contest overlays, etc.) */}
        <canvas
          ref={contestOverlayCanvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            width: displaySize.width,
            height: displaySize.height,
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

      {/* Aspect ratio slider — only in letterbox mode, hidden in lite mode
           (docked to PathAnalysis panel in PropSphere HUD instead) */}
      {!fillContainer && !isLiteMode && <AspectRatioSlider />}

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

      {/* Spot & pin size sliders - bottom left corner */}
      <MapSizeSliders />

      {/* Bearing/Distance overlay - shown when hovering over the map */}
      {hoverBearingDistance && (
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
          <div className="px-2.5 py-1.5 rounded-lg bg-void-black/80 backdrop-blur-sm border border-white/10 text-xs font-mono tabular-nums text-gray-300">
            <span className="text-plasma-orange font-semibold">
              {String(hoverBearingDistance.bearing).padStart(3, "0")}°
            </span>
            <span className="text-gray-500 mx-1">
              {hoverBearingDistance.compassDir}
            </span>
            <span className="text-gray-500 mx-1">|</span>
            <span className="text-cosmic-cyan font-semibold">
              {hoverBearingDistance.distanceKm.toLocaleString()}
            </span>
            <span className="text-gray-500 ml-0.5">km</span>
          </div>
        </div>
      )}

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
          onDeletePin={handleDeletePinFromFlyout}
          onClose={handlePinFlyoutClose}
        />
      )}

      {/* Spot label hover flyout */}
      {hoveredSpotDetails && hoveredSpotData && (
        <SpotDetailsFlyout
          visible
          position={hoveredSpotData.screenPos}
          spot={hoveredSpotDetails}
          onClose={() => setHoveredSpotData(null)}
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
    </div>
  );
}

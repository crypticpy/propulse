/**
 * FlatMapView Component
 *
 * 2D equirectangular map view with NASA Blue Marble texture
 * and terminator/greyline overlays.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { getPathPoints } from "@/lib/utils/path";
import { useAuroraData } from "@/hooks/useAuroraData";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { estimateMUF, getMUFColor } from "@/lib/api/muf";
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
  homeMarker: "#00ff88",
  targetMarker: "#ff6b35",
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
 */
function drawTerminator(ctx: CanvasRenderingContext2D, date: Date) {
  const subsolar = getSubsolarPoint(date);

  ctx.strokeStyle = COLORS.terminator;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLORS.terminator;
  ctx.shadowBlur = 4;

  ctx.beginPath();

  // Draw terminator by finding 90° points from subsolar
  for (let lon = -180; lon <= 180; lon += 1) {
    const lonRad = lon * (Math.PI / 180);
    const subsolarLatRad = subsolar.lat * (Math.PI / 180);
    const subsolarLonRad = subsolar.lon * (Math.PI / 180);

    // Find latitude where angle from subsolar = 90°
    const deltaLon = lonRad - subsolarLonRad;
    const lat =
      Math.atan(-Math.cos(deltaLon) / Math.tan(subsolarLatRad)) *
      (180 / Math.PI);

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
 * Draw a location marker
 */
function drawMarker(
  ctx: CanvasRenderingContext2D,
  lat: number,
  lon: number,
  color: string,
  label?: string,
  isHome: boolean = false,
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

  // Label
  if (label) {
    ctx.fillStyle = "#0a0a1a";
    ctx.fillRect(x - 30, y - 28, 60, 16);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 30, y - 28, 60, 16);

    ctx.fillStyle = color;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - 16);
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
) {
  const points = getPathPoints(startLat, startLon, endLat, endLon, 100);

  ctx.strokeStyle = COLORS.path;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLORS.path;
  ctx.shadowBlur = 6;
  ctx.setLineDash([8, 4]);

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
  ctx.shadowBlur = 0;
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

export function FlatMapView({
  displayTime,
  onLocationClick,
}: FlatMapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const { layers, target } = useMapStore();
  const { station } = useUserStore();
  const { data: auroraData } = useAuroraData();
  const currentSFI = useCurrentSFI();

  // Load map image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setMapImage(img);
    img.src = "/textures/earth-flat.jpg";
  }, []);

  // Handle canvas click
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !onLocationClick) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;

      const { lat, lon } = canvasToLatLon(x, y, canvas.width, canvas.height);
      onLocationClick(lat, lon);
    },
    [onLocationClick],
  );

  // Render map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapImage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    // Draw grid
    drawGrid(ctx);

    // Draw path if both home and target exist
    if (station && target) {
      drawPath(ctx, station.lat, station.lon, target.lat, target.lon);
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
        COLORS.targetMarker,
        target.name || target.grid,
      );
    }
  }, [displayTime, layers, station, target, mapImage, auroraData, currentSFI]);

  return (
    <div className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative">
      {!mapImage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-500">Loading map...</div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        onClick={handleClick}
        className="w-full h-full cursor-crosshair"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}

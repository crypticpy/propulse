/**
 * DXSpotOverlay Components
 *
 * Map overlays for displaying DX spots on both 3D globe and 2D flat map views.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { getBandColor } from "@/lib/api/dxcluster";
import { latLonToCanvas } from "@/lib/utils/canvas";
import type { DXSpot } from "@/types/dxcluster";

// Map dimensions (must match FlatMapView) - used for date line wrap-around
const MAP_WIDTH = 1024;

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// ============================================================================
// 3D Globe Components
// ============================================================================

interface SpotMarker3DProps {
  spot: DXSpot;
  isSelected: boolean;
  isHovered: boolean;
  onSpotClick: (spot: DXSpot) => void;
  onSpotHover: (spot: DXSpot | null) => void;
}

/**
 * Individual 3D spot marker for globe view
 */
function SpotMarker3D({
  spot,
  isSelected,
  isHovered,
  onSpotClick,
  onSpotHover,
}: SpotMarker3DProps) {
  const markerRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  const hasPosition = spot.dxLat !== undefined && spot.dxLon !== undefined;

  const bandColor = getBandColor(spot.band || "");
  const position = useMemo(
    () =>
      hasPosition ? latLonToVector3(spot.dxLat!, spot.dxLon!, 1.01) : null,
    [hasPosition, spot.dxLat, spot.dxLon],
  );

  // Pulse animation for selected/hovered markers
  useFrame(({ clock }) => {
    if (!hasPosition) {
      return;
    }
    if (pulseRef.current && (isSelected || isHovered)) {
      const scale = 1 + Math.sin(clock.elapsedTime * 4) * 0.3;
      pulseRef.current.scale.set(scale, scale, scale);
    }
  });

  if (!position) {
    return null;
  }

  const markerSize = isSelected ? 0.02 : isHovered ? 0.018 : 0.012;
  const pulseSize = markerSize * 2.5;

  return (
    <group position={position}>
      {/* Pulse ring for selected/hovered */}
      {(isSelected || isHovered) && (
        <mesh ref={pulseRef}>
          <ringGeometry args={[pulseSize * 0.8, pulseSize, 32]} />
          <meshBasicMaterial
            color={bandColor.color}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Main marker dot */}
      <mesh
        ref={markerRef}
        onClick={(e) => {
          e.stopPropagation();
          onSpotClick(spot);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onSpotHover(spot);
        }}
        onPointerOut={() => onSpotHover(null)}
      >
        <sphereGeometry args={[markerSize, 12, 12]} />
        <meshBasicMaterial color={bandColor.color} />
      </mesh>

      {/* Tooltip for hovered/selected */}
      {(isSelected || isHovered) && (
        <Html
          position={[0, markerSize * 4, 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            className="px-2 py-1 rounded text-xs font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.95)",
              color: bandColor.color,
              border: `1px solid ${bandColor.color}`,
              boxShadow: `0 0 10px ${bandColor.color}40`,
            }}
          >
            <div className="font-bold">{spot.dx}</div>
            <div className="text-gray-400 text-[10px]">
              {(spot.frequency / 1000).toFixed(3)} MHz {spot.mode}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export interface DXSpotOverlay3DProps {
  /** Array of spots to display */
  spots: DXSpot[];
  /** Currently selected spot */
  selectedSpot: DXSpot | null;
  /** Currently hovered spot */
  hoveredSpot?: DXSpot | null;
  /** Callback when a spot is clicked */
  onSpotClick: (spot: DXSpot) => void;
  /** Callback when a spot is hovered */
  onSpotHover?: (spot: DXSpot | null) => void;
}

/**
 * 3D Globe overlay component for DX spots
 * Use inside a React Three Fiber Canvas
 */
export function DXSpotOverlay3D({
  spots,
  selectedSpot,
  hoveredSpot = null,
  onSpotClick,
  onSpotHover = () => {},
}: DXSpotOverlay3DProps) {
  // Only render spots with valid positions
  const validSpots = useMemo(
    () => spots.filter((s) => s.dxLat !== undefined && s.dxLon !== undefined),
    [spots],
  );

  return (
    <group>
      {validSpots.map((spot) => (
        <SpotMarker3D
          key={spot.id}
          spot={spot}
          isSelected={selectedSpot?.id === spot.id}
          isHovered={hoveredSpot?.id === spot.id}
          onSpotClick={onSpotClick}
          onSpotHover={onSpotHover}
        />
      ))}
    </group>
  );
}

// ============================================================================
// 2D Flat Map Drawing Functions
// ============================================================================

/**
 * Draw a single spot marker on canvas
 */
function drawSpotMarker(
  ctx: CanvasRenderingContext2D,
  spot: DXSpot,
  isSelected: boolean,
  isHovered: boolean,
) {
  if (spot.dxLat === undefined || spot.dxLon === undefined) {
    return;
  }

  const { x, y } = latLonToCanvas(spot.dxLat, spot.dxLon);
  const bandColor = getBandColor(spot.band || "");
  const size = isSelected ? 8 : isHovered ? 7 : 5;

  ctx.save();

  // Outer glow for selected/hovered
  if (isSelected || isHovered) {
    ctx.fillStyle = bandColor.color + "40";
    ctx.beginPath();
    ctx.arc(x, y, size * 2, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing ring effect
    ctx.strokeStyle = bandColor.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Main marker (diamond shape for DX spots)
  ctx.fillStyle = bandColor.color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw tooltip for hovered/selected spot
 */
function drawSpotTooltip(
  ctx: CanvasRenderingContext2D,
  spot: DXSpot,
  isSelected: boolean,
) {
  if (spot.dxLat === undefined || spot.dxLon === undefined) return;

  const { x, y } = latLonToCanvas(spot.dxLat, spot.dxLon);
  const bandColor = getBandColor(spot.band || "");

  const label = spot.dx;
  const subLabel = `${(spot.frequency / 1000).toFixed(1)} ${spot.mode || ""}`;

  ctx.save();

  // Measure text
  ctx.font = "bold 11px monospace";
  const labelWidth = ctx.measureText(label).width;
  ctx.font = "9px monospace";
  const subLabelWidth = ctx.measureText(subLabel).width;
  const boxWidth = Math.max(labelWidth, subLabelWidth) + 12;
  const boxHeight = 28;
  const boxX = x - boxWidth / 2;
  const boxY = y - 35;

  // Background
  ctx.fillStyle = "rgba(10, 10, 26, 0.95)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  // Border
  ctx.strokeStyle = bandColor.color;
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  // Glow
  if (isSelected) {
    ctx.shadowColor = bandColor.color;
    ctx.shadowBlur = 6;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    ctx.shadowBlur = 0;
  }

  // Text
  ctx.fillStyle = bandColor.color;
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, boxY + 12);

  ctx.fillStyle = "#9ca3af";
  ctx.font = "9px monospace";
  ctx.fillText(subLabel, x, boxY + 23);

  // Pointer triangle
  ctx.fillStyle = "rgba(10, 10, 26, 0.95)";
  ctx.beginPath();
  ctx.moveTo(x - 5, boxY + boxHeight);
  ctx.lineTo(x + 5, boxY + boxHeight);
  ctx.lineTo(x, boxY + boxHeight + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = bandColor.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 5, boxY + boxHeight);
  ctx.lineTo(x, boxY + boxHeight + 5);
  ctx.lineTo(x + 5, boxY + boxHeight);
  ctx.stroke();

  ctx.restore();
}

export interface DrawDXSpotsOptions {
  /** Show tooltips for hovered/selected spots */
  showTooltips?: boolean;
  /** Draw paths from spotter to DX station */
  showPaths?: boolean;
}

/**
 * Draw DX spots on a 2D canvas (for FlatMapView)
 *
 * @param ctx - Canvas 2D rendering context
 * @param spots - Array of spots to draw
 * @param selectedSpot - Currently selected spot (or null)
 * @param hoveredSpot - Currently hovered spot (or null)
 * @param options - Drawing options
 */
export function drawDXSpots(
  ctx: CanvasRenderingContext2D,
  spots: DXSpot[],
  selectedSpot: DXSpot | null,
  hoveredSpot: DXSpot | null = null,
  options: DrawDXSpotsOptions = {},
): void {
  const { showTooltips = true, showPaths = false } = options;

  // Draw paths first (under markers)
  if (showPaths) {
    for (const spot of spots) {
      if (
        spot.dxLat !== undefined &&
        spot.dxLon !== undefined &&
        spot.spotterLat !== undefined &&
        spot.spotterLon !== undefined
      ) {
        const isActive =
          selectedSpot?.id === spot.id || hoveredSpot?.id === spot.id;
        drawSpotPath(ctx, spot, isActive);
      }
    }
  }

  // Draw regular markers (non-selected, non-hovered)
  for (const spot of spots) {
    if (selectedSpot?.id !== spot.id && hoveredSpot?.id !== spot.id) {
      drawSpotMarker(ctx, spot, false, false);
    }
  }

  // Draw hovered spot (on top of regular)
  if (hoveredSpot && hoveredSpot.id !== selectedSpot?.id) {
    drawSpotMarker(ctx, hoveredSpot, false, true);
    if (showTooltips) {
      drawSpotTooltip(ctx, hoveredSpot, false);
    }
  }

  // Draw selected spot (on top of all)
  if (selectedSpot) {
    drawSpotMarker(ctx, selectedSpot, true, false);
    if (showTooltips) {
      drawSpotTooltip(ctx, selectedSpot, true);
    }
  }
}

/**
 * Draw path from spotter to DX station
 */
function drawSpotPath(
  ctx: CanvasRenderingContext2D,
  spot: DXSpot,
  isActive: boolean,
) {
  if (
    spot.dxLat === undefined ||
    spot.dxLon === undefined ||
    spot.spotterLat === undefined ||
    spot.spotterLon === undefined
  ) {
    return;
  }

  const start = latLonToCanvas(spot.spotterLat, spot.spotterLon);
  const end = latLonToCanvas(spot.dxLat, spot.dxLon);
  const bandColor = getBandColor(spot.band || "");

  ctx.save();

  ctx.strokeStyle = isActive ? bandColor.color : bandColor.color + "60";
  ctx.lineWidth = isActive ? 2 : 1;
  ctx.setLineDash([4, 4]);

  // Handle wrap-around at date line
  const dx = end.x - start.x;
  if (Math.abs(dx) > MAP_WIDTH / 2) {
    // Path crosses date line, draw in two segments
    if (dx > 0) {
      // Going east, wrap west
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(0, (start.y + end.y) / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(MAP_WIDTH, (start.y + end.y) / 2);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else {
      // Going west, wrap east
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(MAP_WIDTH, (start.y + end.y) / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, (start.y + end.y) / 2);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Check if a canvas point is near a spot (for hit detection)
 */
export function getSpotAtPoint(
  x: number,
  y: number,
  spots: DXSpot[],
  hitRadius: number = 10,
): DXSpot | null {
  // Scale coordinates to map dimensions
  // Note: caller should provide already-scaled coordinates

  for (const spot of spots) {
    if (spot.dxLat === undefined || spot.dxLon === undefined) {
      continue;
    }

    const spotPos = latLonToCanvas(spot.dxLat, spot.dxLon);
    const distance = Math.sqrt(
      Math.pow(x - spotPos.x, 2) + Math.pow(y - spotPos.y, 2),
    );

    if (distance <= hitRadius) {
      return spot;
    }
  }

  return null;
}

export default DXSpotOverlay3D;

/**
 * NVISCoverage Component
 *
 * Renders NVIS coverage circles on the map views.
 * Provides both 3D (Three.js) and 2D (Canvas) implementations
 * for use with GlobeView and FlatMapView respectively.
 *
 * Coverage visualization:
 * - Outer circle: Maximum coverage radius (~400km)
 * - Inner circle: Optimal coverage area (~250km)
 * - Concentric rings at 100km intervals for distance reference
 */

import { useMemo } from "react";
import * as THREE from "three";

// Earth radius for calculations
const EARTH_RADIUS_KM = 6371;
const GLOBE_RADIUS = 1; // Three.js globe radius

// NVIS coverage colors (purple/violet theme for emergency communications)
const NVIS_COLORS = {
  outer: "#9333ea", // purple-600
  inner: "#a855f7", // purple-500
  rings: "#c084fc", // purple-400
  glow: "#d946ef", // fuchsia-500
};

interface NVISCoverageProps {
  /** Center latitude in degrees */
  centerLat: number;
  /** Center longitude in degrees */
  centerLon: number;
  /** Maximum coverage radius in km */
  radiusKm: number;
  /** Optimal coverage radius in km (default: 60% of max) */
  optimalRadiusKm?: number;
  /** Whether the overlay is visible */
  visible?: boolean;
}

/**
 * Convert lat/lon to 3D position on globe
 */
function latLonToPosition(
  lat: number,
  lon: number,
  radius: number = GLOBE_RADIUS,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Calculate point at distance and bearing from center
 */
function getPointAtDistance(
  centerLat: number,
  centerLon: number,
  distanceKm: number,
  bearingDeg: number,
): { lat: number; lon: number } {
  const R = EARTH_RADIUS_KM;
  const d = distanceKm / R; // Angular distance in radians
  const bearing = bearingDeg * (Math.PI / 180);

  const lat1 = centerLat * (Math.PI / 180);
  const lon1 = centerLon * (Math.PI / 180);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: lat2 * (180 / Math.PI),
    lon: lon2 * (180 / Math.PI),
  };
}

/**
 * Generate circle points on Earth's surface
 */
function generateCirclePoints(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  numPoints: number = 64,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i <= numPoints; i++) {
    const bearing = (i / numPoints) * 360;
    const point = getPointAtDistance(centerLat, centerLon, radiusKm, bearing);
    points.push(point);
  }

  return points;
}

/**
 * NVISCoverage3D - Three.js implementation for GlobeView
 *
 * Renders NVIS coverage circles on the 3D globe using Three.js meshes.
 * Includes outer coverage ring, optimal coverage ring, and distance markers.
 */
export function NVISCoverage3D({
  centerLat,
  centerLon,
  radiusKm,
  optimalRadiusKm,
  visible = true,
}: NVISCoverageProps) {
  // Calculate optimal radius if not provided
  const actualOptimalRadius = optimalRadiusKm || radiusKm * 0.6;

  // Generate circle geometries
  const geometry = useMemo(() => {
    // Generate points for outer circle
    const outerPoints = generateCirclePoints(centerLat, centerLon, radiusKm);
    const outerPositions = outerPoints.map((p) =>
      latLonToPosition(p.lat, p.lon, GLOBE_RADIUS + 0.002),
    );

    // Generate points for optimal circle
    const innerPoints = generateCirclePoints(
      centerLat,
      centerLon,
      actualOptimalRadius,
    );
    const innerPositions = innerPoints.map((p) =>
      latLonToPosition(p.lat, p.lon, GLOBE_RADIUS + 0.002),
    );

    // Generate ring markers at 100km intervals
    const ringRadii = [];
    for (let r = 100; r < radiusKm; r += 100) {
      ringRadii.push(r);
    }
    const ringPoints = ringRadii.map((r) =>
      generateCirclePoints(centerLat, centerLon, r).map((p) =>
        latLonToPosition(p.lat, p.lon, GLOBE_RADIUS + 0.001),
      ),
    );

    // Create filled coverage area using a disc
    const discPoints: THREE.Vector3[] = [];
    const numRings = 20;
    const segments = 64;

    for (let ring = 0; ring <= numRings; ring++) {
      const ringRadius = (ring / numRings) * radiusKm;
      for (let seg = 0; seg <= segments; seg++) {
        const bearing = (seg / segments) * 360;
        const point = getPointAtDistance(
          centerLat,
          centerLon,
          ringRadius,
          bearing,
        );
        discPoints.push(
          latLonToPosition(point.lat, point.lon, GLOBE_RADIUS + 0.001),
        );
      }
    }

    return {
      outerPositions,
      innerPositions,
      ringPoints,
      discPoints,
      numRings,
      segments,
    };
  }, [centerLat, centerLon, radiusKm, actualOptimalRadius]);

  if (!visible) {
    return null;
  }

  return (
    <group>
      {/* Coverage disc (filled area) */}
      <mesh>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={geometry.discPoints.length}
            array={
              new Float32Array(
                geometry.discPoints.flatMap((p) => [p.x, p.y, p.z]),
              )
            }
            itemSize={3}
          />
        </bufferGeometry>
        <meshBasicMaterial
          color={NVIS_COLORS.outer}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Outer coverage ring */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={geometry.outerPositions.length}
            array={
              new Float32Array(
                geometry.outerPositions.flatMap((p) => [p.x, p.y, p.z]),
              )
            }
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={NVIS_COLORS.outer}
          linewidth={2}
          transparent
          opacity={0.8}
        />
      </line>

      {/* Optimal coverage ring */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={geometry.innerPositions.length}
            array={
              new Float32Array(
                geometry.innerPositions.flatMap((p) => [p.x, p.y, p.z]),
              )
            }
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={NVIS_COLORS.inner}
          linewidth={2}
          transparent
          opacity={0.9}
        />
      </line>

      {/* Distance marker rings */}
      {geometry.ringPoints.map((ringPositions, index) => (
        <line key={index}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={ringPositions.length}
              array={
                new Float32Array(ringPositions.flatMap((p) => [p.x, p.y, p.z]))
              }
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={NVIS_COLORS.rings}
            linewidth={1}
            transparent
            opacity={0.3}
          />
        </line>
      ))}

      {/* Center marker */}
      <mesh
        position={latLonToPosition(centerLat, centerLon, GLOBE_RADIUS + 0.003)}
      >
        <sphereGeometry args={[0.008, 16, 16]} />
        <meshBasicMaterial color={NVIS_COLORS.glow} />
      </mesh>
    </group>
  );
}

/**
 * Draw NVIS coverage on 2D canvas (for FlatMapView)
 *
 * Renders coverage circles on a 2D equirectangular map projection.
 * Called from FlatMapView's render loop.
 *
 * @param ctx - Canvas 2D rendering context
 * @param centerLat - Center latitude in degrees
 * @param centerLon - Center longitude in degrees
 * @param radiusKm - Maximum coverage radius in km
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param optimalRadiusKm - Optional optimal coverage radius in km
 */
export function drawNVISCoverage(
  ctx: CanvasRenderingContext2D,
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  width: number,
  height: number,
  optimalRadiusKm?: number,
): void {
  const actualOptimalRadius = optimalRadiusKm || radiusKm * 0.6;

  // Convert lat/lon to canvas coordinates
  const toCanvas = (lat: number, lon: number) => ({
    x: ((lon + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  });

  // Generate circle points
  const outerPoints = generateCirclePoints(centerLat, centerLon, radiusKm, 72);
  const innerPoints = generateCirclePoints(
    centerLat,
    centerLon,
    actualOptimalRadius,
    72,
  );

  // Save context state
  ctx.save();

  // Draw filled coverage area with gradient
  ctx.beginPath();
  const centerCanvas = toCanvas(centerLat, centerLon);

  // Calculate approximate pixel radius for gradient
  const outerPointCanvas = toCanvas(outerPoints[0].lat, outerPoints[0].lon);
  const pixelRadius = Math.sqrt(
    Math.pow(outerPointCanvas.x - centerCanvas.x, 2) +
      Math.pow(outerPointCanvas.y - centerCanvas.y, 2),
  );

  // Create radial gradient
  const gradient = ctx.createRadialGradient(
    centerCanvas.x,
    centerCanvas.y,
    0,
    centerCanvas.x,
    centerCanvas.y,
    pixelRadius,
  );
  gradient.addColorStop(0, "rgba(147, 51, 234, 0.3)"); // purple-600
  gradient.addColorStop(0.6, "rgba(147, 51, 234, 0.15)");
  gradient.addColorStop(1, "rgba(147, 51, 234, 0.05)");

  // Draw outer coverage area
  ctx.beginPath();
  outerPoints.forEach((point, i) => {
    const canvasPoint = toCanvas(point.lat, point.lon);
    if (i === 0) {
      ctx.moveTo(canvasPoint.x, canvasPoint.y);
    } else {
      ctx.lineTo(canvasPoint.x, canvasPoint.y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw distance rings (100km, 200km, 300km intervals)
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(192, 132, 252, 0.3)"; // purple-400
  ctx.lineWidth = 1;

  for (let r = 100; r < radiusKm; r += 100) {
    const ringPoints = generateCirclePoints(centerLat, centerLon, r, 72);
    ctx.beginPath();
    ringPoints.forEach((point, i) => {
      const canvasPoint = toCanvas(point.lat, point.lon);
      if (i === 0) {
        ctx.moveTo(canvasPoint.x, canvasPoint.y);
      } else {
        ctx.lineTo(canvasPoint.x, canvasPoint.y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  }

  // Draw optimal coverage ring
  ctx.setLineDash([]);
  ctx.strokeStyle = NVIS_COLORS.inner;
  ctx.lineWidth = 2;
  ctx.shadowColor = NVIS_COLORS.inner;
  ctx.shadowBlur = 4;

  ctx.beginPath();
  innerPoints.forEach((point, i) => {
    const canvasPoint = toCanvas(point.lat, point.lon);
    if (i === 0) {
      ctx.moveTo(canvasPoint.x, canvasPoint.y);
    } else {
      ctx.lineTo(canvasPoint.x, canvasPoint.y);
    }
  });
  ctx.closePath();
  ctx.stroke();

  // Draw outer coverage ring
  ctx.strokeStyle = NVIS_COLORS.outer;
  ctx.lineWidth = 2;
  ctx.shadowColor = NVIS_COLORS.outer;
  ctx.shadowBlur = 6;

  ctx.beginPath();
  outerPoints.forEach((point, i) => {
    const canvasPoint = toCanvas(point.lat, point.lon);
    if (i === 0) {
      ctx.moveTo(canvasPoint.x, canvasPoint.y);
    } else {
      ctx.lineTo(canvasPoint.x, canvasPoint.y);
    }
  });
  ctx.closePath();
  ctx.stroke();

  // Draw center marker
  ctx.shadowBlur = 0;
  ctx.fillStyle = NVIS_COLORS.glow;
  ctx.beginPath();
  ctx.arc(centerCanvas.x, centerCanvas.y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(centerCanvas.x, centerCanvas.y, 3, 0, Math.PI * 2);
  ctx.fill();

  // Draw distance labels
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "rgba(192, 132, 252, 0.8)";
  ctx.textAlign = "center";

  // Label at optimal radius
  const optimalLabelPoint = getPointAtDistance(
    centerLat,
    centerLon,
    actualOptimalRadius,
    45,
  );
  const optimalLabelCanvas = toCanvas(
    optimalLabelPoint.lat,
    optimalLabelPoint.lon,
  );
  ctx.fillText(
    `${Math.round(actualOptimalRadius)}km`,
    optimalLabelCanvas.x,
    optimalLabelCanvas.y - 8,
  );

  // Label at max radius
  const maxLabelPoint = getPointAtDistance(centerLat, centerLon, radiusKm, 45);
  const maxLabelCanvas = toCanvas(maxLabelPoint.lat, maxLabelPoint.lon);
  ctx.fillText(
    `${Math.round(radiusKm)}km`,
    maxLabelCanvas.x,
    maxLabelCanvas.y - 8,
  );

  // Restore context state
  ctx.restore();
}

/**
 * NVIS coverage legend component for map overlays
 */
export function NVISCoverageLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-black/60 backdrop-blur-sm rounded-lg p-2 text-xs ${className}`}
    >
      <div className="font-medium text-purple-300 mb-1">NVIS Coverage</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: NVIS_COLORS.inner }}
          />
          <span className="text-gray-400">Optimal</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: NVIS_COLORS.outer }}
          />
          <span className="text-gray-400">Maximum</span>
        </div>
      </div>
    </div>
  );
}

export default NVISCoverage3D;

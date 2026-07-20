/**
 * CompassRose Component
 *
 * Renders a compass rose overlay centered on the operator's QTH location,
 * showing cardinal directions, target bearing line, and optional beam width wedge.
 * Used for visual orientation and antenna pointing guidance on the 3D globe.
 */

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

/** Cardinal and intercardinal direction labels */
const CARDINAL_DIRECTIONS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;

/** Bearing angles for each cardinal direction (degrees from north) */
const CARDINAL_BEARINGS: Record<(typeof CARDINAL_DIRECTIONS)[number], number> =
  {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315,
  };

/** Default compass rose radius on the globe */
const DEFAULT_RADIUS = 0.15;

/** Color constants matching PropSphere theme */
const COLORS = {
  /** Ring outline color */
  ring: "#4a5568",
  /** Cardinal label color */
  label: "#e2e8f0",
  /** Target bearing line color (plasma orange) */
  bearing: "#FF6B35",
  /** Beam width wedge color */
  beamWedge: "#FF6B35",
  /** North indicator highlight */
  north: "#22D3EE",
};

export interface CompassRoseProps {
  /** Operator QTH latitude */
  qthLat: number;
  /** Operator QTH longitude */
  qthLon: number;
  /** Current target bearing in degrees (0-360, north = 0) */
  targetBearing?: number;
  /** Beam width in degrees (30, 45, 60, 90) */
  beamWidth?: number;
  /** Whether to show the compass rose */
  visible: boolean;
  /** Globe radius for positioning (default: 1.01, slightly above surface) */
  radius?: number;
  /** Compass rose size scale (default: 0.15) */
  size?: number;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = 1.01,
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
 * Get the normal vector (pointing outward from Earth center) at a lat/lon position
 */
function getNormalAtLatLon(lat: number, lon: number): THREE.Vector3 {
  return latLonToVector3(lat, lon, 1).normalize();
}

/**
 * Calculate rotation quaternion to orient the compass rose flat on the globe surface
 * with north pointing toward geographic north
 */
function getCompassRotation(lat: number, lon: number): THREE.Quaternion {
  const normal = getNormalAtLatLon(lat, lon);

  // Create a rotation that aligns Z-up with the surface normal
  const quaternion = new THREE.Quaternion();

  // Calculate local east and north vectors on the sphere surface
  // East is perpendicular to the normal in the horizontal plane
  const worldUp = new THREE.Vector3(0, 1, 0);

  // East vector: cross product of up and normal (tangent in east direction)
  const east = new THREE.Vector3().crossVectors(worldUp, normal).normalize();

  // North vector: cross product of normal and east (tangent in north direction)
  const north = new THREE.Vector3().crossVectors(normal, east).normalize();

  // Build rotation matrix from basis vectors
  const rotationMatrix = new THREE.Matrix4().makeBasis(east, normal, north);
  quaternion.setFromRotationMatrix(rotationMatrix);

  return quaternion;
}

/**
 * Create points for a circle (compass ring)
 */
function createCirclePoints(
  radius: number,
  segments: number = 64,
): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
  }
  return points;
}

/**
 * Create points for a line from center toward a bearing
 */
function createBearingLinePoints(
  bearing: number,
  innerRadius: number,
  outerRadius: number,
): Array<[number, number, number]> {
  // Convert bearing to radians (bearing 0 = north = -Z in our coordinate system)
  const angle = ((bearing - 90) * Math.PI) / 180;
  return [
    [Math.cos(angle) * innerRadius, 0, Math.sin(angle) * innerRadius],
    [Math.cos(angle) * outerRadius, 0, Math.sin(angle) * outerRadius],
  ];
}

/**
 * Create a wedge shape for beam width visualization
 */
function createBeamWedgeGeometry(
  bearing: number,
  beamWidth: number,
  innerRadius: number,
  outerRadius: number,
  segments: number = 16,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];

  const halfWidth = beamWidth / 2;
  const startAngle = ((bearing - halfWidth - 90) * Math.PI) / 180;
  const endAngle = ((bearing + halfWidth - 90) * Math.PI) / 180;
  const angleStep = (endAngle - startAngle) / segments;

  // Create vertices for wedge
  // Center point at innerRadius along the bearing line
  const centerAngle = ((bearing - 90) * Math.PI) / 180;
  vertices.push(
    Math.cos(centerAngle) * innerRadius,
    0,
    Math.sin(centerAngle) * innerRadius,
  );

  // Outer arc vertices
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + i * angleStep;
    vertices.push(
      Math.cos(angle) * outerRadius,
      0,
      Math.sin(angle) * outerRadius,
    );
  }

  // Create triangles from center to arc
  for (let i = 0; i < segments; i++) {
    indices.push(0, i + 1, i + 2);
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Individual cardinal direction label component
 */
function CardinalLabel({
  direction,
  bearing,
  radius,
  isNorth,
}: {
  direction: string;
  bearing: number;
  radius: number;
  isNorth: boolean;
}) {
  const position = useMemo(() => {
    const angle = ((bearing - 90) * Math.PI) / 180;
    return [
      Math.cos(angle) * radius * 1.15,
      0.001,
      Math.sin(angle) * radius * 1.15,
    ] as [number, number, number];
  }, [bearing, radius]);

  return (
    <Html
      position={position}
      center
      zIndexRange={[1, 0]}
      style={{
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div
        className="text-[10px] font-bold font-mono"
        style={{
          color: isNorth ? COLORS.north : COLORS.label,
          textShadow: `0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px ${isNorth ? COLORS.north : "rgba(0, 0, 0, 0.5)"}`,
        }}
      >
        {direction}
      </div>
    </Html>
  );
}

/**
 * Animated bearing line component
 */
function BearingLine({
  points,
  color,
}: {
  points: Array<[number, number, number]>;
  color: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);

  // Animate bearing line with subtle pulse
  useFrame(({ clock }) => {
    if (lineRef.current && lineRef.current.material) {
      const { material } = lineRef.current;
      if (material.opacity !== undefined) {
        const pulse = 0.7 + Math.sin(clock.elapsedTime * 3) * 0.3;
        material.opacity = pulse;
      }
    }
  });

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={2}
      transparent
      opacity={0.9}
      depthTest={true}
      depthWrite={false}
      renderOrder={GLOBE_LAYER_ORDER.hud + 0.2}
    />
  );
}

/**
 * CompassRose renders an orientation compass centered on the operator's QTH
 *
 * @example
 * ```tsx
 * <CompassRose
 *   qthLat={30.2672}
 *   qthLon={-97.7431}
 *   targetBearing={45}
 *   beamWidth={30}
 *   visible={true}
 * />
 * ```
 */
export function CompassRose({
  qthLat,
  qthLon,
  targetBearing,
  beamWidth,
  visible,
  radius = 1.01,
  size = DEFAULT_RADIUS,
}: CompassRoseProps) {
  // Calculate 3D position on globe surface
  const position = useMemo(() => {
    return latLonToVector3(qthLat, qthLon, radius);
  }, [qthLat, qthLon, radius]);

  // Calculate rotation to lay flat on globe surface with north oriented correctly
  const rotation = useMemo(() => {
    return getCompassRotation(qthLat, qthLon);
  }, [qthLat, qthLon]);

  // Create compass ring points
  const ringPoints = useMemo(() => createCirclePoints(size, 64), [size]);

  // Create inner ring points
  const innerRingPoints = useMemo(
    () => createCirclePoints(size * 0.3, 32),
    [size],
  );

  // Create tick mark points for cardinal directions
  const tickMarks = useMemo(() => {
    const marks: {
      points: Array<[number, number, number]>;
      isCardinal: boolean;
      isNorth: boolean;
    }[] = [];

    for (let i = 0; i < 8; i++) {
      const bearing = i * 45;
      const isCardinal = i % 2 === 0; // N, E, S, W
      const innerRadius = isCardinal ? size * 0.8 : size * 0.85;
      marks.push({
        points: createBearingLinePoints(bearing, innerRadius, size),
        isCardinal,
        isNorth: i === 0,
      });
    }

    return marks;
  }, [size]);

  // Create target bearing line points
  const bearingLinePoints = useMemo(() => {
    if (targetBearing === undefined) {
      return null;
    }
    return createBearingLinePoints(targetBearing, 0, size * 1.3);
  }, [targetBearing, size]);

  // Create beam width wedge geometry
  const beamWedgeGeometry = useMemo(() => {
    if (targetBearing === undefined || !beamWidth) {
      return null;
    }
    return createBeamWedgeGeometry(
      targetBearing,
      beamWidth,
      size * 0.1,
      size * 1.2,
    );
  }, [targetBearing, beamWidth, size]);

  // Dispose geometry on unmount or when it changes to prevent memory leaks
  useEffect(() => {
    return () => {
      beamWedgeGeometry?.dispose();
    };
  }, [beamWedgeGeometry]);

  if (!visible) {
    return null;
  }

  return (
    <group position={position} quaternion={rotation}>
      {/* Compass ring outline */}
      <Line
        points={ringPoints}
        color={COLORS.ring}
        lineWidth={1}
        transparent
        opacity={0.6}
        depthTest={true}
        depthWrite={false}
        renderOrder={GLOBE_LAYER_ORDER.hud + 0.2}
      />

      {/* Inner ring for visual depth */}
      <Line
        points={innerRingPoints}
        color={COLORS.ring}
        lineWidth={1}
        transparent
        opacity={0.3}
        depthTest={true}
        depthWrite={false}
        renderOrder={GLOBE_LAYER_ORDER.hud + 0.2}
      />

      {/* Tick marks for cardinal/intercardinal directions */}
      {tickMarks.map((tick, index) => (
        <Line
          key={`tick-${index}`}
          points={tick.points}
          color={tick.isNorth ? COLORS.north : COLORS.ring}
          lineWidth={tick.isCardinal ? 2 : 1}
          transparent
          opacity={tick.isCardinal ? 0.8 : 0.5}
          depthTest={true}
          depthWrite={false}
          renderOrder={GLOBE_LAYER_ORDER.hud + 0.2}
        />
      ))}

      {/* Beam width wedge (behind bearing line) */}
      {beamWedgeGeometry && (
        <mesh geometry={beamWedgeGeometry} renderOrder={GLOBE_LAYER_ORDER.hud + 0.2}>
          <meshBasicMaterial
            color={COLORS.beamWedge}
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
            depthTest={true}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Target bearing line */}
      {bearingLinePoints && (
        <BearingLine points={bearingLinePoints} color={COLORS.bearing} />
      )}

      {/* Cardinal direction labels */}
      {CARDINAL_DIRECTIONS.map((dir) => (
        <CardinalLabel
          key={dir}
          direction={dir}
          bearing={CARDINAL_BEARINGS[dir]}
          radius={size}
          isNorth={dir === "N"}
        />
      ))}

      {/* Target bearing degree indicator */}
      {targetBearing !== undefined && (
        <Html
          position={[0, 0.002, 0]}
          center
          zIndexRange={[1, 0]}
          style={{
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.85)",
              color: COLORS.bearing,
              border: `1px solid ${COLORS.bearing}50`,
              boxShadow: `0 0 8px ${COLORS.bearing}40`,
            }}
          >
            {Math.round(targetBearing)}°
          </div>
        </Html>
      )}
    </group>
  );
}

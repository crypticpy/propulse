/**
 * ISSTrackerOverlay Component
 *
 * Renders a dedicated 3D ISS visualization on the globe using React Three Fiber.
 * Includes a procedural ISS model (billboarded body + solar panels), orbit ring
 * at altitude, ground track on the surface, visibility footprint circle, and a
 * vertical drop-line connector from the ISS to the sub-satellite point.
 *
 * Rendered inside the globe's tilt group alongside SatelliteOverlay.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useISSTracker } from "@/hooks/useISSTracker";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Globe radius (matching EarthSphere) */
const GLOBE_RADIUS = 1.0;

/** Earth radius in km */
const EARTH_RADIUS_KM = 6371.0;

/**
 * Visual altitude scale factor — same as SatelliteOverlay.
 * Exaggerates altitude so satellites are clearly above the surface.
 */
const ALT_SCALE = 3.0;

/** Base surface offset to prevent z-fighting */
const SURFACE_OFFSET = 0.015;

// ---------------------------------------------------------------------------
// Coordinate Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon/alt to a 3D position on the globe.
 * Matches the SatelliteOverlay coordinate system exactly.
 */
function latLonAltToVector3(
  lat: number,
  lon: number,
  altKm: number,
): THREE.Vector3 {
  const visualAlt = (altKm / EARTH_RADIUS_KM) * ALT_SCALE;
  const radius = GLOBE_RADIUS + SURFACE_OFFSET + visualAlt;

  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Convert lat/lon to surface position (for ground track, footprint, connector base).
 */
function latLonToSurface(lat: number, lon: number): THREE.Vector3 {
  const radius = GLOBE_RADIUS + 0.002;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// ---------------------------------------------------------------------------
// ISSModel — Procedural ISS 3D Icon (Billboarded)
// ---------------------------------------------------------------------------

interface ISSModelProps {
  iss: {
    position: { lat: number; lon: number; alt: number };
  };
}

function ISSModel({ iss }: ISSModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  const bodyRef = useRef<THREE.MeshBasicMaterial>(null);
  const leftPanelRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightPanelRef = useRef<THREE.MeshBasicMaterial>(null);

  const { lat, lon, alt } = iss.position;

  // Globe occlusion for far-side fading
  const { opacityRef, opacity: occlusionOpacity } = useGlobeOcclusion(lat, lon);

  // 3D position at altitude
  const position = useMemo(
    () => latLonAltToVector3(lat, lon, alt),
    [lat, lon, alt],
  );

  // Billboard + glow pulse animation
  useFrame(({ camera, clock }) => {
    if (groupRef.current) {
      groupRef.current.quaternion.copy(camera.quaternion);
    }

    const occlusion = opacityRef.current;
    const pulse =
      0.25 + Math.sin((clock.elapsedTime * (2 * Math.PI)) / 3) * 0.15;

    if (glowRef.current) {
      glowRef.current.opacity = pulse * occlusion;
    }
    if (bodyRef.current) {
      bodyRef.current.opacity = 0.95 * occlusion;
    }
    if (leftPanelRef.current) {
      leftPanelRef.current.opacity = 0.8 * occlusion;
    }
    if (rightPanelRef.current) {
      rightPanelRef.current.opacity = 0.8 * occlusion;
    }
  });

  return (
    <group position={position}>
      <group ref={groupRef}>
        {/* Glow circle behind model */}
        <mesh renderOrder={0}>
          <circleGeometry args={[0.03, 32]} />
          <meshBasicMaterial
            ref={glowRef}
            color="#ffffff"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Central body module */}
        <mesh renderOrder={2}>
          <boxGeometry args={[0.012, 0.006, 0.003]} />
          <meshBasicMaterial
            ref={bodyRef}
            color="#ffffff"
            transparent
            opacity={0.95}
            depthTest={false}
          />
        </mesh>

        {/* Left solar array */}
        <mesh position={[-0.018, 0, 0]} renderOrder={1}>
          <planeGeometry args={[0.018, 0.008]} />
          <meshBasicMaterial
            ref={leftPanelRef}
            color="#FFD700"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>

        {/* Right solar array */}
        <mesh position={[0.018, 0, 0]} renderOrder={1}>
          <planeGeometry args={[0.018, 0.008]} />
          <meshBasicMaterial
            ref={rightPanelRef}
            color="#FFD700"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>

        {/* Small radiator panels (perpendicular detail) */}
        <mesh
          position={[-0.008, 0.005, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          renderOrder={1}
        >
          <planeGeometry args={[0.006, 0.003]} />
          <meshBasicMaterial
            color="#cccccc"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
        <mesh
          position={[0.008, 0.005, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          renderOrder={1}
        >
          <planeGeometry args={[0.006, 0.003]} />
          <meshBasicMaterial
            color="#cccccc"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>

        {/* ISS Label */}
        <Html
          position={[0, 0.04, 0]}
          center
          zIndexRange={[1, 0]}
          style={{
            pointerEvents: "none",
            transition: "opacity 0.2s ease",
            opacity: occlusionOpacity,
          }}
        >
          <div
            className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.9)",
              color: "#ffffff",
              border: "1px solid rgba(100, 180, 255, 0.5)",
              boxShadow: "0 0 12px rgba(100, 180, 255, 0.3)",
              textShadow: "0 0 8px rgba(100, 180, 255, 0.5)",
            }}
          >
            ISS
          </div>
        </Html>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// ISSOrbitRing — 3D Orbit Path at Altitude
// ---------------------------------------------------------------------------

interface ISSOrbitRingProps {
  orbitTrack: Array<{
    lat: number;
    lon: number;
    alt: number;
    minutesFromNow: number;
  }>;
  alt: number;
}

function ISSOrbitRing({ orbitTrack, alt }: ISSOrbitRingProps) {
  // Split into past and future segments, handling antimeridian crossings
  const { pastSegments, futureSegments } = useMemo(() => {
    const past: THREE.Vector3[][] = [];
    const future: THREE.Vector3[][] = [];

    let currentPast: THREE.Vector3[] = [];
    let currentFuture: THREE.Vector3[] = [];

    for (let i = 0; i < orbitTrack.length; i++) {
      const point = orbitTrack[i];
      const vec = latLonAltToVector3(point.lat, point.lon, alt);

      // Detect antimeridian crossing
      if (i > 0) {
        const prevLon = orbitTrack[i - 1].lon;
        const lonDiff = Math.abs(point.lon - prevLon);
        if (lonDiff > 180) {
          // Split both past and future at the crossing
          if (currentPast.length > 1) past.push(currentPast);
          if (currentFuture.length > 1) future.push(currentFuture);
          currentPast = [];
          currentFuture = [];
        }
      }

      if (point.minutesFromNow < 0) {
        currentPast.push(vec);
        // Flush future segment at the boundary
        if (currentFuture.length > 1) {
          future.push(currentFuture);
          currentFuture = [];
        }
      } else {
        // Include the boundary point in future for continuity
        if (currentPast.length > 0 && currentFuture.length === 0) {
          // Bridge: add last past point to start of future
          currentFuture.push(vec);
          if (currentPast.length > 1) past.push(currentPast);
          currentPast = [];
        } else {
          currentFuture.push(vec);
        }
      }
    }

    // Flush remaining
    if (currentPast.length > 1) past.push(currentPast);
    if (currentFuture.length > 1) future.push(currentFuture);

    return { pastSegments: past, futureSegments: future };
  }, [orbitTrack, alt]);

  return (
    <>
      {/* Past orbit (dimmer) */}
      {pastSegments.map((segment, idx) => (
        <Line
          key={`past-${idx}`}
          points={segment}
          color="#4488FF"
          lineWidth={1.5}
          transparent
          opacity={0.15}
          depthTest={false}
        />
      ))}
      {/* Future orbit (brighter) */}
      {futureSegments.map((segment, idx) => (
        <Line
          key={`future-${idx}`}
          points={segment}
          color="#4488FF"
          lineWidth={1.5}
          transparent
          opacity={0.4}
          depthTest={false}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// ISSGroundTrack — Surface Ground Track
// ---------------------------------------------------------------------------

interface ISSGroundTrackProps {
  orbitTrack: Array<{
    lat: number;
    lon: number;
    alt: number;
    minutesFromNow: number;
  }>;
}

function ISSGroundTrack({ orbitTrack }: ISSGroundTrackProps) {
  // Build surface-projected segments, split at antimeridian
  const { segments, timeMarkers } = useMemo(() => {
    const segs: THREE.Vector3[][] = [];
    let currentSegment: THREE.Vector3[] = [];
    const markers: THREE.Vector3[] = [];

    for (let i = 0; i < orbitTrack.length; i++) {
      const point = orbitTrack[i];
      const vec = latLonToSurface(point.lat, point.lon);

      // Detect antimeridian crossing
      if (i > 0) {
        const prevLon = orbitTrack[i - 1].lon;
        const lonDiff = Math.abs(point.lon - prevLon);
        if (lonDiff > 180) {
          if (currentSegment.length > 1) {
            segs.push(currentSegment);
          }
          currentSegment = [];
        }
      }

      currentSegment.push(vec);

      // Time markers every 10 points (~10 minutes)
      if (i % 10 === 0) {
        markers.push(vec);
      }
    }

    if (currentSegment.length > 1) {
      segs.push(currentSegment);
    }

    return { segments: segs, timeMarkers: markers };
  }, [orbitTrack]);

  // Shared geometry and material for time marker dots
  const dotGeometry = useMemo(() => new THREE.SphereGeometry(0.002, 8, 8), []);
  const dotMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.2,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  // Dispose shared geometry/material on unmount
  useEffect(() => {
    return () => {
      dotGeometry.dispose();
      dotMaterial.dispose();
    };
  }, [dotGeometry, dotMaterial]);

  return (
    <>
      {/* Dim dashed ground track lines */}
      {segments.map((segment, idx) => (
        <Line
          key={`gt-${idx}`}
          points={segment}
          color="#ffffff"
          lineWidth={1}
          transparent
          opacity={0.1}
          depthTest={false}
          dashed
          dashSize={0.01}
          gapSize={0.008}
        />
      ))}

      {/* Time marker dots every ~10 minutes */}
      {timeMarkers.map((pos, idx) => (
        <mesh
          key={`tm-${idx}`}
          position={pos}
          geometry={dotGeometry}
          material={dotMaterial}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// ISSFootprint — Visibility Circle on Globe Surface
// ---------------------------------------------------------------------------

interface ISSFootprintProps {
  lat: number;
  lon: number;
  alt: number;
}

function ISSFootprint({ lat, lon, alt }: ISSFootprintProps) {
  const footprintPoints = useMemo(() => {
    // Footprint angular radius
    const footprintAngle = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + alt));

    const latRad = lat * (Math.PI / 180);
    const lonRad = lon * (Math.PI / 180);

    const SEGMENTS = 64;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= SEGMENTS; i++) {
      const bearing = (i / SEGMENTS) * 2 * Math.PI;

      const lat2 = Math.asin(
        Math.sin(latRad) * Math.cos(footprintAngle) +
          Math.cos(latRad) * Math.sin(footprintAngle) * Math.cos(bearing),
      );
      const lon2 =
        lonRad +
        Math.atan2(
          Math.sin(bearing) * Math.sin(footprintAngle) * Math.cos(latRad),
          Math.cos(footprintAngle) - Math.sin(latRad) * Math.sin(lat2),
        );

      // Convert radians back to degrees
      const latDeg = lat2 * (180 / Math.PI);
      const lonDeg = lon2 * (180 / Math.PI);

      points.push(latLonToSurface(latDeg, lonDeg));
    }

    return points;
  }, [lat, lon, alt]);

  if (footprintPoints.length < 2) return null;

  return (
    <Line
      points={footprintPoints}
      color="#64B4FF"
      lineWidth={1}
      transparent
      opacity={0.2}
      depthTest={false}
    />
  );
}

// ---------------------------------------------------------------------------
// ISSConnector — Vertical Drop Line
// ---------------------------------------------------------------------------

interface ISSConnectorProps {
  iss: {
    position: { lat: number; lon: number; alt: number };
  };
}

function ISSConnector({ iss }: ISSConnectorProps) {
  const { lat, lon, alt } = iss.position;

  const points = useMemo(() => {
    const issPos = latLonAltToVector3(lat, lon, alt);
    const surfacePos = latLonToSurface(lat, lon);
    return [issPos, surfacePos];
  }, [lat, lon, alt]);

  return (
    <Line
      points={points}
      color="#ffffff"
      lineWidth={0.5}
      transparent
      opacity={0.15}
      depthTest={false}
      dashed
      dashSize={0.008}
      gapSize={0.006}
    />
  );
}

// ---------------------------------------------------------------------------
// Main Overlay Component
// ---------------------------------------------------------------------------

/**
 * ISSTrackerOverlay renders a dedicated ISS visualization on the globe.
 *
 * Includes:
 * - Procedural billboarded ISS model with solar panels and glow
 * - 3D orbit ring at altitude (past/future split)
 * - Surface ground track with time markers
 * - Visibility footprint circle
 * - Vertical connector line to sub-satellite point
 *
 * Usage inside GlobeScene (within a <Canvas>):
 * ```tsx
 * <ISSTrackerOverlay />
 * ```
 */
export function ISSTrackerOverlay() {
  const tracker = useISSTracker();

  if (!tracker.iss) return null;

  return (
    <group>
      <ISSModel iss={tracker.iss} />
      <ISSOrbitRing
        orbitTrack={tracker.orbitTrack}
        alt={tracker.iss.position.alt}
      />
      <ISSGroundTrack orbitTrack={tracker.orbitTrack} />
      <ISSFootprint
        lat={tracker.iss.position.lat}
        lon={tracker.iss.position.lon}
        alt={tracker.iss.position.alt}
      />
      <ISSConnector iss={tracker.iss} />
    </group>
  );
}

export default ISSTrackerOverlay;

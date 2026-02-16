/**
 * ISSTrackerOverlay Component
 *
 * Renders a dedicated 3D ISS visualization on the globe using React Three Fiber.
 * Includes a procedural ISS model (billboarded body + solar panels), orbit ring
 * at altitude, ground track on the surface, visibility footprint circle, and a
 * vertical drop-line connector from the ISS to the sub-satellite point.
 *
 * Clicking the ISS model opens an info card with real-time orbital data and
 * ham radio frequency reference (voice, APRS, packet, cross-band repeater).
 *
 * Rendered inside the globe's tilt group alongside SatelliteOverlay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useISSTracker } from "@/hooks/useISSTracker";
import type { UseISSTrackerResult } from "@/hooks/useISSTracker";
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
// ISS Ham Radio Constants
// ---------------------------------------------------------------------------

/** Well-known ISS amateur radio frequencies and modes */
const ISS_FREQUENCIES = [
  {
    label: "Voice Downlink",
    freq: "145.800 MHz",
    mode: "FM",
    note: "Worldwide",
  },
  {
    label: "Voice Uplink",
    freq: "144.490 MHz",
    mode: "FM",
    note: "Region 2/3",
  },
  {
    label: "APRS Digipeater",
    freq: "145.825 MHz",
    mode: "AFSK 1200 baud",
    note: "Worldwide",
  },
  {
    label: "Packet",
    freq: "145.825 MHz",
    mode: "1200 baud AFSK",
    note: "Mailbox / BBS",
  },
  {
    label: "Cross-band DN",
    freq: "437.800 MHz",
    mode: "FM",
    note: "When active",
  },
  {
    label: "Cross-band UP",
    freq: "145.990 MHz",
    mode: "FM",
    note: "When active",
  },
] as const;

/** ISS orbital velocity in km/s (approximate) */
const ISS_VELOCITY_KMS = 7.66;

/** ISS orbital period in minutes (approximate) */
const ISS_ORBITAL_PERIOD_MIN = 92.65;

// ---------------------------------------------------------------------------
// Time Formatting Helpers
// ---------------------------------------------------------------------------

/** Format seconds into a human-readable countdown string */
function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "NOW";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format elevation with degree symbol */
function formatDegrees(deg: number): string {
  return `${deg.toFixed(1)}\u00B0`;
}

// ---------------------------------------------------------------------------
// ISSInfoCard — Clickable Info Popup
// ---------------------------------------------------------------------------

interface ISSInfoCardProps {
  tracker: UseISSTrackerResult;
  occlusionOpacity: number;
}

function ISSInfoCard({ tracker, occlusionOpacity }: ISSInfoCardProps) {
  const {
    iss,
    elevation,
    azimuth,
    isAboveHorizon,
    currentPass,
    nextPass,
    footprintRadiusKm,
  } = tracker;
  if (!iss) return null;

  const { lat, lon, alt } = iss.position;

  const relevantPass = currentPass ?? nextPass;

  return (
    <Html
      position={[0, 0.06, 0]}
      center
      zIndexRange={[10, 5]}
      style={{
        pointerEvents: "auto",
        opacity: Math.max(occlusionOpacity, 0.85),
      }}
    >
      <div
        className="flex flex-col gap-1 rounded-lg px-3 py-2.5 text-[10px] font-mono select-none"
        style={{
          backgroundColor: "rgba(8, 8, 24, 0.95)",
          border: "1px solid rgba(100, 180, 255, 0.4)",
          boxShadow:
            "0 0 20px rgba(100, 180, 255, 0.2), inset 0 0 30px rgba(100, 180, 255, 0.03)",
          minWidth: "240px",
          maxWidth: "280px",
          color: "#e0e0e8",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span
            className="text-[13px] font-bold tracking-wider"
            style={{ color: "#64B4FF" }}
          >
            ISS (ZARYA)
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase"
            style={{
              backgroundColor: isAboveHorizon
                ? "rgba(0, 255, 136, 0.15)"
                : "rgba(255, 255, 255, 0.06)",
              color: isAboveHorizon ? "#00ff88" : "#888",
              border: `1px solid ${isAboveHorizon ? "rgba(0, 255, 136, 0.4)" : "rgba(136, 136, 136, 0.3)"}`,
            }}
          >
            {isAboveHorizon ? "IN VIEW" : "BELOW HORIZON"}
          </span>
        </div>

        {/* NORAD ID */}
        <div className="text-[9px]" style={{ color: "#777" }}>
          NORAD 25544 &bull; Inclination 51.6&deg;
        </div>

        {/* Divider */}
        <div
          className="my-1"
          style={{ borderTop: "1px solid rgba(100, 180, 255, 0.12)" }}
        />

        {/* Section: Orbital Data */}
        <div
          className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
          style={{ color: "#64B4FF" }}
        >
          Position
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <div className="flex justify-between">
            <span style={{ color: "#888" }}>Lat:</span>
            <span style={{ color: "#ccc" }}>
              {Math.abs(lat).toFixed(2)}&deg;{lat >= 0 ? "N" : "S"}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "#888" }}>Lon:</span>
            <span style={{ color: "#ccc" }}>
              {Math.abs(lon).toFixed(2)}&deg;{lon >= 0 ? "E" : "W"}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "#888" }}>Alt:</span>
            <span style={{ color: "#ccc" }}>{alt.toFixed(1)} km</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "#888" }}>Speed:</span>
            <span style={{ color: "#ccc" }}>{ISS_VELOCITY_KMS} km/s</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "#888" }}>Period:</span>
            <span style={{ color: "#ccc" }}>{ISS_ORBITAL_PERIOD_MIN} min</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "#888" }}>Footprint:</span>
            <span style={{ color: "#ccc" }}>
              {footprintRadiusKm.toFixed(0)} km
            </span>
          </div>
        </div>

        {/* Observer section (only when station is configured) */}
        {elevation !== null && azimuth !== null && (
          <>
            <div
              className="my-1"
              style={{ borderTop: "1px solid rgba(100, 180, 255, 0.12)" }}
            />
            <div
              className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
              style={{ color: "#64B4FF" }}
            >
              From Your QTH
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <div className="flex justify-between">
                <span style={{ color: "#888" }}>Elev:</span>
                <span style={{ color: isAboveHorizon ? "#00ff88" : "#ccc" }}>
                  {formatDegrees(elevation)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "#888" }}>Azim:</span>
                <span style={{ color: "#ccc" }}>{formatDegrees(azimuth)}</span>
              </div>
            </div>
          </>
        )}

        {/* Pass prediction section */}
        {relevantPass && (
          <>
            <div
              className="my-1"
              style={{ borderTop: "1px solid rgba(100, 180, 255, 0.12)" }}
            />
            <div
              className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
              style={{ color: "#64B4FF" }}
            >
              {currentPass ? "Current Pass" : "Next Pass"}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {currentPass ? (
                <>
                  <div className="flex justify-between">
                    <span style={{ color: "#888" }}>LOS in:</span>
                    <span style={{ color: "#ffcc00" }}>
                      {currentPass.timeToLos !== null
                        ? formatCountdown(currentPass.timeToLos)
                        : "--"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "#888" }}>Max El:</span>
                    <span style={{ color: "#ccc" }}>
                      {formatDegrees(currentPass.maxEl)}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-between">
                    <span style={{ color: "#888" }}>Direction:</span>
                    <span style={{ color: "#ccc" }}>
                      {currentPass.direction}
                    </span>
                  </div>
                </>
              ) : nextPass ? (
                <>
                  <div className="flex justify-between">
                    <span style={{ color: "#888" }}>AOS in:</span>
                    <span style={{ color: "#ffcc00" }}>
                      {nextPass.timeToAos !== null
                        ? formatCountdown(nextPass.timeToAos)
                        : "--"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "#888" }}>Max El:</span>
                    <span style={{ color: "#ccc" }}>
                      {formatDegrees(nextPass.maxEl)}
                    </span>
                  </div>
                  <div className="col-span-2 flex justify-between">
                    <span style={{ color: "#888" }}>Direction:</span>
                    <span style={{ color: "#ccc" }}>{nextPass.direction}</span>
                  </div>
                </>
              ) : null}
            </div>
          </>
        )}

        {/* Divider */}
        <div
          className="my-1"
          style={{ borderTop: "1px solid rgba(100, 180, 255, 0.12)" }}
        />

        {/* Ham Radio Frequencies */}
        <div
          className="text-[9px] font-semibold uppercase tracking-wide mb-0.5"
          style={{ color: "#64B4FF" }}
        >
          Ham Radio Frequencies
        </div>
        <div className="flex flex-col gap-0.5">
          {ISS_FREQUENCIES.map((f) => (
            <div
              key={f.label}
              className="flex items-baseline justify-between gap-1"
            >
              <span
                className="text-[9px] truncate"
                style={{ color: "#999", maxWidth: "90px" }}
              >
                {f.label}
              </span>
              <span
                className="text-[9px] font-semibold"
                style={{ color: "#e0e0e8" }}
              >
                {f.freq}
              </span>
              <span className="text-[8px]" style={{ color: "#666" }}>
                {f.note}
              </span>
            </div>
          ))}
        </div>

        {/* SSTV note */}
        <div
          className="mt-1 px-1.5 py-1 rounded text-[8px]"
          style={{
            backgroundColor: "rgba(100, 180, 255, 0.06)",
            border: "1px solid rgba(100, 180, 255, 0.12)",
            color: "#999",
          }}
        >
          ISS occasionally transmits SSTV images on 145.800 MHz during special
          events.
        </div>
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// ISSModel — Procedural ISS 3D Icon (Billboarded)
// ---------------------------------------------------------------------------

interface ISSModelProps {
  iss: {
    position: { lat: number; lon: number; alt: number };
  };
  isSelected: boolean;
  onToggleSelect: () => void;
  tracker: UseISSTrackerResult;
}

function ISSModel({ iss, isSelected, onToggleSelect, tracker }: ISSModelProps) {
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

  // Click handler for the ISS model meshes
  const handleClick = useCallback(
    (e: THREE.Event) => {
      if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      onToggleSelect();
    },
    [onToggleSelect],
  );

  return (
    <group position={position}>
      <group ref={groupRef}>
        {/* Invisible click target — larger hitbox for easier clicking */}
        <mesh onClick={handleClick} renderOrder={0}>
          <planeGeometry args={[0.06, 0.04]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>

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
        <mesh onClick={handleClick} renderOrder={2}>
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
        <mesh position={[-0.018, 0, 0]} onClick={handleClick} renderOrder={1}>
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
        <mesh position={[0.018, 0, 0]} onClick={handleClick} renderOrder={1}>
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
            pointerEvents: "auto",
            transition: "opacity 0.2s ease",
            opacity: occlusionOpacity,
            cursor: "pointer",
          }}
        >
          <div
            className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.9)",
              color: "#ffffff",
              border: `1px solid ${isSelected ? "rgba(100, 180, 255, 0.8)" : "rgba(100, 180, 255, 0.5)"}`,
              boxShadow: isSelected
                ? "0 0 16px rgba(100, 180, 255, 0.5)"
                : "0 0 12px rgba(100, 180, 255, 0.3)",
              textShadow: "0 0 8px rgba(100, 180, 255, 0.5)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
          >
            ISS
          </div>
        </Html>

        {/* Info card popup when selected */}
        {isSelected && (
          <ISSInfoCard tracker={tracker} occlusionOpacity={occlusionOpacity} />
        )}
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
  const [isSelected, setIsSelected] = useState(false);

  const handleToggleSelect = useCallback(() => {
    setIsSelected((prev) => !prev);
  }, []);

  if (!tracker.iss) return null;

  return (
    <group>
      <ISSModel
        iss={tracker.iss}
        isSelected={isSelected}
        onToggleSelect={handleToggleSelect}
        tracker={tracker}
      />
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

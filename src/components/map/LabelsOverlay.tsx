/**
 * LabelsOverlay Component — Performance-Optimized
 *
 * Renders country borders and labels on the 3D globe.
 *
 * Performance strategy:
 *  - ALL border polygons merged into ONE THREE.LineSegments geometry (1 draw call)
 *  - Html labels use manual backface culling (dot product) instead of drei's
 *    `occlude` prop which does per-element raycasting every frame
 *  - No backdrop-blur CSS (heavy GPU compositing)
 *  - Visibility array updated in useFrame, DOM only touched on change
 */

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  WORLD_COUNTRIES,
  type CountryData,
} from "@/lib/data/worldCountries.generated";
import { US_STATES } from "@/lib/data/usStates.generated";
import { useMapStore } from "@/stores/mapStore";
import {
  getMaidenheadFields,
  MAIDENHEAD_LON_LINES,
  MAIDENHEAD_LAT_LINES,
} from "@/lib/utils/maidenheadGrid";

// Major world cities
const MAJOR_CITIES = [
  { name: "New York", lat: 40.7128, lon: -74.006 },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "London", lat: 51.5074, lon: -0.1278 },
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Beijing", lat: 39.9042, lon: 116.4074 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Moscow", lat: 55.7558, lon: 37.6173 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Mumbai", lat: 19.076, lon: 72.8777 },
  { name: "Cairo", lat: 30.0444, lon: 31.2357 },
  { name: "Rio", lat: -22.9068, lon: -43.1729 },
  { name: "Toronto", lat: 43.6532, lon: -79.3832 },
  { name: "Berlin", lat: 52.52, lon: 13.405 },
  { name: "Seoul", lat: 37.5665, lon: 126.978 },
  { name: "Mexico City", lat: 19.4326, lon: -99.1332 },
  { name: "Cape Town", lat: -33.9249, lon: 18.4241 },
  { name: "Buenos Aires", lat: -34.6037, lon: -58.3816 },
  { name: "Bangkok", lat: 13.7563, lon: 100.5018 },
];

// Area thresholds for zoom-based label filtering (km²)
const AREA_ALWAYS_VISIBLE = 1_000_000;
const AREA_MEDIUM_THRESHOLD = 100_000;
const AREA_SMALL_THRESHOLD = 10_000;

const DISTANCE_FAR = 3.0;
const DISTANCE_CLOSE = 2.0;
const DISTANCE_HYSTERESIS = 0.05;

// Backface culling threshold: cos(90°) = 0 means exactly on the horizon.
// Small positive value hides labels just before they reach the edge.
const BACKFACE_THRESHOLD = 0.1;

const DEG2RAD = Math.PI / 180;

/**
 * Convert lat/lon to 3D position on unit sphere (inlined for hot paths)
 */
function latLonToXYZ(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  const sinPhi = Math.sin(phi);
  return [
    -radius * sinPhi * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(theta),
  ];
}

function getZoomTier(distance: number, currentTier: number): number {
  if (currentTier === 0) {
    if (distance < DISTANCE_FAR - DISTANCE_HYSTERESIS) return 1;
    return 0;
  }
  if (currentTier === 1) {
    if (distance >= DISTANCE_FAR + DISTANCE_HYSTERESIS) return 0;
    if (distance < DISTANCE_CLOSE - DISTANCE_HYSTERESIS) return 2;
    return 1;
  }
  if (distance >= DISTANCE_CLOSE + DISTANCE_HYSTERESIS) return 1;
  return 2;
}

function isCountryVisible(area: number, zoomTier: number): boolean {
  if (area >= AREA_ALWAYS_VISIBLE) return true;
  if (zoomTier >= 1 && area >= AREA_MEDIUM_THRESHOLD) return true;
  if (zoomTier >= 2 && area >= AREA_SMALL_THRESHOLD) return true;
  return false;
}

// ─── Merged border geometry (built once) ─────────────────────────────────────

/**
 * Build a single THREE.BufferGeometry containing ALL country border line
 * segments. Uses LineSegments topology: each pair of consecutive vertices
 * forms one independent line segment.
 *
 * For a polygon ring [A, B, C, D] we emit segments: A→B, B→C, C→D, D→A
 * Total segments = sum of all ring lengths across all countries.
 */
function buildMergedBorderGeometry(): THREE.BufferGeometry {
  // First pass: count total segments to pre-allocate
  let totalSegments = 0;
  for (const country of WORLD_COUNTRIES) {
    for (const ring of country.borders) {
      if (ring.length >= 2) {
        totalSegments += ring.length; // N points → N segments (including close)
      }
    }
  }

  // Each segment = 2 vertices × 3 floats
  const positions = new Float32Array(totalSegments * 2 * 3);
  let offset = 0;
  const R = 1.003;

  for (const country of WORLD_COUNTRIES) {
    for (const ring of country.borders) {
      if (ring.length < 2) continue;

      // Convert all ring points to 3D
      const pts: [number, number, number][] = ring.map(([lat, lon]) =>
        latLonToXYZ(lat, lon, R),
      );

      // Emit segments: each consecutive pair + closing segment
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        positions[offset++] = a[0];
        positions[offset++] = a[1];
        positions[offset++] = a[2];
        positions[offset++] = b[0];
        positions[offset++] = b[1];
        positions[offset++] = b[2];
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions.slice(0, offset), 3),
  );
  return geometry;
}

// ─── Merged state border geometry (built once) ───────────────────────────────

/**
 * Build a single THREE.BufferGeometry containing ALL US state border line
 * segments. Uses LineSegments topology identical to buildMergedBorderGeometry().
 */
function buildMergedStateBorderGeometry(): THREE.BufferGeometry {
  // First pass: count total segments to pre-allocate
  let totalSegments = 0;
  for (const state of US_STATES) {
    for (const ring of state.borders) {
      if (ring.length >= 2) {
        totalSegments += ring.length; // N points → N segments (including close)
      }
    }
  }

  // Each segment = 2 vertices × 3 floats
  const positions = new Float32Array(totalSegments * 2 * 3);
  let offset = 0;
  const R = 1.003;

  for (const state of US_STATES) {
    for (const ring of state.borders) {
      if (ring.length < 2) continue;

      // Convert all ring points to 3D
      const pts: [number, number, number][] = ring.map(([lat, lon]) =>
        latLonToXYZ(lat, lon, R),
      );

      // Emit segments: each consecutive pair + closing segment
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        positions[offset++] = a[0];
        positions[offset++] = a[1];
        positions[offset++] = a[2];
        positions[offset++] = b[0];
        positions[offset++] = b[1];
        positions[offset++] = b[2];
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions.slice(0, offset), 3),
  );
  return geometry;
}

// ─── Maidenhead grid geometry (built once) ───────────────────────────────────

/** Points per line when rendering lat/lon grid arcs on the sphere */
const GRID_ARC_SEGMENTS = 72;

/**
 * Build merged LineSegments geometry for Maidenhead grid lines.
 * Longitude lines (every 20°) are great circles; latitude lines (every 10°)
 * are small circles.
 */
function buildMaidenheadGridGeometry(): THREE.BufferGeometry {
  const R = 1.004; // Slightly above borders
  const lonLines = MAIDENHEAD_LON_LINES;
  const latLines = MAIDENHEAD_LAT_LINES;

  // Each line has GRID_ARC_SEGMENTS segments = GRID_ARC_SEGMENTS * 2 * 3 floats
  const totalSegments = (lonLines.length + latLines.length) * GRID_ARC_SEGMENTS;
  const positions = new Float32Array(totalSegments * 2 * 3);
  let offset = 0;

  // Longitude lines: constant lon, vary lat from -90 to 90
  for (const lon of lonLines) {
    for (let i = 0; i < GRID_ARC_SEGMENTS; i++) {
      const lat1 = -90 + (i / GRID_ARC_SEGMENTS) * 180;
      const lat2 = -90 + ((i + 1) / GRID_ARC_SEGMENTS) * 180;
      const [ax, ay, az] = latLonToXYZ(lat1, lon, R);
      const [bx, by, bz] = latLonToXYZ(lat2, lon, R);
      positions[offset++] = ax;
      positions[offset++] = ay;
      positions[offset++] = az;
      positions[offset++] = bx;
      positions[offset++] = by;
      positions[offset++] = bz;
    }
  }

  // Latitude lines: constant lat, vary lon from -180 to 180
  for (const lat of latLines) {
    for (let i = 0; i < GRID_ARC_SEGMENTS; i++) {
      const lon1 = -180 + (i / GRID_ARC_SEGMENTS) * 360;
      const lon2 = -180 + ((i + 1) / GRID_ARC_SEGMENTS) * 360;
      const [ax, ay, az] = latLonToXYZ(lat, lon1, R);
      const [bx, by, bz] = latLonToXYZ(lat, lon2, R);
      positions[offset++] = ax;
      positions[offset++] = ay;
      positions[offset++] = az;
      positions[offset++] = bx;
      positions[offset++] = by;
      positions[offset++] = bz;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions.slice(0, offset), 3),
  );
  return geometry;
}

// ─── Label data types ────────────────────────────────────────────────────────

interface LabelData {
  key: string;
  name: string;
  area: number;
  // Unit-sphere normal (for backface culling)
  nx: number;
  ny: number;
  nz: number;
  // Position slightly above sphere (for Html placement)
  px: number;
  py: number;
  pz: number;
}

// ─── Single backface-culled label component ──────────────────────────────────

const _normal = new THREE.Vector3();

function BackfaceLabel({
  label,
  fontSize,
  camDirRef,
}: {
  label: LabelData;
  fontSize: string;
  camDirRef: React.RefObject<THREE.Vector3>;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(true);

  useFrame(() => {
    if (!divRef.current || !camDirRef.current) return;

    // Dot product of label normal with camera direction
    // Positive = facing camera, negative = facing away
    _normal.set(label.nx, label.ny, label.nz);
    const dot = _normal.dot(camDirRef.current);
    const visible = dot > BACKFACE_THRESHOLD;

    if (visible !== wasVisibleRef.current) {
      wasVisibleRef.current = visible;
      divRef.current.style.display = visible ? "" : "none";
    }
  });

  return (
    <Html
      position={[label.px, label.py, label.pz]}
      center
      style={{
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <div
        ref={divRef}
        className={`${fontSize} font-medium whitespace-nowrap px-1 py-0.5
                    text-white/90 bg-black/40 rounded`}
        style={{
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        {label.name}
      </div>
    </Html>
  );
}

// ─── Night-aware border shader material ──────────────────────────────────────

function buildNightAwareBorderMaterial(
  subsolarLat: number,
  subsolarLon: number,
  baseOpacity: number,
  nightBoost: number,
): THREE.ShaderMaterial {
  // Convert subsolar lat/lon to a unit vector (sun direction)
  const phi = (90 - subsolarLat) * DEG2RAD;
  const theta = (subsolarLon + 180) * DEG2RAD;
  const sunDir = new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );

  return new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDir },
      baseOpacity: { value: baseOpacity },
      nightBoost: { value: nightBoost },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      void main() {
        vWorldNormal = normalize((modelMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform float baseOpacity;
      uniform float nightBoost;
      varying vec3 vWorldNormal;
      void main() {
        float sunDot = dot(vWorldNormal, sunDirection);
        // Night: sunDot < 0, twilight: -0.1 to 0.1
        float nightAmount = smoothstep(0.1, -0.2, sunDot);
        float opacity = baseOpacity + nightBoost * nightAmount;
        gl_FragColor = vec4(1.0, 1.0, 1.0, opacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

// ─── Main component ──────────────────────────────────────────────────────────

interface LabelsOverlayProps {
  /** Whether to show text labels (country names, cities, maidenhead grid) */
  showLabels?: boolean;
  /** Subsolar point latitude for night-side border enhancement */
  subsolarLat?: number;
  /** Subsolar point longitude for night-side border enhancement */
  subsolarLon?: number;
}

export function LabelsOverlay({
  showLabels,
  subsolarLat,
  subsolarLon,
}: LabelsOverlayProps = {}) {
  const labelOptions = useMapStore((s) => s.labelOptions);
  const effectiveOptions = useMemo(
    () => ({
      borders: labelOptions.borders,
      stateBorders: labelOptions.stateBorders,
      countryNames: showLabels !== false && labelOptions.countryNames,
      cities: showLabels !== false && labelOptions.cities,
      maidenheadGrid: showLabels !== false && labelOptions.maidenheadGrid,
    }),
    [labelOptions, showLabels],
  );
  const zoomTierRef = useRef(0);
  const camDirRef = useRef(new THREE.Vector3(0, 0, 1));

  // Merged border geometry — ONE draw call for all countries
  const borderGeometry = useMemo(() => buildMergedBorderGeometry(), []);

  // Night-aware country border material
  const borderMaterial = useMemo(
    () =>
      buildNightAwareBorderMaterial(
        subsolarLat ?? 0,
        subsolarLon ?? 0,
        0.35,
        0.4,
      ),
    [subsolarLat, subsolarLon],
  );

  // Merged state border geometry — ONE draw call for all US states
  const stateBorderGeometry = useMemo(
    () => buildMergedStateBorderGeometry(),
    [],
  );

  // Night-aware state border material (lower opacity to distinguish from country borders)
  const stateBorderMaterial = useMemo(
    () =>
      buildNightAwareBorderMaterial(
        subsolarLat ?? 0,
        subsolarLon ?? 0,
        0.2,
        0.4,
      ),
    [subsolarLat, subsolarLon],
  );

  // Maidenhead grid geometry — ONE draw call for all grid lines
  const gridGeometry = useMemo(() => {
    if (!effectiveOptions.maidenheadGrid) return null;
    return buildMaidenheadGridGeometry();
  }, [effectiveOptions.maidenheadGrid]);

  const gridMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x00cccc,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    [],
  );

  // Pre-compute all label data (positions + normals for backface culling)
  const allCountryLabels: LabelData[] = useMemo(() => {
    if (!effectiveOptions.countryNames) return [];
    return WORLD_COUNTRIES.map((country: CountryData) => {
      const [nx, ny, nz] = latLonToXYZ(
        country.centroidLat,
        country.centroidLon,
        1.0,
      );
      const [px, py, pz] = latLonToXYZ(
        country.centroidLat,
        country.centroidLon,
        1.025,
      );
      return {
        key: `country-${country.iso}`,
        name: country.name,
        area: country.area,
        nx,
        ny,
        nz,
        px,
        py,
        pz,
      };
    });
  }, [effectiveOptions.countryNames]);

  const cityLabels: LabelData[] = useMemo(() => {
    if (!effectiveOptions.cities) return [];
    return MAJOR_CITIES.map((city) => {
      const [nx, ny, nz] = latLonToXYZ(city.lat, city.lon, 1.0);
      const [px, py, pz] = latLonToXYZ(city.lat, city.lon, 1.02);
      return {
        key: `city-${city.name}`,
        name: city.name,
        area: 0,
        nx,
        ny,
        nz,
        px,
        py,
        pz,
      };
    });
  }, [effectiveOptions.cities]);

  // Maidenhead field labels (324 total, backface culled)
  const maidenheadLabels: LabelData[] = useMemo(() => {
    if (!effectiveOptions.maidenheadGrid) return [];
    const fields = getMaidenheadFields();
    return fields.map((field) => {
      const [nx, ny, nz] = latLonToXYZ(field.latCenter, field.lonCenter, 1.0);
      const [px, py, pz] = latLonToXYZ(field.latCenter, field.lonCenter, 1.03);
      return {
        key: `mh-${field.label}`,
        name: field.label,
        area: 0,
        nx,
        ny,
        nz,
        px,
        py,
        pz,
      };
    });
  }, [effectiveOptions.maidenheadGrid]);

  // Force re-render callback for zoom tier changes
  const [zoomTier, setZoomTier] = useState(0);

  useFrame(({ camera }) => {
    if (
      !effectiveOptions.countryNames &&
      !effectiveOptions.cities &&
      !effectiveOptions.maidenheadGrid
    ) {
      return;
    }
    // Update camera direction (normalized) for backface culling
    camDirRef.current.copy(camera.position).normalize();

    // Update zoom tier
    const distance = camera.position.length();
    const newTier = getZoomTier(distance, zoomTierRef.current);
    if (newTier !== zoomTierRef.current) {
      zoomTierRef.current = newTier;
      setZoomTier(newTier);
    }
  });

  // Filter country labels by zoom tier
  const visibleCountryLabels = useMemo(() => {
    if (!effectiveOptions.countryNames) return [];
    return allCountryLabels.filter((c) => isCountryVisible(c.area, zoomTier));
  }, [allCountryLabels, effectiveOptions.countryNames, zoomTier]);

  return (
    <group>
      {/* ALL country borders — single draw call */}
      {effectiveOptions.borders && (
        <lineSegments geometry={borderGeometry} material={borderMaterial} />
      )}

      {/* ALL US state borders — single draw call */}
      {effectiveOptions.stateBorders && (
        <lineSegments
          geometry={stateBorderGeometry}
          material={stateBorderMaterial}
        />
      )}

      {/* Country name labels — backface culled, no occlude raycasting */}
      {effectiveOptions.countryNames &&
        visibleCountryLabels.map((label) => (
          <BackfaceLabel
            key={label.key}
            label={label}
            fontSize="text-[10px]"
            camDirRef={camDirRef}
          />
        ))}

      {/* City labels — backface culled */}
      {effectiveOptions.cities &&
        cityLabels.map((label) => (
          <BackfaceLabel
            key={label.key}
            label={label}
            fontSize="text-[9px]"
            camDirRef={camDirRef}
          />
        ))}

      {/* Maidenhead grid lines — single draw call */}
      {effectiveOptions.maidenheadGrid && gridGeometry && (
        <lineSegments geometry={gridGeometry} material={gridMaterial} />
      )}

      {/* Maidenhead field labels — backface culled */}
      {effectiveOptions.maidenheadGrid &&
        maidenheadLabels.map((label) => (
          <BackfaceLabel
            key={label.key}
            label={label}
            fontSize="text-[8px]"
            camDirRef={camDirRef}
          />
        ))}
    </group>
  );
}

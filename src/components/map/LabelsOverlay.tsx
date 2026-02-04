/**
 * LabelsOverlay Component
 *
 * Renders country borders (from comprehensive world data) and labels on the 3D globe.
 * Country borders are rendered as closed 3D line loops from imported polygon data.
 * Country name labels are placed at centroids with zoom-based filtering.
 * Major city labels are retained as secondary detail.
 */

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { WORLD_COUNTRIES, type CountryData } from "@/lib/data/worldCountries";

// Major world cities with coordinates
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

// Zoom-level area thresholds for country label visibility (km²)
const AREA_ALWAYS_VISIBLE = 1_000_000;
const AREA_MEDIUM_THRESHOLD = 100_000;
const AREA_SMALL_THRESHOLD = 10_000;

// Camera distance thresholds
const DISTANCE_FAR = 3.0;
const DISTANCE_CLOSE = 2.0;

// Hysteresis margin to prevent flickering at threshold boundaries
const DISTANCE_HYSTERESIS = 0.05;

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = 1.003,
): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Determine the zoom tier based on camera distance with hysteresis.
 *   0 = far (only large countries)
 *   1 = medium (medium+ countries)
 *   2 = close (small+ countries)
 */
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
  // currentTier === 2
  if (distance >= DISTANCE_CLOSE + DISTANCE_HYSTERESIS) return 1;
  return 2;
}

function isCountryVisible(area: number, zoomTier: number): boolean {
  if (area >= AREA_ALWAYS_VISIBLE) return true;
  if (zoomTier >= 1 && area >= AREA_MEDIUM_THRESHOLD) return true;
  if (zoomTier >= 2 && area >= AREA_SMALL_THRESHOLD) return true;
  return false;
}

interface LabelsOverlayProps {
  /** Show country borders */
  showBorders?: boolean;
  /** Show city and country labels */
  showLabels?: boolean;
}

export function LabelsOverlay({
  showBorders = true,
  showLabels = true,
}: LabelsOverlayProps) {
  const [zoomTier, setZoomTier] = useState(0);
  const zoomTierRef = useRef(0);

  useFrame(({ camera }) => {
    const distance = camera.position.length();
    const newTier = getZoomTier(distance, zoomTierRef.current);
    if (newTier !== zoomTierRef.current) {
      zoomTierRef.current = newTier;
      setZoomTier(newTier);
    }
  });

  // Pre-compute border line geometry from country data
  const borderLines = useMemo(() => {
    const lines: { key: string; points: [number, number, number][] }[] = [];

    WORLD_COUNTRIES.forEach((country: CountryData) => {
      country.borders.forEach((ring, ringIdx) => {
        if (ring.length < 2) return;

        const points: [number, number, number][] = ring.map(([lat, lon]) => {
          const vec = latLonToVector3(lat, lon, 1.003);
          return [vec.x, vec.y, vec.z] as [number, number, number];
        });

        // Close the ring
        const first = points[0];
        const last = points[points.length - 1];
        if (
          first[0] !== last[0] ||
          first[1] !== last[1] ||
          first[2] !== last[2]
        ) {
          points.push([...first]);
        }

        lines.push({
          key: `${country.iso}-${ringIdx}`,
          points,
        });
      });
    });

    return lines;
  }, []);

  // Pre-compute country label centroid positions
  const countryLabels = useMemo(() => {
    return WORLD_COUNTRIES.map((country: CountryData) => {
      const position = latLonToVector3(
        country.centroidLat,
        country.centroidLon,
        1.025,
      );
      return {
        name: country.name,
        iso: country.iso,
        area: country.area,
        position,
      };
    });
  }, []);

  // Pre-compute city 3D positions
  const cityPositions = useMemo(() => {
    return MAJOR_CITIES.map((city) => ({
      ...city,
      position: latLonToVector3(city.lat, city.lon, 1.02),
    }));
  }, []);

  // Filter visible country labels based on current zoom tier
  const visibleCountryLabels = useMemo(() => {
    return countryLabels.filter((c) => isCountryVisible(c.area, zoomTier));
  }, [countryLabels, zoomTier]);

  return (
    <group>
      {/* Country border polygons */}
      {showBorders &&
        borderLines.map((line) => (
          <Line
            key={line.key}
            points={line.points}
            color="#ffffff"
            lineWidth={0.6}
            opacity={0.35}
            transparent
          />
        ))}

      {/* Country name labels (zoom-filtered) */}
      {showLabels &&
        visibleCountryLabels.map((country) => (
          <Html
            key={`country-${country.iso}`}
            position={[
              country.position.x,
              country.position.y,
              country.position.z,
            ]}
            center
            occlude
            style={{
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            <div
              className="text-[10px] font-medium whitespace-nowrap px-1 py-0.5
                         text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]
                         bg-black/30 rounded backdrop-blur-sm"
            >
              {country.name}
            </div>
          </Html>
        ))}

      {/* City labels */}
      {showLabels &&
        cityPositions.map((city) => (
          <Html
            key={city.name}
            position={[city.position.x, city.position.y, city.position.z]}
            center
            occlude
            style={{
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            <div
              className="text-[9px] font-medium whitespace-nowrap px-1 py-0.5
                         text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]
                         bg-black/30 rounded backdrop-blur-sm"
            >
              {city.name}
            </div>
          </Html>
        ))}
    </group>
  );
}

/**
 * LabelsOverlay Component
 *
 * Renders country borders and major city labels on the 3D globe.
 * Country borders are rendered as 3D lines.
 * City labels use HTML overlays that face the camera.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";

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

// Simplified country border coordinates (key coastlines and borders)
// These are simplified polylines for major landmass outlines
const COUNTRY_BORDERS: Array<Array<[number, number]>> = [
  // North America West Coast
  [
    [48.4, -124.7],
    [42.0, -124.2],
    [34.4, -120.5],
    [32.5, -117.1],
    [23.0, -110.0],
  ],
  // North America East Coast
  [
    [47.0, -67.0],
    [42.0, -70.0],
    [35.0, -75.5],
    [25.0, -80.0],
    [30.0, -88.0],
  ],
  // South America West Coast
  [
    [-5.0, -81.0],
    [-15.0, -75.0],
    [-33.0, -71.6],
    [-54.8, -68.3],
  ],
  // South America East Coast
  [
    [5.0, -52.0],
    [-3.0, -41.0],
    [-23.0, -43.0],
    [-34.0, -54.0],
    [-54.8, -68.3],
  ],
  // Europe West Coast
  [
    [58.0, -6.0],
    [50.0, -5.0],
    [43.0, -9.0],
    [36.0, -6.0],
    [36.0, -5.3],
  ],
  // Mediterranean
  [
    [36.0, -5.3],
    [37.0, 15.0],
    [38.0, 24.0],
    [41.0, 29.0],
  ],
  // Africa West Coast
  [
    [35.0, -6.0],
    [14.0, -17.0],
    [-5.0, 12.0],
    [-34.0, 18.0],
  ],
  // Africa East Coast
  [
    [31.0, 32.0],
    [12.0, 43.0],
    [-5.0, 40.0],
    [-26.0, 33.0],
    [-34.0, 26.0],
  ],
  // Asia - India
  [
    [23.0, 68.0],
    [8.0, 77.0],
    [22.0, 88.0],
  ],
  // Asia - Southeast
  [
    [22.0, 88.0],
    [10.0, 99.0],
    [1.0, 103.0],
    [6.0, 116.0],
  ],
  // Asia - China/Japan
  [
    [40.0, 120.0],
    [35.0, 129.0],
    [35.0, 140.0],
    [45.0, 142.0],
  ],
  // Australia
  [
    [-12.0, 130.0],
    [-20.0, 118.0],
    [-35.0, 117.0],
    [-38.0, 145.0],
    [-28.0, 153.0],
    [-12.0, 142.0],
    [-12.0, 130.0],
  ],
  // US-Canada Border (simplified)
  [
    [49.0, -123.0],
    [49.0, -95.0],
    [45.0, -75.0],
  ],
  // US-Mexico Border (simplified)
  [
    [32.5, -117.0],
    [29.0, -103.0],
    [26.0, -97.0],
  ],
];

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

interface LabelsOverlayProps {
  /** Show country borders */
  showBorders?: boolean;
  /** Show city labels */
  showLabels?: boolean;
}

export function LabelsOverlay({
  showBorders = true,
  showLabels = true,
}: LabelsOverlayProps) {
  // Convert border coordinates to 3D points
  const borderLines = useMemo(() => {
    return COUNTRY_BORDERS.map((border) =>
      border.map(([lat, lon]) => {
        const vec = latLonToVector3(lat, lon, 1.003);
        return [vec.x, vec.y, vec.z] as [number, number, number];
      }),
    );
  }, []);

  // Convert city coordinates to 3D positions
  const cityPositions = useMemo(() => {
    return MAJOR_CITIES.map((city) => ({
      ...city,
      position: latLonToVector3(city.lat, city.lon, 1.02),
    }));
  }, []);

  return (
    <group>
      {/* Country borders */}
      {showBorders &&
        borderLines.map((points, index) => (
          <Line
            key={`border-${index}`}
            points={points}
            color="#ffffff"
            lineWidth={0.5}
            opacity={0.4}
            transparent
          />
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

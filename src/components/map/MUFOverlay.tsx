/**
 * MUFOverlay Component
 *
 * Renders a semi-transparent MUF (Maximum Usable Frequency) overlay on the globe.
 * Uses a custom shader to visualize MUF values across the globe with color coding:
 * - Red: < 7 MHz (low bands only)
 * - Yellow: 7-14 MHz (40m-20m)
 * - Green: 14-21 MHz (20m-15m)
 * - Blue: > 21 MHz (high bands open)
 *
 * Now supports blending with real ionosonde measurements when available.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { useIonosondeData } from "@/hooks/useIonosondeData";
import type { IonosondeReading } from "@/lib/api/ionosonde";

interface MUFOverlayProps {
  /** Current display time */
  date: Date;
  /** Solar Flux Index */
  sfi: number;
  /** Overlay opacity (0-1) */
  opacity?: number;
  /** Whether to blend with measured ionosonde data (default false) */
  useMeasuredData?: boolean;
}

/**
 * Create ionosonde station uniforms for shader
 * We'll pass up to 32 stations to the shader for real-time blending
 */
function createStationUniforms(stations: IonosondeReading[]): {
  stationPositions: THREE.Vector3[];
  stationFoF2Values: number[];
  stationCount: number;
} {
  const maxStations = 32;
  const stationPositions: THREE.Vector3[] = [];
  const stationFoF2Values: number[] = [];

  // Sort by confidence and take top stations
  const sortedStations = [...stations]
    .filter((s) => s.confidence >= 50)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxStations);

  for (const station of sortedStations) {
    // Convert lat/lon to 3D normalized vector
    const phi = ((90 - station.lat) * Math.PI) / 180;
    const theta = ((station.lon + 180) * Math.PI) / 180;

    stationPositions.push(
      new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      ),
    );
    stationFoF2Values.push(station.foF2);
  }

  // Pad arrays to maxStations length
  while (stationPositions.length < maxStations) {
    stationPositions.push(new THREE.Vector3(0, 0, 0));
    stationFoF2Values.push(0);
  }

  return {
    stationPositions,
    stationFoF2Values,
    stationCount: sortedStations.length,
  };
}

export function MUFOverlay({
  date,
  sfi,
  opacity = 0.45,
  useMeasuredData = false,
}: MUFOverlayProps) {
  // Get ionosonde data when measured mode is enabled
  const { stations } = useIonosondeData();

  // Calculate subsolar point for the shader
  const subsolar = useMemo(() => getSubsolarPoint(date), [date]);

  // Prepare station data for shader
  const stationData = useMemo(() => {
    if (!useMeasuredData || !stations.length) {
      return {
        stationPositions: Array(32).fill(new THREE.Vector3(0, 0, 0)),
        stationFoF2Values: Array(32).fill(0),
        stationCount: 0,
      };
    }
    return createStationUniforms(stations);
  }, [useMeasuredData, stations]);

  // Custom shader material for MUF visualization
  const material = useMemo(() => {
    // Convert lat/lon to 3D using same coordinate system as globe
    const phi = ((90 - subsolar.lat) * Math.PI) / 180;
    const theta = ((subsolar.lon + 180) * Math.PI) / 180;

    const sunVec = new THREE.Vector3(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );

    return new THREE.ShaderMaterial({
      uniforms: {
        sunPosition: { value: sunVec },
        sfi: { value: sfi },
        opacity: { value: opacity },
        useMeasured: { value: useMeasuredData ? 1 : 0 },
        stationCount: { value: stationData.stationCount },
        stationPositions: { value: stationData.stationPositions },
        stationFoF2: { value: stationData.stationFoF2Values },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunPosition;
        uniform float sfi;
        uniform float opacity;
        uniform int useMeasured;
        uniform int stationCount;
        uniform vec3 stationPositions[32];
        uniform float stationFoF2[32];

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        // MUF factor for converting foF2 to MUF(3000)
        const float MUF_FACTOR = 3.0;

        // Calculate model-based MUF at position
        float calculateModelMUF(vec3 pos, vec3 sunPos, float solarFlux) {
          // Base critical frequency from SFI
          float f0F2 = 0.15 * sqrt(max(solarFlux - 60.0, 5.0)) + 4.0;

          // Calculate solar zenith angle (dot product with sun direction)
          float sunDot = dot(pos, sunPos);
          float zenithAngle = acos(clamp(sunDot, -1.0, 1.0));
          float zenithDeg = zenithAngle * 57.29578; // rad to deg

          // MUF factor for F2 layer
          float mufFactor = 3.6;

          // Latitude correction (get lat from position)
          float lat = asin(pos.y) * 57.29578;
          float latFactor = 1.0 + 0.1 * cos(abs(lat) * 0.01745);

          // Calculate MUF based on zenith angle
          float muf;

          if (zenithDeg > 90.0) {
            // Night side
            float nightDepth = (zenithDeg - 90.0) / 90.0;
            muf = f0F2 * 2.0 * (1.0 - nightDepth * 0.4);
          } else if (zenithDeg > 80.0) {
            // Twilight transition
            float twilightFactor = (90.0 - zenithDeg) / 10.0;
            float dayMUF = f0F2 * mufFactor * pow(cos(zenithAngle), 0.5);
            float nightMUF = f0F2 * 2.0;
            muf = nightMUF + (dayMUF - nightMUF) * twilightFactor;
          } else {
            // Day side
            float cosFactor = pow(cos(zenithAngle), 0.5);
            muf = f0F2 * mufFactor * cosFactor;
          }

          return max(muf, 3.5) * latFactor;
        }

        // Calculate measured MUF using inverse distance weighting from ionosonde stations
        float calculateMeasuredMUF(vec3 pos) {
          if (stationCount == 0) return 0.0;

          float totalWeight = 0.0;
          float weightedSum = 0.0;
          float maxInfluenceDistance = 0.5; // ~3000km in normalized units

          for (int i = 0; i < 32; i++) {
            if (i >= stationCount) break;

            vec3 stationPos = stationPositions[i];
            float foF2 = stationFoF2[i];

            // Calculate angular distance
            float dist = acos(clamp(dot(pos, stationPos), -1.0, 1.0));

            if (dist < maxInfluenceDistance) {
              // Inverse distance weighting with power of 2
              float weight = 1.0 / max(dist * dist, 0.001);
              totalWeight += weight;
              weightedSum += foF2 * MUF_FACTOR * weight;
            }
          }

          if (totalWeight > 0.0) {
            return weightedSum / totalWeight;
          }
          return 0.0;
        }

        // Calculate final MUF, optionally blending measured and modeled
        float calculateMUF(vec3 pos, vec3 sunPos, float solarFlux) {
          float modelMUF = calculateModelMUF(pos, sunPos, solarFlux);

          if (useMeasured == 0 || stationCount == 0) {
            return modelMUF;
          }

          float measuredMUF = calculateMeasuredMUF(pos);

          if (measuredMUF > 0.0) {
            // Blend measured and modeled based on station coverage
            // Higher weight to measured data near stations
            float blendFactor = 0.7; // 70% measured, 30% model
            return mix(modelMUF, measuredMUF, blendFactor);
          }

          return modelMUF;
        }

        // Get color for MUF value
        vec3 getMUFColor(float muf) {
          // Color thresholds
          // < 7 MHz: Red (low bands only)
          // 7-14 MHz: Yellow (40m-20m)
          // 14-21 MHz: Green (20m-15m)
          // > 21 MHz: Blue (high bands open)

          vec3 red = vec3(0.937, 0.267, 0.267);     // #ef4444
          vec3 yellow = vec3(0.918, 0.702, 0.031);  // #eab308
          vec3 green = vec3(0.133, 0.773, 0.369);   // #22c55e
          vec3 blue = vec3(0.231, 0.510, 0.965);    // #3b82f6

          if (muf < 7.0) {
            return red;
          } else if (muf < 14.0) {
            // Blend red to yellow
            float t = (muf - 7.0) / 7.0;
            return mix(red, yellow, t);
          } else if (muf < 21.0) {
            // Blend yellow to green
            float t = (muf - 14.0) / 7.0;
            return mix(yellow, green, t);
          } else {
            // Blend green to blue (up to ~28 MHz)
            float t = clamp((muf - 21.0) / 7.0, 0.0, 1.0);
            return mix(green, blue, t);
          }
        }

        void main() {
          // Calculate MUF at this position
          float muf = calculateMUF(vPosition, sunPosition, sfi);

          // Get color based on MUF
          vec3 color = getMUFColor(muf);

          gl_FragColor = vec4(color, opacity);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
  }, [subsolar, sfi, opacity, useMeasuredData, stationData]);

  return (
    <mesh>
      <sphereGeometry args={[1.002, 64, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * MUF data source indicator component
 * Shows whether using modeled or measured data
 */
export function MUFDataSourceBadge({
  useMeasuredData,
  stationCount,
  lastUpdate: _lastUpdate,
  onToggle,
}: {
  useMeasuredData: boolean;
  stationCount: number;
  lastUpdate: Date | null;
  onToggle?: () => void;
}) {
  const hasMeasuredData = stationCount > 0;

  return (
    <button
      onClick={onToggle}
      disabled={!hasMeasuredData}
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
        transition-colors border
        ${
          useMeasuredData && hasMeasuredData
            ? "bg-signal-green/20 border-signal-green/50 text-signal-green hover:bg-signal-green/30"
            : hasMeasuredData
              ? "bg-cosmic-cyan/20 border-cosmic-cyan/50 text-cosmic-cyan hover:bg-cosmic-cyan/30"
              : "bg-space-800 border-space-700 text-space-500 cursor-not-allowed"
        }
      `}
      title={
        hasMeasuredData
          ? useMeasuredData
            ? "Using real ionosonde data (click to use model only)"
            : "Using predicted model (click to blend with real data)"
          : "No ionosonde data available"
      }
    >
      {/* Indicator dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          useMeasuredData && hasMeasuredData
            ? "bg-signal-green animate-pulse"
            : hasMeasuredData
              ? "bg-cosmic-cyan"
              : "bg-space-600"
        }`}
      />

      {/* Label */}
      <span>
        {useMeasuredData && hasMeasuredData
          ? "Real foF2"
          : hasMeasuredData
            ? "Model"
            : "Model Only"}
      </span>

      {/* Station count */}
      {hasMeasuredData && (
        <span className="text-[10px] opacity-70">({stationCount})</span>
      )}
    </button>
  );
}

/**
 * MUF comparison display for path analysis
 * Shows model vs measured MUF when both are available
 */
export function MUFComparisonDisplay({
  modeledMUF,
  measuredMUF,
  className = "",
}: {
  modeledMUF: number | null;
  measuredMUF: number | null;
  className?: string;
}) {
  if (modeledMUF === null) return null;

  const hasMeasured = measuredMUF !== null;
  const difference = hasMeasured ? measuredMUF - modeledMUF : null;
  const percentDiff =
    hasMeasured && modeledMUF > 0
      ? ((measuredMUF - modeledMUF) / modeledMUF) * 100
      : null;

  return (
    <div className={`font-mono text-xs ${className}`}>
      <div className="flex items-center gap-2">
        {/* Model value */}
        <div className="flex items-center gap-1">
          <span className="text-cosmic-cyan text-[10px]">Model:</span>
          <span className="text-white">{modeledMUF.toFixed(1)} MHz</span>
        </div>

        {/* Measured value */}
        {hasMeasured && (
          <>
            <span className="text-space-600">/</span>
            <div className="flex items-center gap-1">
              <span className="text-signal-green text-[10px]">Real:</span>
              <span className="text-signal-green font-semibold">
                {measuredMUF.toFixed(1)} MHz
              </span>
            </div>
          </>
        )}
      </div>

      {/* Difference indicator */}
      {hasMeasured && difference !== null && percentDiff !== null && (
        <div className="mt-0.5 text-[10px]">
          <span
            className={
              difference > 0
                ? "text-signal-green"
                : difference < 0
                  ? "text-alert-red"
                  : "text-space-400"
            }
          >
            {difference > 0 ? "+" : ""}
            {difference.toFixed(1)} MHz ({percentDiff > 0 ? "+" : ""}
            {percentDiff.toFixed(0)}%)
          </span>
          <span className="text-space-500 ml-1">
            {Math.abs(percentDiff) < 10
              ? "Model accurate"
              : percentDiff > 0
                ? "Better than predicted"
                : "Worse than predicted"}
          </span>
        </div>
      )}
    </div>
  );
}

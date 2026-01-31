/**
 * GlobeView Component
 *
 * 3D interactive globe using React Three Fiber.
 * Provides camera controls, lighting, and click-to-select functionality.
 */

import { Suspense, useCallback, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars, PerspectiveCamera } from "@react-three/drei";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { EarthSphere } from "./EarthSphere";
import { Terminator } from "./Terminator";
import { Greyline } from "./Greyline";
import { NightOverlay } from "./NightOverlay";
import { AuroraOverlay } from "./AuroraOverlay";
import { MUFOverlay } from "./MUFOverlay";
import { PathArc } from "./PathArc";
import { LocationMarker } from "./LocationMarker";
import { LiveSpotArcs } from "./LiveSpotArcs";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useAuroraData } from "@/hooks/useAuroraData";
import { useCurrentSFI } from "@/hooks/useMUFData";

interface GlobeViewProps {
  /** Current display time (current time + offset) */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
}

/**
 * Loading fallback for 3D content
 */
function GlobeLoader() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color="#1a1a2e" wireframe />
    </mesh>
  );
}

/**
 * Scene lighting setup - positions sun based on actual subsolar point
 */
function SceneLighting({ displayTime }: { displayTime: Date }) {
  // Calculate sun position from subsolar point
  const sunPosition = useMemo(() => {
    const subsolar = getSubsolarPoint(displayTime);

    // Convert lat/lon to 3D using same coordinate system as globe
    const phi = ((90 - subsolar.lat) * Math.PI) / 180;
    const theta = ((subsolar.lon + 180) * Math.PI) / 180;

    // Position sun far away for directional light effect
    const distance = 10;
    return [
      -distance * Math.sin(phi) * Math.cos(theta),
      distance * Math.cos(phi),
      distance * Math.sin(phi) * Math.sin(theta),
    ] as [number, number, number];
  }, [displayTime]);

  return (
    <>
      {/* Ambient light for base illumination */}
      <ambientLight intensity={0.2} />
      {/* Sun light - positioned based on actual subsolar point */}
      <directionalLight
        position={sunPosition}
        intensity={1.5}
        color="#fff8e8"
      />
      {/* Subtle fill light from opposite side */}
      <directionalLight
        position={[-sunPosition[0], -sunPosition[1], -sunPosition[2]]}
        intensity={0.1}
        color="#4466aa"
      />
    </>
  );
}

/**
 * Globe scene content
 */
function GlobeScene({
  displayTime,
  onLocationClick,
}: {
  displayTime: Date;
  onLocationClick?: (lat: number, lon: number) => void;
}) {
  const { layers, target, autoRotate } = useMapStore();
  const { station } = useUserStore();
  const { data: auroraData } = useAuroraData();
  const currentSFI = useCurrentSFI();

  const handleEarthClick = useCallback(
    (lat: number, lon: number) => {
      onLocationClick?.(lat, lon);
    },
    [onLocationClick],
  );

  return (
    <>
      <SceneLighting displayTime={displayTime} />

      {/* Starfield background */}
      <Stars
        radius={100}
        depth={50}
        count={3000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />

      {/* Earth sphere */}
      <EarthSphere
        autoRotate={autoRotate}
        rotationSpeed={0.0005}
        onClick={handleEarthClick}
      />

      {/* Night side darkening overlay */}
      {layers.terminator && <NightOverlay date={displayTime} opacity={0.6} />}

      {/* Day/night terminator line */}
      {layers.terminator && <Terminator date={displayTime} />}

      {/* Greyline band */}
      {layers.greyline && <Greyline date={displayTime} />}

      {/* Aurora overlay */}
      {layers.aurora && auroraData && (
        <AuroraOverlay auroraData={auroraData} minProbability={10} />
      )}

      {/* MUF overlay */}
      {layers.muf && currentSFI && (
        <MUFOverlay date={displayTime} sfi={currentSFI} opacity={0.45} />
      )}

      {/* Live spot arcs */}
      {layers.spots && <LiveSpotArcs grid={station?.grid} maxArcs={30} />}

      {/* Home station marker */}
      {station && (
        <LocationMarker
          lat={station.lat}
          lon={station.lon}
          color="#00ff88"
          label={station.callsign}
          type="home"
        />
      )}

      {/* Target location marker */}
      {target && (
        <>
          <LocationMarker
            lat={target.lat}
            lon={target.lon}
            color="#ff6b35"
            label={target.name || target.grid}
            type="target"
          />

          {/* Path arc between home and target */}
          {station && (
            <PathArc
              startLat={station.lat}
              startLon={station.lon}
              endLat={target.lat}
              endLon={target.lon}
            />
          )}
        </>
      )}

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        zoomSpeed={0.5}
        minDistance={1.5}
        maxDistance={4}
        rotateSpeed={0.5}
        dampingFactor={0.1}
        enableDamping
      />
    </>
  );
}

export function GlobeView({ displayTime, onLocationClick }: GlobeViewProps) {
  const { zoom } = useMapStore();

  return (
    <div className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden">
      <Canvas>
        <PerspectiveCamera
          makeDefault
          position={[0, 0, 2.5 / zoom]}
          fov={45}
          near={0.1}
          far={1000}
        />
        <Suspense fallback={<GlobeLoader />}>
          <GlobeScene
            displayTime={displayTime}
            onLocationClick={onLocationClick}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

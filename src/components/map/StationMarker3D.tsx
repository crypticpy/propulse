/**
 * StationMarker3D -- Renders user's station location as a pulsing pin on the globe
 */

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { latLonTo3D } from "@/components/map/lib/globeCoords";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";

const GLOBE_RADIUS = 1.000002;

interface StationMarker3DProps {
  lat: number;
  lon: number;
  callsign: string;
}

export const StationMarker3D = React.memo(function StationMarker3D({
  lat,
  lon,
  callsign,
}: StationMarker3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const worldPositionRef = useRef(new THREE.Vector3());
  const [x, y, z] = latLonTo3D(lat, lon, GLOBE_RADIUS);

  // Tile-hugging marker below the depth dome — depthTest stays off, so the
  // far side must fade out via CPU occlusion (globe stacking contract 1b).
  const { opacityRef } = useGlobeOcclusion(lat, lon);

  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const occlusion = opacityRef.current;

    if (groupRef.current) {
      groupRef.current.visible = occlusion > 0.01;
      groupRef.current.getWorldPosition(worldPositionRef.current);
      groupRef.current.scale.setScalar(
        getScreenSpaceScale(
          camera.position.distanceTo(worldPositionRef.current),
        ),
      );
    }

    // Pulse the marker
    if (meshRef.current) {
      const scale = 1 + Math.sin(t * 2) * 0.15;
      meshRef.current.scale.setScalar(scale);
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.9 * occlusion;
    }

    // Expand and fade the ring
    if (ringRef.current) {
      const phase = (t * 0.8) % 2;
      const ringScale = 1 + phase * 2;
      ringRef.current.scale.setScalar(ringScale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.max(0, 0.6 - phase * 0.3) * occlusion;
    }
  });

  return (
    <group ref={groupRef} position={[x, y, z]}>
      {/* Pulsing ring */}
      <mesh ref={ringRef} renderOrder={GLOBE_LAYER_ORDER.markers}>
        <ringGeometry args={[0.003, 0.004, 32]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Core dot */}
      <mesh ref={meshRef} renderOrder={GLOBE_LAYER_ORDER.markers}>
        <sphereGeometry args={[0.003, 12, 12]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0.9}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Callsign label */}
      <Text
        position={[0, 0.012, 0]}
        fontSize={0.012}
        color="#f97316"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.001}
        outlineColor="#000000"
        /* Above every other marker, but within the markers slot. This used to
           borrow nightShade's number, which only worked while the night shade
           sat above markers in the ladder. */
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
        font={undefined}
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        {...({ "material-depthTest": false } as any)}
      >
        {callsign || "QTH"}
      </Text>
    </group>
  );
});

export default StationMarker3D;

/**
 * FlashPulse
 *
 * Fires a ~3s expanding/fading ring at a point selected out-of-band -- e.g.
 * clicking a hop's reflection point in the MUF report's hop table. Cloned
 * from `LoggedPulse` (see that file for the surface-orientation / occlusion
 * rationale); kept as a separate component/color so a hop-table click and a
 * just-logged QSO are never visually confused with each other.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToVector3 } from "@/components/map/lib/globeCoords";
import {
  FLASH_POINT_DURATION_MS,
  useFlashPoint,
} from "@/components/map/hooks/useFlashPoint";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";

const SURFACE_OFFSET = 1.000002;
const PULSE_COLOR = "#FFB000"; // plasma-orange -- distinct from LoggedPulse's signal-green
const RING_BASE_RADIUS = 0.025;

export function FlashPulse() {
  const flashPoint = useFlashPoint();
  const ringRef = useRef<THREE.Mesh>(null);

  const position = useMemo(() => {
    if (!flashPoint) return null;
    return latLonToVector3(flashPoint.lat, flashPoint.lon, SURFACE_OFFSET);
  }, [flashPoint]);

  const surfaceQuaternion = useMemo(() => {
    if (!position) return null;
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      position.clone().normalize(),
    );
  }, [position]);

  const { opacityRef } = useGlobeOcclusion(
    flashPoint?.lat ?? 0,
    flashPoint?.lon ?? 0,
  );

  useFrame(() => {
    if (!ringRef.current || !flashPoint) return;
    const progress = Math.min(
      Math.max((Date.now() - flashPoint.at) / FLASH_POINT_DURATION_MS, 0),
      1,
    );
    const scale = 1 + progress * 4;
    ringRef.current.scale.setScalar(scale);
    const material = ringRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.75 * (1 - progress) * opacityRef.current;
    ringRef.current.visible = opacityRef.current > 0.01;
  });

  if (!flashPoint || !position || !surfaceQuaternion) return null;

  return (
    <mesh
      ref={ringRef}
      position={position}
      quaternion={surfaceQuaternion}
      renderOrder={GLOBE_LAYER_ORDER.markers + 0.2}
    >
      <ringGeometry args={[RING_BASE_RADIUS * 0.85, RING_BASE_RADIUS, 32]} />
      <meshBasicMaterial
        color={PULSE_COLOR}
        transparent
        opacity={0.75}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

export default FlashPulse;

/**
 * LoggedPulse
 *
 * Fires a ~2s expanding/fading signal-green ring at the lat/lon of a QSO
 * that was just logged (WSJT-X auto-log or a manual Enter with a resolvable
 * target). Reads its marker from `useJustLoggedMarker`, which anchors expiry
 * to the marker's own timestamp (see that hook for why) rather than to when
 * this component happens to mount.
 *
 * Positioned like LocationMarker's target dot (tile-hugging radius +
 * useGlobeOcclusion CPU fade) so it sits directly on the pin it is
 * celebrating rather than floating above the surface. Oriented tangent to
 * the globe surface the same way SpotHighlight orients its rings -- without
 * this the ring sits in the world XY plane and appears edge-on at most
 * positions.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToVector3 } from "@/components/map/lib/globeCoords";
import {
  JUST_LOGGED_PULSE_DURATION_MS,
  useJustLoggedMarker,
} from "@/components/map/hooks/useJustLoggedMarker";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";

const SURFACE_OFFSET = 1.000002;
const PULSE_COLOR = "#00FF88"; // signal-green
const RING_BASE_RADIUS = 0.025;

export function LoggedPulse() {
  const justLogged = useJustLoggedMarker();
  const ringRef = useRef<THREE.Mesh>(null);

  const position = useMemo(() => {
    if (!justLogged) return null;
    return latLonToVector3(justLogged.lat, justLogged.lon, SURFACE_OFFSET);
  }, [justLogged]);

  // Orient the flat ring tangent to the globe surface, front face outward --
  // without this it sits in the world XY plane and appears edge-on at most
  // positions. Same pattern as SpotHighlight.
  const surfaceQuaternion = useMemo(() => {
    if (!position) return null;
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      position.clone().normalize(),
    );
  }, [position]);

  const { opacityRef } = useGlobeOcclusion(
    justLogged?.lat ?? 0,
    justLogged?.lon ?? 0,
  );

  useFrame(() => {
    if (!ringRef.current || !justLogged) return;
    const progress = Math.min(
      Math.max(
        (Date.now() - justLogged.at) / JUST_LOGGED_PULSE_DURATION_MS,
        0,
      ),
      1,
    );
    const scale = 1 + progress * 4;
    ringRef.current.scale.setScalar(scale);
    const material = ringRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.75 * (1 - progress) * opacityRef.current;
    ringRef.current.visible = opacityRef.current > 0.01;
  });

  if (!justLogged || !position || !surfaceQuaternion) return null;

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

export default LoggedPulse;

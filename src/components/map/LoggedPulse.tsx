/**
 * LoggedPulse
 *
 * Fires a ~2s expanding/fading signal-green ring at the lat/lon of a QSO
 * that was just logged (WSJT-X auto-log or a manual Enter with a resolvable
 * target). Reads `justLogged` from mapStore -- see logIntent.ts for the
 * writers -- and clears the marker itself once the pulse finishes so it
 * never lingers. Guards against a newer marker landing mid-animation by only
 * clearing the store if the marker it started with is still the active one.
 *
 * Positioned like LocationMarker's target dot (tile-hugging radius +
 * useGlobeOcclusion CPU fade) so it sits directly on the pin it is
 * celebrating rather than floating above the surface.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToVector3 } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";
import { useMapStore } from "@/stores/mapStore";

const SURFACE_OFFSET = 1.000002;
const PULSE_DURATION_MS = 2000;
const PULSE_COLOR = "#00FF88"; // signal-green
const RING_BASE_RADIUS = 0.025;

export function LoggedPulse() {
  const justLogged = useMapStore((s) => s.justLogged);
  const setJustLogged = useMapStore((s) => s.setJustLogged);
  const ringRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!justLogged) return undefined;
    const markerAt = justLogged.at;
    const timer = window.setTimeout(() => {
      // Only clear if a newer marker hasn't already replaced this one.
      if (useMapStore.getState().justLogged?.at === markerAt) {
        setJustLogged(null);
      }
    }, PULSE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [justLogged, setJustLogged]);

  const position = useMemo(() => {
    if (!justLogged) return null;
    return latLonToVector3(justLogged.lat, justLogged.lon, SURFACE_OFFSET);
  }, [justLogged]);

  const { opacityRef } = useGlobeOcclusion(
    justLogged?.lat ?? 0,
    justLogged?.lon ?? 0,
  );

  useFrame(() => {
    if (!ringRef.current || !justLogged) return;
    const progress = Math.min(
      Math.max((Date.now() - justLogged.at) / PULSE_DURATION_MS, 0),
      1,
    );
    const scale = 1 + progress * 4;
    ringRef.current.scale.setScalar(scale);
    const material = ringRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.75 * (1 - progress) * opacityRef.current;
    ringRef.current.visible = opacityRef.current > 0.01;
  });

  if (!justLogged || !position) return null;

  return (
    <mesh
      ref={ringRef}
      position={position}
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

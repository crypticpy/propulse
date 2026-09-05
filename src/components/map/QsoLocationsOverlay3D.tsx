/**
 * QsoLocationsOverlay3D
 *
 * Renders contest and logged QSO locations as band-colored dots on the 3D
 * globe. Mirrors FlatMapView's drawContestQsos/drawLoggedQsos color scheme
 * and semantics (band-colored markers, contest QSOs more opaque/larger with
 * multiplier QSOs sized up, logged QSOs smaller/more transparent since there
 * can be many) so the 2D and 3D views agree visually.
 *
 * Accepts all data as props -- no direct hook imports (matches the
 * WSPROverlay3D / EarthquakeOverlay3D convention: GlobeView owns the data
 * hooks, this component only renders).
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { latLonTo3D, getUpDirection } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { getQsoBandColor } from "@/lib/map/qsoBandColors";
import type { LocatedContestQso } from "@/hooks/useContestQsoLocations";
import type { LocatedLogQso } from "@/hooks/useLoggedQsoLocations";

interface QsoLocationsOverlay3DProps {
  contestQsos: LocatedContestQso[];
  loggedQsos: LocatedLogQso[];
}

/** Globe surface radius for QSO location dots (markers range: 1.005-1.03) */
const MARKER_RADIUS = 1.008;

/** Marker sizes, kept within the ~0.004-0.006 point-marker guidance */
const LOGGED_DOT_SIZE = 0.006;
const CONTEST_DOT_SIZE = 0.005;
const CONTEST_MULTIPLIER_DOT_SIZE = 0.006;

/** Segments per dot -- kept low since there can be hundreds of instances */
const DOT_SEGMENTS = 12;

interface QsoDot {
  lat: number;
  lon: number;
  color: string;
  size: number;
}

/**
 * Instanced surface-tangent discs for a set of QSO location dots.
 * Follows the OverlayLayers3D (OverlayCells) pattern: InstancedMesh +
 * circleGeometry, positions on the globe surface, quaternion orienting each
 * disc outward via setFromUnitVectors, depthTest/depthWrite off so the
 * discs aren't discarded by the depth buffer against the opaque tile globe
 * (see globeRenderOrder.ts for the full stacking contract).
 */
function QsoDotField({
  dots,
  opacity,
  renderOrder,
  hollow = false,
}: {
  dots: QsoDot[];
  opacity: number;
  renderOrder: number;
  hollow?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const normalUp = new THREE.Vector3(0, 0, 1);
    dots.forEach((dot, index) => {
      const [x, y, z] = latLonTo3D(dot.lat, dot.lon, MARKER_RADIUS);
      const position = new THREE.Vector3(x, y, z);
      const outward = getUpDirection(dot.lat, dot.lon);
      quaternion.setFromUnitVectors(normalUp, outward);
      scale.setScalar(dot.size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(dot.color));
    });
    mesh.count = dots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [dots]);

  if (dots.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, dots.length]}
      renderOrder={renderOrder}
      frustumCulled={false}
    >
      {hollow ? <ringGeometry args={[0.55, 1, DOT_SEGMENTS]} /> : <circleGeometry args={[1, DOT_SEGMENTS]} />}
      <meshBasicMaterial
        transparent
        opacity={opacity}
        depthTest={true}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function QsoLocationsOverlay3D({
  contestQsos,
  loggedQsos,
}: QsoLocationsOverlay3DProps) {
  const loggedDots = useMemo<QsoDot[]>(
    () =>
      loggedQsos.map((qso) => ({
        lat: qso.lat,
        lon: qso.lon,
        color: getQsoBandColor(qso.band),
        size: LOGGED_DOT_SIZE,
      })),
    [loggedQsos],
  );

  const contestDots = useMemo<QsoDot[]>(
    () =>
      contestQsos.map((qso) => ({
        lat: qso.lat,
        lon: qso.lon,
        color: getQsoBandColor(qso.band),
        size: qso.isMultiplier
          ? CONTEST_MULTIPLIER_DOT_SIZE
          : CONTEST_DOT_SIZE,
      })),
    [contestQsos],
  );

  if (loggedDots.length === 0 && contestDots.length === 0) return null;

  return (
    <group name="qso-locations-overlay">
      {/* Logged QSOs painted first -- smaller, more transparent (can be
          hundreds of entries), mirrors drawLoggedQsos being drawn behind
          contest QSOs in FlatMapView. */}
      <QsoDotField
        dots={loggedDots}
        hollow
        opacity={0.9}
        renderOrder={GLOBE_LAYER_ORDER.markers}
      />
      {/* Contest QSOs painted on top -- more opaque, mirrors drawContestQsos. */}
      <QsoDotField
        dots={contestDots}
        opacity={0.8}
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
      />
    </group>
  );
}

export default QsoLocationsOverlay3D;

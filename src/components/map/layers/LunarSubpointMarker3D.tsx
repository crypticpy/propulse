/** Lunar-overhead marker for the 3D globe. */

import { useMemo } from "react";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";
import { getSublunarPoint } from "@/lib/utils/moon";
import { LUNAR_SUBPOINT_COLOR } from "@/lib/map/lunarSubpointMarker";
import { useMapStore } from "@/stores/mapStore";
import { SpotLabel } from "../SpotLabel";

interface LunarSubpointMarker3DProps {
  displayTime: Date;
}

export function LunarSubpointMarker3D({
  displayTime,
}: LunarSubpointMarker3DProps) {
  const point = useMemo(() => getSublunarPoint(displayTime), [displayTime]);
  const { opacity } = useGlobeOcclusion(point.lat, point.lon);
  const setTarget = useMapStore((state) => state.setTarget);

  return (
    <group name="lunar-subpoint-marker">
      <SpotLabel
        lat={point.lat}
        lon={point.lon}
        callsign="LUNAR"
        badge="☾"
        size="md"
        color={LUNAR_SUBPOINT_COLOR}
        occlusionOpacity={opacity}
        ariaLabel={`Lunar subpoint at ${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`}
        onClick={() =>
          setTarget({
            lat: point.lat,
            lon: point.lon,
            name: "Lunar Subpoint",
          })
        }
      />
    </group>
  );
}

export default LunarSubpointMarker3D;

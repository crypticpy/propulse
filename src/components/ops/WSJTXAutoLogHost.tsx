import { useJustLoggedMarker } from "@/components/map/hooks/useJustLoggedMarker";
import { useWSJTXAutoLog } from "@/hooks/useWSJTXAutoLog";

/** App-root host so WSJT-X logs land even when the operator is off /map. */
export function WSJTXAutoLogHost() {
  useWSJTXAutoLog();
  // Expire the globe's `justLogged` marker on its own timer here too, so a
  // QSO logged while /map is unmounted doesn't leave a stale marker (and
  // stale chip) for whenever the operator returns to the globe.
  useJustLoggedMarker();
  return null;
}

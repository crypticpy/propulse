import { useWSJTXAutoLog } from "@/hooks/useWSJTXAutoLog";

/** App-root host so WSJT-X logs land even when the operator is off /map. */
export function WSJTXAutoLogHost() {
  useWSJTXAutoLog();
  return null;
}

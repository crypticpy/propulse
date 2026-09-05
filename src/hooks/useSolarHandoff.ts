import { useMapStore } from "@/stores/mapStore";
import { useOperatingStore } from "@/stores/operatingStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { parseSolarHandoff } from "@/lib/solar/handoff";

/** Router state carries operating intent without resetting map display settings. */
export function useSolarHandoff() {
  const { state } = useLocation();
  return useMemo(() => parseSolarHandoff(state?.solarHandoff), [state]);
}

/** Keep planning intent local so telemetry and contest locks cannot discard it. */
export function useSolarPlanningMode(handoff: ReturnType<typeof parseSolarHandoff>) {
  const liveMode = useOperatingStore((state) => state.activeMode);
  const [mode, setMode] = useState(handoff?.mode ?? liveMode);
  const previousLiveMode = useRef(liveMode);
  useEffect(() => {
    if (previousLiveMode.current === liveMode) return;
    previousLiveMode.current = liveMode;
    setMode(liveMode);
  }, [liveMode]);
  return { mode: handoff ? mode : liveMode, setMode };
}


export function useApplySolarMapHandoff() {
  const handoff = useSolarHandoff();
  const applied = useRef<unknown>(null);
  useEffect(() => {
    if (!handoff || applied.current === handoff) return;
    applied.current = handoff;
    applySolarMapHandoff(handoff);
  }, [handoff]);
}

export function applySolarMapHandoff(handoff: NonNullable<ReturnType<typeof parseSolarHandoff>>) {
  const map = useMapStore.getState();
  if (handoff.target) map.setTarget(handoff.target);
  map.setTimeOffset(0);
  if (handoff.at) map.setAbsoluteTime(handoff.at);
  useOperatingStore.getState().setManualMode(handoff.mode);
}

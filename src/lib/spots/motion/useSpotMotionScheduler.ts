import { useCallback, useRef } from "react";
import {
  createMotionRuntime,
  resetMotionRuntime,
  tickMotion,
  type MotionRuntime,
  type MotionSnapshot,
  type MotionTickInput,
} from "./scheduler";

/** One scheduler per running view. Callers tick; they must not loop per report in React. */
export function useSpotMotionScheduler(): {
  tick: (input: MotionTickInput) => MotionSnapshot;
  reset: () => void;
} {
  const runtimeRef = useRef<MotionRuntime | null>(null);
  if (runtimeRef.current === null) runtimeRef.current = createMotionRuntime();
  const tick = useCallback((input: MotionTickInput) => {
    return tickMotion(runtimeRef.current!, input);
  }, []);
  const reset = useCallback(() => {
    resetMotionRuntime(runtimeRef.current!);
  }, []);
  return { tick, reset };
}

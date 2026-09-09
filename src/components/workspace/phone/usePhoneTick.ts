import { useEffect, useState } from "react";

/**
 * A once-a-minute tick shared by the phone pages' time-derived values
 * (band-ladder verdicts, spot ages) so they don't freeze at whatever they
 * were on first render (#685 P3). The returned number carries no meaning —
 * callers only need it to change so a memo recomputes or the component
 * re-renders.
 */
export function usePhoneTick(intervalMs = 60_000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return tick;
}

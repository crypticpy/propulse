import type { WSJTXDecode } from "@/stores/wsjtxStore";

/** Passband range (Hz) - must match BandScope.tsx */
const PASSBAND_LOW = 100;
const PASSBAND_HIGH = 3000;
const PASSBAND_RANGE = PASSBAND_HIGH - PASSBAND_LOW;

/** Time window to display (seconds) - must match BandScope.tsx */
const TIME_WINDOW_S = 120;

export function findHoveredDecodeAtCssPoint(
  mx: number,
  my: number,
  decodes: WSJTXDecode[],
  cssWidth: number,
  cssHeight: number,
  now: number = Date.now(),
  threshold = 20,
): WSJTXDecode | null {
  const cutoffMs = now - TIME_WINDOW_S * 1000;
  let closest: WSJTXDecode | null = null;
  let closestDist = threshold;

  for (const decode of decodes) {
    if (decode.receivedAt < cutoffMs) continue;
    const age = (now - decode.receivedAt) / 1000;
    const x =
      ((decode.deltaFrequency - PASSBAND_LOW) / PASSBAND_RANGE) * cssWidth;
    const y = (1 - (TIME_WINDOW_S - age) / TIME_WINDOW_S) * cssHeight;
    const dist = Math.hypot(mx - x, my - y);
    if (dist < closestDist) {
      closestDist = dist;
      closest = decode;
    }
  }

  return closest;
}

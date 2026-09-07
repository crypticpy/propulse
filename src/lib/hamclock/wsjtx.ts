import type { WSJTXDecode } from "@/stores/wsjtxStore";
import { wsjtxDecodedAt, wsjtxFrequencyHz } from "@/lib/radio/wsjtxIngestion";

export function recentWSJTXDecodes(decodes: readonly WSJTXDecode[], now: number): WSJTXDecode[] {
  return decodes.filter(d => {
    const time = wsjtxDecodedAt(d);
    return time !== null && time <= now + 5_000 && now - time <= 15 * 60_000;
  }).sort((a, b) => b.receivedAt - a.receivedAt);
}
export function wsjtxTuneReason(decode: WSJTXDecode): string | undefined {
  return !decode.isNew ? "REPLAY" : decode.offAir ? "OFF AIR" : decode.lowConfidence ? "LOW CONFIDENCE" : wsjtxFrequencyHz(decode) === null ? "NO DIAL CONTEXT" : undefined;
}
export function wsjtxSourceState(enabled: boolean, connected: boolean, lastReceived: number | undefined, now: number): string {
  if (!enabled || !connected) return "BRIDGE OFF";
  if (lastReceived === undefined) return "NO DECODES YET";
  return now - lastReceived > 120_000 ? "STALE" : "RECEIVING";
}
export function wsjtxUtc(time: number): string {
  if (!Number.isFinite(time) || time < 0 || time >= 86_400_000) return "—";
  return new Date(time).toISOString().slice(11, 19);
}

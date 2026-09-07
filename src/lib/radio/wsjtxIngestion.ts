import type { BridgeMessage } from "@/types/bridge";
import { useWSJTXStore, type WSJTXDecode } from "@/stores/wsjtxStore";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function hz(value: unknown): value is number { return finite(value) && Number.isSafeInteger(value) && value > 0 && value <= 1e12; }

/** Use only captured context, never the current radio or latest WSJT-X status. */
export function wsjtxFrequencyHz(decode: WSJTXDecode): number | null {
  if (!decode.isNew || decode.offAir || !hz(decode.dialFrequencyHz) || !finite(decode.deltaFrequency) || !Number.isSafeInteger(decode.deltaFrequency) || decode.deltaFrequency < 0) return null;
  const frequency = decode.dialFrequencyHz + decode.deltaFrequency;
  return hz(frequency) ? frequency : null;
}

/** Resolve UTC QTime across midnight for new on-air decodes only. */
export function wsjtxDecodedAt(decode: WSJTXDecode): number | null {
  if (!decode.isNew || decode.offAir || !finite(decode.receivedAt) || !finite(decode.time) || decode.time < 0 || decode.time >= 86_400_000) return null;
  const day = Math.floor(decode.receivedAt / 86_400_000) * 86_400_000;
  const candidate = day + decode.time;
  return candidate > decode.receivedAt + 5_000 ? candidate - 86_400_000 : candidate;
}

/** Called synchronously for every packet by the shell's existing bridge connection. */
export function ingestWSJTXMessage(message: BridgeMessage): void {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("wsjtx.")) return;
  const payload = object(message.payload);
  if (!payload) return;
  if (payload.instanceId !== undefined && (!text(payload.instanceId, 128) || !payload.instanceId.trim())) return;
  const instanceId = payload.instanceId as string | undefined;
  const store = useWSJTXStore.getState();
  if (message.type === "wsjtx.clear") {
    store.clearDecodes(instanceId);
    return;
  }
  const now = Date.now();
  if (message.type === "wsjtx.status") {
    if (!hz(payload.frequency) || !text(payload.mode, 24) || typeof payload.txEnabled !== "boolean" || typeof payload.decoding !== "boolean" || !finite(payload.rxDF) || !finite(payload.txDF)) return;
    store.setStatus({ instanceId, frequency: payload.frequency, mode: payload.mode,
      dxCall: text(payload.dxCall, 32) ? payload.dxCall : undefined, dxGrid: text(payload.dxGrid, 8) ? payload.dxGrid : undefined,
      txEnabled: payload.txEnabled, decoding: payload.decoding, rxDF: payload.rxDF, txDF: payload.txDF, lastUpdate: now });
    store.setConnected(true);
    return;
  }
  if (message.type !== "wsjtx.decode") return;
  if (typeof payload.isNew !== "boolean" || !finite(payload.time) || payload.time < 0 || payload.time >= 86_400_000 || !finite(payload.snr) || !finite(payload.deltaTime) || !finite(payload.deltaFrequency) || !Number.isSafeInteger(payload.deltaFrequency) || payload.deltaFrequency < 0 || !text(payload.mode, 24) || !text(payload.message, 1024) || typeof payload.lowConfidence !== "boolean") return;
  if (payload.offAir !== undefined && typeof payload.offAir !== "boolean") return;
  if (payload.receivedAt !== undefined && (!finite(payload.receivedAt) || payload.receivedAt <= 0 || payload.receivedAt > now + 5_000)) return;
  const receivedAt = payload.receivedAt as number | undefined ?? now;
  const hasDial = payload.isNew && !payload.offAir && hz(payload.dialFrequencyHz) && text(payload.dialMode, 24);
  store.addDecode({ instanceId, isNew: payload.isNew, time: payload.time, snr: payload.snr,
    deltaTime: payload.deltaTime, deltaFrequency: payload.deltaFrequency, mode: payload.mode, message: payload.message,
    lowConfidence: payload.lowConfidence, offAir: payload.offAir as boolean | undefined, receivedAt,
    callsign: text(payload.callsign, 32) ? payload.callsign : undefined, grid: text(payload.grid, 8) ? payload.grid : undefined,
    ...(hasDial ? { dialFrequencyHz: payload.dialFrequencyHz as number, dialMode: payload.dialMode as string } : {}),
  });
  store.setConnected(true);
}

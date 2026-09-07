import type { PskStationSnapshot } from "../../src/lib/hamclock/pskStation.js";
import { readBoundedJson } from "./spotStore.js";

export interface PskStationClaim {
  token: string | null;
  snapshot: PskStationSnapshot | null;
  retryAt: number;
}
export interface PskStationCache {
  claim: (callsign: string) => Promise<PskStationClaim>;
  finish: (callsign: string, token: string, snapshot: PskStationSnapshot) => Promise<PskStationSnapshot>;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Shared PSK cache is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args), signal: controller.signal, redirect: "error",
    });
    if (!response.ok) throw new Error("Shared PSK cache unavailable");
    return await readBoundedJson(response, 512 * 1024);
  } finally { clearTimeout(timer); }
}

function snapshot(value: unknown, callsign: string): PskStationSnapshot | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("Invalid PSK cache snapshot");
  const s = value as PskStationSnapshot;
  if (s.callsign !== callsign || !Array.isArray(s.reports) || s.reports.length > 1000 ||
      !["ok", "stale", "unavailable"].includes(s.status) || !Number.isFinite(s.retryAt) ||
      !Number.isFinite(s.checkedAt) || (s.fetchedAt !== null && !Number.isFinite(s.fetchedAt))) {
    throw new Error("Invalid PSK cache snapshot");
  }
  return s;
}

/** Every deployment sharing an egress quota must use this same database gate. No local bypass. */
export const sharedPskStationCache: PskStationCache = {
  async claim(callsign) {
    const value = await rpc("psk_station_claim", { p_callsign: callsign }) as PskStationClaim;
    if (!value || typeof value !== "object" || !Number.isFinite(value.retryAt) ||
        (value.token !== null && (typeof value.token !== "string" || !/^[0-9a-f-]{36}$/i.test(value.token)))) {
      throw new Error("Invalid PSK cache claim");
    }
    return { token: value.token, retryAt: value.retryAt, snapshot: snapshot(value.snapshot, callsign) };
  },
  async finish(callsign, token, data) {
    const result = snapshot(await rpc("psk_station_finish", { p_callsign: callsign, p_token: token, p_snapshot: data }), callsign);
    if (!result) throw new Error("Missing PSK cache snapshot");
    return result;
  },
};

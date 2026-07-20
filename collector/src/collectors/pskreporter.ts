import type { SupabaseClient } from "@supabase/supabase-js";
import mqtt, { type MqttClient } from "mqtt";
import { log } from "../logger.js";
import { frequencyToBand } from "../transforms/bands.js";
import { resolveGrid } from "../transforms/normalize.js";
import type { NormalizedSpot } from "../types.js";
import { SpotBatcher } from "../lib/spot-batcher.js";

const PSK_BROKER_URL = "mqtts://mqtt.pskreporter.info:1884";
const PSK_TOPIC = "pskr/filter/v2raw_1pc/#";

interface PskReporterPayload {
  f?: number;
  md?: string;
  rp?: number;
  t?: number;
  t_tx?: number;
  sc?: string;
  sl?: string;
  rc?: string;
  rl?: string;
  sa?: number;
  b?: string;
}

let client: MqttClient | null = null;
let batcher: SpotBatcher | null = null;

function observedAt(payload: PskReporterPayload): string {
  const seconds = payload.t_tx ?? payload.t;
  if (!Number.isFinite(seconds) || (seconds ?? 0) <= 0) {
    return new Date().toISOString();
  }

  const timestamp = (seconds as number) * 1000;
  if (timestamp > Date.now() + 5 * 60_000) {
    return new Date().toISOString();
  }
  return new Date(timestamp).toISOString();
}

function supportedLocator(locator: string | undefined): string | undefined {
  const normalized = locator?.trim();
  if (!normalized) return undefined;
  return normalized.length > 6 ? normalized.slice(0, 6) : normalized;
}

export function normalizePskReporterPayload(
  payload: PskReporterPayload,
): NormalizedSpot | null {
  const txCallsign = payload.sc?.trim().toUpperCase();
  const rxCallsign = payload.rc?.trim().toUpperCase();
  const frequencyHz = Number(payload.f);
  if (!txCallsign || !rxCallsign || !Number.isFinite(frequencyHz)) return null;

  const frequencyKhz = frequencyHz / 1000;
  const band = frequencyToBand(frequencyKhz);
  if (!band) return null;

  const txGrid = resolveGrid(supportedLocator(payload.sl));
  const rxGrid = resolveGrid(supportedLocator(payload.rl));
  const snr = Number(payload.rp);
  const dxcc = Number(payload.sa);

  return {
    source: "pskreporter",
    spotted_at: observedAt(payload),
    tx_callsign: txCallsign,
    tx_grid: txGrid.grid,
    tx_lat: txGrid.lat,
    tx_lon: txGrid.lon,
    rx_callsign: rxCallsign,
    rx_grid: rxGrid.grid,
    rx_lat: rxGrid.lat,
    rx_lon: rxGrid.lon,
    frequency_khz: Math.round(frequencyKhz * 10) / 10,
    band,
    mode: payload.md?.trim().toUpperCase() || null,
    snr: Number.isFinite(snr) ? snr : null,
    wpm: null,
    comment: null,
    dxcc: Number.isInteger(dxcc) && dxcc > 0 ? dxcc : null,
    continent: null,
  };
}

export function startPskReporter(db: SupabaseClient): void {
  if (client) return;

  batcher = new SpotBatcher({ db, source: "pskreporter" });
  batcher.start();

  client = mqtt.connect(PSK_BROKER_URL, {
    clean: true,
    clientId: `propulse-${process.pid}-${Math.random().toString(16).slice(2, 10)}`,
    connectTimeout: 15_000,
    reconnectPeriod: 10_000,
    resubscribe: true,
  });

  client.on("connect", () => {
    client?.subscribe(PSK_TOPIC, { qos: 0 }, (error?: Error | null) => {
      if (error) {
        batcher?.setConnected(false);
        log("error", "PSKReporter MQTT subscription failed", {
          error: error.message,
        });
        return;
      }
      batcher?.setConnected(true);
      log("info", "PSKReporter MQTT connected", { topic: PSK_TOPIC });
    });
  });

  client.on("message", (_topic: string, message: Buffer) => {
    try {
      const payload = JSON.parse(message.toString("utf8")) as PskReporterPayload;
      const spot = normalizePskReporterPayload(payload);
      if (spot) batcher?.enqueue(spot);
    } catch (error) {
      log("warn", "PSKReporter MQTT payload rejected", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  client.on("offline", () => batcher?.setConnected(false));
  client.on("close", () => batcher?.setConnected(false));
  client.on("error", (error: Error) => {
    batcher?.setConnected(false);
    log("warn", "PSKReporter MQTT connection error", {
      error: error.message,
    });
  });
}

export function stopPskReporter(): void {
  batcher?.stop();
  batcher = null;
  client?.end(true);
  client = null;
}

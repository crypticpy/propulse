import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";

export async function collectSolar(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  try {
    // Fetch all three in parallel using Promise.allSettled
    const [kpResult, sfiResult, magResult] = await Promise.allSettled([
      fetchJson<Array<{ kp_index: number }>>(
        "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
      ),
      fetchJson<Array<{ flux: number }>>(
        "https://services.swpc.noaa.gov/json/f107_cm_flux.json",
      ),
      fetchJson<
        Array<{
          bz_gsm: number | null;
          by_gsm: number | null;
          bt: number | null;
        }>
      >("https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json"),
    ]);

    const kp =
      kpResult.status === "fulfilled" && kpResult.value.length > 0
        ? kpResult.value[kpResult.value.length - 1].kp_index
        : null;
    const sfi =
      sfiResult.status === "fulfilled" && sfiResult.value.length > 0
        ? sfiResult.value[sfiResult.value.length - 1].flux
        : null;
    const mag =
      magResult.status === "fulfilled" && magResult.value.length > 0
        ? magResult.value[magResult.value.length - 1]
        : null;

    const snapshot = {
      captured_at: new Date().toISOString(),
      kp_index: kp,
      sfi,
      bz_gsm: mag?.bz_gsm ?? null,
      by_gsm: mag?.by_gsm ?? null,
      bt: mag?.bt ?? null,
      solar_wind_speed: null, // Future: DSCOVR plasma
      sunspot_number: null, // Future: sunspot number endpoint
    };

    const { error } = await db.from("solar_snapshots").upsert(snapshot, {
      onConflict: "captured_at",
      ignoreDuplicates: true,
    });

    if (error) throw new Error(`Solar insert failed: ${error.message}`);

    const durationMs = Date.now() - start;
    reportHealth("solar", "ok", 1);

    // Also write to collector_health table
    await db.from("collector_health").insert({
      source: "solar",
      status: "ok",
      spots_ingested: 1,
      duration_ms: durationMs,
    });

    log("info", "Solar snapshot captured", {
      kp,
      sfi,
      bz: mag?.bz_gsm,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("solar", "error", 0);
    await db
      .from("collector_health")
      .insert({
        source: "solar",
        status: "error",
        duration_ms: durationMs,
        error_message: msg,
      })
      .then(() => {});
    log("error", "Solar collection failed", { error: msg });
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Propulse-Collector/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

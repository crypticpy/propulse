import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";

export async function collectSolar(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  try {
    // Fetch all nine sources in parallel using Promise.allSettled
    const [
      kpResult,
      sfiResult,
      magResult,
      windResult,
      ssnResult,
      xrayResult,
      protonResult,
      dstResult,
    ] = await Promise.allSettled([
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
      fetchJson<
        Array<{ proton_speed: number | null; proton_density: number | null }>
      >("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json"),
      fetchJson<Array<{ ssn: number | null }>>(
        "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json",
      ),
      fetchJson<Array<{ flux: number }>>(
        "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json",
      ),
      fetchJson<Array<{ flux: number }>>(
        "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json",
      ),
      fetchJson<Array<[string, string]>>(
        "https://services.swpc.noaa.gov/products/kyoto-dst.json",
      ),
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
    const windEntry =
      windResult.status === "fulfilled" && windResult.value.length > 0
        ? windResult.value[windResult.value.length - 1]
        : null;
    const solarWindSpeed = windEntry?.proton_speed ?? null;
    const solarWindDensity = windEntry?.proton_density ?? null;
    const sunspotNumber =
      ssnResult.status === "fulfilled" && ssnResult.value.length > 0
        ? ssnResult.value[ssnResult.value.length - 1].ssn
        : null;
    const xrayFlux =
      xrayResult.status === "fulfilled" && xrayResult.value.length > 0
        ? xrayResult.value[xrayResult.value.length - 1].flux
        : null;
    const protonFlux =
      protonResult.status === "fulfilled" && protonResult.value.length > 0
        ? protonResult.value[protonResult.value.length - 1].flux
        : null;
    // Dst JSON is an array of [time_tag, dst] pairs; first row is header
    const dstIndex =
      dstResult.status === "fulfilled" && dstResult.value.length > 1
        ? parseFloat(dstResult.value[dstResult.value.length - 1][1])
        : null;

    const snapshot = {
      captured_at: new Date().toISOString(),
      kp_index: kp,
      sfi,
      bz_gsm: mag?.bz_gsm ?? null,
      by_gsm: mag?.by_gsm ?? null,
      bt: mag?.bt ?? null,
      solar_wind_speed: solarWindSpeed ?? null,
      sunspot_number: sunspotNumber ?? null,
      xray_flux: xrayFlux ?? null,
      proton_flux_10mev: protonFlux ?? null,
      dst_index: isNaN(dstIndex as number) ? null : dstIndex,
      solar_wind_density: solarWindDensity ?? null,
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
      xray: xrayFlux,
      protons: protonFlux,
      dst: dstIndex,
      windDensity: solarWindDensity,
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

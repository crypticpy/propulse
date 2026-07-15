import type { SupabaseClient } from "@supabase/supabase-js";
import type { SolarSnapshot } from "../types.js";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";

type TimedRow = Record<string, unknown>;

function sourceTimestamp(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) return Number.NaN;
  const normalized = /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01T00:00:00Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value}Z`
      : value;
  return Date.parse(normalized);
}

export function latestBySourceTime<T extends TimedRow>(rows: T[]): T | null {
  let latest: T | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const value = row.time_tag ?? row["time-tag"];
    const timestamp = sourceTimestamp(value);
    if (Number.isFinite(timestamp) && timestamp > latestTime) {
      latest = row;
      latestTime = timestamp;
    }
  }
  return latest;
}

export function normalizedSourceTime(row: TimedRow | null): string | null {
  if (!row) return null;
  const timestamp = sourceTimestamp(row.time_tag ?? row["time-tag"]);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export async function collectSolar(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  try {
    // Fetch all eight sources in parallel using Promise.allSettled
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
      fetchJson<Array<{ time_tag: string; kp_index: number }>>(
        "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
      ),
      fetchJson<Array<{ time_tag: string; flux: number }>>(
        "https://services.swpc.noaa.gov/json/f107_cm_flux.json",
      ),
      fetchJson<
        Array<{
          bz_gsm: number | null;
          bx_gsm: number | null;
          by_gsm: number | null;
          bt: number | null;
          active: boolean;
          source: string;
          overall_quality: number | null;
          time_tag: string;
        }>
      >("https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json"),
      fetchJson<
        Array<{
          proton_speed: number | null;
          proton_temperature: number | null;
          proton_density: number | null;
          active: boolean;
          source: string;
          overall_quality: number | null;
          time_tag: string;
        }>
      >("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json"),
      fetchJson<Array<{ "time-tag": string; ssn: number | null }>>(
        "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json",
      ),
      fetchJson<Array<{ time_tag: string; flux: number; energy: string }>>(
        "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json",
      ),
      fetchJson<Array<{ time_tag: string; flux: number; energy: string }>>(
        "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json",
      ),
      fetchJson<Array<{ time_tag: string; dst: number | string }>>(
        "https://services.swpc.noaa.gov/products/kyoto-dst.json",
      ),
    ]);

    const kpEntry = kpResult.status === "fulfilled"
      ? latestBySourceTime(kpResult.value)
      : null;
    const sfiEntry = sfiResult.status === "fulfilled"
      ? latestBySourceTime(sfiResult.value)
      : null;
    const mag = magResult.status === "fulfilled"
      ? latestBySourceTime(magResult.value)
      : null;
    const windEntry = windResult.status === "fulfilled"
      ? latestBySourceTime(windResult.value)
      : null;
    const kp = kpEntry?.kp_index ?? null;
    const sfi = sfiEntry?.flux ?? null;
    const solarWindSpeed = windEntry?.proton_speed ?? null;
    const solarWindTemperature = windEntry?.proton_temperature ?? null;
    const solarWindDensity = windEntry?.proton_density ?? null;
    const sunspotEntry = ssnResult.status === "fulfilled"
      ? latestBySourceTime(ssnResult.value)
      : null;
    const sunspotNumber = sunspotEntry?.ssn ?? null;
    // Filter X-ray for long wavelength band (0.1-0.8nm), the standard indicator
    const xrayFiltered =
      xrayResult.status === "fulfilled"
        ? xrayResult.value.filter((e) => e.energy === "0.1-0.8nm")
        : [];
    const xrayEntry = latestBySourceTime(xrayFiltered);
    const xrayFlux = xrayEntry?.flux ?? null;
    // Filter proton flux for >=10 MeV band (standard for solar proton events)
    const protonFiltered =
      protonResult.status === "fulfilled"
        ? protonResult.value.filter((e) => e.energy === ">=10 MeV")
        : [];
    const protonEntry = latestBySourceTime(protonFiltered);
    const protonFlux = protonEntry?.flux ?? null;
    const dstEntry = dstResult.status === "fulfilled"
      ? latestBySourceTime(dstResult.value)
      : null;
    const parsedDst = dstEntry == null ? Number.NaN : Number(dstEntry.dst);
    const dstIndex = Number.isFinite(parsedDst) ? parsedDst : null;

    const snapshot: SolarSnapshot = {
      captured_at: new Date().toISOString(),
      kp_index: kp,
      sfi,
      bz_gsm: mag?.bz_gsm ?? null,
      bx_gsm: mag?.bx_gsm ?? null,
      by_gsm: mag?.by_gsm ?? null,
      bt: mag?.bt ?? null,
      solar_wind_speed: solarWindSpeed ?? null,
      solar_wind_temperature: solarWindTemperature ?? null,
      sunspot_number: sunspotNumber ?? null,
      xray_flux: xrayFlux ?? null,
      proton_flux_10mev: protonFlux ?? null,
      dst_index: dstIndex,
      solar_wind_density: solarWindDensity ?? null,
      source_observed_at: {
        kp: normalizedSourceTime(kpEntry),
        f107: normalizedSourceTime(sfiEntry),
        magnetic_field: normalizedSourceTime(mag),
        solar_wind: normalizedSourceTime(windEntry),
        sunspot_number: normalizedSourceTime(sunspotEntry),
        xray: normalizedSourceTime(xrayEntry),
        proton_flux_10mev: normalizedSourceTime(protonEntry),
        dst: normalizedSourceTime(dstEntry),
      },
      source_status: {
        magnetic_field: mag == null ? null : {
          active: mag.active,
          source: mag.source,
          overall_quality: mag.overall_quality,
        },
        solar_wind: windEntry == null ? null : {
          active: windEntry.active,
          source: windEntry.source,
          overall_quality: windEntry.overall_quality,
        },
      },
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
      .then(
        () => {},
        () => {},
      ); // fire-and-forget, swallow errors
    log("error", "Solar collection failed", { error: msg });
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Propulse-Collector/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

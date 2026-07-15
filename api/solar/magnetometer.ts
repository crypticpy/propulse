import { adaptMagnetometer } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";
import type { SolarSourcePolicy } from "../../src/lib/solar/sourcePolicies";

export const config = { runtime: "edge" };

const FALLBACK_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";

async function loadMagnetometer(signal: AbortSignal, policy: SolarSourcePolicy) {
  try {
    return await fetchSolarUpstream(policy.sourceUrl, {
      signal,
      accept: "json",
      maxBytes: policy.maxUpstreamBytes,
    });
  } catch (primaryError) {
    try {
      return await fetchSolarUpstream(FALLBACK_URL, {
        signal,
        accept: "json",
        maxBytes: policy.maxUpstreamBytes,
      });
    } catch {
      throw primaryError;
    }
  }
}

export default createSolarHandler({
  sourceId: "noaa-magnetometer",
  load: loadMagnetometer,
  adapt: (raw, policy) => adaptMagnetometer(raw, policy.maxRows),
});

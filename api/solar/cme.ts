import { adaptCme } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";

export const config = { runtime: "edge" };

interface CmeLoadResult {
  value: unknown;
  source: "ccmc-direct" | "nasa-open-api";
}

function cmeDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60_000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  return { start: date(start), end: date(end) };
}

function ccmcCmeUrl(): string {
  const { start, end } = cmeDateRange();
  return `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/CMEAnalysis?startDate=${start}&endDate=${end}&mostAccurateOnly=true`;
}

function openApiCmeUrl(): string {
  const { start, end } = cmeDateRange();
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  return `https://api.nasa.gov/DONKI/CMEAnalysis?startDate=${start}&endDate=${end}&mostAccurateOnly=true&api_key=${encodeURIComponent(key)}`;
}

export default createSolarHandler({
  sourceId: "nasa-cme",
  load: async (signal, policy): Promise<CmeLoadResult> => {
    try {
      return {
        value: await fetchSolarUpstream(ccmcCmeUrl(), {
          signal,
          accept: "json",
          maxBytes: policy.maxUpstreamBytes,
        }),
        source: "ccmc-direct",
      };
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn(
        JSON.stringify({
          event: "solar_provider_fallback",
          sourceId: "nasa-cme",
          primary: "ccmc-direct",
          fallback: "nasa-open-api",
        }),
      );
      return {
        value: await fetchSolarUpstream(openApiCmeUrl(), {
          signal,
          accept: "json",
          maxBytes: policy.maxUpstreamBytes,
        }),
        source: "nasa-open-api",
      };
    }
  },
  adapt: (raw, policy) => {
    const result = raw as CmeLoadResult;
    const adapted = adaptCme(result.value, policy.maxRows);
    const warnings = [...(adapted.warnings ?? [])];
    if (result.source === "nasa-open-api") {
      warnings.push(
        "NASA CCMC direct DONKI was unavailable; api.nasa.gov fallback is in use.",
      );
      if (!process.env.NASA_API_KEY) {
        warnings.push(
          "NASA_API_KEY is not configured; the shared DONKI DEMO_KEY is in use.",
        );
      }
    }
    return warnings.length > 0 ? { ...adapted, warnings } : adapted;
  },
});

import { adaptCme } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";

export const config = { runtime: "edge" };

function cmeUrl(): string {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60_000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  return `https://api.nasa.gov/DONKI/CMEAnalysis?startDate=${date(start)}&endDate=${date(end)}&mostAccurateOnly=true&api_key=${encodeURIComponent(key)}`;
}

export default createSolarHandler({
  sourceId: "nasa-cme",
  load: (signal, policy) =>
    fetchSolarUpstream(cmeUrl(), {
      signal,
      accept: "json",
      maxBytes: policy.maxUpstreamBytes,
    }),
  adapt: (raw, policy) => {
    const adapted = adaptCme(raw, policy.maxRows);
    return process.env.NASA_API_KEY
      ? adapted
      : {
          ...adapted,
          warnings: [
            ...(adapted.warnings ?? []),
            "NASA_API_KEY is not configured; the shared DONKI DEMO_KEY is in use.",
          ],
        };
  },
});

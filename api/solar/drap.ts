import { adaptDrapText } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";

export const config = { runtime: "edge" };

export default createSolarHandler({
  sourceId: "noaa-drap",
  load: (signal, policy) =>
    fetchSolarUpstream(policy.sourceUrl, {
      signal,
      accept: "text",
      maxBytes: policy.maxUpstreamBytes,
    }),
  adapt: (raw) => adaptDrapText(String(raw)),
});

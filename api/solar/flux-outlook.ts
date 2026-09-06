import { adaptFluxOutlookText } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";

export const config = { runtime: "edge" };

export default createSolarHandler({
  sourceId: "noaa-flux-outlook",
  load: (signal, policy) =>
    fetchSolarUpstream(policy.sourceUrl, {
      signal,
      accept: "text",
      maxBytes: policy.maxUpstreamBytes,
    }),
  adapt: (raw, policy) => adaptFluxOutlookText(String(raw), policy.maxRows),
});

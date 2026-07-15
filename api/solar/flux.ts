import { adaptSolarFlux } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";

export const config = { runtime: "edge" };

export default createSolarHandler({
  sourceId: "noaa-solar-flux",
  load: (signal, policy) =>
    fetchSolarUpstream(policy.sourceUrl, {
      signal,
      accept: "json",
      maxBytes: policy.maxUpstreamBytes,
    }),
  adapt: (raw, policy) => adaptSolarFlux(raw, policy.maxRows),
});

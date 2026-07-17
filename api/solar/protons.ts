import { adaptProtons } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";

export const config = { runtime: "edge" };

export default createSolarHandler({
  sourceId: "noaa-protons",
  load: (signal, policy) =>
    fetchSolarUpstream(policy.sourceUrl, {
      signal,
      accept: "json",
      maxBytes: policy.maxUpstreamBytes,
    }),
  adapt: (raw, policy) => adaptProtons(raw, policy.maxRows),
});

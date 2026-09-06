import { adaptWindPlasma } from "../../src/lib/solar/adapters";
import { createSolarHandler, fetchSolarUpstream } from "../_lib/solarHandler";

export const config = { runtime: "edge" };

const DAY_MS = 24 * 60 * 60 * 1000;

export default createSolarHandler({
  sourceId: "swpc-solar-wind-plasma",
  load: (signal, policy) =>
    fetchSolarUpstream(policy.sourceUrl, {
      signal,
      accept: "json",
      maxBytes: policy.maxUpstreamBytes,
    }),
  adapt: (raw, policy) => adaptWindPlasma(raw, policy.maxRows, DAY_MS),
});

import { MAX_SPOT_FETCH_LIMIT } from "./spotDensity";

/** Two visible endpoint instances for every possible rendered spot. */
export const MAX_ENDPOINT_INSTANCES = MAX_SPOT_FETCH_LIMIT * 2;

export function getEndpointInstanceCount(endpointCount: number): number {
  return Math.min(Math.max(0, endpointCount), MAX_ENDPOINT_INSTANCES);
}

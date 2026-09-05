import { fetchCallook, isCallookError } from "./callook";
import { fetchHamQTH, isHamQTHError } from "./hamqth";
import { stripCallsignModifiers } from "./callsignIngestion";
import type { QSOLookupResult } from "@/types/qso";

/** Keep US lookups public and fast; try the authenticated DX directory on failure. */
export async function lookupQSOCallsign(rawCallsign: string): Promise<QSOLookupResult> {
  const callsign = stripCallsignModifiers(rawCallsign);
  const callook = await fetchCallook(callsign);
  if (!isCallookError(callook)) return callook;

  const hamqth = await fetchHamQTH(callsign);
  if (isHamQTHError(hamqth)) {
    const reason = hamqth.status === 501
      ? "International lookup is unavailable because HamQTH credentials are not configured."
      : hamqth.status === 401 || hamqth.status === 403
        ? "Sign in to use international callsign lookup."
        : hamqth.status === 429
          ? "HamQTH lookup rate limit reached. Try again shortly."
          : `HamQTH: ${hamqth.error}`;
    // Preserve both results: a provider outage or missing credentials must not
    // be presented as a definitive callsign-not-found result.
    throw new Error(`Callook (US FCC): ${callook.error}. ${reason}`);
  }
  return {
    callsign: hamqth.callsign,
    name: hamqth.name,
    grid: hamqth.grid,
    qth: hamqth.qth,
    country: hamqth.country,
    cqZone: hamqth.cqzone,
    ituZone: hamqth.ituzone,
    lat: hamqth.lat,
    lon: hamqth.lon,
    imageUrl: hamqth.picture,
    source: "hamqth",
  };
}

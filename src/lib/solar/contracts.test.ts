import { describe, expect, it } from "vitest";
import { isSolarEnvelope, SOLAR_SCHEMA_VERSION } from "./contracts";

describe("solar response envelope guard", () => {
  const valid = {
    schemaVersion: SOLAR_SCHEMA_VERSION,
    sourceId: "noaa-k-index",
    provider: "NOAA SWPC",
    product: "Planetary Kp",
    data: [],
    observedAt: "2026-07-15T18:00:00.000Z",
    fetchedAt: "2026-07-15T18:01:00.000Z",
    sourceUrl: "https://services.swpc.noaa.gov/",
  };

  it("accepts the current version and rejects older service-worker shapes", () => {
    expect(isSolarEnvelope(valid)).toBe(true);
    expect(isSolarEnvelope({ ...valid, schemaVersion: 0 })).toBe(false);
    expect(isSolarEnvelope({ ...valid, observedAt: "not-a-date" })).toBe(false);
  });
});

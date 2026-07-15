import { describe, expect, it } from "vitest";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SolarResource } from "@/lib/solar/contracts";
import {
  oldestKnownTimestamp,
  projectSolarResource,
} from "./projectSolarResource";

describe("solar compatibility projection", () => {
  it("projects validated data while retaining provenance and observation time", () => {
    const observedAt = "2026-07-15T18:00:00.000Z";
    const resource: SolarResource<Array<{ value: number }>> = {
      envelope: {
        schemaVersion: 1,
        sourceId: "noaa-solar-flux",
        provider: "NOAA SWPC",
        product: "Observed solar flux",
        data: [{ value: 123 }],
        observedAt,
        fetchedAt: "2026-07-15T18:05:00.000Z",
        sourceUrl: "https://services.swpc.noaa.gov/",
      },
      state: "stale",
      cacheOutcome: "stale-on-error",
      observationAgeMs: 300_000,
    };
    const query = {
      data: resource,
      dataUpdatedAt: Date.parse("2026-07-15T19:00:00.000Z"),
      isLoading: false,
    } as UseQueryResult<SolarResource<Array<{ value: number }>>>;

    const projected = projectSolarResource(query, (data) => data[0]?.value);
    expect(projected.data).toBe(123);
    expect(projected.dataUpdatedAt).toBe(Date.parse(observedAt));
    expect(projected.solarState).toBe("stale");
    expect(projected.cacheOutcome).toBe("stale-on-error");
    expect(projected.solarResource).toBe(resource);
  });

  it("uses the oldest required observation for aggregate freshness", () => {
    expect(oldestKnownTimestamp([300, undefined, 100, 0, 200])).toBe(100);
    expect(oldestKnownTimestamp([undefined, 0])).toBeUndefined();
  });
});

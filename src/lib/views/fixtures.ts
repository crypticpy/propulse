/** Synthetic fixed-clock inputs shared by all Spots & Paths package tests. No live calls/data. */
import type { LiveSpot } from "@/types/livespot";
import type { NormalizedSpotReport } from "./spotContracts";
import { createViewConfiguration } from "./defaults";
import { displayAssignmentSchema, type DisplayAssignment } from "./contracts";

export const SPOT_FIXTURE_NOW_MS = Date.parse("2026-09-07T00:00:00.000Z");
export const SPOT_FIXTURE_GEOGRAPHY_VERSION = "sp01-synthetic-v1";

export function createSpotInput(id: string, overrides: Partial<LiveSpot> = {}): LiveSpot {
  return {
    id, dx: "TEST1DX", spotter: "TEST2RX", source: "PSKReporter", mode: "FT8",
    band: "20m", frequency: 14074, comment: "Synthetic SP-01 fixture",
    time: new Date(SPOT_FIXTURE_NOW_MS - 60_000),
    dxLat: 40.4, dxLon: -3.7, spotterLat: 51.5, spotterLon: -0.1,
    ...overrides,
  };
}

export function createNormalizedSpot(id = "normalized-1"): NormalizedSpotReport {
  return {
    id, source: "PSKReporter", sourceReportId: id, observedAtMs: SPOT_FIXTURE_NOW_MS - 60_000,
    sourceRefs: [{ source: "PSKReporter", sourceReportId: id }],
    frequencyKhz: 14074, band: "20m",
    mode: { name: "FT8", category: "digital", provenance: "reported", originalLabel: "FT8" },
    dx: { callsign: "TEST1DX", role: "transmitter", location: { kind: "reported-coordinate", coordinates: { lat: 40.4, lon: -3.7 } } },
    reporter: { callsign: "TEST2RX", role: "receiver", location: { kind: "reported-coordinate", coordinates: { lat: 51.5, lon: -0.1 } } },
    snrDb: -12,
  };
}

/** No hidden randomness, wall clock or camera dependency. */
export function createSpotFixtures() {
  return {
    spain: Array.from({ length: 50 }, (_, n) => createSpotInput(`spain-${n}`, {
      dx: `TEST${n}ES`, dxLat: 39 + (n % 5) * 0.4, dxLon: -5 + Math.floor(n / 5) * 0.3,
    })),
    norway: Array.from({ length: 20 }, (_, n) => createSpotInput(`norway-${n}`, {
      dx: `TEST${n}NO`, dxLat: 59 + (n % 5), dxLon: 7 + Math.floor(n / 5),
    })),
    us: [
      createSpotInput("us-colorado", { dxLat: 39.74, dxLon: -104.99 }),
      createSpotInput("us-texas", { dxLat: 30.27, dxLon: -97.74 }),
      createSpotInput("us-california", { dxLat: 34.05, dxLon: -118.24 }),
      createSpotInput("us-approximate", { dx: "K1TEST", dxLat: 39.8, dxLon: -98.6, dxLocApprox: true }),
      createSpotInput("us-prefix-only", { dx: "W1TEST", dxLat: undefined, dxLon: undefined }),
    ],
    edges: [
      createSpotInput("date-east", { dxLat: 0, dxLon: 179.9 }),
      createSpotInput("date-west", { dxLat: 0, dxLon: -179.9 }),
      createSpotInput("north-pole", { dxLat: 89.9, dxLon: 20 }),
      createSpotInput("south-pole", { dxLat: -89.9, dxLon: -20 }),
      createSpotInput("zero", { dxLat: 0, dxLon: 0 }),
      createSpotInput("grid-only", { dxLat: undefined, dxLon: undefined, dxGrid: "IN80" }),
      createSpotInput("coarse-grid", { dxLat: undefined, dxLon: undefined, dxGrid: "IN" }),
      createSpotInput("unlocated", { dx: "?", dxLat: undefined, dxLon: undefined }),
    ],
    modes: ["SSB", "USB", "LSB", "PHONE", "AM", "FM", "CW", "cw", "FT8", "FT-8", "FT4", "RTTY", "DIGITAL", "", undefined]
      .map((mode, n) => createSpotInput(`mode-${n}`, { mode })),
    duplicates: [
      createSpotInput("same-report"), createSpotInput("same-report"),
      createSpotInput("other-receiver", { spotter: "TEST3RX", spotterLat: 52 }),
      createSpotInput("copied-other-source", { source: "Cluster" }),
    ],
    ages: [
      createSpotInput("age-boundary", { time: new Date(SPOT_FIXTURE_NOW_MS - 30 * 60_000) }),
      createSpotInput("age-expired", { time: new Date(SPOT_FIXTURE_NOW_MS - 30 * 60_000 - 1) }),
      createSpotInput("future-clock", { time: new Date(SPOT_FIXTURE_NOW_MS + 60_000) }),
    ],
  };
}

export function createSpotLoadFixture(count: 500 | 5_000): LiveSpot[] {
  return Array.from({ length: count }, (_, n) => createSpotInput(`load-${n}`, {
    dx: `TEST${n}DX`, dxLat: -70 + (n % 140), dxLon: -179 + (n % 358),
    mode: ["FT8", "CW", "SSB"][n % 3],
    time: new Date(SPOT_FIXTURE_NOW_MS - (n % 1_800) * 1_000),
  }));
}

export function createDisplayAssignmentFixture(): DisplayAssignment {
  const ft8 = createViewConfiguration("hamclock");
  ft8.spots.filters.modes = { all: false, categories: [], modes: ["FT8"], includeUnknown: false, includeInferred: true };
  return displayAssignmentSchema.parse({
    schemaVersion: 1, revision: 1,
    scenes: [
      { id: "wall-ft8", name: "FT8 wall", enabled: true, durationSec: 120, transition: "fade", config: ft8, sourceView: null },
      { id: "solar", name: "Solar", enabled: true, durationSec: 120, transition: "cut", config: createViewConfiguration("route"), sourceView: null },
    ],
    rotation: { enabled: true, intervalSec: 120 }, breakInLevel: "CRITICAL", startSceneId: "wall-ft8",
    presentation: { headerScale: "standard", slashedZero: true, autoNightDim: false },
  });
}

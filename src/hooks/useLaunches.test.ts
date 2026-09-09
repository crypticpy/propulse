import { describe, expect, it } from "vitest";
import {
  countdownAllowed,
  launchPad,
  launchProvider,
  netDateLabel,
  type LaunchRecord,
} from "./useLaunches";

function launch(overrides: Partial<LaunchRecord> = {}): LaunchRecord {
  return {
    id: "1",
    name: "Falcon 9 | Starlink",
    provider: "SpaceX",
    providerAbbrev: "SpX",
    pad: "SLC-40",
    location: "Cape Canaveral, FL, USA",
    net: "2026-09-10T09:00:00.000Z",
    windowStart: null,
    windowEnd: null,
    status: "Go",
    statusName: "Go for Launch",
    precision: "hour",
    webcastLive: false,
    sourceUpdatedAt: null,
    ...overrides,
  };
}

describe("countdownAllowed", () => {
  it("allows a Go launch with hour-or-finer precision", () => {
    expect(countdownAllowed(launch({ precision: "hour" }))).toBe(true);
    expect(countdownAllowed(launch({ precision: "minute" }))).toBe(true);
    expect(countdownAllowed(launch({ precision: "second" }))).toBe(true);
  });

  it("refuses TBD/TBC and coarse NET windows", () => {
    expect(countdownAllowed(launch({ status: "TBD", precision: "second" }))).toBe(
      false,
    );
    expect(countdownAllowed(launch({ status: "TBC", precision: "minute" }))).toBe(
      false,
    );
    expect(countdownAllowed(launch({ precision: "day" }))).toBe(false);
    expect(countdownAllowed(launch({ precision: "coarser" }))).toBe(false);
    expect(countdownAllowed(launch({ net: null, precision: "second" }))).toBe(
      false,
    );
  });
});

describe("launch labels", () => {
  it("prefers the provider abbrev and pad name", () => {
    expect(launchProvider(launch())).toBe("SpX");
    expect(launchPad(launch())).toBe("SLC-40");
    expect(launchProvider(launch({ providerAbbrev: "", provider: "NASA" }))).toBe(
      "NASA",
    );
    expect(launchPad(launch({ pad: "", location: "Kourou" }))).toBe(
      "Kourou",
    );
  });

  it("prints a UTC date without a year when NET is this year", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    expect(netDateLabel("2026-09-10T09:00:00.000Z", now)).toBe("10 SEP");
  });
});

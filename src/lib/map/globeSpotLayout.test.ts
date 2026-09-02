import { describe, expect, it } from "vitest";
import type { MappableActivationSpot } from "./activationMarkers";
import {
  buildGlobeSpotLayoutCandidates,
  formatLiveSpotLayoutFrequency,
  globeSpotCandidateRevision,
  type GlobeResolvedLiveSpot,
} from "./globeSpotLayout";

const SPOT_TIME = new Date("2026-09-01T12:00:00.000Z");

function liveSpot(
  overrides: Partial<GlobeResolvedLiveSpot> = {},
): GlobeResolvedLiveSpot {
  const originalSpot = {
    id: "live-1",
    spotter: "W1AW",
    spotterGrid: "FN31",
    dx: "K5ABC",
    dxGrid: "EM10",
    frequency: 14_074.5,
    mode: "FT8",
    comment: "test",
    time: SPOT_TIME,
    band: "20m",
    source: "WSJT-X" as const,
  };
  return {
    spotterLat: 41.7,
    spotterLon: -72.7,
    dxLat: 30.3,
    dxLon: -97.7,
    callsign: "K5ABC",
    spotter: "W1AW",
    frequency: 14_074.5,
    mode: "FT8",
    band: "20m",
    time: SPOT_TIME,
    originalSpot,
    ...overrides,
  };
}

const ACTIVATION: MappableActivationSpot = {
  id: "activation-1",
  program: "POTA",
  callsign: "N0PARK",
  reference: "US-1234",
  referenceName: "Test Park",
  frequencyKHz: 7_240,
  mode: "SSB",
  comments: "",
  spotter: "K1SPT",
  spottedAt: "2026-09-01T12:01:00.000Z",
  latitude: 39,
  longitude: -96,
};

function candidates(
  overrides: Partial<
    Parameters<typeof buildGlobeSpotLayoutCandidates>[0]
  > = {},
) {
  return buildGlobeSpotLayoutCandidates({
    includeLiveActivity: true,
    renderLiveLabels: true,
    includeActivations: true,
    resolvedLiveSpots: [liveSpot()],
    activationSpots: [ACTIVATION],
    selectedSpotId: undefined,
    matchedSpotIds: new Set(),
    activeBand: "20m",
    labelScale: 1,
    showSpotCallsignLabels: true,
    showSpotterLabels: true,
    colorMode: "mode",
    now: SPOT_TIME.getTime(),
    ...overrides,
  });
}

describe("buildGlobeSpotLayoutCandidates", () => {
  it("gives DX, spotter, and activation surfaces collision-stable identities", () => {
    const result = candidates();

    expect(result.map(({ id, kind }) => [id, kind])).toEqual([
      ["WSJT-X:live-1:dx", "dx-label"],
      ["WSJT-X:live-1:spotter", "spotter-label"],
      ["activation:activation-1:activation", "activation-label"],
    ]);
    expect(result[0].reportId).toBe(result[1].reportId);
    expect(result[2].reportId).not.toBe(result[0].reportId);
  });

  it("uses exact rendered frequency lengths instead of placeholder values", () => {
    expect(formatLiveSpotLayoutFrequency(14_074.5)).toBe("14.075");
    const short = candidates({
      resolvedLiveSpots: [liveSpot({ callsign: "K1A", frequency: 7_240 })],
    });
    const long = candidates({
      resolvedLiveSpots: [
        liveSpot({ callsign: "W1AW/VE3", frequency: 144_390 }),
      ],
    });

    expect(long[0].width).toBeGreaterThan(short[0].width);
    // The activation formatter retains the half-kHz precision used by its pill.
    const halfKhz = candidates({
      includeLiveActivity: false,
      activationSpots: [{ ...ACTIVATION, frequencyKHz: 14_074.5 }],
    });
    expect(halfKhz[0].contentRevision).toContain("14074.5");
  });

  it("uses endpoint bounds when traces are visible without live labels", () => {
    const result = candidates({ renderLiveLabels: false });

    expect(result.slice(0, 2).map(({ kind }) => kind)).toEqual([
      "endpoint",
      "endpoint",
    ]);
    expect(result[0]).toMatchObject({ width: 28, height: 28 });
    expect(result[1]).toMatchObject({ width: 24, height: 24 });
  });

  it("keeps replay surfaces separate from a matching live provider ID", () => {
    const report = liveSpot();
    const result = candidates({
      includeReplayActivity: true,
      resolvedReplaySpots: [report],
    });

    expect(result.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "WSJT-X:live-1:dx",
        "replay-WSJT-X:live-1:dx",
      ]),
    );
    expect(
      result.find(({ id }) => id === "replay-WSJT-X:live-1:dx"),
    ).toMatchObject({ kind: "endpoint", sourcePriority: 0 });
  });

  it("carries selected, watch, band, recency, and source priority metadata", () => {
    const result = candidates({
      selectedSpotId: "live-1",
      matchedSpotIds: new Set(["live-1", "activation-1"]),
    });

    expect(result[0]).toMatchObject({
      selected: true,
      watched: true,
      activeBand: true,
      observedAt: SPOT_TIME.getTime(),
      sourcePriority: 4,
    });
    expect(result[2]).toMatchObject({
      watched: true,
      activeBand: false,
      sourcePriority: 3,
    });
  });

  it("changes its cheap revision when paint-only report content changes", () => {
    const first = candidates();
    const changed = candidates({
      resolvedLiveSpots: [liveSpot({ mode: "CW" })],
    });

    expect(globeSpotCandidateRevision(changed)).not.toBe(
      globeSpotCandidateRevision(first),
    );
  });
});

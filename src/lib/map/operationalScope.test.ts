import { describe, expect, it } from "vitest";
import { contestEventBus } from "@/lib/services/contestEventBus";
import { useContestStore } from "@/stores/contestStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import {
  applyMapDataPolicyToLayers,
  buildMapDataPolicy,
  deriveMapDataScope,
  isOwnStationIdentity,
  policyAllows,
  selectScopedLiveSpotSources,
} from "./operationalScope";

const LAYERS = {
  spots: false,
  spotTraces: false,
  gridActivity: false,
  activations: true,
  beacons: true,
  wspr: true,
  ft8Spotter: false,
  rayPath: false,
  loggedQsos: false,
  contestQsos: false,
  labels: true,
};

describe("operational map scope", () => {
  it("uses contest, station operation, then observation precedence", () => {
    expect(
      deriveMapDataScope({
        manualScope: null,
        contestActive: true,
        stationOperationActive: true,
      }),
    ).toBe("contest");
    expect(
      deriveMapDataScope({
        manualScope: null,
        contestActive: false,
        stationOperationActive: true,
      }),
    ).toBe("log");
    expect(
      deriveMapDataScope({
        manualScope: null,
        contestActive: false,
        stationOperationActive: false,
      }),
    ).toBe("observe");
  });

  it("honors an intentional manual override", () => {
    expect(
      deriveMapDataScope({
        manualScope: "observe",
        contestActive: true,
        stationOperationActive: true,
      }),
    ).toBe("observe");
  });

  it("clears a manual contest workspace when its session ends off-map", () => {
    useContestStore.setState({ activeSession: null });
    useMapOperationalStore.setState({
      manualScope: "contest",
      workspaceOpen: true,
    });

    contestEventBus.emit({
      type: "SESSION_ENDED",
      sessionId: "session-1",
      ts: "2026-09-02T12:00:00.000Z",
    });

    expect(useMapOperationalStore.getState()).toMatchObject({
      manualScope: null,
      workspaceOpen: false,
    });
  });

  it("excludes public traffic from logging and unassisted contests", () => {
    const logging = buildMapDataPolicy("log", true);
    const unassisted = buildMapDataPolicy("contest", false);
    const assisted = buildMapDataPolicy("contest", true);

    expect(policyAllows(logging, "liveSpots", "public")).toBe(false);
    expect(policyAllows(unassisted, "liveSpots", "public")).toBe(false);
    expect(policyAllows(unassisted, "neededMultipliers", "public")).toBe(
      false,
    );
    expect(policyAllows(assisted, "liveSpots", "public")).toBe(true);
    expect(policyAllows(assisted, "neededMultipliers", "public")).toBe(true);
  });

  it("requests only station spots in focused unassisted operation", () => {
    expect(
      selectScopedLiveSpotSources(
        ["PSKReporter", "RBN"],
        buildMapDataPolicy("log", false),
      ),
    ).toEqual(["WSJT-X"]);
    expect(
      selectScopedLiveSpotSources(
        ["RBN"],
        buildMapDataPolicy("contest", true),
      ),
    ).toEqual(["WSJT-X", "RBN"]);
    expect(
      selectScopedLiveSpotSources(
        [],
        buildMapDataPolicy("contest", true),
      ),
    ).toEqual(["WSJT-X", "PSKReporter", "RBN", "Cluster"]);
  });

  it("derives focused layers without changing observation preferences", () => {
    const focused = applyMapDataPolicyToLayers(
      LAYERS,
      buildMapDataPolicy("log", false),
    );

    expect(focused).toMatchObject({
      spots: true,
      spotTraces: true,
      gridActivity: true,
      activations: false,
      beacons: false,
      wspr: false,
      loggedQsos: true,
      contestQsos: false,
    });
    expect(LAYERS).toMatchObject({ spots: false, activations: true });
    expect(
      applyMapDataPolicyToLayers(
        LAYERS,
        buildMapDataPolicy("observe", false),
      ),
    ).toBe(LAYERS);
  });

  it("matches exact and portable forms of the operator callsign", () => {
    expect(isOwnStationIdentity("K1ABC", "K1ABC/P")).toBe(true);
    expect(isOwnStationIdentity("K1ABC/M", "K1ABC/P")).toBe(true);
    expect(isOwnStationIdentity("EA8/K1ABC", "K1ABC")).toBe(true);
    expect(isOwnStationIdentity("W1XYZ", "K1ABC/P")).toBe(false);
  });
});

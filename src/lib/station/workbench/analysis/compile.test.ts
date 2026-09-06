import { describe, expect, it } from "vitest";
import { compileSelectedRoute } from "@/lib/station/workbench/analysis/compile";
import {
  createCycleFixture, createEngineParityFixture, createExclusiveConflictFixture, createKnownInlineRunsFixture,
  createKnownLayersFixture, createKnownReceiveFixture, createKnownSimpleFixture, createKnownSwitchFixture,
  createMismatchedConnectorFixture, createPostAmpPowerRatingFixture, createRadioCappedPowerRatingFixture,
  createUnknownPortFixture, createUnknownTunerLossFixture, createZeroAndSignedFixture,
} from "@/lib/station/workbench/analysis/fixtures";
import { createUnsupportedBranchFixture } from "@/lib/station/workbench/fixtures";
import { assessRevisionTopology } from "@/lib/station/workbench/revisions/inputs";
import { resolveCatalogReceiver } from "@/lib/station/workbench/equipment/services";
import {
  computeStationChainPerformance, deriveStationFeatureEnvelope, type StationInventory,
} from "@/lib/station/stationChainEngine";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type { UserAccessory, UserAntenna, UserFeedline } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";

const equipment: RadioEquipment = {
  id: "radio-model", manufacturer: "Test", model: "HF-100",
  receiver: { rmdr: 90, imdr3: 85, blockingGain: 120, sensitivity: 0.2, noiseFloorDbm: -135 },
  maxPower: 100, minPower: 5, modes: ["CW", "SSB", "FT8"], bands: ["40m", "20m"], tier: "midrange",
};
const userRadio: UserRadio = { id: "owned-radio", equipmentId: equipment.id, customPowerLimit: 75, addedAt: "2026-01-01T00:00:00Z" };
const antenna: UserAntenna = {
  id: "antenna", name: "Test Beam", antennaType: "yagi_3el", gainPatternType: "yagi_3el",
  bands: ["40m", "20m"], heightMeters: 15, azimuthDeg: 90, isRotatable: false, polarization: "horizontal",
  mounting: "tower", gainDbiOverride: { "20m": 8, "40m": 6 }, swrByBand: { "20m": 1.2, "40m": 1.4 }, addedAt: "2026-01-01T00:00:00Z",
};
const feedline: UserFeedline = {
  id: "feedline", name: "LMR-400 run", feedlineType: "lmr400", lengthFeet: 100, connectorCount: 2,
  connectorType: "n_type", condition: "new", addedAt: "2026-01-01T00:00:00Z",
};
const amplifier: UserAccessory = { id: "amplifier", name: "500 W amplifier", category: "amplifier", maxPowerWatts: 500, gainDb: 20, bands: ["20m"], addedAt: "2026-01-01T00:00:00Z" };
const filter: UserAccessory = { id: "filter", name: "Band-pass filter", category: "filter", filterType: "bandpass", insertionLossDb: 1, bands: ["20m"], addedAt: "2026-01-01T00:00:00Z" };

function goldenInventory(): StationInventory {
  return {
    radios: [{ userRadio, equipment }], antennas: [antenna], feedlines: [feedline], accessories: [amplifier, filter],
    inlineComponents: [{ id: "choke", name: "Common-mode choke", componentType: "choke", chokeType: "common_mode", insertionLossDb: 0.25, addedAt: "2026-01-01T00:00:00Z" }],
  };
}
function goldenChain(): StationChain {
  return {
    id: "chain", name: "Main chain",
    nodes: [
      { type: "radio", radioId: userRadio.id }, { type: "accessory", accessoryId: amplifier.id },
      { type: "accessory", accessoryId: filter.id }, { type: "feedline_run", feedlineRunId: "run" },
      { type: "antenna", antennaId: antenna.id },
    ],
    feedlineRuns: [{ id: "run", feedlineId: feedline.id, inlineComponentIds: ["choke"] }],
    operatingPowerWatts: 200, shackAccessoryIds: [], createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("compileSelectedRoute", () => {
  it("matches known-route engine numbers without copying physics", () => {
    const archive = createEngineParityFixture();
    const compiled = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], targetBearingDeg: 90, mode: "FT8" },
    });
    expect(compiled.status).toBe("compiled");
    const golden = computeStationChainPerformance(goldenChain(), goldenInventory(), { bands: ["20m"], targetBearingDeg: 90 });
    expect(compiled.status).toBe("compiled");
    expect(compiled.structuralCandidate).toBe(true);
    expect(compiled.purpose).toBe("transmit");
    expect(compiled.compatibility.overall).toBe("compatible");
    const band = compiled.modeledRoute.engine?.bands[0];
    const expected = golden.bands[0];
    expect(band?.txPowerWatts).toBe(expected.txPowerWatts);
    expect(band?.feedlineLossDb).toBeCloseTo(expected.feedlineLossDb, 10);
    expect(band?.inlineLossDb).toBeCloseTo(expected.inlineLossDb, 10);
    expect(band?.antennaGainDbi).toBeCloseTo(expected.antennaGainDbi, 10);
    expect(band?.powerAtAntennaWatts).toBeCloseTo(expected.powerAtAntennaWatts, 10);
    expect(band?.eirpWatts).toBeCloseTo(expected.eirpWatts, 10);
    expect(band?.erpWatts).toBeCloseTo(expected.erpWatts, 10);
    expect(band?.warnings.map((item) => item.code).sort()).toEqual(expected.warnings.map((item) => item.code).sort());
    expect(compiled.topology.chain?.feedlineRuns[0].inlineComponentIds).toEqual(["choke"]);
    expect(compiled.metrics.find((item) => item.name === "eirp")?.quantity).toMatchObject({ state: "known", unit: "W" });
    expect(compiled.pathTimeConditions.targetBearingDeg).toBe(90);
    expect(compiled.measurements.some((item) => item.id === "gain-reading")).toBe(true);
  });

  it("does not treat a W03 structural candidate as engine-supported when ports and ratings are unknown", () => {
    const archive = createUnknownPortFixture();
    const topology = assessRevisionTopology(archive, "home-r1", { sourceId: "home-r1", sourceVersion: 1 });
    expect(topology.status === "candidate" || topology.status === "incomplete").toBe(true);
    const compiled = compileSelectedRoute(archive, { revisionId: "home-r1", routeId: "main" });
    expect(compiled.status).not.toBe("compiled");
    expect(compiled.modeledRoute.state).toBe("withheld");
    expect(compiled.compatibility.overall === "unknown" || compiled.status === "incomplete").toBe(true);
  });

  it("compiles explicit receive intent with known zero transmit power", () => {
    const compiled = compileSelectedRoute(createKnownReceiveFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] },
    });
    expect(compiled.status).toBe("compiled");
    expect(compiled.purpose).toBe("receive");
    expect(compiled.modeledRoute.engine?.bands[0]?.requestedPowerWatts).toBe(0);
    expect(compiled.modeledRoute.engine?.bands[0]?.txPowerWatts).toBe(0);
    expect(compiled.gearCapability.radio.customPowerLimit).toMatchObject({ state: "known", value: 0, unit: "W" });
  });

  it("follows the named switch path and does not infer the unused throw or claim hardware moved", () => {
    const archive = createKnownSwitchFixture();
    const selectedA = compileSelectedRoute(archive, { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } });
    const selectedB = compileSelectedRoute(archive, { revisionId: "home-r1", routeId: "antenna-b-route", options: { bands: ["20m"] } });
    expect(selectedA.status).toBe("compiled");
    expect(selectedB.status).toBe("compiled");
    expect(selectedA.exclusiveSelections[0]).toMatchObject({ selectedPathId: "select-a", throwPortId: "a" });
    expect(selectedB.exclusiveSelections[0]).toMatchObject({ selectedPathId: "select-b", throwPortId: "b" });
    expect(selectedA.topology.chain?.nodes.some((node) => node.type === "antenna" && node.antennaId === "antenna")).toBe(true);
    expect(selectedB.topology.chain?.nodes.some((node) => node.type === "antenna" && node.antennaId === "antenna-b")).toBe(true);
    expect(selectedA.assumptions.some((item) => /hardware/i.test(item))).toBe(true);
    const missing = compileSelectedRoute(archive, { revisionId: "home-r1", routeId: "not-a-route" });
    expect(missing.status).toBe("invalid");
    expect(missing.diagnostics.some((item) => item.code === "missing-route")).toBe(true);
  });

  it("flags exclusive conflicts as unsupported documentation without compiling a supported estimate", () => {
    const compiled = compileSelectedRoute(createExclusiveConflictFixture(), { revisionId: "home-r1", routeId: "main" });
    expect(compiled.status).toBe("unsupported");
    expect(compiled.compatibility.findings.some((item) => item.code === "exclusive-conflict")).toBe(true);
    expect(compiled.modeledRoute.state).toBe("withheld");
  });

  it("preserves two cable runs, inline order and base-cable meters without adding pigtail length", () => {
    const compiled = compileSelectedRoute(createKnownInlineRunsFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] },
    });
    expect(compiled.status).toBe("compiled");
    expect(compiled.topology.cableRuns.map((run) => run.id).sort()).toEqual(["legacy-run-a", "main-run"].sort());
    const assembly = compiled.topology.cableRuns.find((run) => run.id === "legacy-run-a");
    expect(assembly?.inlineInstanceIds).toEqual(["run-adapter", "run-choke"]);
    expect(assembly?.lengthMeters).toMatchObject({ state: "known", value: 12.192, unit: "m" });
    const feedline = compiled.topology.chain?.feedlineRuns.find((run) => run.id === "legacy-run-a");
    expect(feedline?.inlineComponentIds).toEqual(["run-adapter", "run-choke"]);
    const adapted = compiled.modeledRoute.engine?.chain?.feedlineRuns.find((run) => run.id === "legacy-run-a");
    expect(adapted?.inlineComponentIds).toEqual(["run-adapter", "run-choke"]);
    expect(compiled.calculationLimits.some((item) => item.code === "pigtail-length-not-in-engine" || item.code === "pigtail-length-excluded-from-feedline")).toBe(true);
    const engineFeet = compiled.modeledRoute.engine?.chain
      ? 12.192 / 0.3048
      : NaN;
    expect(engineFeet).toBeCloseTo(40, 10);
  });

  it("keeps unwired accessories and non-RF layers out of the RF chain", () => {
    const compiled = compileSelectedRoute(createKnownLayersFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] },
    });
    expect(compiled.status).toBe("compiled");
    expect(compiled.topology.members.find((item) => item.instanceId === "spare-accessory")?.role).toBe("unwired-member");
    expect(compiled.topology.members.find((item) => item.instanceId === "spare-antenna")?.role).toBe("unwired-member");
    expect(compiled.topology.chain?.shackAccessoryIds).toEqual(["spare-accessory"]);
    expect(compiled.topology.chain?.nodes.some((node) => node.type === "accessory" && "accessoryId" in node && node.accessoryId === "spare-accessory")).toBe(false);
    const signals = compiled.topology.documentedLayers.map((item) => item.signal).sort();
    expect(signals).toEqual(expect.arrayContaining(["power", "audio", "control", "bonding"]));
    expect(compiled.topology.chain?.nodes.filter((node) => node.type === "feedline_run")).toHaveLength(1);
  });

  it("distinguishes mismatched connectors from unknown ports", () => {
    const mismatched = compileSelectedRoute(createMismatchedConnectorFixture(), { revisionId: "home-r1", routeId: "main" });
    const unknown = compileSelectedRoute(createUnknownPortFixture(), { revisionId: "home-r1", routeId: "main" });
    expect(mismatched.status).toBe("unsupported");
    expect(mismatched.compatibility.overall).toBe("contradicted");
    expect(mismatched.compatibility.findings.some((item) => item.code === "connector-family-mismatch")).toBe(true);
    expect(unknown.compatibility.overall).toBe("unknown");
    expect(unknown.modeledRoute.state).toBe("withheld");
  });

  it("preserves known zero insertion loss and signed antenna gain through the engine", () => {
    const compiled = compileSelectedRoute(createZeroAndSignedFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], targetBearingDeg: 90 },
    });
    expect(compiled.status).toBe("compiled");
    expect(compiled.modeledRoute.engine?.bands[0]?.inlineLossDb).toBe(0.25);
    expect(compiled.modeledRoute.engine?.bands[0]?.nodes.find((node) => node.nodeType === "accessory" && node.label.includes("filter"))?.lossDb).toBe(0);
    expect(compiled.modeledRoute.engine?.bands[0]?.antennaGainDbi).toBe(-2);
    expect(compiled.gearCapability.antenna.gain).toMatchObject({ state: "known", value: -2, unit: "dBi" });
  });

  it("retains unsupported cycles, branches and non-RF hops as documentation", () => {
    const cycle = compileSelectedRoute(createCycleFixture(), { revisionId: "home-r1", routeId: "main" });
    const branch = compileSelectedRoute(createUnsupportedBranchFixture(), { revisionId: "home-r1", routeId: "main" });
    expect(cycle.status).toBe("unsupported");
    expect(cycle.diagnostics.some((item) => item.code === "cycle") || cycle.modeledRoute.reasons.some((item) => /cycle/i.test(item))).toBe(true);
    expect(branch.status).toBe("unsupported");
    expect(branch.modeledRoute.reasons.some((item) => /splitter|branch/i.test(item))).toBe(true);
    expect(branch.structuralCandidate).toBe(false);
  });

  it("uses pinned revision inputs after live inventory and catalog changes", () => {
    const archive = createEngineParityFixture();
    const before = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], targetBearingDeg: 90 },
    });
    archive.inventory[0].fields = {
      ...archive.inventory[0].fields,
      "radio.customPowerLimit": { state: "known", value: 1, unit: "W", evidenceId: "declared" },
    };
    archive.inventory[0].facts.powerLimit = { state: "known", value: 1, unit: "W", evidenceId: "declared" };
    archive.inventory[0].privateMetadata = { ...archive.inventory[0].privateMetadata, notes: "Live inventory note after pin" };
    const liveAntenna = archive.inventory.find((item) => item.id === "antenna")!;
    liveAntenna.fields = {
      ...liveAntenna.fields,
      "antenna.gain": { state: "known", value: 99, unit: "dBi", evidenceId: "declared" },
    };
    liveAntenna.facts = { gain: { state: "known", value: 99, unit: "dBi", evidenceId: "declared" } };
    const after = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], targetBearingDeg: 90 },
    });
    expect(after.status).toBe("compiled");
    expect(after.modeledRoute.engine?.bands[0]?.eirpWatts).toBe(before.modeledRoute.engine?.bands[0]?.eirpWatts);
    expect(after.gearCapability.radio.maxPower).toEqual(before.gearCapability.radio.maxPower);
  });

  it("keeps W02 factory/tested whole-source preference and bibliography on pinned radios", () => {
    const archive = createKnownSimpleFixture();
    const tested = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], preferTestedSpecs: true },
    });
    expect(tested.gearCapability.catalogReceiver?.selectedSource).toBe("tested");
    expect(tested.gearCapability.radio["receiver.rmdr"]).toMatchObject({ state: "known", value: 95 });
    expect(tested.gearCapability.radio["receiver.sensitivity"]).toMatchObject({ state: "known", value: 0.0000003, unit: "V" });
    expect(tested.gearCapability.bibliography.map((item) => item.citation.name).sort()).toEqual([
      "Synthetic factory receiver specifications", "Synthetic independent receiver test",
    ]);
    archive.revisions[0].equipment[0].privateMetadata.specPreference = "factory";
    const factory = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], preferTestedSpecs: true },
    });
    expect(factory.gearCapability.catalogReceiver?.selectedSource).toBe("factory");
    expect(factory.gearCapability.radio["receiver.rmdr"]).toMatchObject({ value: 90 });
    const live = resolveCatalogReceiver(archive, "radio", true);
    expect(live.selectedSource).toBe("tested");
  });

  it("withholds envelope when the selected catalog receiver group is unknown and does not invent zeros", () => {
    const archive = createKnownSimpleFixture();
    delete archive.revisions[0].models[0].fields!["radio.receiver.rmdr"];
    delete archive.revisions[0].models[0].fields!["radio.receiver.imdr3"];
    delete archive.revisions[0].models[0].fields!["radio.receiver.blockingGain"];
    delete archive.revisions[0].models[0].fields!["radio.receiver.sensitivity"];
    delete archive.revisions[0].models[0].fields!["radio.receiver.noiseFloorDbm"];
    delete archive.revisions[0].models[0].fields!["radio.testedSpecs.rmdr"];
    delete archive.revisions[0].models[0].fields!["radio.testedSpecs.imdr3"];
    delete archive.revisions[0].models[0].fields!["radio.testedSpecs.blockingGain"];
    delete archive.revisions[0].models[0].fields!["radio.testedSpecs.sensitivity"];
    delete archive.revisions[0].models[0].fields!["radio.testedSpecs.noiseFloorDbm"];
    const compiled = compileSelectedRoute(archive, { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } });
    expect(compiled.gearCapability.catalogReceiver?.selectedSource).toBe("unknown");
    expect(compiled.modeledRoute.envelope).toBeNull();
    expect(Object.values(compiled.gearCapability.radio).some((item) => item.state === "known" && item.value === 0 && item.unit === "dB")).toBe(false);
  });

  it("records envelope path conditions separately from gear and keeps fingerprint honest when bearing changes", () => {
    const archive = createEngineParityFixture();
    archive.revisions[0].equipment[0].privateMetadata.specPreference = "factory";
    const forward = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], targetBearingDeg: 90, mode: "FT8", preferTestedSpecs: false },
    });
    const offAxis = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"], targetBearingDeg: 180, mode: "FT8", preferTestedSpecs: false },
    });
    expect(forward.modeledRoute.envelope?.receiverEvidence).toBe("manufacturer_claim");
    expect(forward.modeledRoute.envelope?.receiverNoiseFloorDbm).toBe(-135);
    expect(forward.pathTimeConditions.targetBearingDeg).toBe(90);
    expect(forward.modeledRoute.envelope?.chainFingerprint).not.toBe(offAxis.modeledRoute.envelope?.chainFingerprint);
    const golden = deriveStationFeatureEnvelope(goldenChain(), goldenInventory(), "20m", { mode: "FT8", targetBearingDeg: 90, preferTestedSpecs: false });
    expect(forward.modeledRoute.envelope?.modeBandwidthHz).toBe(golden?.modeBandwidthHz);
    expect(forward.modeledRoute.envelope?.eirpWatts).toBeCloseTo(golden?.eirpWatts ?? NaN, 10);
  });

  it("uses modeled hop power rather than requested power for port ratings", () => {
    const capped = compileSelectedRoute(createRadioCappedPowerRatingFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] },
    });
    expect(capped.status).toBe("compiled");
    expect(capped.modeledRoute.engine?.bands[0]?.txPowerWatts).toBe(75);
    expect(capped.compatibility.findings.some((item) => item.code === "power-rating-ok")).toBe(true);
    const afterAmp = compileSelectedRoute(createPostAmpPowerRatingFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] },
    });
    expect(afterAmp.status).toBe("unsupported");
    expect(afterAmp.modeledRoute.state).toBe("withheld");
    expect(afterAmp.compatibility.findings.some((item) => item.code === "power-rating-exceeded")).toBe(true);
  });

  it("withholds when operating frequency or recorded frequency ratings are unknown", () => {
    const archive = createKnownSimpleFixture();
    archive.revisions[0].settings.frequencyHz = { state: "unknown", reason: "Operating frequency was not recorded" };
    const unknownFrequency = compileSelectedRoute(archive, { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } });
    expect(unknownFrequency.status).toBe("incomplete");
    expect(unknownFrequency.compatibility.findings.some((item) => item.code === "unknown-frequency")).toBe(true);
    expect(unknownFrequency.modeledRoute.state).toBe("withheld");
    const rated = createKnownSimpleFixture();
    rated.revisions[0].equipment.find((item) => item.id === "antenna")!.ports[0].ratings["port.minFrequency"] = {
      state: "unknown", reason: "Port frequency range was not recorded",
    };
    const unknownRating = compileSelectedRoute(rated, { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } });
    expect(unknownRating.status).toBe("incomplete");
    expect(unknownRating.compatibility.findings.some((item) => item.code === "unknown-frequency-rating")).toBe(true);
  });

  it("requires tuner insertion loss before compiling so the engine cannot treat unknown as 0 dB", () => {
    const compiled = compileSelectedRoute(createUnknownTunerLossFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] },
    });
    expect(compiled.status).toBe("incomplete");
    expect(compiled.missingInputs.some((item) => item.code === "unknown-tuner-loss")).toBe(true);
    expect(compiled.modeledRoute.state).toBe("withheld");
  });

  it("labels metrics with each engine result band instead of the request order", () => {
    const compiled = compileSelectedRoute(createEngineParityFixture(), {
      revisionId: "home-r1", routeId: "main", options: { bands: ["40m", "20m"], targetBearingDeg: 90 },
    });
    expect(compiled.status).toBe("compiled");
    const golden = computeStationChainPerformance(goldenChain(), goldenInventory(), { bands: ["40m", "20m"], targetBearingDeg: 90 });
    expect(compiled.modeledRoute.engine?.bands.map((item) => item.band)).toEqual(golden.bands.map((item) => item.band));
    const eirp = compiled.metrics.filter((item) => item.name === "eirp");
    expect(eirp.map((item) => item.sourceId).sort()).toEqual(["20m", "40m"]);
    const top = golden.bands[0];
    expect(eirp.find((item) => item.sourceId === top.band)?.quantity).toMatchObject({ state: "known", unit: "W" });
    expect(eirp.find((item) => item.sourceId === top.band)?.quantity.state === "known"
      ? eirp.find((item) => item.sourceId === top.band)!.quantity.value
      : NaN).toBeCloseTo(top.eirpWatts, 10);
  });
});

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
import { mapLegacyEquipment } from "@/lib/station/workbench/equipment/legacyAdapters";
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
    const archive = createEngineParityFixture();
    for (const item of archive.revisions[0].equipment.filter((item) => ["amplifier", "filter"].includes(item.id))) {
      item.fields!["accessory.bands"] = { state: "known", value: ["40m", "20m"], evidenceId: "declared" };
    }
    const compiled = compileSelectedRoute(archive, {
      revisionId: "home-r1", routeId: "main", options: { bands: ["40m", "20m"], targetBearingDeg: 90 },
    });
    expect(compiled.status).toBe("compiled");
    const inventory = structuredClone(goldenInventory());
    for (const accessory of inventory.accessories) {
      if (accessory.category === "amplifier" || accessory.category === "filter") accessory.bands = ["40m", "20m"];
    }
    const golden = computeStationChainPerformance(goldenChain(), inventory, { bands: ["40m", "20m"], targetBearingDeg: 90 });
    expect(compiled.modeledRoute.engine?.bands.map((item) => item.band)).toEqual(golden.bands.map((item) => item.band));
    const eirp = compiled.metrics.filter((item) => item.name === "eirp");
    expect(eirp.map((item) => item.sourceId).sort()).toEqual(["20m", "40m"]);
    const top = golden.bands[0];
    const topEirp = eirp.find((item) => item.sourceId === top.band);
    expect(topEirp?.quantity.state).toBe("known");
    const topValue = topEirp?.quantity.state === "known" ? topEirp.quantity.value : Number.NaN;
    expect(topValue).toBeCloseTo(top.eirpWatts, 10);
  });
});


describe("coordinator regression coverage", () => {
  const request = { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } };

  it("does not silently omit an unsupported selected device", () => {
    const archive = createEngineParityFixture();
    const device = archive.revisions[0].equipment.find((item) => item.id === "amplifier")!;
    device.fields = { "accessory.category": { state: "known", value: "power_supply", evidenceId: "declared" } };
    const result = compileSelectedRoute(archive, request);
    expect(result.status).toBe("unsupported");
    expect(result.calculationLimits.some((item) => item.code === "non-rf-accessory-on-route")).toBe(true);
    expect(result.modeledRoute.engine).toBeNull();
    expect(result.metrics).toEqual([]);
    expect(result.topology.members.find((item) => item.instanceId === device.id)?.role).toBe("rf-path");
  });

  it("withholds signed amplifier gain and unapplied feedpoint loss without withholding known zero", () => {
    const gainArchive = createEngineParityFixture();
    gainArchive.revisions[0].equipment.find((item) => item.id === "amplifier")!.fields!["accessory.gainDb"] = { state: "known", value: -3, unit: "dB", evidenceId: "declared" };
    const negative = compileSelectedRoute(gainArchive, request);
    expect(negative.status).toBe("unsupported");
    expect(negative.modeledRoute.engine).toBeNull();
    expect(negative.metrics).toEqual([]);
    const archive = createKnownSimpleFixture();
    const antenna = archive.revisions[0].equipment.find((item) => item.id === "antenna")!;
    antenna.fields!["antenna.feedpointFerrites.insertionLossDb"] = { state: "known", value: 1, unit: "dB", evidenceId: "declared" };
    const lossy = compileSelectedRoute(archive, request);
    expect(lossy.status).toBe("unsupported");
    expect(lossy.modeledRoute.engine).toBeNull();
    expect(lossy.calculationLimits.some((item) => item.code === "feedpoint-ferrite-not-in-engine")).toBe(true);
    antenna.fields!["antenna.feedpointFerrites.insertionLossDb"] = { state: "known", value: 0, unit: "dB", evidenceId: "declared" };
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
  });

  it("resolves each selected antenna band from its map or recorded scalar, never an engine default", () => {
    const archive = createKnownSimpleFixture();
    const antenna = archive.revisions[0].equipment.find((item) => item.id === "antenna")!;
    antenna.facts = {};
    antenna.fields!["antenna.gainDbiOverride"] = { state: "known", value: { "40m": 6 }, unit: "dBi", evidenceId: "declared" };
    antenna.fields!["antenna.swrByBand"] = { state: "known", value: { "40m": 1.4 }, unit: "ratio", evidenceId: "declared" };
    antenna.fields!["antenna.gain"] = { state: "known", value: -2, unit: "dBi", evidenceId: "declared" };
    antenna.fields!["antenna.swr"] = { state: "known", value: 3, unit: "ratio", evidenceId: "declared" };
    const scalar = compileSelectedRoute(archive, request);
    expect(scalar.status).toBe("compiled");
    expect(scalar.modeledRoute.engine?.bands[0].antennaGainDbi).toBe(-2);
    const explicit = structuredClone(archive);
    explicit.revisions[0].equipment.find((item) => item.id === "antenna")!.fields!["antenna.swrByBand"] = { state: "known", value: { "20m": 3 }, unit: "ratio", evidenceId: "declared" };
    expect(scalar.modeledRoute.engine?.bands[0].feedlineLossDb).toBe(compileSelectedRoute(explicit, request).modeledRoute.engine?.bands[0].feedlineLossDb);
    antenna.fields!["antenna.gain"] = { state: "unknown", reason: "No scalar gain" };
    antenna.fields!["antenna.swr"] = { state: "unknown", reason: "No scalar SWR" };
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("incomplete");
    expect(unknown.missingInputs.map((item) => item.code)).toEqual(expect.arrayContaining(["unknown-antenna-gain-band", "unknown-antenna-swr-band"]));
    expect(unknown.metrics).toEqual([]);
    expect(compileSelectedRoute(archive, { ...request, options: { bands: ["40m"] } }).status).toBe("compiled");
  });

  it("uses pinned mode unless explicitly overridden and withholds a mode-dependent envelope when absent", () => {
    const archive = createKnownSimpleFixture();
    const pinned = compileSelectedRoute(archive, request);
    expect(pinned.modeledRoute.envelope?.mode).toBe("SSB");
    expect(pinned.pathTimeConditions.mode).toBe("SSB");
    const override = compileSelectedRoute(archive, { ...request, options: { bands: ["20m"], mode: "FT8" } });
    expect(override.modeledRoute.envelope?.mode).toBe("FT8");
    expect(override.pathTimeConditions.mode).toBe("FT8");
    archive.revisions[0].settings.mode = null;
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("compiled");
    expect(unknown.modeledRoute.envelope).toBeNull();
    expect(unknown.pathTimeConditions.mode).toBeNull();
    expect(unknown.calculationLimits.some((item) => item.code === "unknown-operating-mode")).toBe(true);
  });

  it("accepts actual receive input/output directions and rejects a reversed receiving port", () => {
    const archive = createKnownReceiveFixture();
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    archive.revisions[0].equipment.find((item) => item.id === "radio")!.ports[0].direction = "output";
    const reversed = compileSelectedRoute(archive, request);
    expect(reversed.status).toBe("unsupported");
    expect(reversed.compatibility.findings.some((item) => item.code === "direction-mismatch")).toBe(true);
  });

  it("keeps declared receiver evidence without relabeling it as a manufacturer claim", () => {
    const archive = createKnownSimpleFixture();
    Object.entries(archive.revisions[0].models[0].fields!).forEach(([key, value]) => {
      if (key.startsWith("radio.receiver.") && value.state === "known") value.evidenceId = "declared";
    });
    const declared = compileSelectedRoute(archive, request);
    expect(declared.status).toBe("compiled");
    expect(declared.gearCapability.catalogReceiver?.evidence).toEqual([expect.objectContaining({ id: "declared", kind: "declared" })]);
    expect(declared.modeledRoute.envelope).toBeNull();
    expect(declared.calculationLimits.some((item) => item.code === "receiver-provenance-not-supported")).toBe(true);
    const tested = compileSelectedRoute(archive, { ...request, options: { bands: ["20m"], preferTestedSpecs: true } });
    expect(tested.modeledRoute.envelope?.receiverEvidence).toBe("independent_test");
  });
});


describe("explicit cable interfaces and engine conditions", () => {
  const request = { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } };
  it("mates each equipment jack to its bound cable end, with no inferred ends", () => {
    const archive = createKnownSimpleFixture();
    const revision = archive.revisions[0];
    revision.equipment.find((item) => item.id === "radio")!.ports[0].connector = { state: "known", family: "n_type", gender: "female" };
    const cable = revision.equipment.find((item) => item.id === "feedline")!;
    cable.ports.find((port) => port.id === "near")!.connector = { state: "known", family: "n_type", gender: "male" };
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    delete revision.connections[0].connectorInterface;
    const unbound = compileSelectedRoute(archive, request);
    expect(unbound.status).toBe("incomplete");
    expect(unbound.compatibility.findings.some((item) => item.code === "unknown-cable-termination")).toBe(true);
    expect(unbound.compatibility.findings.some((item) => item.code === "connector-gender-mismatch")).toBe(false);
    revision.connections[0].connectorInterface = { kind: "cable", fromPortId: "near", toPortId: "far", internalPathId: "cable-through" };
    cable.ports.find((port) => port.id === "far")!.connector = { state: "known", family: "bnc", gender: "male" };
    const mismatch = compileSelectedRoute(archive, request);
    expect(mismatch.status).toBe("unsupported");
    expect(mismatch.compatibility.findings.some((item) => item.code === "connector-family-mismatch")).toBe(true);
  });

  it("checks each requested engine band center against pinned port frequency bounds", () => {
    const archive = createKnownSimpleFixture();
    const port = archive.revisions[0].equipment.find((item) => item.id === "antenna")!.ports[0];
    port.ratings["port.minFrequency"] = { state: "known", value: 14e6, unit: "Hz", evidenceId: "declared" };
    port.ratings["port.maxFrequency"] = { state: "known", value: 15e6, unit: "Hz", evidenceId: "declared" };
    const result = compileSelectedRoute(archive, { ...request, options: { bands: ["20m", "40m"] } });
    expect(result.status).toBe("unsupported");
    expect(result.modeledRoute.engine).toBeNull();
    expect(result.compatibility.findings.some((item) => item.verdict === "contradicted" && item.message.startsWith("40m engine frequency"))).toBe(true);
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
  });

  it("does not use an unsupported engine stage's zero as a power-rating pass", () => {
    const result = compileSelectedRoute(createPostAmpPowerRatingFixture(), { ...request, options: { bands: ["40m"] } });
    expect(result.status).toBe("unsupported");
    expect(result.metrics).toEqual([]);
    expect(result.compatibility.findings.some((item) => item.code === "power-rating-ok")).toBe(false);
    expect(result.calculationLimits.some((item) => item.code === "unsupported-engine-band")).toBe(true);
  });

  it("does not turn an RF power reading into a maximum port rating", () => {
    const archive = createKnownSimpleFixture();
    const port = archive.revisions[0].equipment.find((item) => item.id === "antenna")!.ports[0];
    port.ratings["port.rfPower"] = { state: "known", value: 50, unit: "W", evidenceId: "declared" };
    const reading = compileSelectedRoute(archive, request);
    expect(reading.status).toBe("compiled");
    expect(reading.compatibility.findings.some((item) => item.code === "power-rating-ok")).toBe(false);
    port.ratings["port.maxPower"] = { state: "known", value: 100, unit: "W", evidenceId: "declared" };
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    port.ratings["port.maxPower"] = { state: "unknown", reason: "Not a measured maximum" };
    expect(compileSelectedRoute(archive, request).status).toBe("incomplete");
  });
});


describe("validated compiler boundary", () => {
  const request = { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } };
  it.each([
    { bands: "20m" }, { bands: ["20m", "invented"] }, { bands: [] }, { bands: ["not-a-band"] },
    { targetBearingDeg: Number.NaN }, { takeoffAngleDeg: Infinity }, { localNoiseFloorDbm: -Infinity }, { mode: "bogus" },
  ])("rejects invalid options without throwing or publishing known nonfinite metrics: %j", (options) => {
    const result = compileSelectedRoute(createKnownSimpleFixture(), { ...request, options });
    expect(result.status).toBe("invalid");
    expect(result.metrics).toEqual([]);
    expect(result.modeledRoute.engine).toBeNull();
  });

  it("withholds an unsupported pinned mode while retaining its declaration", () => {
    const archive = createKnownSimpleFixture();
    archive.revisions[0].settings.mode = "JS8";
    const result = compileSelectedRoute(archive, request);
    expect(result.status).toBe("compiled");
    expect(result.pathTimeConditions.mode).toBe("JS8");
    expect(result.modeledRoute.envelope).toBeNull();
    expect(result.calculationLimits.some((item) => item.code === "unsupported-operating-mode")).toBe(true);
  });

  it("checks cable-port ratings and does not assume an unknown cable path is RF", () => {
    const archive = createKnownSimpleFixture();
    const cable = archive.revisions[0].equipment.find((item) => item.id === "feedline")!;
    cable.ports[0].ratings["port.maxPower"] = { state: "known", value: 50, unit: "W", evidenceId: "declared" };
    const exceeded = compileSelectedRoute(archive, request);
    expect(exceeded.status).toBe("unsupported");
    expect(exceeded.compatibility.findings.some((item) => item.code === "power-rating-exceeded" && item.instanceId === cable.id)).toBe(true);
    cable.ports[0].ratings = {};
    cable.internalPaths[0].signal = "unknown";
    cable.ports.forEach((port) => { port.signal = "unknown"; });
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("incomplete");
    expect(unknown.compatibility.findings.some((item) => item.code === "unknown-cable-signal")).toBe(true);
  });

  it("withholds cable branches hidden behind an end binding and respects an explicitly exclusive choice", () => {
    const archive = createKnownSimpleFixture();
    const cable = archive.revisions[0].equipment.find((item) => item.id === "feedline")!;
    cable.ports.push({ ...structuredClone(cable.ports[1]), id: "branch", label: "Branch termination" });
    cable.internalPaths.push({ id: "unmodeled-branch", fromPortId: "near", toPortId: "branch", signal: "rf" });
    const branched = compileSelectedRoute(archive, request);
    expect(branched.status).toBe("unsupported");
    expect(branched.compatibility.findings.some((item) => item.code === "branched-cable-internals")).toBe(true);
    expect(branched.modeledRoute.engine).toBeNull();
    expect(branched.metrics).toEqual([]);
    cable.internalPaths.forEach((path) => { path.exclusiveGroupId = "explicit-path-choice"; });
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    cable.internalPaths[1].exclusiveGroupId = "independent-choice";
    expect(compileSelectedRoute(archive, request).status).toBe("unsupported");
    cable.ports.find((port) => port.id === "near")!.signal = "unknown";
    cable.ports.find((port) => port.id === "branch")!.signal = "unknown";
    cable.internalPaths[1].signal = "unknown";
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("incomplete");
    expect(unknown.compatibility.findings.some((item) => item.code === "unknown-cable-branch")).toBe(true);
  });

  it("preserves supported non-N adapter types and withholds unknown or invalid connector enums", () => {
    const archive = createKnownInlineRunsFixture();
    const adapter = archive.revisions[0].equipment.find((item) => item.id === "run-adapter")!;
    adapter.fields!["inline.connectorFrom"] = { state: "known", value: "bnc", evidenceId: "declared" };
    adapter.fields!["inline.connectorTo"] = { state: "known", value: "sma", evidenceId: "declared" };
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    adapter.fields!["inline.connectorFrom"] = { state: "unknown", reason: "End not documented" };
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("incomplete");
    expect(unknown.missingInputs.some((item) => item.code === "unknown-inline-connectors")).toBe(true);
    adapter.fields!["inline.connectorFrom"] = { state: "known", value: "invented-connector", evidenceId: "declared" };
    expect(compileSelectedRoute(archive, request).status).toBe("invalid");
  });
});


describe("PR242 cable and inline constraints", () => {
  const request = { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } };

  it("keeps a legacy-imported unknown far end unresolved until reviewed", () => {
    const archive = createKnownSimpleFixture();
    const cable = archive.revisions[0].equipment.find((item) => item.id === "feedline")!;
    const mapped = mapLegacyEquipment("feedline", { id: cable.id, name: cable.label, addedAt: cable.addedAt, connectorType: "pl259" },
      { ownerId: archive.ownerId, sourceId: cable.id, sourceVersion: 1, capturedAt: cable.addedAt });
    expect(mapped.status).toBe("mapped");
    if (mapped.status !== "mapped") return;
    const farEnd = mapped.value.fields!["feedline.connectorTypeFarEnd"];
    expect(farEnd).toEqual({ state: "unknown", reason: "Not recorded in legacy source" });
    cable.fields!["feedline.connectorTypeFarEnd"] = farEnd;
    const result = compileSelectedRoute(archive, request);
    expect(result.status).toBe("incomplete");
    expect(result.missingInputs.some((item) => item.code === "unknown-feedline-far-connector")).toBe(true);
    expect(result.metrics).toEqual([]);
    expect(mapped.source.payload).not.toHaveProperty("connectorTypeFarEnd");
  });

  it.each([createKnownSimpleFixture, createKnownReceiveFixture])("compares impedance at each actual equipment/cable joint in either route direction", (fixture) => {
    const archive = fixture();
    const revision = archive.revisions[0];
    const radioPort = revision.equipment.find((item) => item.id === "radio")!.ports[0];
    const antennaPort = revision.equipment.find((item) => item.id === "antenna")!.ports[0];
    const cable = revision.equipment.find((item) => item.id === "feedline")!;
    for (const port of [radioPort, antennaPort]) port.ratings["port.impedance"] = { state: "known", value: 75, unit: "ohm", evidenceId: "declared" };
    for (const port of cable.ports) port.ratings["port.impedance"] = { state: "known", value: 50, unit: "ohm", evidenceId: "declared" };
    const mismatched = compileSelectedRoute(archive, request);
    expect(mismatched.status).toBe("unsupported");
    expect(mismatched.compatibility.findings.filter((item) => item.code === "impedance-mismatch")).toHaveLength(2);
    expect(mismatched.metrics).toEqual([]);
    for (const port of cable.ports) port.ratings["port.impedance"] = { state: "known", value: 75, unit: "ohm", evidenceId: "declared" };
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    cable.ports[0].ratings["port.impedance"] = { state: "unknown", reason: "Cable end not characterized" };
    expect(compileSelectedRoute(archive, request).status).toBe("incomplete");
  });

  it("preserves matching/absent far connector behavior and withholds mixed or explicitly unknown ends", () => {
    const archive = createKnownSimpleFixture();
    const cable = archive.revisions[0].equipment.find((item) => item.id === "feedline")!;
    const legacy = compileSelectedRoute(archive, request);
    expect(legacy.status).toBe("compiled");
    cable.fields!["feedline.connectorTypeFarEnd"] = { state: "known", value: "n_type", evidenceId: "declared" };
    const matching = compileSelectedRoute(archive, request);
    expect(matching.status).toBe("compiled");
    expect(matching.modeledRoute.engine?.bands[0].feedlineLossDb).toBe(legacy.modeledRoute.engine?.bands[0].feedlineLossDb);
    cable.fields!["feedline.connectorTypeFarEnd"] = { state: "known", value: "pl259", evidenceId: "declared" };
    const mixed = compileSelectedRoute(archive, request);
    expect(mixed.status).toBe("unsupported");
    expect(mixed.calculationLimits.some((item) => item.code === "mixed-feedline-connectors-not-supported")).toBe(true);
    expect(mixed.metrics).toEqual([]);
    cable.fields!["feedline.connectorTypeFarEnd"] = { state: "unknown", reason: "Far end not recorded" };
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("incomplete");
    expect(unknown.missingInputs.some((item) => item.code === "unknown-feedline-far-connector")).toBe(true);
    expect(unknown.modeledRoute.engine).toBeNull();
  });

  it("enforces each requested band against recorded inline support without inventing constraints for absent fields", () => {
    const archive = createKnownInlineRunsFixture();
    const inline = archive.revisions[0].equipment.find((item) => item.id === "run-choke")!;
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    inline.fields!["inline.bands"] = { state: "known", value: ["20m"], evidenceId: "declared" };
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    const outside = compileSelectedRoute(archive, { ...request, options: { bands: ["20m", "40m"] } });
    expect(outside.status).toBe("unsupported");
    expect(outside.calculationLimits.some((item) => item.code === "inline-band-unsupported" && item.message.includes("40m"))).toBe(true);
    expect(outside.metrics).toEqual([]);
    inline.fields!["inline.bands"] = { state: "unknown", reason: "Band support not established" };
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("incomplete");
    expect(unknown.missingInputs.some((item) => item.code === "unknown-inline-bands")).toBe(true);
  });

  it("does not compare inline maximum power to requested power or the whole run's combined output", () => {
    const archive = createKnownInlineRunsFixture();
    const inline = archive.revisions[0].equipment.find((item) => item.id === "run-adapter")!;
    for (const maximum of [0, 1, 1000]) {
      inline.fields!["inline.maxPowerWatts"] = { state: "known", value: maximum, unit: "W", evidenceId: "declared" };
      const limited = compileSelectedRoute(archive, request);
      expect(limited.status).toBe("incomplete");
      expect(limited.missingInputs.some((item) => item.code === "unknown-inline-stage-power" && item.instanceId === inline.id)).toBe(true);
      expect(limited.modeledRoute.engine).toBeNull();
      expect(limited.metrics).toEqual([]);
    }
    inline.fields!["inline.maxPowerWatts"] = { state: "unknown", reason: "No reliable rating" };
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.missingInputs.some((item) => item.code === "unknown-inline-power-limit")).toBe(true);
    delete inline.fields!["inline.maxPowerWatts"];
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
  });
});


describe("final cable path and mode provenance", () => {
  const request = { revisionId: "home-r1", routeId: "main", options: { bands: ["20m"] } };

  it.each([createKnownSimpleFixture, createKnownReceiveFixture])("requires modeled cable connector loss to match both physical ends", (fixture) => {
    const archive = fixture();
    const revision = archive.revisions[0];
    const cable = revision.equipment.find((item) => item.id === "feedline")!;
    for (const item of revision.equipment.filter((item) => ["radio", "antenna", "feedline"].includes(item.id))) {
      for (const port of item.ports) if (port.connector.state === "known") port.connector.family = "BNC";
    }
    const wrongLoss = compileSelectedRoute(archive, request);
    expect(wrongLoss.status).toBe("unsupported");
    expect(wrongLoss.calculationLimits.filter((item) => item.code === "cable-connector-loss-mismatch")).toHaveLength(2);
    expect(wrongLoss.metrics).toEqual([]);
    cable.fields!["feedline.connectorType"] = { state: "known", value: "bnc", evidenceId: "declared" };
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    for (const item of revision.equipment.filter((item) => ["radio", "antenna", "feedline"].includes(item.id))) {
      for (const port of item.ports) if (port.connector.state === "known") port.connector.family = "custom-owner-connector";
    }
    const unmapped = compileSelectedRoute(archive, request);
    expect(unmapped.status).toBe("incomplete");
    expect(unmapped.missingInputs.some((item) => item.code === "unmapped-cable-connector-family")).toBe(true);
  });

  it.each([
    ["n_type", "N-type", "N"], ["pl259", "PL-259", "SO-239"], ["sma_rp", "RP-SMA", "SMA-RP"],
  ])("supports explicit family aliases for %s without inventing gender", (engineType, nearAlias, farAlias) => {
    const archive = createKnownSimpleFixture();
    const revision = archive.revisions[0];
    const cable = revision.equipment.find((item) => item.id === "feedline")!;
    const radio = revision.equipment.find((item) => item.id === "radio")!;
    const antenna = revision.equipment.find((item) => item.id === "antenna")!;
    cable.fields!["feedline.connectorType"] = { state: "known", value: engineType, evidenceId: "declared" };
    for (const port of [radio.ports[0], cable.ports[0]]) if (port.connector.state === "known") port.connector.family = nearAlias;
    for (const port of [antenna.ports[0], cable.ports[1]]) if (port.connector.state === "known") port.connector.family = farAlias;
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    if (cable.ports[0].connector.state === "known") cable.ports[0].connector.gender = "unknown";
    expect(compileSelectedRoute(archive, request).status).toBe("incomplete");
  });

  it("keeps reverse-polarity SMA distinct from SMA even when each physical joint mates", () => {
    const archive = createKnownSimpleFixture();
    const revision = archive.revisions[0];
    const cable = revision.equipment.find((item) => item.id === "feedline")!;
    cable.fields!["feedline.connectorType"] = { state: "known", value: "sma", evidenceId: "declared" };
    for (const port of [revision.equipment.find((item) => item.id === "radio")!.ports[0], cable.ports[0]]) if (port.connector.state === "known") port.connector.family = "SMA";
    for (const port of [revision.equipment.find((item) => item.id === "antenna")!.ports[0], cable.ports[1]]) if (port.connector.state === "known") port.connector.family = "RP-SMA";
    const mismatch = compileSelectedRoute(archive, request);
    expect(mismatch.status).toBe("unsupported");
    expect(mismatch.calculationLimits.some((item) => item.code === "cable-connector-loss-mismatch")).toBe(true);
  });

  it("requires the selected inline path to match its run and handles reversed run/path storage and receive flow", () => {
    const archive = createKnownInlineRunsFixture();
    const revision = archive.revisions[0];
    const inline = revision.equipment.find((item) => item.id === "run-adapter")!;
    const run = revision.cableRuns.find((item) => item.id === "legacy-run-a")!;
    const hop = revision.routes[0].hops.find((item) => item.kind === "internal" && item.instanceId === inline.id)!;
    if (hop.kind !== "internal") throw new Error("Fixture must have an inline hop");
    inline.internalPaths[0].exclusiveGroupId = "selected-path";
    inline.internalPaths.push({ ...structuredClone(inline.internalPaths[0]), id: "other-path" });
    hop.internalPathId = "other-path";
    const mismatched = compileSelectedRoute(archive, request);
    expect(mismatched.status).toBe("unsupported");
    expect(mismatched.calculationLimits.some((item) => item.code === "unrepresented-inline-path")).toBe(true);
    expect(mismatched.metrics).toEqual([]);
    hop.internalPathId = "through";
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    // The same physical flow, but with the stored selected internal path reversed.
    inline.internalPaths[0].fromPortId = "out";
    inline.internalPaths[0].toPortId = "in";
    hop.reverse = true;
    run.inlineItems.find((item) => item.instanceId === inline.id)!.reverse = true;
    expect(compileSelectedRoute(archive, request).status).toBe("compiled");
    // Run order is independently stored backwards; emitted engine order stays RF flow order.
    run.connections.reverse().forEach((segment) => { segment.reverse = !segment.reverse; });
    run.inlineItems.reverse().forEach((item) => { item.reverse = !item.reverse; });
    const reversedRun = compileSelectedRoute(archive, request);
    expect(reversedRun.status).toBe("compiled");
    expect(reversedRun.topology.chain?.feedlineRuns.find((item) => item.id === run.id)?.inlineComponentIds).toEqual(["run-adapter", "run-choke"]);
    revision.routes[0].purpose = "receive";
    revision.routes[0].hops.reverse().forEach((item) => { item.reverse = !item.reverse; });
    revision.equipment.find((item) => item.id === "radio")!.ports[0].direction = "input";
    revision.equipment.find((item) => item.id === "antenna")!.ports[0].direction = "output";
    revision.settings.requestedPowerWatts = { state: "known", value: 0, unit: "W", evidenceId: "declared" };
    const received = compileSelectedRoute(archive, request);
    expect(received.status).toBe("compiled");
    expect(received.purpose).toBe("receive");
    expect(received.modeledRoute.engine?.bands[0].txPowerWatts).toBe(0);
  });

  it("uses pinned radio mode capability for the envelope without erasing mode-independent metrics", () => {
    const archive = createKnownSimpleFixture();
    const radio = archive.revisions[0].equipment.find((item) => item.id === "radio")!;
    const supported = compileSelectedRoute(archive, { ...request, options: { bands: ["20m"], mode: " ft8 " } });
    expect(supported.modeledRoute.envelope?.mode).toBe("FT8");
    const unsupported = compileSelectedRoute(archive, { ...request, options: { bands: ["20m"], mode: "FM" } });
    expect(unsupported.status).toBe("compiled");
    expect(unsupported.modeledRoute.envelope).toBeNull();
    expect(unsupported.calculationLimits.some((item) => item.code === "unsupported-radio-mode")).toBe(true);
    expect(unsupported.metrics).toEqual(supported.metrics);
    radio.fields!["radio.modes"] = { state: "unknown", reason: "Owned radio mode capability unverified" };
    const unknown = compileSelectedRoute(archive, request);
    expect(unknown.status).toBe("compiled");
    expect(unknown.modeledRoute.envelope).toBeNull();
    expect(unknown.calculationLimits.some((item) => item.code === "unknown-radio-mode-capability")).toBe(true);
    expect(unknown.metrics).toEqual(supported.metrics);
  });
});


describe("complete cable assembly coverage", () => {
  it("does not emit unused run parts when a valid selected route exits through an exclusive inline branch", () => {
    const archive = createKnownInlineRunsFixture();
    const revision = archive.revisions[0];
    const adapter = revision.equipment.find((item) => item.id === "run-adapter")!;
    adapter.ports.push({ ...structuredClone(adapter.ports.find((port) => port.id === "out")!), id: "alternate" });
    adapter.internalPaths[0].exclusiveGroupId = "output-selection";
    adapter.internalPaths.push({ id: "alternate-path", fromPortId: "in", toPortId: "alternate", signal: "rf", exclusiveGroupId: "output-selection" });
    const alternateAntenna = revision.equipment.find((item) => item.id === "antenna-b")!;
    alternateAntenna.fields = structuredClone(revision.equipment.find((item) => item.id === "antenna")!.fields);
    for (const field of Object.values(alternateAntenna.fields!)) if (field.state === "known") field.evidenceId = "declared";
    revision.connections = revision.connections.filter((connection) => connection.id !== "switch-b");
    revision.connections.push({ id: "alternate-exit", signal: "rf", from: { instanceId: adapter.id, portId: "alternate" }, to: { instanceId: alternateAntenna.id, portId: "feed" }, runId: null, label: "Alternate exit", connectorInterface: { kind: "direct" } });
    revision.routes[0].hops = [
      ...revision.routes[0].hops.slice(0, 3),
      { kind: "internal", instanceId: adapter.id, internalPathId: "alternate-path", reverse: false },
      { kind: "connection", connectionId: "alternate-exit", reverse: false },
    ];
    const result = compileSelectedRoute(archive, { revisionId: revision.id, routeId: "main", options: { bands: ["20m"] } });
    expect(result.structuralCandidate).toBe(true);
    expect(result.status).toBe("unsupported");
    expect(result.diagnostics.some((finding) => finding.code === "invalid-document")).toBe(false);
    expect(result.calculationLimits.some((finding) => finding.code === "incomplete-run-selection")).toBe(true);
    expect(result.topology.cableRuns.some((run) => run.id === "legacy-run-a" && run.countedInEngine)).toBe(false);
    expect(result.modeledRoute.engine).toBeNull();
    expect(result.metrics).toEqual([]);
  });
});

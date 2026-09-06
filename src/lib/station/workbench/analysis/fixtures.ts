/** Synthetic W07 compiler fixtures. Nothing is written to user storage. */
import {
  type EquipmentInstance, type Evidence, type Quantity, workbenchArchiveSchema, type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import {
  createHfFixture, createInlineAndLayersFixture, createMultipleCableRunsFixture, createReceiveOnlyFixture,
  createSwitchedFixture, createUnsupportedBranchFixture, FIXTURE_DATE, FIXTURE_OWNER,
} from "@/lib/station/workbench/fixtures";

const kn = (value: number, unit: string): Quantity => ({ state: "known", value, unit, evidenceId: "declared" });
const kt = (value: string | boolean | string[] | Record<string, number>) => ({ state: "known" as const, value, evidenceId: "declared" });

const factoryReport: Evidence = {
  id: "factory-report", ownerId: FIXTURE_OWNER, kind: "report", reportType: "manufacturer",
  source: "Synthetic factory sheet", recordedAt: FIXTURE_DATE,
  citation: { name: "Synthetic factory receiver specifications", license: "Synthetic fixture" },
  measurementContext: { state: "unknown", reason: "Factory claims are not a physical-instance measurement" },
};
const testedReport: Evidence = {
  id: "tested-report", ownerId: FIXTURE_OWNER, kind: "report", reportType: "independent-test",
  source: "Synthetic lab", recordedAt: FIXTURE_DATE,
  citation: { name: "Synthetic independent receiver test", license: "Synthetic fixture" },
  measurementContext: { state: "recorded", method: "Synthetic lab method", frequencyHz: 14_150_000 },
};
const gainMeasurement: Evidence = {
  id: "gain-reading", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Owner range",
  observedAt: FIXTURE_DATE, point: { kind: "equipment", instanceId: "antenna", description: "Feedpoint" },
  reading: { value: 8, unit: "dBi" }, quantityKind: "antenna-gain", context: { kind: "rf", frequencyHz: 14_150_000 },
  method: "Synthetic antenna measurement",
};

function mate(item: EquipmentInstance, portId: string, role: EquipmentInstance["ports"][number]["role"], direction: EquipmentInstance["ports"][number]["direction"], gender: "male" | "female") {
  const port = item.ports.find((entry) => entry.id === portId);
  if (!port) return;
  port.role = role;
  port.direction = direction;
  port.connector = { state: "known", family: "n_type", gender };
}

function through(item: EquipmentInstance, fromPortId: string, toPortId: string) {
  item.internalPaths = [{ id: "through", fromPortId, toPortId, signal: "rf" }];
}

function addEvidence(archive: WorkbenchArchive, extra: Evidence[]) {
  archive.evidence.push(...extra);
  archive.revisions[0].evidence.push(...structuredClone(extra));
}

function radioCatalog(archive: WorkbenchArchive) {
  const radio = archive.revisions[0].equipment.find((item) => item.id === "radio")!;
  const model = archive.revisions[0].models[0];
  radio.fields = {
    "radio.maxPower": kn(100, "W"), "radio.minPower": kn(5, "W"), "radio.customPowerLimit": kn(75, "W"),
    "radio.bands": kt(["40m", "20m"]), "radio.modes": kt(["CW", "SSB", "FT8"]), "radio.tier": kt("midrange"),
    "equipment.manufacturer": kt("Test"), "radio.model": kt("HF-100"),
  };
  radio.facts = { powerLimit: kn(75, "W") };
  model.fields = {
    "radio.maxPower": kn(100, "W"), "radio.minPower": kn(5, "W"), "radio.bands": kt(["40m", "20m"]),
    "radio.modes": kt(["CW", "SSB", "FT8"]), "radio.tier": kt("midrange"),
    "equipment.manufacturer": kt("Test"), "radio.model": kt("HF-100"),
    "radio.receiver.rmdr": { state: "known", value: 90, unit: "dB", evidenceId: "factory-report" },
    "radio.receiver.imdr3": { state: "known", value: 85, unit: "dB", evidenceId: "factory-report" },
    "radio.receiver.blockingGain": { state: "known", value: 120, unit: "dB", evidenceId: "factory-report" },
    "radio.receiver.sensitivity": { state: "known", value: 0.0000002, unit: "V", evidenceId: "factory-report" },
    "radio.receiver.noiseFloorDbm": { state: "known", value: -135, unit: "dBm", evidenceId: "factory-report" },
    "radio.testedSpecs.rmdr": { state: "known", value: 95, unit: "dB", evidenceId: "tested-report" },
    "radio.testedSpecs.imdr3": { state: "known", value: 87, unit: "dB", evidenceId: "tested-report" },
    "radio.testedSpecs.blockingGain": { state: "known", value: 114, unit: "dB", evidenceId: "tested-report" },
    "radio.testedSpecs.sensitivity": { state: "known", value: 0.0000003, unit: "V", evidenceId: "tested-report" },
    "radio.testedSpecs.noiseFloorDbm": { state: "known", value: -124, unit: "dBm", evidenceId: "tested-report" },
  };
  model.sourceReportIds = ["factory-report", "tested-report"];
  model.specifications = { maxPower: kn(100, "W") };
  archive.models[0] = structuredClone(model);
  const live = archive.inventory.find((item) => item.id === "radio");
  if (live) {
    live.fields = structuredClone(radio.fields);
    live.facts = structuredClone(radio.facts);
  }
}

function antennaCatalog(archive: WorkbenchArchive, gain = 8, swr = 1.2) {
  const antenna = archive.revisions[0].equipment.find((item) => item.id === "antenna")!;
  antenna.fields = {
    "antenna.antennaType": kt("yagi_3el"), "antenna.gainPatternType": kt("yagi_3el"),
    "antenna.bands": kt(["40m", "20m"]), "antenna.heightMeters": kn(15, "m"),
    "antenna.azimuthDeg": kn(90, "deg"), "antenna.isRotatable": kt(false),
    "antenna.polarization": kt("horizontal"), "antenna.mounting": kt("tower"),
    "antenna.gainDbiOverride": { state: "known", value: { "20m": gain, "40m": 6 }, unit: "dBi", evidenceId: "declared" },
    "antenna.swrByBand": { state: "known", value: { "20m": swr, "40m": 1.4 }, unit: "ratio", evidenceId: "declared" },
    "antenna.gain": { state: "known", value: gain, unit: "dBi", evidenceId: gain === 8 ? "gain-reading" : "declared" }, "antenna.swr": kn(swr, "ratio"),
  };
  if (gain === 8) antenna.facts = { gain: { state: "known", value: 8, unit: "dBi", evidenceId: "gain-reading" } };
  const live = archive.inventory.find((item) => item.id === "antenna");
  if (live) {
    live.fields = structuredClone(antenna.fields);
    live.facts = structuredClone(antenna.facts);
  }
}

function cableCatalog(archive: WorkbenchArchive, lengthMeters = 30.48) {
  const cable = archive.revisions[0].equipment.find((item) => item.kind === "cable");
  if (!cable) return;
  cable.fields = {
    "feedline.feedlineType": kt("lmr400"), "feedline.length": kn(lengthMeters, "m"),
    "feedline.connectorCount": kn(2, "count"), "feedline.connectorType": kt("n_type"),
    "feedline.condition": kt("new"),
  };
  const run = archive.revisions[0].cableRuns[0];
  if (run) run.lengthMeters = kn(lengthMeters, "m");
}

function accessoryFields(item: EquipmentInstance, category: string, extra: Record<string, ReturnType<typeof kn> | ReturnType<typeof kt>>) {
  item.kind = "accessory";
  item.fields = { "accessory.category": kt(category), ...extra };
}

/** Fully specified radio→amp→filter→run(choke)→antenna route matching the engine golden chain. */
export function createEngineParityFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  const amp: EquipmentInstance = {
    id: "amplifier", ownerId: FIXTURE_OWNER, modelId: null, label: "500 W amplifier", kind: "accessory",
    lifecycle: "owned", addedAt: FIXTURE_DATE, ports: [
      { id: "in", label: "in", signal: "rf", direction: "input", role: "load", connector: { state: "known", family: "n_type", gender: "female" }, ratings: {} },
      { id: "out", label: "out", signal: "rf", direction: "output", role: "source", connector: { state: "known", family: "n_type", gender: "male" }, ratings: {} },
    ], internalPaths: [{ id: "through", fromPortId: "in", toPortId: "out", signal: "rf" }],
    facts: {}, fields: {
      "accessory.category": kt("amplifier"), "accessory.gainDb": kn(20, "dB"),
      "accessory.maxPowerWatts": kn(500, "W"), "accessory.bands": kt(["20m"]),
    }, privateMetadata: { receiptMediaIds: [], imageIds: [] }, legacy: [],
  };
  const filter: EquipmentInstance = {
    id: "filter", ownerId: FIXTURE_OWNER, modelId: null, label: "Band-pass filter", kind: "accessory",
    lifecycle: "owned", addedAt: FIXTURE_DATE, ports: [
      { id: "in", label: "in", signal: "rf", direction: "input", role: "load", connector: { state: "known", family: "n_type", gender: "female" }, ratings: {} },
      { id: "out", label: "out", signal: "rf", direction: "output", role: "source", connector: { state: "known", family: "n_type", gender: "male" }, ratings: {} },
    ], internalPaths: [{ id: "through", fromPortId: "in", toPortId: "out", signal: "rf" }],
    facts: {}, fields: {
      "accessory.category": kt("filter"), "accessory.filterType": kt("bandpass"),
      "accessory.insertionLossDb": kn(1, "dB"), "accessory.bands": kt(["20m"]),
    }, privateMetadata: { receiptMediaIds: [], imageIds: [] }, legacy: [],
  };
  const choke: EquipmentInstance = {
    id: "choke", ownerId: FIXTURE_OWNER, modelId: null, label: "Common-mode choke", kind: "inline",
    lifecycle: "owned", addedAt: FIXTURE_DATE, ports: [
      { id: "in", label: "in", signal: "rf", direction: "bidirectional", role: "through", connector: { state: "known", family: "n_type", gender: "female" }, ratings: {} },
      { id: "out", label: "out", signal: "rf", direction: "bidirectional", role: "through", connector: { state: "known", family: "n_type", gender: "male" }, ratings: {} },
    ], internalPaths: [{ id: "through", fromPortId: "in", toPortId: "out", signal: "rf" }],
    facts: {}, fields: {
      "inline.componentType": kt("choke"), "inline.insertionLossDb": kn(0.25, "dB"), "inline.chokeType": kt("common_mode"),
    }, privateMetadata: { receiptMediaIds: [], imageIds: [] }, legacy: [],
  };
  archive.inventory.push(amp, filter, choke);
  const revision = archive.revisions[0];
  revision.equipment.push(structuredClone(amp), structuredClone(filter), structuredClone(choke));
  const radio = revision.equipment.find((item) => item.id === "radio")!;
  const antenna = revision.equipment.find((item) => item.id === "antenna")!;
  mate(radio, "antenna", "source", "output", "male");
  mate(antenna, "feed", "load", "input", "female");
  radioCatalog(archive);
  antennaCatalog(archive);
  cableCatalog(archive);
  addEvidence(archive, [factoryReport, testedReport, gainMeasurement]);
  revision.settings.requestedPowerWatts = kn(200, "W");
  revision.settings.bandId = "20m";
  revision.settings.mode = "FT8";
  revision.connections = [
    { id: "radio-amp", signal: "rf", from: { instanceId: "radio", portId: "antenna" }, to: { instanceId: "amplifier", portId: "in" }, runId: null, label: "radio-amp" },
    { id: "amp-filter", signal: "rf", from: { instanceId: "amplifier", portId: "out" }, to: { instanceId: "filter", portId: "in" }, runId: null, label: "amp-filter" },
    { id: "filter-choke", signal: "rf", from: { instanceId: "filter", portId: "out" }, to: { instanceId: "choke", portId: "in" }, runId: "main-run", label: "filter-choke" },
    { id: "choke-antenna", signal: "rf", from: { instanceId: "choke", portId: "out" }, to: { instanceId: "antenna", portId: "feed" }, runId: "main-run", label: "choke-antenna" },
  ];
  revision.cableRuns = [{
    id: "main-run", label: "Main coax run", signal: "rf", baseCableInstanceId: "feedline", lengthMeters: kn(30.48, "m"),
    connections: [{ connectionId: "filter-choke", reverse: false }, { connectionId: "choke-antenna", reverse: false }],
    inlineItems: [{ instanceId: "choke", internalPathId: "through", reverse: false }], legacy: [],
  }];
  revision.routes[0].hops = [
    { kind: "connection", connectionId: "radio-amp", reverse: false },
    { kind: "internal", instanceId: "amplifier", internalPathId: "through", reverse: false },
    { kind: "connection", connectionId: "amp-filter", reverse: false },
    { kind: "internal", instanceId: "filter", internalPathId: "through", reverse: false },
    { kind: "connection", connectionId: "filter-choke", reverse: false },
    { kind: "internal", instanceId: "choke", internalPathId: "through", reverse: false },
    { kind: "connection", connectionId: "choke-antenna", reverse: false },
  ];
  return workbenchArchiveSchema.parse(archive);
}

export function createKnownSimpleFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  mate(archive.revisions[0].equipment[0], "antenna", "source", "output", "male");
  mate(archive.revisions[0].equipment[1], "feed", "load", "input", "female");
  radioCatalog(archive);
  antennaCatalog(archive);
  cableCatalog(archive);
  addEvidence(archive, [factoryReport, testedReport, gainMeasurement]);
  archive.revisions[0].settings.bandId = "20m";
  archive.revisions[0].settings.requestedPowerWatts = kn(200, "W");
  return workbenchArchiveSchema.parse(archive);
}

export function createKnownReceiveFixture(): WorkbenchArchive {
  const archive = createReceiveOnlyFixture();
  mate(archive.revisions[0].equipment[0], "antenna", "source", "output", "male");
  mate(archive.revisions[0].equipment[1], "feed", "load", "input", "female");
  radioCatalog(archive);
  archive.revisions[0].equipment[0].fields!["radio.customPowerLimit"] = kn(0, "W");
  archive.revisions[0].equipment[0].facts.powerLimit = kn(0, "W");
  const liveRadio = archive.inventory.find((item) => item.id === "radio");
  if (liveRadio) {
    liveRadio.fields = structuredClone(archive.revisions[0].equipment[0].fields);
    liveRadio.facts = structuredClone(archive.revisions[0].equipment[0].facts);
  }
  antennaCatalog(archive);
  cableCatalog(archive);
  addEvidence(archive, [factoryReport, testedReport, gainMeasurement]);
  archive.revisions[0].settings.bandId = "20m";
  archive.revisions[0].settings.requestedPowerWatts = kn(0, "W");
  return workbenchArchiveSchema.parse(archive);
}

export function createKnownSwitchFixture(): WorkbenchArchive {
  const archive = createSwitchedFixture();
  const revision = archive.revisions[0];
  mate(revision.equipment.find((item) => item.id === "radio")!, "antenna", "source", "output", "male");
  mate(revision.equipment.find((item) => item.id === "antenna")!, "feed", "load", "input", "female");
  mate(revision.equipment.find((item) => item.id === "antenna-b")!, "feed", "load", "input", "female");
  const selector = revision.equipment.find((item) => item.id === "switch")!;
  mate(selector, "common", "switch-common", "bidirectional", "female");
  mate(selector, "a", "switch-throw", "bidirectional", "male");
  mate(selector, "b", "switch-throw", "bidirectional", "male");
  accessoryFields(selector, "switch", { "accessory.insertionLossDb": kn(0.1, "dB"), "accessory.ports": kn(3, "count") });
  radioCatalog(archive);
  antennaCatalog(archive);
  const alternate = revision.equipment.find((item) => item.id === "antenna-b")!;
  alternate.fields = structuredClone(revision.equipment.find((item) => item.id === "antenna")!.fields);
  if (alternate.fields) {
    for (const field of Object.values(alternate.fields)) {
      if (field.state === "known") field.evidenceId = "declared";
    }
  }
  const liveAlternate = archive.inventory.find((item) => item.id === "antenna-b");
  if (liveAlternate) liveAlternate.fields = structuredClone(alternate.fields);
  cableCatalog(archive, 5);
  addEvidence(archive, [factoryReport, testedReport, gainMeasurement]);
  revision.settings.bandId = "20m";
  revision.settings.requestedPowerWatts = kn(75, "W");
  revision.routes.push({
    id: "antenna-b-route", name: "Alternate vertical", purpose: "transmit",
    hops: [
      { kind: "connection", connectionId: "radio-switch", reverse: false },
      { kind: "internal", instanceId: "switch", internalPathId: "select-b", reverse: false },
      { kind: "connection", connectionId: "switch-b", reverse: false },
    ],
    analysis: { state: "candidate" },
  });
  return workbenchArchiveSchema.parse(archive);
}

export function createExclusiveConflictFixture(): WorkbenchArchive {
  const archive = createKnownSwitchFixture();
  const revision = archive.revisions[0];
  revision.routes = [revision.routes[0]];
  revision.connections.push({
    id: "throw-jumper", signal: "rf", from: { instanceId: "switch", portId: "a" }, to: { instanceId: "switch", portId: "b" }, runId: null, label: "throw-jumper",
  });
  revision.routes[0].analysis = { state: "documentation-only", reasons: ["Exclusive switch paths both appear on one intended route"] };
  revision.routes[0].hops = [
    { kind: "connection", connectionId: "radio-switch", reverse: false },
    { kind: "internal", instanceId: "switch", internalPathId: "select-a", reverse: false },
    { kind: "connection", connectionId: "throw-jumper", reverse: false },
    { kind: "internal", instanceId: "switch", internalPathId: "select-b", reverse: true },
  ];
  archive.operating = null;
  return workbenchArchiveSchema.parse(archive);
}

export function createCycleFixture(): WorkbenchArchive {
  const archive = createKnownSimpleFixture();
  const revision = archive.revisions[0];
  const loop = revision.equipment.find((item) => item.id === "radio")!;
  loop.ports.push({
    id: "loop", label: "loop", signal: "rf", direction: "bidirectional", role: "through",
    connector: { state: "known", family: "n_type", gender: "female" }, ratings: {},
  });
  revision.connections.push({
    id: "return", signal: "rf", from: { instanceId: "antenna", portId: "feed" }, to: { instanceId: "radio", portId: "loop" }, runId: null, label: "return",
  });
  revision.routes[0].analysis = { state: "documentation-only", reasons: ["Closed RF loop is not an ordered engine chain"] };
  revision.routes[0].hops = [
    { kind: "connection", connectionId: "main-coax", reverse: false },
    { kind: "connection", connectionId: "return", reverse: false },
  ];
  archive.operating = null;
  return workbenchArchiveSchema.parse(archive);
}

export function createMismatchedConnectorFixture(): WorkbenchArchive {
  const archive = createKnownSimpleFixture();
  archive.revisions[0].equipment[1].ports[0].connector = { state: "known", family: "bnc", gender: "female" };
  return workbenchArchiveSchema.parse(archive);
}

export function createUnknownPortFixture(): WorkbenchArchive {
  return createHfFixture();
}

export function createZeroAndSignedFixture(): WorkbenchArchive {
  const archive = createEngineParityFixture();
  const filter = archive.revisions[0].equipment.find((item) => item.id === "filter")!;
  filter.fields!["accessory.insertionLossDb"] = kn(0, "dB");
  const antenna = archive.revisions[0].equipment.find((item) => item.id === "antenna")!;
  antenna.fields!["antenna.gain"] = kn(-2, "dBi");
  antenna.fields!["antenna.gainDbiOverride"] = { state: "known", value: { "20m": -2, "40m": -2 }, unit: "dBi", evidenceId: "declared" };
  antenna.facts.gain = kn(-2, "dBi");
  return workbenchArchiveSchema.parse(archive);
}

export function createKnownInlineRunsFixture(): WorkbenchArchive {
  const archive = createMultipleCableRunsFixture();
  const revision = archive.revisions[0];
  mate(revision.equipment.find((item) => item.id === "radio")!, "antenna", "source", "output", "male");
  mate(revision.equipment.find((item) => item.id === "antenna")!, "feed", "load", "input", "female");
  mate(revision.equipment.find((item) => item.id === "antenna-b")!, "feed", "load", "input", "female");
  const selector = revision.equipment.find((item) => item.id === "switch")!;
  mate(selector, "common", "switch-common", "bidirectional", "female");
  mate(selector, "a", "switch-throw", "bidirectional", "male");
  mate(selector, "b", "switch-throw", "bidirectional", "male");
  accessoryFields(selector, "switch", { "accessory.insertionLossDb": kn(0.1, "dB"), "accessory.ports": kn(3, "count") });
  for (const id of ["run-adapter", "run-choke"]) {
    const item = revision.equipment.find((entry) => entry.id === id)!;
    mate(item, "in", "through", "bidirectional", "female");
    mate(item, "out", "through", "bidirectional", "male");
    through(item, "in", "out");
    item.fields = id === "run-adapter"
      ? { "inline.componentType": kt("adapter"), "inline.insertionLossDb": kn(0.2, "dB"), "inline.connectorFrom": kt("n_type"), "inline.connectorTo": kt("n_type") }
      : { "inline.componentType": kt("choke"), "inline.insertionLossDb": kn(0.4, "dB"), "inline.chokeType": kt("common_mode") };
  }
  const pigtailLength = revision.equipment.find((item) => item.id === "run-adapter")!;
  pigtailLength.fields!["inline.length"] = kn(0.15, "m");
  radioCatalog(archive);
  antennaCatalog(archive);
  cableCatalog(archive, 3);
  const second = revision.equipment.find((item) => item.id === "antenna-cable")!;
  second.fields = {
    "feedline.feedlineType": kt("lmr400"), "feedline.length": kn(12.192, "m"),
    "feedline.connectorCount": kn(2, "count"), "feedline.connectorType": kt("n_type"), "feedline.condition": kt("new"),
  };
  addEvidence(archive, [factoryReport, testedReport, gainMeasurement]);
  revision.settings.bandId = "20m";
  revision.settings.requestedPowerWatts = kn(75, "W");
  return workbenchArchiveSchema.parse(archive);
}

export function createKnownLayersFixture(): WorkbenchArchive {
  const archive = createInlineAndLayersFixture();
  const revision = archive.revisions[0];
  mate(revision.equipment.find((item) => item.id === "radio")!, "antenna", "source", "output", "male");
  mate(revision.equipment.find((item) => item.id === "antenna")!, "feed", "load", "input", "female");
  const adapter = revision.equipment.find((item) => item.id === "adapter")!;
  mate(adapter, "in", "through", "bidirectional", "female");
  mate(adapter, "out", "through", "bidirectional", "male");
  adapter.fields = {
    "inline.componentType": kt("adapter"), "inline.insertionLossDb": kn(0.05, "dB"),
    "inline.connectorFrom": kt("n_type"), "inline.connectorTo": kt("n_type"),
  };
  radioCatalog(archive);
  antennaCatalog(archive);
  cableCatalog(archive);
  addEvidence(archive, [factoryReport, testedReport, gainMeasurement]);
  const spareAntenna = structuredClone(revision.equipment.find((item) => item.id === "antenna")!);
  spareAntenna.id = "spare-antenna";
  spareAntenna.label = "Spare antenna";
  if (spareAntenna.fields) {
    for (const field of Object.values(spareAntenna.fields)) {
      if (field.state === "known") field.evidenceId = "declared";
    }
  }
  spareAntenna.facts = {};
  archive.inventory.push(structuredClone(spareAntenna));
  revision.equipment.push(spareAntenna);
  revision.settings.bandId = "20m";
  return workbenchArchiveSchema.parse(archive);
}

export function createUnknownTunerLossFixture(): WorkbenchArchive {
  const archive = createEngineParityFixture();
  const filter = archive.revisions[0].equipment.find((item) => item.id === "filter")!;
  filter.fields = {
    "accessory.category": kt("tuner"),
    "accessory.tunerType": kt("automatic"),
    "accessory.maxPowerWatts": kn(200, "W"),
  };
  return workbenchArchiveSchema.parse(archive);
}

export function createPostAmpPowerRatingFixture(): WorkbenchArchive {
  const archive = createEngineParityFixture();
  const antenna = archive.revisions[0].equipment.find((item) => item.id === "antenna")!;
  antenna.ports[0].ratings["port.maxPower"] = kn(50, "W");
  return workbenchArchiveSchema.parse(archive);
}

export function createRadioCappedPowerRatingFixture(): WorkbenchArchive {
  const archive = createKnownSimpleFixture();
  const antenna = archive.revisions[0].equipment.find((item) => item.id === "antenna")!;
  antenna.ports[0].ratings["port.maxPower"] = kn(100, "W");
  return workbenchArchiveSchema.parse(archive);
}

export const analysisFixtureFactories = {
  engineParity: createEngineParityFixture,
  knownSimple: createKnownSimpleFixture,
  knownReceive: createKnownReceiveFixture,
  knownSwitch: createKnownSwitchFixture,
  exclusiveConflict: createExclusiveConflictFixture,
  cycle: createCycleFixture,
  mismatchedConnector: createMismatchedConnectorFixture,
  unknownPort: createUnknownPortFixture,
  zeroAndSigned: createZeroAndSignedFixture,
  knownInlineRuns: createKnownInlineRunsFixture,
  knownLayers: createKnownLayersFixture,
  unknownTunerLoss: createUnknownTunerLossFixture,
  postAmpPowerRating: createPostAmpPowerRatingFixture,
  radioCappedPowerRating: createRadioCappedPowerRatingFixture,
  unsupportedBranch: createUnsupportedBranchFixture,
};

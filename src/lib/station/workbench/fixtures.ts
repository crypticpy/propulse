import {
  type EquipmentInstance, type Evidence, type Quantity, type SetupRevision,
  type WorkbenchArchive, workbenchArchiveSchema,
} from "@/lib/station/workbench/contracts";

export const FIXTURE_OWNER = "fixture-owner";
export const FIXTURE_DATE = "2026-09-05T12:00:00Z";
export const unknownQuantity = (reason = "Not recorded"): Quantity => ({ state: "unknown", reason });
const known = (value: number, unit: string): Quantity => ({ state: "known", value, unit, evidenceId: "declared" });
const declared: Evidence = { id: "declared", ownerId: FIXTURE_OWNER, kind: "declared", source: "Synthetic fixture inputs", recordedAt: FIXTURE_DATE };

function equipment(id: string, label: string, portIds: string[]): EquipmentInstance {
  return {
    id, ownerId: FIXTURE_OWNER, modelId: null, label, kind: "other", lifecycle: "owned", addedAt: FIXTURE_DATE,
    ports: portIds.map((portId) => ({
      id: portId, label: portId, signal: "rf", direction: "bidirectional", role: "unknown",
      connector: { state: "unknown" }, ratings: {},
    })),
    internalPaths: [], facts: {}, privateMetadata: { receiptMediaIds: [], imageIds: [] }, legacy: [],
  };
}

const cable = (id: string, fromInstanceId: string, fromPortId: string, toInstanceId: string, toPortId: string): SetupRevision["connections"][number] => ({
  id, signal: "rf", from: { instanceId: fromInstanceId, portId: fromPortId },
  to: { instanceId: toInstanceId, portId: toPortId }, runId: null, label: id,
});
const connectionHop = (connectionId: string) => ({ kind: "connection" as const, connectionId, reverse: false });

/** Synthetic HF inputs; no product specification or clinical/installation validation claim. */
export function createHfFixture(): WorkbenchArchive {
  const radio = equipment("radio", "My HF transceiver", ["antenna"]);
  radio.modelId = "hf-model";
  radio.kind = "radio";
  radio.facts.powerLimit = known(100, "W");
  radio.privateMetadata = { serialNumber: "PRIVATE-SERIAL", notes: "Private workshop notes", imageIds: ["private-photo"], receiptMediaIds: ["private-receipt"] };
  const antenna = equipment("antenna", "Home-built dipole", ["feed"]);
  antenna.kind = "antenna";
  antenna.facts.gain = unknownQuantity("No measurement or model selected");
  const feedline = equipment("feedline", "My coax run", []);
  feedline.kind = "cable";
  const inventory = [radio, antenna, feedline];
  const location: WorkbenchArchive["locations"][number] = {
    id: "home", ownerId: FIXTURE_OWNER, label: "Home", kind: "home",
    coordinates: { latitude: 40, longitude: -90 }, grid: "EN50", privateNotes: "Synthetic exact location",
    timezone: "America/Chicago", createdAt: FIXTURE_DATE, legacy: [],
  };
  const model: WorkbenchArchive["models"][number] = {
    id: "hf-model", origin: "custom", name: "Custom HF radio", kind: "radio",
    portTemplates: structuredClone(radio.ports), specifications: { maxPower: known(100, "W") },
  };
  const revision: SetupRevision = {
    id: "home-r1", ownerId: FIXTURE_OWNER, setupId: "home-hf", parentRevisionId: null,
    createdAt: FIXTURE_DATE, equipment: structuredClone(inventory), models: [structuredClone(model)],
    evidence: [structuredClone(declared)], location: structuredClone(location),
    connections: [{ ...cable("main-coax", "radio", "antenna", "antenna", "feed"), runId: "main-run" }],
    cableRuns: [{ id: "main-run", label: "Main coax run", signal: "rf", baseCableInstanceId: "feedline", lengthMeters: unknownQuantity(), connections: [{ connectionId: "main-coax", reverse: false }], inlineItems: [], legacy: [] }],
    routes: [{ id: "main", name: "Home HF", purpose: "transmit", hops: [connectionHop("main-coax")], analysis: { state: "candidate" } }],
    settings: { frequencyHz: known(14_200_000, "Hz"), requestedPowerWatts: known(100, "W"), mode: "SSB" }, notes: "Synthetic HF route",
  };
  return workbenchArchiveSchema.parse({
    schemaVersion: 1, ownerId: FIXTURE_OWNER, models: [model], inventory, evidence: [declared],
    locations: [location], setups: [{ id: "home-hf", ownerId: FIXTURE_OWNER, name: "Home HF", locationId: "home", draftRevisionId: "home-r1", archivedAt: null, legacy: [] }],
    revisions: [revision], layouts: [{
      id: "home-diagram", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1", view: "diagram",
      positions: [{ instanceId: "radio", x: 0, y: 0, groupId: null }, { instanceId: "antenna", x: 300, y: 0, groupId: null }],
      groups: [], viewport: { x: 0, y: 0, zoom: 1 },
    }], experiments: [], publications: [], operating: { ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1", routeId: "main", reviewedAt: FIXTURE_DATE, intent: "use-in-propulse" },
  });
}

export function createPortableSharedFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  archive.locations.push({ id: "park", ownerId: FIXTURE_OWNER, label: "Portable site", kind: "pota", coordinates: null, activationRef: "SYNTHETIC-1", createdAt: FIXTURE_DATE, legacy: [] });
  const portable = structuredClone(archive.revisions[0]);
  portable.id = "portable-r1";
  portable.setupId = "portable";
  portable.location = structuredClone(archive.locations[1]);
  portable.settings.requestedPowerWatts = known(5, "W");
  // These are the same physical instance IDs, with separately pinned setup inputs.
  archive.setups.push({ id: "portable", ownerId: FIXTURE_OWNER, name: "Portable kit", locationId: "park", draftRevisionId: portable.id, archivedAt: null, legacy: [] });
  archive.revisions.push(portable);
  return workbenchArchiveSchema.parse(archive);
}

export function createReceiveOnlyFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  const revision = archive.revisions[0];
  revision.routes[0].purpose = "receive";
  revision.routes[0].hops[0].reverse = true;
  revision.settings.requestedPowerWatts = known(0, "W");
  revision.equipment[0].facts.powerLimit = known(0, "W");
  revision.equipment[0].label = "Receive-only SDR";
  return workbenchArchiveSchema.parse(archive);
}

export function createSwitchedFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  const selector = equipment("switch", "Two-position antenna switch", ["common", "a", "b"]);
  selector.kind = "accessory";
  selector.ports[0].role = "switch-common";
  selector.ports[1].role = "switch-throw";
  selector.ports[2].role = "switch-throw";
  selector.internalPaths = ["a", "b"].map((portId) => ({ id: `select-${portId}`, fromPortId: "common", toPortId: portId, signal: "rf", exclusiveGroupId: "antenna-selector" }));
  const second = equipment("antenna-b", "Alternate vertical", ["feed"]);
  second.kind = "antenna";
  archive.inventory.push(selector, second);
  const revision = archive.revisions[0];
  revision.equipment.push(structuredClone(selector), structuredClone(second));
  revision.connections = [
    { ...cable("radio-switch", "radio", "antenna", "switch", "common"), runId: "main-run" },
    cable("switch-a", "switch", "a", "antenna", "feed"),
    cable("switch-b", "switch", "b", "antenna-b", "feed"),
  ];
  revision.cableRuns[0].connections = [{ connectionId: "radio-switch", reverse: false }];
  revision.routes[0].hops = [connectionHop("radio-switch"), { kind: "internal", instanceId: "switch", internalPathId: "select-a", reverse: false }, connectionHop("switch-a")];
  return workbenchArchiveSchema.parse(archive);
}

export function createInlineAndLayersFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  const adapter = equipment("adapter", "Custom inline adapter", ["in", "out"]);
  adapter.kind = "inline";
  adapter.internalPaths = [{ id: "through", fromPortId: "in", toPortId: "out", signal: "rf" }];
  const supply = equipment("supply", "Station supply", ["dc"]);
  supply.ports[0].signal = "power";
  const audio = equipment("audio", "Audio processor", ["audio-out"]);
  audio.ports[0].signal = "audio";
  const controller = equipment("controller", "Station controller", ["control-out"]);
  controller.ports[0].signal = "control";
  const bond = equipment("bond", "Recorded bonding point", ["bond"]);
  bond.ports[0].signal = "bonding";
  archive.inventory.push(adapter, supply, audio, controller, bond);
  const revision = archive.revisions[0];
  revision.equipment.push(...structuredClone([adapter, supply, audio, controller, bond]));
  revision.connections = [
    { ...cable("before-adapter", "radio", "antenna", "adapter", "in"), runId: "main-run" },
    { ...cable("after-adapter", "adapter", "out", "antenna", "feed"), runId: "main-run" },
  ];
  revision.cableRuns[0].connections = [{ connectionId: "before-adapter", reverse: false }, { connectionId: "after-adapter", reverse: false }];
  revision.cableRuns[0].inlineItems = [{ instanceId: "adapter", internalPathId: "through", reverse: false }];
  revision.routes[0].hops = [connectionHop("before-adapter"), { kind: "internal", instanceId: "adapter", internalPathId: "through", reverse: false }, connectionHop("after-adapter")];
  for (const item of [supply, audio, controller, bond]) {
    const port = { ...structuredClone(item.ports[0]), id: `${item.id}-input` };
    archive.inventory[0].ports.push(structuredClone(port));
    revision.equipment[0].ports.push(port);
    revision.connections.push({
      ...cable(`${item.id}-documentation`, item.id, item.ports[0].id, "radio", port.id),
      signal: port.signal,
    });
  }
  const unwired = equipment("spare-accessory", "Unwired station accessory", []);
  unwired.kind = "accessory";
  archive.inventory.push(unwired);
  revision.equipment.push(structuredClone(unwired));
  // Membership without wiring is intentional: accessories must not disappear from a setup.
  return workbenchArchiveSchema.parse(archive);
}

export function createUnknownLegacyFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  archive.models[0].origin = "legacy";
  archive.inventory[0].facts.powerLimit = unknownQuantity("Legacy value lacked reliable provenance");
  archive.inventory[0].legacy = [{ kind: "radio", sourceId: "radio", sourceVersion: 24, payload: {
    id: "radio", equipmentId: "hf-model", notes: "Keep me", imageId: "old-image", futureField: { nested: [false, 0, null, "verbatim"] },
  } }];
  archive.revisions[0].equipment = structuredClone(archive.inventory);
  archive.revisions[0].models = structuredClone(archive.models);
  archive.revisions[0].settings.requestedPowerWatts = unknownQuantity();
  archive.operating = null;
  return workbenchArchiveSchema.parse(archive);
}

export function createUnsupportedBranchFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  const second = equipment("branch-antenna", "Undocumented branch antenna", ["feed"]);
  second.kind = "antenna";
  archive.inventory.push(second);
  archive.revisions[0].equipment.push(structuredClone(second));
  archive.revisions[0].connections.push(cable("unknown-branch", "radio", "antenna", "branch-antenna", "feed"));
  archive.revisions[0].routes[0].analysis = { state: "documentation-only", reasons: ["Multiple connections on one RF port; no modeled splitter or selected switch path"] };
  archive.operating = null;
  return workbenchArchiveSchema.parse(archive);
}

export function createExperimentFixture(): WorkbenchArchive {
  const archive = createHfFixture();
  const candidate = structuredClone(archive.revisions[0]);
  candidate.id = "home-r2";
  candidate.parentRevisionId = "home-r1";
  candidate.settings.requestedPowerWatts = known(5, "W");
  archive.revisions.push(candidate);
  archive.setups[0].draftRevisionId = candidate.id;
  archive.experiments.push({
    id: "qrp-comparison", ownerId: FIXTURE_OWNER, name: "Try five watts", baselineRevisionId: "home-r1", candidateRevisionId: "home-r2",
    comparison: { frequencyHz: 14_200_000, requestedPowerWatts: 5, mode: "SSB" },
    assumptions: [{ instanceId: "radio", field: "powerLimit", value: 5, unit: "W", rationale: "Hypothetical QRP setting" }],
    notes: "Scenario only", promotionDefault: "save-as-new-setup",
  });
  return workbenchArchiveSchema.parse(archive);
}

/** Two stable insertion targets; the second has a preserved ordered adapter/choke assembly. */
export function createMultipleCableRunsFixture(): WorkbenchArchive {
  const archive = createSwitchedFixture();
  const adapter = equipment("run-adapter", "Adapter on antenna A run", ["in", "out"]);
  const choke = equipment("run-choke", "Choke after adapter", ["in", "out"]);
  for (const item of [adapter, choke]) {
    item.kind = "inline";
    item.internalPaths = [{ id: "through", fromPortId: "in", toPortId: "out", signal: "rf" }];
  }
  const secondCable = equipment("antenna-cable", "Antenna A coax", []);
  secondCable.kind = "cable";
  archive.inventory.push(adapter, choke, secondCable);
  const revision = archive.revisions[0];
  revision.equipment.push(...structuredClone([adapter, choke, secondCable]));
  revision.connections = [revision.connections[0], revision.connections[2],
    { ...cable("a-before", "switch", "a", "run-adapter", "in"), runId: "legacy-run-a" },
    { ...cable("a-middle", "run-adapter", "out", "run-choke", "in"), runId: "legacy-run-a" },
    { ...cable("a-after", "run-choke", "out", "antenna", "feed"), runId: "legacy-run-a" },
  ];
  revision.cableRuns.push({
    id: "legacy-run-a", label: "Antenna A assembly", signal: "rf", baseCableInstanceId: "antenna-cable", lengthMeters: known(12.192, "m"),
    connections: ["a-before", "a-middle", "a-after"].map((connectionId) => ({ connectionId, reverse: false })),
    inlineItems: [adapter, choke].map((item) => ({ instanceId: item.id, internalPathId: "through", reverse: false })),
    legacy: [{ kind: "feedline-run", sourceId: "legacy-run-a", sourceVersion: 24, payload: { id: "legacy-run-a", feedlineId: "antenna-cable", inlineComponentIds: ["run-adapter", "run-choke"], originalLengthFeet: 40 } }],
  });
  revision.routes[0].hops = [
    revision.routes[0].hops[0], revision.routes[0].hops[1], connectionHop("a-before"),
    { kind: "internal", instanceId: "run-adapter", internalPathId: "through", reverse: false }, connectionHop("a-middle"),
    { kind: "internal", instanceId: "run-choke", internalPathId: "through", reverse: false }, connectionHop("a-after"),
  ];
  return workbenchArchiveSchema.parse(archive);
}

export const workbenchFixtureFactories = {
  hf: createHfFixture, portableShared: createPortableSharedFixture, receiveOnly: createReceiveOnlyFixture,
  switched: createSwitchedFixture, inlineAndLayers: createInlineAndLayersFixture,
  unknownLegacy: createUnknownLegacyFixture, unsupportedBranch: createUnsupportedBranchFixture,
  experiment: createExperimentFixture, multipleCableRuns: createMultipleCableRunsFixture,
};

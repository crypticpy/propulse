import { describe, expect, it } from "vitest";
import {
  evidenceSchema, experimentSchema, parseWorkbenchArchive, publishedProfileSchema,
  quantitySchema, workbenchArchiveSchema,
} from "@/lib/station/workbench/contracts";
import {
  createExperimentFixture, createHfFixture, createInlineAndLayersFixture, createPortableSharedFixture,
  createReceiveOnlyFixture, createSwitchedFixture, createUnsupportedBranchFixture,
  FIXTURE_DATE, FIXTURE_OWNER, workbenchFixtureFactories,
} from "@/lib/station/workbench/fixtures";
import { captureLegacyRecord, proposeLegacyRadio } from "@/lib/station/workbench/legacy";

describe("station workbench W01 contracts", () => {
  it.each(Object.entries(workbenchFixtureFactories))("validates the %s fixture", (_name, create) => {
    expect(workbenchArchiveSchema.safeParse(create()).success).toBe(true);
  });

  it("keeps unknown distinct from a real zero, and rejects non-finite or implicit values", () => {
    expect(quantitySchema.parse({ state: "unknown", reason: "Not measured" })).not.toHaveProperty("value");
    expect(quantitySchema.parse({ state: "known", value: 0, unit: "dB", evidenceId: "source" })).toHaveProperty("value", 0);
    for (const value of [NaN, Infinity, -Infinity, "0", null, undefined]) {
      expect(quantitySchema.safeParse({ state: "known", value, unit: "W", evidenceId: "source" }).success).toBe(false);
    }
    expect(quantitySchema.safeParse({ state: "unknown", reason: "Missing", value: 0 }).success).toBe(false);
  });

  it.each(["MHz", "kHz"])("rejects %s where canonical frequency Hz is required", (unit) => {
    const archive = createHfFixture();
    archive.revisions[0].settings.frequencyHz = { state: "known", value: 14.2, unit, evidenceId: "declared" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("pins equipment, models, location and evidence independently of inventory and draft", () => {
    const archive = createExperimentFixture();
    const baseline = structuredClone(archive.revisions[0]);
    archive.inventory[0].label = "Renamed shared radio";
    archive.models[0].specifications.maxPower = { state: "known", value: 200, unit: "W", evidenceId: "declared" };
    archive.locations[0].coordinates = { latitude: 10, longitude: 20 };
    archive.evidence[0].source = "New declaration";
    archive.revisions[1].notes = "New draft";
    const parsed = parseWorkbenchArchive(archive);
    expect(parsed.revisions[0]).toEqual(baseline);
    expect(parsed.operating?.revisionId).toBe("home-r1");
    expect(parsed.setups[0].draftRevisionId).toBe("home-r2");
    expect(Object.isFrozen(parsed.revisions[0].equipment[0].privateMetadata)).toBe(true);
    expect(Object.isFrozen(parsed.revisions[0].models[0])).toBe(true);
    expect(Object.isFrozen(parsed.revisions[0].location?.coordinates)).toBe(true);
    archive.revisions[0].equipment[0].label = "Mutation of caller input";
    expect(parsed.revisions[0].equipment[0].label).toBe(baseline.equipment[0].label);
  });

  it("keeps canvas and rack layout independent from connectivity and operating selection", () => {
    const archive = createHfFixture();
    const topology = structuredClone(archive.revisions);
    const operating = structuredClone(archive.operating);
    archive.layouts[0].positions[0].x = 1000;
    archive.layouts.push({ ...structuredClone(archive.layouts[0]), id: "rack", view: "rack" });
    const parsed = parseWorkbenchArchive(archive);
    expect(parsed.revisions).toEqual(topology);
    expect(parsed.operating).toEqual(operating);
    expect(parsed.layouts).toHaveLength(2);
  });

  it("shares physical identities without sharing mutable setup snapshots", () => {
    const archive = createPortableSharedFixture();
    expect(archive.inventory.filter((item) => item.id === "radio")).toHaveLength(1);
    expect(archive.revisions[1].equipment[0].id).toBe(archive.revisions[0].equipment[0].id);
    archive.revisions[1].equipment[0].label = "Portable nickname";
    expect(archive.revisions[0].equipment[0].label).toBe("My HF transceiver");
  });

  it("records receive-only route orientation and a known zero transmit power", () => {
    const archive = createReceiveOnlyFixture();
    expect(archive.revisions[0].routes[0]).toMatchObject({ purpose: "receive", hops: [{ reverse: true }] });
    expect(archive.revisions[0].settings.requestedPowerWatts).toMatchObject({ state: "known", value: 0 });
  });

  it.each([
    ["connection endpoint", (a: ReturnType<typeof createHfFixture>) => { a.revisions[0].connections[0].to.portId = "missing"; }],
    ["inventory identity", (a: ReturnType<typeof createHfFixture>) => { a.inventory.pop(); }],
    ["pinned model", (a: ReturnType<typeof createHfFixture>) => { a.revisions[0].models = []; }],
    ["pinned evidence", (a: ReturnType<typeof createHfFixture>) => { a.revisions[0].evidence = []; }],
    ["location identity", (a: ReturnType<typeof createHfFixture>) => { a.locations = []; }],
    ["layout member", (a: ReturnType<typeof createHfFixture>) => { a.layouts[0].positions[0].instanceId = "missing"; }],
    ["operating revision", (a: ReturnType<typeof createHfFixture>) => { a.operating!.revisionId = "missing"; }],
    ["cross-owner snapshot", (a: ReturnType<typeof createHfFixture>) => { a.revisions[0].equipment[0].ownerId = "someone-else"; }],
    ["duplicate instance", (a: ReturnType<typeof createHfFixture>) => { a.inventory.push(structuredClone(a.inventory[0])); }],
    ["ancestry cycle", (a: ReturnType<typeof createHfFixture>) => { a.revisions[0].parentRevisionId = a.revisions[0].id; }],
    ["non-cable instance", (a: ReturnType<typeof createHfFixture>) => { a.revisions[0].cableRuns[0].baseCableInstanceId = "radio"; }],
  ])("rejects %s corruption", (_name, corrupt) => {
    const archive = createHfFixture();
    corrupt(archive);
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("requires a continuous selected path through the actual switch ports", () => {
    const archive = createSwitchedFixture();
    const route = archive.revisions[0].routes[0];
    const selection = route.hops[1];
    if (selection.kind !== "internal") throw new Error("Fixture requires switch hop");
    selection.internalPathId = "select-b";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    route.hops[2] = { kind: "connection", connectionId: "switch-b", reverse: false };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    expect(route).not.toHaveProperty("hardwareState");
  });

  it("retains conflicting switch intent as documentation while withholding operating eligibility", () => {
    const archive = createSwitchedFixture();
    const route = archive.revisions[0].routes[0];
    route.hops = [
      { kind: "internal", instanceId: "switch", internalPathId: "select-a", reverse: true },
      { kind: "internal", instanceId: "switch", internalPathId: "select-b", reverse: false },
    ];
    const candidate = workbenchArchiveSchema.safeParse(archive);
    expect(candidate.success).toBe(false);
    if (!candidate.success) expect(candidate.error.issues.some((issue) => issue.message.includes("Exclusive route conflict"))).toBe(true);
    route.analysis = { state: "documentation-only", reasons: ["Exclusive switch positions cannot be selected together"] };
    archive.operating = null;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    archive.operating = createHfFixture().operating;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("keeps unmodeled branch documentation but rejects use and unsupported candidate claims", () => {
    const archive = createUnsupportedBranchFixture();
    expect(archive.revisions[0].connections).toHaveLength(2);
    archive.operating = createHfFixture().operating;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    archive.operating = null;
    archive.revisions[0].routes[0].analysis = { state: "candidate" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("retains conflicting switch intent as documentation while blocking its use", () => {
    const archive = createSwitchedFixture();
    const revision = archive.revisions[0];
    revision.connections = [revision.connections[0], {
      ...revision.connections[1], id: "loop", from: { instanceId: "switch", portId: "a" }, to: { instanceId: "switch", portId: "b" },
    }];
    revision.routes[0].hops = [
      revision.routes[0].hops[0], revision.routes[0].hops[1],
      { kind: "connection", connectionId: "loop", reverse: false },
      { kind: "internal", instanceId: "switch", internalPathId: "select-b", reverse: true },
    ];
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    revision.routes[0].analysis = { state: "documentation-only", reasons: ["Conflicting paths through one exclusive switch group"] };
    archive.operating = null;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    archive.operating = createHfFixture().operating;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("preserves accessories without connections and rejects non-RF calculation hops", () => {
    const archive = createInlineAndLayersFixture();
    expect(archive.revisions[0].equipment.map((item) => item.id)).toEqual(expect.arrayContaining(["supply", "audio", "controller", "bond"]));
    const revision = archive.revisions[0];
    revision.equipment.find((item) => item.id === "radio")!.ports[0].signal = "power";
    revision.equipment.find((item) => item.id === "adapter")!.ports[0].signal = "power";
    revision.connections[0].signal = "power";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("requires measured context and prevents assumptions from being submitted as measurements", () => {
    const measured = {
      id: "swr-check", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Synthetic analyzer",
      observedAt: FIXTURE_DATE, quantityKind: "swr", context: { kind: "rf", frequencyHz: 14_200_000 },
      reading: { value: 1.4, unit: "ratio" },
      point: { kind: "port", instanceId: "antenna", portId: "feed" }, method: "Analyzer at antenna feedpoint",
    };
    expect(evidenceSchema.safeParse(measured).success).toBe(true);
    expect(evidenceSchema.safeParse({ ...measured, observedAt: undefined }).success).toBe(false);
    const archive = createHfFixture();
    archive.revisions[0].evidence.push(evidenceSchema.parse(measured));
    archive.revisions[0].equipment[1].facts.swr = { state: "known", value: 1.4, unit: "ratio", evidenceId: "swr-check" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    archive.revisions[0].equipment[1].facts.swr = { state: "known", value: 1.5, unit: "ratio", evidenceId: "swr-check" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    archive.revisions[0].equipment[1].facts.swr = { state: "known", value: 1.4, unit: "ratio", evidenceId: "swr-check" };
    const pointEvidence = archive.revisions[0].evidence[1];
    if (pointEvidence.kind !== "measurement") throw new Error("Expected measurement");
    pointEvidence.context = { kind: "not-applicable", reason: "No RF context" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    pointEvidence.quantityKind = "other";
    pointEvidence.reading = { value: 10, unit: "m" };
    pointEvidence.point = { kind: "equipment", instanceId: "antenna", description: "Height above ground" };
    archive.revisions[0].equipment[1].facts = { height: { state: "known", value: 10, unit: "m", evidenceId: "swr-check" } };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    const experiment = createExperimentFixture().experiments[0];
    expect(experimentSchema.safeParse({ ...experiment, assumptions: [{ ...experiment.assumptions[0], kind: "measurement" }] }).success).toBe(false);
  });

  it("retains location metadata in a pinned snapshot and private recovery envelope", () => {
    const archive = createPortableSharedFixture();
    archive.locations[1].legacy = [{ kind: "location", sourceId: "park", sourceVersion: 1, payload: { timezone: "America/Chicago", activationRef: "SYNTHETIC-1", type: "pota", createdAt: FIXTURE_DATE, futureField: true } }];
    archive.revisions[1].location = structuredClone(archive.locations[1]);
    const original = structuredClone(archive.revisions[1].location);
    archive.locations[1].activationRef = "SYNTHETIC-2";
    expect(parseWorkbenchArchive(archive).revisions[1].location).toEqual(original);
  });

  it("pins publication lineage independently of the draft and operating choice", () => {
    const archive = createExperimentFixture();
    archive.publications.push({ id: "showcase", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1", audience: "visitor", publicationVersion: 1, reviewedAt: FIXTURE_DATE });
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    expect(archive.publications[0].revisionId).not.toBe(archive.setups[0].draftRevisionId);
    archive.publications[0].ownerId = "another-owner";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    archive.publications[0].ownerId = FIXTURE_OWNER;
    archive.publications[0].revisionId = "missing";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("strict public output cannot accidentally spread private inventory or location fields", () => {
    const publicProfile = {
      id: "public", ownerId: FIXTURE_OWNER, publicationVersion: 1, audience: "visitor", displayName: "Test operator",
      biography: "Enjoys portable operating", featuredSetup: { title: "Portable", equipmentLabels: ["HF rig"], description: "A small station" },
      regionLabel: "Midwest", publicMediaIds: ["public-derivative"], modules: [],
    };
    expect(publishedProfileSchema.safeParse(publicProfile).success).toBe(true);
    for (const field of ["privateMetadata", "legacy", "coordinates", "privateImageId", "inventory"]) {
      expect(publishedProfileSchema.safeParse({ ...publicProfile, [field]: createHfFixture().inventory[0] }).success).toBe(false);
    }
    expect(publishedProfileSchema.safeParse({ ...publicProfile, featuredSetup: { ...publicProfile.featuredSetup, serialNumber: "PRIVATE" } }).success).toBe(false);
  });

  it("retains all legacy metadata and unknown fields in private recovery while mapping radio fields", () => {
    const raw = {
      id: "old-radio", equipmentId: "custom-radio", nickname: "My rig", customPowerLimit: 0, addedAt: FIXTURE_DATE,
      purchaseDate: "2020-01-01", purchaseLocation: "Local shop", firmwareRevision: "v1.2", wiringConfiguration: "CAT and audio",
      notes: "Service notes", imageId: "cover", galleryImageIds: ["extra", "cover"], specPreference: "tested",
      futureField: { nested: [false, 0, null, "retained"] },
    };
    const mapped = proposeLegacyRadio(raw, FIXTURE_OWNER, 24);
    expect(mapped.instance.legacy[0].payload).toEqual(raw);
    expect(mapped.instance.privateMetadata).toMatchObject({ notes: "Service notes", imageIds: ["cover", "extra"], specPreference: "tested", wiringConfiguration: "CAT and audio" });
    expect(mapped.instance.facts.powerLimit).toMatchObject({ state: "known", value: 0 });
    expect(mapped.evidence[0].kind).toBe("declared");
    expect(mapped.instance.ports).toEqual([]);
    raw.futureField.nested.push("later mutation");
    expect(mapped.instance.legacy[0].payload).not.toEqual(raw);
    const unknown = proposeLegacyRadio({ id: "old", equipmentId: "model", addedAt: FIXTURE_DATE }, FIXTURE_OWNER, 24);
    expect(unknown.instance.facts.powerLimit.state).toBe("unknown");
    expect(unknown.evidence).toEqual([]);
    expect(captureLegacyRecord({ kind: "chain", sourceId: "broken", sourceVersion: 24, payload: { nodes: [{ missingRadioId: "lost" }], media: ["keep"] } }).payload).toEqual({ nodes: [{ missingRadioId: "lost" }], media: ["keep"] });
  });
});

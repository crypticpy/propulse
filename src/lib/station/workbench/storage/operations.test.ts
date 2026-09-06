import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExperimentFixture, createHfFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import {
  prepareStationOperation, stationOperationDraftSchema, stationOperationSchema, verifyStationOperation,
  type StationOperationDraft, type StationVersionedRecord,
} from "@/lib/station/workbench/storage/operations";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

function fromRecords(records: StationVersionedRecord[]): StationOperationDraft {
  const setupIds = new Set(records.flatMap((record) => record.kind === "revision" ? [record.body.setupId] : record.kind === "setup" ? [record.id] : []));
  const expectedHeads: StationOperationDraft["expectedHeads"] = records.map(({ kind, id }) => ({ kind, id, versionId: null }));
  for (const id of setupIds) {
    if (!expectedHeads.some((head) => head.kind === "setup" && head.id === id)) expectedHeads.push({ kind: "setup", id, versionId: null });
  }
  return {
    schemaVersion: 1, operationId: "operation-1", ownerId: FIXTURE_OWNER, generationId: "generation-1", createdAt: FIXTURE_DATE,
    expectedHeads, records, nextHeads: records.map(({ kind, id, versionId }) => ({ kind, id, versionId })), tombstones: [],
    setupDraftPreconditions: [...setupIds].map((setupId) => ({ setupId, revisionId: null })),
  };
}
function locationDraft(): StationOperationDraft {
  const body = createHfFixture().locations[0];
  return fromRecords([{ kind: "location", id: body.id, versionId: "location-v1", body }]);
}
function setupDraft(): StationOperationDraft {
  const archive = createHfFixture();
  return fromRecords([
    { kind: "setup", id: archive.setups[0].id, versionId: "setup-v1", body: archive.setups[0] },
    { kind: "revision", id: archive.revisions[0].id, versionId: archive.revisions[0].id, body: archive.revisions[0] },
  ]);
}

beforeEach(() => vi.stubGlobal("crypto", webcrypto));

describe("station operation envelope", () => {
  it("accepts the existing typed bodies for every currently writable entity kind", async () => {
    const archive = createHfFixture();
    const records: StationVersionedRecord[] = [
      { kind: "model", id: archive.models[0].id, versionId: "model-v1", body: archive.models[0] },
      { kind: "equipment", id: archive.inventory[0].id, versionId: "equipment-v1", body: archive.inventory[0] },
      { kind: "evidence", id: archive.evidence[0].id, versionId: "evidence-v1", body: archive.evidence[0] },
      { kind: "location", id: archive.locations[0].id, versionId: "location-v1", body: archive.locations[0] },
      ...setupDraft().records,
      { kind: "layout", id: archive.layouts[0].id, versionId: "layout-v1", body: archive.layouts[0] },
      { kind: "experiment", id: "qrp-comparison", versionId: "experiment-v1", body: createExperimentFixture().experiments[0] },
    ];
    const operation = await prepareStationOperation(fromRecords(records));
    expect(operation.records.map((record) => record.kind)).toEqual(["model", "equipment", "evidence", "location", "setup", "revision", "layout", "experiment"]);
    expect(await verifyStationOperation(operation)).toEqual(operation);
  });

  it("rejects outer/inner IDs and owner disagreement, including pinned snapshot members", () => {
    const wrongId = locationDraft();
    Object.assign(wrongId.records[0].body, { id: "different" });
    expect(() => stationOperationDraftSchema.parse(wrongId)).toThrow("body ID");
    const wrongOwner = locationDraft();
    wrongOwner.ownerId = "other-account";
    expect(() => stationOperationDraftSchema.parse(wrongOwner)).toThrow("body owner");
    for (const target of ["equipment", "evidence", "location"] as const) {
      const draft = setupDraft();
      const record = draft.records.find((item) => item.kind === "revision")!;
      if (target === "location") record.body.location!.ownerId = "other-account";
      else record.body[target][0].ownerId = "other-account";
      expect(() => stationOperationDraftSchema.parse(draft)).toThrow("owner mismatch");
    }
  });

  it("keeps a model's owner implicit in the envelope and rejects invented owner fields", () => {
    const body = createHfFixture().models[0];
    const draft = fromRecords([{ kind: "model", id: body.id, versionId: "model-v1", body }]);
    expect(stationOperationDraftSchema.parse(draft).ownerId).toBe(FIXTURE_OWNER);
    Object.assign(draft.records[0].body, { ownerId: FIXTURE_OWNER });
    expect(() => stationOperationDraftSchema.parse(draft)).toThrow();
  });

  it.each(["expectedHeads", "records", "nextHeads"] as const)("rejects duplicate %s targets", (collection) => {
    const draft = locationDraft();
    // Preserve the correlated array element type while making an actual duplicate.
    if (collection === "records") draft.records.push(structuredClone(draft.records[0]));
    else if (collection === "expectedHeads") draft.expectedHeads.push(structuredClone(draft.expectedHeads[0]));
    else draft.nextHeads.push(structuredClone(draft.nextHeads[0]));
    expect(() => stationOperationDraftSchema.parse(draft)).toThrow(`Duplicate ${collection}`);
  });

  it("requires reciprocal exact record/head versions and a fresh head token", () => {
    const missingExpectation = locationDraft();
    missingExpectation.expectedHeads = [];
    expect(() => stationOperationDraftSchema.parse(missingExpectation)).toThrow("expectation");
    const orphanRecord = locationDraft();
    orphanRecord.nextHeads = [];
    expect(() => stationOperationDraftSchema.parse(orphanRecord)).toThrow("matching next head");
    const missingRecord = locationDraft();
    missingRecord.records = [];
    expect(() => stationOperationDraftSchema.parse(missingRecord)).toThrow("matching submitted typed record");
    const wrongVersion = locationDraft();
    wrongVersion.nextHeads[0].versionId = "another-version";
    expect(() => stationOperationDraftSchema.parse(wrongVersion)).toThrow("matching");
    const reusedToken = locationDraft();
    reusedToken.expectedHeads[0].versionId = reusedToken.nextHeads[0].versionId;
    expect(() => stationOperationDraftSchema.parse(reusedToken)).toThrow("new version token");
  });

  it("accepts additional read expectations, including gated kinds, with collision-safe opaque IDs", () => {
    const draft = locationDraft();
    draft.expectedHeads.push(
      { kind: "operating", id: "operating", versionId: "use-v1" },
      { kind: "publication-source", id: "source:1", versionId: null },
      { kind: "model", id: "equipment:thing", versionId: "model-head" },
      { kind: "equipment", id: "model:thing", versionId: "equipment-head" },
    );
    expect(stationOperationDraftSchema.parse(draft).expectedHeads).toHaveLength(5);
    draft.expectedHeads[1].id = "not-the-singleton";
    expect(() => stationOperationDraftSchema.parse(draft)).toThrow("singleton");
  });

  it("enforces immutable revision ID/version identity", () => {
    const draft = setupDraft();
    const record = draft.records.find((item) => item.kind === "revision")!;
    record.versionId = "replacement-version";
    draft.nextHeads.find((head) => head.kind === "revision")!.versionId = record.versionId;
    expect(() => stationOperationDraftSchema.parse(draft)).toThrow("Immutable revision ID");
  });

  it("binds W03 semantic draft preconditions separately from setup storage versions", () => {
    const draft = setupDraft();
    const revision = draft.records.find((item) => item.kind === "revision")!;
    revision.body.parentRevisionId = "prior-r1";
    revision.body.transition = { kind: "edit" };
    draft.setupDraftPreconditions[0].revisionId = "prior-r1";
    draft.expectedHeads.find((head) => head.kind === "setup")!.versionId = "setup-prior-storage-token";
    expect(stationOperationDraftSchema.parse(draft).setupDraftPreconditions[0].revisionId).toBe("prior-r1");
    const missing = structuredClone(draft);
    missing.setupDraftPreconditions = [];
    expect(() => stationOperationDraftSchema.parse(missing)).toThrow("precondition");
    const wrongParent = structuredClone(draft);
    wrongParent.setupDraftPreconditions[0].revisionId = "other-r1";
    expect(() => stationOperationDraftSchema.parse(wrongParent)).toThrow("Revision parent");
    const wrongAbsence = structuredClone(draft);
    wrongAbsence.setupDraftPreconditions[0].revisionId = null;
    expect(() => stationOperationDraftSchema.parse(wrongAbsence)).toThrow("absence");
    const duplicate = structuredClone(draft);
    duplicate.setupDraftPreconditions.push(duplicate.setupDraftPreconditions[0]);
    expect(() => stationOperationDraftSchema.parse(duplicate)).toThrow("Duplicate setup");
  });

  it("requires semantic preconditions to be covered by storage expectations", () => {
    const draft = locationDraft();
    draft.setupDraftPreconditions.push({ setupId: "read-setup", revisionId: "r1" });
    expect(() => stationOperationDraftSchema.parse(draft)).toThrow("storage head expectation");
    draft.expectedHeads.push({ kind: "setup", id: "read-setup", versionId: "storage-v1" });
    expect(stationOperationDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("validates tombstone tokens and excludes simultaneous advance or duplicate deletion", async () => {
    const draft = locationDraft();
    draft.records = [];
    draft.nextHeads = [];
    draft.expectedHeads[0].versionId = "old-token";
    draft.tombstones.push({ kind: "location", id: "home", expectedVersionId: "old-token", versionId: "deleted-token" });
    expect((await prepareStationOperation(draft)).tombstones[0].versionId).toBe("deleted-token");
    const mismatch = structuredClone(draft);
    mismatch.tombstones[0].expectedVersionId = "stale-token";
    expect(() => stationOperationDraftSchema.parse(mismatch)).toThrow("expected token");
    const same = structuredClone(draft);
    same.tombstones[0].versionId = "old-token";
    expect(() => stationOperationDraftSchema.parse(same)).toThrow("new version token");
    const duplicate = structuredClone(draft);
    duplicate.tombstones.push(duplicate.tombstones[0]);
    expect(() => stationOperationDraftSchema.parse(duplicate)).toThrow("Duplicate tombstones");
    const conflict = locationDraft();
    conflict.expectedHeads[0].versionId = "old-token";
    conflict.tombstones = draft.tombstones;
    expect(() => stationOperationDraftSchema.parse(conflict)).toThrow("advanced and tombstoned");
    const absent = structuredClone(draft);
    absent.expectedHeads[0].versionId = null;
    expect(() => stationOperationDraftSchema.parse(absent)).toThrow("expected token");
  });

  it.each(["operating", "publication-source"] as const)("blocks %s record, head and tombstone mutations while owner gates are unavailable", (kind) => {
    const archive = createHfFixture();
    const record: StationVersionedRecord = kind === "operating"
      ? { kind, id: "operating", versionId: "v1", body: archive.operating! }
      : { kind, id: "pub", versionId: "v1", body: { id: "pub", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1", audience: "owner", publicationVersion: 1, reviewedAt: FIXTURE_DATE } };
    const draft = fromRecords([record]);
    expect(() => stationOperationDraftSchema.parse(draft)).toThrow("separate owner gates");
    draft.records = [];
    draft.nextHeads = [];
    draft.expectedHeads[0].versionId = "v0";
    draft.tombstones = [{ kind, id: record.id, expectedVersionId: "v0", versionId: "deleted" }];
    expect(() => stationOperationDraftSchema.parse(draft)).toThrow("separate owner gates");
  });

  it("rejects unsupported schema, unknown fields/kinds and malformed body without silently stripping", () => {
    for (const extra of [{ schemaVersion: 2 }, { provenance: {} }, { payloadDigest: "0".repeat(64) }, { createdAt: "yesterday" }]) {
      expect(stationOperationDraftSchema.safeParse({ ...locationDraft(), ...extra }).success).toBe(false);
    }
    const wrongKind = locationDraft();
    Object.assign(wrongKind.records[0], { kind: "raw-recovery" });
    expect(stationOperationDraftSchema.safeParse(wrongKind).success).toBe(false);
    const wrongBody = locationDraft();
    Object.assign(wrongBody.records[0].body, { coordinates: { latitude: 91, longitude: 0 } });
    expect(stationOperationDraftSchema.safeParse(wrongBody).success).toBe(false);
  });

  it("does not claim aggregate validation or authorization without a repository snapshot", async () => {
    const draft = setupDraft();
    const record = draft.records.find((item) => item.kind === "setup")!;
    record.body.locationId = "not-in-this-operation";
    expect((await prepareStationOperation(draft)).records).toHaveLength(2);
    // The referenced location may exist in the repository. These helpers cannot
    // decide that, nor whether the caller is authenticated as FIXTURE_OWNER.
  });
});

describe("station operation integrity", () => {
  it("normalizes before preparing, detaches before async hashing, and returns deeply frozen data", async () => {
    const draft = locationDraft();
    draft.operationId = " operation-1 ";
    const record = draft.records.find((item) => item.kind === "location")!;
    record.body.label = " Original label ";
    const pending = prepareStationOperation(draft);
    record.body.label = "Changed while hashing";
    const operation = await pending;
    expect(operation.operationId).toBe("operation-1");
    expect(operation.records[0].body).toMatchObject({ label: "Original label" });
    expect(Object.isFrozen(operation)).toBe(true);
    expect(Object.isFrozen(operation.records[0].body)).toBe(true);
    const verified = await verifyStationOperation(operation);
    expect(verified).toEqual(operation);
    expect(verified).not.toBe(operation);
    expect(Object.isFrozen(verified.expectedHeads[0])).toBe(true);
  });

  it("preserves zero, null, false, Unicode and private raw reserved keys through prepare/verify", async () => {
    const draft = locationDraft();
    const record = draft.records.find((item) => item.kind === "location")!;
    record.body.coordinates = { latitude: 0, longitude: 0 };
    record.body.legacy = [{ kind: "location", sourceId: "legacy-home", sourceVersion: 0, payload: JSON.parse('{"__proto__":{"constructor":false},"nested":{"__proto__":0},"value":null,"lone":"\\ud800"}') }];
    const operation = await verifyStationOperation(await prepareStationOperation(draft));
    const body = operation.records[0].body;
    expect(body).toMatchObject({ coordinates: { latitude: 0, longitude: 0 } });
    if (!("legacy" in body) || !body.legacy) throw new Error("Expected location recovery payload");
    const payload = body.legacy[0].payload;
    expect(Object.prototype.hasOwnProperty.call(payload, "__proto__")).toBe(true);
    expect(payload.__proto__).toEqual({ constructor: false });
    expect(payload.value).toBeNull();
    expect(payload.lone).toBe("\ud800");
    expect(Object.isFrozen(payload.__proto__)).toBe(true);
  });

  it("keeps repeat preparation stable but distinguishes replay IDs with different semantic payloads", async () => {
    const original = locationDraft();
    const first = await prepareStationOperation(original);
    expect((await prepareStationOperation(original)).payloadDigest).toBe(first.payloadDigest);
    const changes: Array<(draft: StationOperationDraft) => void> = [
      (draft) => { draft.generationId = "generation-2"; },
      (draft) => { draft.operationId = "operation-2"; },
      (draft) => { draft.createdAt = "2026-09-05T12:01:00Z"; },
      (draft) => { draft.expectedHeads[0].versionId = "prior-v0"; },
      (draft) => { draft.records[0].versionId = "location-v2"; draft.nextHeads[0].versionId = "location-v2"; },
    ];
    for (const change of changes) {
      const draft = structuredClone(original);
      change(draft);
      const operation = await prepareStationOperation(draft);
      expect(operation.payloadDigest).not.toBe(first.payloadDigest);
      expect(await verifyStationOperation(operation)).toEqual(operation);
    }
    // Same operation ID with another valid digest is distinguishable here; only
    // the repository's prior receipt can determine that this is forbidden reuse.
  });

  it("rejects tampering with a signed body or digest, while object key order does not matter", async () => {
    const operation = await prepareStationOperation(locationDraft());
    const changed = structuredClone(operation);
    Object.assign(changed.records[0].body, { label: "Tampered" });
    await expect(verifyStationOperation(changed)).rejects.toThrow("digest mismatch");
    const changedOwner = structuredClone(operation);
    Object.assign(changedOwner, { ownerId: "other-account" });
    Object.assign(changedOwner.records[0].body, { ownerId: "other-account" });
    await expect(verifyStationOperation(changedOwner)).rejects.toThrow("digest mismatch");
    await expect(verifyStationOperation({ ...operation, payloadDigest: "0".repeat(64) })).rejects.toThrow("digest mismatch");
    const reordered = Object.fromEntries(Object.entries(operation).reverse());
    expect(await verifyStationOperation(reordered)).toEqual(operation);
    expect(stationOperationSchema.safeParse({ ...operation, payloadDigest: operation.payloadDigest.toUpperCase() }).success).toBe(false);
  });

  it("rejects signed schema-normalization discrepancies even with a digest of the raw body", async () => {
    const draft = locationDraft();
    draft.operationId = " padded-operation ";
    const payloadDigest = await digestWorkbenchJson(draft);
    await expect(verifyStationOperation({ ...draft, payloadDigest })).rejects.toThrow("schema-normalized");
    const prepared = await prepareStationOperation(draft);
    expect(prepared.operationId).toBe("padded-operation");
    expect(prepared.payloadDigest).not.toBe(payloadDigest);
  });

  it("validates JSON before property access, never invoking getters or toJSON", async () => {
    const getter = vi.fn(() => "operation-1");
    const draft = Object.defineProperty(locationDraft(), "operationId", { enumerable: true, get: getter });
    expect(stationOperationDraftSchema.safeParse(draft).success).toBe(false);
    await expect(prepareStationOperation(draft)).rejects.toThrow("accessors");
    await expect(verifyStationOperation(draft)).rejects.toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
    const toJSON = vi.fn(() => locationDraft());
    await expect(prepareStationOperation({ toJSON })).rejects.toThrow("non-JSON");
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("rejects non-JSON raw values and checks setup preconditions are digest-bound", async () => {
    const draft = locationDraft();
    const record = draft.records.find((item) => item.kind === "location")!;
    Object.assign(record.body, { privateNotes: undefined });
    await expect(prepareStationOperation(draft)).rejects.toThrow("non-JSON");
    const setup = setupDraft();
    const operation = await prepareStationOperation(setup);
    const { payloadDigest, ...unsigned } = operation;
    expect(await digestWorkbenchJson(unsigned)).toBe(payloadDigest);
    expect(canonicalWorkbenchJson(unsigned)).toContain('"setupDraftPreconditions"');
  });
});

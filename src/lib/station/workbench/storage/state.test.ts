import { describe, expect, it } from "vitest";
import { createHfFixture } from "@/lib/station/workbench/fixtures";
import { prepareRevision, prepareRevisionRestore, prepareSetupClone, type RevisionTransitionProposal } from "@/lib/station/workbench/revisions/services";
import type { DeepReadonly } from "@/lib/station/workbench/contracts";
import { prepareStationOperation, type StationOperationDraft } from "@/lib/station/workbench/storage/operations";
import { evaluateStationChange, stationArchiveIdentities, type StationStateSnapshot } from "@/lib/station/workbench/storage/state";

function snapshot() {
  const archive = createHfFixture();
  return { archive, heads: stationArchiveIdentities(archive).map((target) => ({ ...target, versionId: target.kind === "revision" ? target.id : `${target.kind}:${target.id}:v1`, deleted: false })) };
}

function editDraft(base: StationStateSnapshot): StationOperationDraft {
  const setup = base.archive.setups[0];
  const revision = base.archive.revisions.find((item) => item.id === setup.draftRevisionId)!;
  const content = Object.fromEntries(Object.entries(revision).filter(([key]) => !["id", "ownerId", "setupId", "parentRevisionId", "createdAt", "transition"].includes(key)));
  const proposal = prepareRevision(base.archive, { setupId: setup.id, revisionId: "next-revision", expectedHead: revision.id, createdAt: revision.createdAt, content: { ...content, notes: "Reviewed next draft" } });
  return {
    schemaVersion: 1, operationId: "save-next", ownerId: base.archive.ownerId, generationId: "generation", createdAt: revision.createdAt,
    expectedHeads: [
      { kind: "setup", id: setup.id, versionId: base.heads.find((head) => head.kind === "setup" && head.id === setup.id)!.versionId },
      { kind: "revision", id: proposal.revision.id, versionId: null },
    ],
    records: [
      { kind: "setup", id: setup.id, versionId: "setup-v2", body: structuredClone(proposal.setup) },
      { kind: "revision", id: proposal.revision.id, versionId: proposal.revision.id, body: structuredClone(proposal.revision) },
    ] as StationOperationDraft["records"],
    nextHeads: [{ kind: "setup", id: setup.id, versionId: "setup-v2" }, { kind: "revision", id: proposal.revision.id, versionId: proposal.revision.id }],
    tombstones: [], setupDraftPreconditions: [structuredClone(proposal.expectedHead)],
  };
}

describe("station transaction state validation", () => {
  it("appends a W03 draft while preserving reviewed pins and detached history", async () => {
    const base = snapshot();
    const before = structuredClone(base);
    const operation = await prepareStationOperation(editDraft(base));
    const result = evaluateStationChange(base, operation);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.archive.revisions).toHaveLength(base.archive.revisions.length + 1);
    expect(result.archive.setups[0].draftRevisionId).toBe("next-revision");
    expect(result.archive.operating).toEqual(base.archive.operating);
    expect(result.archive.publications).toEqual(base.archive.publications);
    expect(result.archive.experiments).toEqual(base.archive.experiments);
    expect(Object.isFrozen(result.archive)).toBe(true);
    expect(base).toEqual(before);
  });
  it("detects a concurrent rename even when the graph revision is unchanged", async () => {
    const base = snapshot();
    const operation = await prepareStationOperation(editDraft(base));
    const renamed = structuredClone(base);
    renamed.archive.setups[0].name = "Newer name";
    renamed.heads.find((head) => head.kind === "setup")!.versionId = "rename-v2";
    const result = evaluateStationChange(renamed, operation);
    expect(result).toMatchObject({ status: "conflict", reason: expect.stringContaining("Storage head") });
    expect(renamed.archive.setups[0].name).toBe("Newer name");
  });
  it("checks semantic draft expectations separately from storage tokens", async () => {
    const base = snapshot();
    const historical = structuredClone(base.archive.revisions[0]);
    historical.id = "stale-semantic-head";
    base.archive.revisions.push(historical);
    base.heads.push({ kind: "revision", id: historical.id, versionId: historical.id, deleted: false });
    const draft = editDraft(base);
    draft.setupDraftPreconditions[0].revisionId = "stale-semantic-head";
    const revision = draft.records.find((record) => record.kind === "revision")!;
    if (revision.kind === "revision") revision.body.parentRevisionId = "stale-semantic-head";
    const result = evaluateStationChange(base, await prepareStationOperation(draft));
    expect(result).toMatchObject({ status: "conflict", candidateValidation: { status: "quarantined", reason: "historical-validation-context-unavailable" }, reason: expect.stringContaining("Setup draft") });
  });
  it("rejects missing or inconsistent repository heads", async () => {
    const base = snapshot();
    const operation = await prepareStationOperation(editDraft(base));
    expect(() => evaluateStationChange({ ...base, heads: base.heads.slice(1) }, operation)).toThrow(/missing.*storage head/i);
    expect(() => evaluateStationChange({ ...base, heads: [...base.heads, base.heads[0]] }, operation)).toThrow(/duplicate/i);
    expect(() => evaluateStationChange({ ...base, heads: base.heads.map((head, index) => index === 0 ? { ...head, deleted: true } : head) }, operation)).toThrow(/do not match/i);
  });
  it("rejects invalid aggregate references before accepting a candidate", async () => {
    const base = snapshot();
    const draft = editDraft(base);
    const revision = draft.records.find((record) => record.kind === "revision")!;
    if (revision.kind === "revision") revision.body.connections[0].from.portId = "missing-port";
    const operation = await prepareStationOperation(draft);
    expect(() => evaluateStationChange(base, operation)).toThrow(/connection endpoint/i);
  });
  it("quarantines stale dangling-reference alternatives but rejects the same current proposal", async () => {
    const base = snapshot();
    const draft = editDraft(base);
    const revision = draft.records.find((record) => record.kind === "revision")!;
    if (revision.kind === "revision") revision.body.connections[0].from.portId = "missing-port";
    const operation = await prepareStationOperation(draft);
    const concurrent = structuredClone(base);
    concurrent.heads.find((head) => head.kind === "setup")!.versionId = "concurrent-rename";
    concurrent.archive.setups[0].name = "Concurrent name";
    const before = structuredClone(concurrent);
    expect(evaluateStationChange(concurrent, operation)).toMatchObject({
      status: "conflict", candidateValidation: { status: "quarantined", reason: "historical-validation-context-unavailable" },
    });
    expect(concurrent).toEqual(before);
    expect(operation.records).toEqual(draft.records);
    expect(() => evaluateStationChange(base, operation)).toThrow(/connection endpoint/i);
  });
  it.each(["missing-transition", "invalid-parent", "missing-parent", "missing-source", "orphan", "revision-deletion"] as const)("rejects %s even with stale CAS", async (invalid) => {
    const base = snapshot();
    const draft = editDraft(base);
    const revision = draft.records.find((record) => record.kind === "revision")!;
    if (revision.kind !== "revision") throw new Error("Missing fixture revision");
    if (invalid === "missing-transition") delete revision.body.transition;
    if (invalid === "invalid-parent") revision.body.transition = { kind: "initial" };
    if (invalid === "missing-parent") {
      revision.body.parentRevisionId = "absent-parent";
      draft.setupDraftPreconditions[0].revisionId = "absent-parent";
    }
    if (invalid === "missing-source") revision.body.transition = { kind: "restore", sourceRevisionId: "missing-source" };
    if (invalid === "orphan") {
      draft.records = draft.records.filter((record) => record.kind !== "setup");
      draft.nextHeads = draft.nextHeads.filter((head) => head.kind !== "setup");
    }
    if (invalid === "revision-deletion") {
      const source = base.archive.revisions[0];
      draft.expectedHeads.push({ kind: "revision", id: source.id, versionId: source.id });
      draft.tombstones.push({ kind: "revision", id: source.id, expectedVersionId: source.id, versionId: "deleted-revision" });
    }
    const operation = await prepareStationOperation(draft);
    base.heads.find((head) => head.kind === "setup")!.versionId = "stale-token";
    expect(() => evaluateStationChange(base, operation)).toThrow(/transition|lineage|matching setup|retain revision history/i);
  });
  it("retains a valid stale restore after concurrent setup metadata changes", async () => {
    const base = snapshot();
    const source = base.archive.revisions[0];
    const proposal = prepareRevisionRestore(base.archive, { setupId: source.setupId, sourceRevisionId: source.id,
      revisionId: "next-revision", expectedHead: source.id, createdAt: source.createdAt });
    const draft = editDraft(base);
    draft.records = draft.records.map((record) => record.kind === "revision" ? { ...record, body: structuredClone(proposal.revision) }
      : record.kind === "setup" ? { ...record, body: structuredClone(proposal.setup) } : record) as StationOperationDraft["records"];
    const operation = await prepareStationOperation(draft);
    expect(evaluateStationChange(base, operation).status).toBe("ready");
    base.archive.setups[0].name = "Concurrent renamed setup";
    base.heads.find((head) => head.kind === "setup")!.versionId = "renamed-token";
    const before = structuredClone(base);
    expect(evaluateStationChange(base, operation)).toMatchObject({ status: "conflict",
      candidateValidation: { status: "quarantined", reason: "historical-validation-context-unavailable" } });
    expect(base).toEqual(before);
    expect(operation.records.find((record) => record.kind === "setup")?.body).toEqual(proposal.setup);
  });
  it("requires a new revision to accompany every changed draft head", async () => {
    const base = snapshot();
    const draft = editDraft(base);
    draft.records = draft.records.filter((record) => record.kind !== "revision");
    draft.nextHeads = draft.nextHeads.filter((head) => head.kind !== "revision");
    const operation = await prepareStationOperation(draft);
    expect(() => evaluateStationChange(base, operation)).toThrow(/newly appended revision/i);
  });
  it("does not store an orphan revision without its setup advance", async () => {
    const base = snapshot();
    const draft = editDraft(base);
    draft.records = draft.records.filter((record) => record.kind !== "setup");
    draft.nextHeads = draft.nextHeads.filter((head) => head.kind !== "setup");
    const operation = await prepareStationOperation(draft);
    expect(() => evaluateStationChange(base, operation)).toThrow(/matching setup head/i);
  });
  it("requires explicit transition metadata for newly authored revisions", async () => {
    const base = snapshot();
    const draft = editDraft(base);
    const revision = draft.records.find((record) => record.kind === "revision")!;
    if (revision.kind === "revision") delete revision.body.transition;
    expect(() => evaluateStationChange(base, { ...draft, payloadDigest: "0".repeat(64) })).toThrow(/explicit W03 transition/i);
  });
  it("rejects cross-account proposals even when all nested owners agree with that other account", async () => {
    const base = snapshot();
    const operation = await prepareStationOperation(editDraft(base));
    const otherSnapshot = structuredClone(base);
    otherSnapshot.archive = JSON.parse(JSON.stringify(base.archive), (key, value: unknown) => key === "ownerId" ? "other" : value);
    expect(() => evaluateStationChange(otherSnapshot, operation)).toThrow(/owner does not match/i);
  });
  it("blocks deletion of inventory referenced by retained snapshots", async () => {
    const base = snapshot();
    const target = base.heads.find((head) => head.kind === "equipment")!;
    const draft = editDraft(base);
    const operation = await prepareStationOperation({ ...draft, records: [], nextHeads: [], setupDraftPreconditions: [],
      expectedHeads: [{ kind: target.kind, id: target.id, versionId: target.versionId }],
      tombstones: [{ kind: target.kind, id: target.id, expectedVersionId: target.versionId, versionId: "deleted-v2" }],
    });
    expect(() => evaluateStationChange(base, operation)).toThrow(/Missing physical instance/i);
    expect(base.archive.inventory.some((item) => item.id === target.id)).toBe(true);
  });
  it.each(["restore", "clone"] as const)("accepts W03 %s and rejects forged historical pins", async (kind) => {
    const base = snapshot();
    const source = base.archive.revisions.find((revision) => revision.id === base.archive.setups[0].draftRevisionId)!;
    const mapIds = (items: { id: string }[]) => Object.fromEntries(items.map(({ id }) => [id, `clone-${id}`]));
    const proposal: DeepReadonly<RevisionTransitionProposal> = kind === "restore"
      ? prepareRevisionRestore(base.archive, { setupId: source.setupId, sourceRevisionId: source.id, revisionId: "next-revision", expectedHead: source.id, createdAt: source.createdAt })
      : prepareSetupClone(base.archive, { setupId: "new-setup", sourceRevisionId: source.id, revisionId: "next-revision", name: "Clone", createdAt: source.createdAt,
        idMap: { connections: mapIds(source.connections), cableRuns: mapIds(source.cableRuns), routes: mapIds(source.routes) },
      });
    const draft = editDraft(base);
    draft.expectedHeads = [{ kind: "setup", id: proposal.setup.id, versionId: kind === "restore" ? base.heads.find((head) => head.kind === "setup" && head.id === source.setupId)!.versionId : null },
      { kind: "revision", id: proposal.revision.id, versionId: null }];
    draft.records = [{ kind: "setup", id: proposal.setup.id, versionId: "setup-v2", body: structuredClone(proposal.setup) },
      { kind: "revision", id: proposal.revision.id, versionId: proposal.revision.id, body: structuredClone(proposal.revision) }] as StationOperationDraft["records"];
    draft.nextHeads = draft.records.map(({ kind, id, versionId }) => ({ kind, id, versionId }));
    draft.setupDraftPreconditions = [structuredClone(proposal.expectedHead)];
    expect(evaluateStationChange(base, await prepareStationOperation(draft)).status).toBe("ready");
    const revision = draft.records.find((record) => record.kind === "revision")!;
    if (revision.kind === "revision") revision.body.equipment[0].label = "Not the historical gear";
    const forged = await prepareStationOperation(draft);
    expect(() => evaluateStationChange(base, forged)).toThrow(/preserve W03 source pins/i);
    if (kind === "clone" && revision.kind === "revision") {
      revision.body = structuredClone(proposal.revision) as typeof revision.body;
      revision.body.connections = structuredClone(source.connections);
      revision.body.cableRuns = structuredClone(source.cableRuns);
      revision.body.routes = structuredClone(source.routes);
      const reusedGraph = await prepareStationOperation(draft);
      expect(() => evaluateStationChange(base, reusedGraph)).toThrow(/IDs must be distinct and new/i);
    }
  });
});

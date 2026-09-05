import { describe, expect, it } from "vitest";
import { parseWorkbenchArchive, type DeepReadonly, type SetupRevision, type WorkbenchArchive } from "@/lib/station/workbench/contracts";
import {
  createExperimentFixture, createHfFixture, createMultipleCableRunsFixture, createPortableSharedFixture,
  createUnsupportedBranchFixture, FIXTURE_DATE, FIXTURE_OWNER, unknownQuantity,
} from "@/lib/station/workbench/fixtures";
import { prepareSetup, prepareRevision, prepareSetupClone, prepareRevisionRestore, type RevisionContent, type RevisionTransitionProposal } from "@/lib/station/workbench/revisions/services";

const nextDate = "2026-09-06T12:00:00Z";
function content(revision: SetupRevision): RevisionContent {
  return structuredClone({
    equipment: revision.equipment, models: revision.models, evidence: revision.evidence, location: revision.location,
    connections: revision.connections, cableRuns: revision.cableRuns, routes: revision.routes,
    settings: revision.settings, notes: revision.notes,
  });
}
function blank(): RevisionContent {
  return { equipment: [], models: [], evidence: [], location: null, connections: [], cableRuns: [], routes: [],
    settings: { frequencyHz: unknownQuantity(), requestedPowerWatts: unknownQuantity(), mode: null, bandId: null }, notes: "Incomplete draft" };
}
function mapping(revision: SetupRevision) {
  return {
    connections: Object.fromEntries(revision.connections.map((item) => [item.id, `clone-${item.id}`])),
    cableRuns: Object.fromEntries(revision.cableRuns.map((item) => [item.id, `clone-${item.id}`])),
    routes: Object.fromEntries(revision.routes.map((item) => [item.id, `clone-${item.id}`])),
  };
}
function assemble(archive: WorkbenchArchive, change: DeepReadonly<RevisionTransitionProposal>) {
  return parseWorkbenchArchive({ ...archive,
    setups: change.expectedHead.revisionId === null ? [...archive.setups, change.setup] : archive.setups.map((setup) => setup.id === change.setup.id ? change.setup : setup),
    revisions: [...archive.revisions, change.revision],
  });
}

describe("setup and revision preparation", () => {
  it("prepares an empty, incomplete initial setup with explicit unknowns and no operating or historical write", () => {
    const archive = createHfFixture();
    const before = structuredClone(archive);
    const body = blank();
    const result = prepareSetup(archive, { setupId: "new-setup", revisionId: "new-r1", name: "Portable idea", createdAt: nextDate, content: body });
    expect(result.expectedHead).toEqual({ setupId: "new-setup", revisionId: null });
    expect(result.setup).toMatchObject({ ownerId: FIXTURE_OWNER, name: "Portable idea", draftRevisionId: "new-r1", locationId: null });
    expect(result.revision).toMatchObject({ parentRevisionId: null, transition: { kind: "initial" }, routes: [], settings: { bandId: null, requestedPowerWatts: { state: "unknown" } } });
    body.notes = "Later input change";
    expect(result.revision.notes).toBe("Incomplete draft");
    expect(Object.isFrozen(result.revision.settings)).toBe(true);
    expect(archive).toEqual(before);
    const next = assemble(archive, result);
    expect(next.operating).toEqual(archive.operating);
    expect(next.revisions[0]).toEqual(archive.revisions[0]);
  });

  it("pins original setup recovery envelopes into a detached clone without rewriting source identities", () => {
    const archive = createHfFixture();
    archive.setups[0].legacy = [
      { kind: "preset", sourceId: "original-preset", sourceVersion: 1, payload: { future: { values: [0, false, null] } } },
      { kind: "chain", sourceId: "original-chain", sourceVersion: 2, payload: { originalConnection: "rf-edge", note: "Keep unknown metadata" } },
    ];
    const expected = structuredClone(archive.setups[0].legacy);
    const result = prepareSetupClone(archive, { setupId: "cloned", revisionId: "cloned-r1", name: "Clone", sourceRevisionId: archive.revisions[0].id, createdAt: nextDate, idMap: mapping(archive.revisions[0]) });
    expect(result.setup.id).toBe("cloned");
    expect(result.setup.legacy).toEqual(expected);
    archive.setups[0].legacy[0].payload.future = "Changed later";
    expect(result.setup.legacy).toEqual(expected);
    expect(Object.isFrozen(result.setup.legacy[0].payload)).toBe(true);
  });

  it("appends an explicit edit from supplied pins while recording the expected current head", () => {
    const archive = createHfFixture();
    archive.inventory[0].privateMetadata.notes = "New live inventory note";
    archive.models[0].name = "Updated live catalog";
    const before = structuredClone(archive);
    const body = content(archive.revisions[0]);
    body.notes = "Revised draft note";
    body.settings.bandId = "20m";
    const result = prepareRevision(archive, { setupId: "home-hf", revisionId: "home-r2", expectedHead: "home-r1", createdAt: nextDate, content: body });
    expect(result.expectedHead).toEqual({ setupId: "home-hf", revisionId: "home-r1" });
    expect(result.revision).toMatchObject({ parentRevisionId: "home-r1", transition: { kind: "edit" }, notes: "Revised draft note", settings: { bandId: "20m" } });
    expect(result.revision.equipment[0].privateMetadata.notes).toBe("Private workshop notes");
    expect(result.revision.models[0].name).toBe("Custom HF radio");
    const next = assemble(archive, result);
    expect(next.setups[0].draftRevisionId).toBe("home-r2");
    expect(next.operating?.revisionId).toBe("home-r1");
    expect(next.revisions[0]).toEqual(before.revisions[0]);
    expect(archive).toEqual(before);
    body.equipment[0].privateMetadata.imageIds.push("later-image");
    expect(result.revision.equipment[0].privateMetadata.imageIds).toEqual(["private-photo"]);
  });

  it("rejects stale heads, reused identities, forged ownership, broken references and caller-supplied transitions", () => {
    const archive = createHfFixture();
    const request = { setupId: "home-hf", revisionId: "home-r2", expectedHead: "home-r1", createdAt: nextDate, content: content(archive.revisions[0]) };
    const before = structuredClone(archive);
    expect(() => prepareRevision(archive, { ...request, expectedHead: "stale" })).toThrow(/Stale setup head/);
    expect(() => prepareRevision(archive, { ...request, revisionId: "home-r1" })).toThrow(/already exists/);
    expect(() => prepareRevision(archive, { ...request, content: { ...request.content, transition: { kind: "initial" } } })).toThrow();
    expect(() => prepareRevision(archive, { ...request, ownerId: "other" })).toThrow();
    const broken = structuredClone(request);
    broken.content.equipment[0].ownerId = "other";
    expect(() => prepareRevision(archive, broken)).toThrow(/Cross-owner/);
    broken.content.equipment[0].ownerId = FIXTURE_OWNER;
    broken.content.connections[0].to.portId = "missing";
    expect(() => prepareRevision(archive, broken)).toThrow(/endpoint/);
    expect(() => prepareSetup(archive, { setupId: "home-hf", revisionId: "initial", name: "Existing", createdAt: nextDate, content: blank() })).toThrow(/Setup already exists/);
    expect(archive).toEqual(before);
  });

  it("accepts a valid clock-skewed timestamp while using explicit lineage and expected heads for ordering", () => {
    const archive = createHfFixture();
    const earlierClock = "2020-01-01T00:00:00Z";
    const request = { setupId: "home-hf", revisionId: "home-r2", expectedHead: "home-r1", createdAt: earlierClock, content: content(archive.revisions[0]) };
    const edit = prepareRevision(archive, request);
    expect(edit.revision.createdAt).toBe(earlierClock);
    expect(edit.revision.parentRevisionId).toBe("home-r1");
    expect(edit.expectedHead.revisionId).toBe("home-r1");
    expect(() => prepareRevision(archive, { ...request, createdAt: "invalid" })).toThrow();
    const cloned = prepareSetupClone(archive, { sourceRevisionId: "home-r1", setupId: "clone", revisionId: "clone-r1", name: "Clone", createdAt: earlierClock, idMap: mapping(archive.revisions[0]) });
    expect(cloned.revision.createdAt).toBe(earlierClock);
    const restored = prepareRevisionRestore(archive, { setupId: "home-hf", sourceRevisionId: "home-r1", revisionId: "restored-r2", expectedHead: "home-r1", createdAt: earlierClock });
    expect(restored.revision.createdAt).toBe(earlierClock);
    expect(restored.revision.parentRevisionId).toBe("home-r1");
  });

  it("rejects a formerly valid proposal preparation after another revision became the draft head", () => {
    const archive = createHfFixture();
    const request = { setupId: "home-hf", revisionId: "home-r2", expectedHead: "home-r1", createdAt: nextDate, content: content(archive.revisions[0]) };
    const first = prepareRevision(archive, request);
    const advanced = assemble(archive, first);
    expect(() => prepareRevision(advanced, { ...request, revisionId: "home-r3" })).toThrow(/Stale setup head/);
    expect(first.expectedHead.revisionId).toBe("home-r1");
    expect(advanced.operating?.revisionId).toBe("home-r1");
  });
});

describe("setup cloning", () => {
  it("remaps every local graph reference across multiple runs and inline paths while retaining shared physical IDs", () => {
    const archive = createMultipleCableRunsFixture();
    const source = archive.revisions[0];
    const ids = mapping(source);
    const before = structuredClone(archive);
    const result = prepareSetupClone(archive, { sourceRevisionId: source.id, setupId: "cloned", revisionId: "clone-r1", name: "Alternative station", createdAt: nextDate, idMap: ids });
    expect(result.revision.transition).toEqual({ kind: "clone", sourceRevisionId: source.id });
    expect(result.revision.parentRevisionId).toBeNull();
    expect(result.revision.equipment).toEqual(source.equipment);
    expect(result.revision.equipment.map((item) => item.id)).toEqual(source.equipment.map((item) => item.id));
    source.connections.forEach((connection, index) => {
      expect(result.revision.connections[index]).toEqual({ ...connection, id: ids.connections[connection.id], runId: connection.runId === null ? null : ids.cableRuns[connection.runId] });
    });
    source.cableRuns.forEach((run, index) => {
      expect(result.revision.cableRuns[index].id).toBe(ids.cableRuns[run.id]);
      expect(result.revision.cableRuns[index].connections).toEqual(run.connections.map((segment) => ({ ...segment, connectionId: ids.connections[segment.connectionId] })));
      expect(result.revision.cableRuns[index].inlineItems).toEqual(run.inlineItems);
      expect(result.revision.cableRuns[index].legacy).toEqual(run.legacy);
    });
    source.routes.forEach((route, index) => {
      expect(result.revision.routes[index].id).toBe(ids.routes[route.id]);
      expect(result.revision.routes[index].hops).toEqual(route.hops.map((hop) => hop.kind === "connection" ? { ...hop, connectionId: ids.connections[hop.connectionId] } : hop));
    });
    const next = assemble(archive, result);
    expect(next.inventory).toEqual(before.inventory);
    expect(next.operating).toEqual(before.operating);
    expect(next.setups).toHaveLength(before.setups.length + 1);
    expect(archive).toEqual(before);
  });

  it("copies the chosen historical private metadata and report citations without refreshing from live records", () => {
    const archive = createHfFixture();
    const source = archive.revisions[0];
    const report = { id: "original-report", ownerId: FIXTURE_OWNER, kind: "report" as const, reportType: "independent-test" as const,
      source: "Model test report", recordedAt: FIXTURE_DATE, citation: { name: "Original citation", license: "Keep attribution", notes: "Original conditions" },
      measurementContext: { state: "unknown" as const, reason: "Legacy report" } };
    archive.evidence.push(structuredClone(report));
    source.evidence.push(structuredClone(report));
    source.models[0].sourceReportIds = [report.id];
    archive.models[0].sourceReportIds = [report.id];
    archive.inventory[0].label = "Renamed today";
    archive.inventory[0].privateMetadata.notes = "New notes";
    archive.models[0].name = "New catalog version";
    const liveReport = archive.evidence.find((item) => item.id === report.id);
    if (liveReport?.kind !== "report") throw new Error("Fixture report missing");
    liveReport.citation.notes = "Changed today";
    if (!source.location) throw new Error("Fixture location missing");
    source.location.coordinates = { latitude: 0, longitude: 0 };
    source.location.timezone = "UTC";
    source.location.activationRef = "SYNTHETIC-0";
    source.location.legacy = [{ kind: "location", sourceId: "old-home", sourceVersion: 1, payload: { original: { coordinate: 0, notes: ["keep order", "keep IDs"] } } }];
    archive.locations[0].label = "New location name";
    archive.locations[0].coordinates = { latitude: 10, longitude: 20 };
    const result = prepareSetupClone(archive, { sourceRevisionId: source.id, setupId: "cloned", revisionId: "clone-r1", name: "Earlier configuration", createdAt: nextDate, idMap: mapping(source) });
    expect(result.revision.equipment[0].label).toBe("My HF transceiver");
    expect(result.revision.equipment[0].privateMetadata.notes).toBe("Private workshop notes");
    expect(result.revision.models[0].name).toBe("Custom HF radio");
    expect(result.revision.location).toEqual(source.location);
    expect(result.revision.location?.coordinates).toEqual({ latitude: 0, longitude: 0 });
    expect(result.revision.location?.activationRef).toBe("SYNTHETIC-0");
    expect(result.revision.evidence.find((item) => item.id === report.id)).toEqual(report);
    expect(Object.isFrozen(result.revision.evidence)).toBe(true);
  });

  it("requires complete fresh bijective local mappings and never guesses insertion/identity", () => {
    const archive = createMultipleCableRunsFixture();
    const source = archive.revisions[0];
    const request = { sourceRevisionId: source.id, setupId: "cloned", revisionId: "clone-r1", name: "Clone", createdAt: nextDate, idMap: mapping(source) };
    const missing = structuredClone(request);
    delete missing.idMap.connections[source.connections[0].id];
    expect(() => prepareSetupClone(archive, missing)).toThrow(/explicit ID mapping/);
    const duplicate = structuredClone(request);
    for (const key of Object.keys(duplicate.idMap.connections)) duplicate.idMap.connections[key] = "same";
    expect(() => prepareSetupClone(archive, duplicate)).toThrow(/distinct and new/);
    const reused = structuredClone(request);
    reused.idMap.routes[source.routes[0].id] = source.routes[0].id;
    expect(() => prepareSetupClone(archive, reused)).toThrow(/distinct and new/);
    const extra = structuredClone(request);
    extra.idMap.cableRuns.extra = "unused";
    expect(() => prepareSetupClone(archive, extra)).toThrow(/no extra keys/);
    expect(() => prepareSetupClone(archive, { ...request, setupId: source.setupId })).toThrow(/Setup already exists/);
    expect(() => prepareSetupClone(archive, { ...request, sourceRevisionId: "missing" })).toThrow(/Unknown source/);
  });

  it("preserves unsupported documentation as documentation when cloned", () => {
    const archive = createUnsupportedBranchFixture();
    const source = archive.revisions[0];
    const result = prepareSetupClone(archive, { sourceRevisionId: source.id, setupId: "cloned", revisionId: "clone-r1", name: "Documented branch", createdAt: nextDate, idMap: mapping(source) });
    expect(result.revision.routes[0].analysis).toEqual(source.routes[0].analysis);
    expect(result.revision.routes[0].analysis.state).toBe("documentation-only");
    expect(assemble(archive, result).operating).toBeNull();
  });
});

describe("revision restoration", () => {
  it("appends a same-setup restore from pinned history while preserving experiments, publication, layout and operation", () => {
    const archive = createExperimentFixture();
    archive.publications.push({ id: "published", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r2", audience: "visitor", publicationVersion: 1, reviewedAt: FIXTURE_DATE });
    archive.inventory[0].privateMetadata.notes = "Today's shared inventory";
    archive.models[0].name = "Today's model";
    archive.locations[0].coordinates = { latitude: 0, longitude: 0 };
    const liveDeclaration = archive.evidence.find((entry) => entry.kind === "declared");
    if (liveDeclaration?.kind === "declared") liveDeclaration.source = "Today's declaration";
    const before = structuredClone(archive);
    const result = prepareRevisionRestore(archive, { setupId: "home-hf", sourceRevisionId: "home-r1", revisionId: "restored-r3", expectedHead: "home-r2", createdAt: nextDate });
    expect(result.expectedHead.revisionId).toBe("home-r2");
    expect(result.revision).toMatchObject({ parentRevisionId: "home-r2", transition: { kind: "restore", sourceRevisionId: "home-r1" } });
    expect(content(structuredClone(result.revision) as SetupRevision)).toEqual(content(archive.revisions[0]));
    const next = assemble(archive, result);
    expect(next.setups[0].draftRevisionId).toBe("restored-r3");
    expect(next.revisions.slice(0, 2)).toEqual(before.revisions);
    expect(next.inventory).toEqual(before.inventory);
    expect(next.operating).toEqual(before.operating);
    expect(next.experiments).toEqual(before.experiments);
    expect(next.publications).toEqual(before.publications);
    expect(next.layouts).toEqual(before.layouts);
    expect(archive).toEqual(before);
  });

  it("rejects cross-setup sources and stale restore heads without altering either station", () => {
    const archive = createPortableSharedFixture();
    const before = structuredClone(archive);
    const request = { setupId: "home-hf", sourceRevisionId: "portable-r1", revisionId: "restored-r2", expectedHead: "home-r1", createdAt: nextDate };
    expect(() => prepareRevisionRestore(archive, request)).toThrow(/same setup/);
    expect(() => prepareRevisionRestore(archive, { ...request, sourceRevisionId: "home-r1", expectedHead: "old" })).toThrow(/Stale setup head/);
    expect(() => prepareRevisionRestore(archive, { ...request, sourceRevisionId: "home-r1", revisionId: "home-r1" })).toThrow(/already exists/);
    expect(archive).toEqual(before);
  });
});

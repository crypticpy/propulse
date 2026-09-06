import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchArchive } from "@/lib/station/workbench/contracts";
import { createHfFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import type { StationEntityKind } from "@/lib/station/workbench/storage/operations";
import {
  prepareStationGeneration, stationGenerationCandidateSchema, stationStageDraftSchema, verifyStationGeneration,
  type StationGenerationCandidate, type StationStageDraft,
} from "@/lib/station/workbench/storage/staging";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

function newEmpty(): StationStageDraft {
  return {
    manifest: {
      schemaVersion: 1, kind: "new-empty", ownerId: FIXTURE_OWNER, generationId: "new-generation", sourceGenerationId: null,
      createdAt: FIXTURE_DATE, recordVersions: [], sourceBackup: null, rawCaptures: [], sourceMappings: [], mediaAvailability: [], parityFindings: [],
    },
    archive: { schemaVersion: 1, ownerId: FIXTURE_OWNER, models: [], inventory: [], evidence: [], locations: [], setups: [], revisions: [], layouts: [], experiments: [], publications: [], operating: null },
  };
}

function synthetic(archive: WorkbenchArchive = createHfFixture()): StationStageDraft {
  const draft = newEmpty();
  draft.archive = archive;
  draft.manifest.kind = "synthetic";
  draft.manifest.sourceGenerationId = "source-generation";
  draft.manifest.sourceBackup = { ownerId: FIXTURE_OWNER, reference: "private-fixture/backup.bin", digest: "a".repeat(64), encoding: "exact-bytes" };
  draft.manifest.rawCaptures = [{
    id: "raw-shack", sourceNamespace: "synthetic-localStorage", sourceId: "propulse-shack", sourceVersion: { state: "unknown", reason: "Original fixture omitted a version" },
    capturedAt: FIXTURE_DATE, state: "captured", artifactReference: "private-fixture/source.txt", digest: "b".repeat(64), rawPayload: ' {"original":0,"original":1} \n',
  }];
  const groups: [StationEntityKind, readonly { id: string }[]][] = [
    ["model", archive.models], ["equipment", archive.inventory], ["evidence", archive.evidence], ["location", archive.locations],
    ["setup", archive.setups], ["revision", archive.revisions], ["layout", archive.layouts], ["experiment", archive.experiments],
    ["publication-source", archive.publications], ["operating", archive.operating ? [{ id: "operating" }] : []],
  ];
  draft.manifest.recordVersions = groups.flatMap(([kind, records]) => records.map(({ id }) => ({ kind, id, versionId: kind === "revision" ? id : `${kind}-${id}-v1` })));
  draft.manifest.sourceMappings = [{ id: "map-shack", captureId: "raw-shack", sourcePath: [], occurrence: 0, adapterVersion: "fixture-v1", status: "retained-only", destinations: [], diagnostics: [] }];
  const ids = new Set<string>();
  for (const equipment of [...archive.inventory, ...archive.revisions.flatMap((revision) => revision.equipment)]) {
    const metadata = equipment.privateMetadata;
    [...metadata.imageIds, ...metadata.receiptMediaIds, ...(metadata.manualMediaIds ?? []), ...(metadata.galleryImageIds ?? []), ...(metadata.primaryImageId ? [metadata.primaryImageId] : [])].forEach((id) => ids.add(id));
  }
  draft.manifest.mediaAvailability = [...ids].map((imageId) => ({ imageId, state: "missing", reference: null, reason: "Synthetic fixture has no actual blob bytes" }));
  return draft;
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));

describe("pure generation staging", () => {
  it("derives a genuine new-empty seal without implying a legacy cutover", async () => {
    const candidate = await prepareStationGeneration(newEmpty());
    expect(candidate.seal.recordManifest).toEqual([]);
    expect(candidate.seal.canonicalMediaIds).toEqual([]);
    expect(candidate.seal.proofClass).toBe("new-empty");
    expect(candidate.seal.legacyCutoverAuthorized).toBe(false);
    expect(candidate.seal.externalArtifactsVerified).toBe(false);
    expect(candidate.archive.operating).toBeNull();
    expect(candidate.archive.publications).toEqual([]);
    expect(await verifyStationGeneration(candidate)).toEqual(candidate);
  });

  it("rejects a nonempty archive under a new-empty label even with complete version coverage", () => {
    const draft = synthetic();
    draft.manifest.kind = "new-empty";
    draft.manifest.sourceGenerationId = null;
    draft.manifest.sourceBackup = null;
    draft.manifest.rawCaptures = [];
    draft.manifest.sourceMappings = [];
    expect(() => stationStageDraftSchema.parse(draft)).toThrow("every archive collection empty");
  });

  it("rejects source artifacts and lineage in a new-empty stage", () => {
    const draft = newEmpty();
    draft.manifest.sourceGenerationId = "prior-generation";
    expect(() => stationStageDraftSchema.parse(draft)).toThrow("New-empty cannot include");
    draft.manifest.sourceGenerationId = null;
    draft.manifest.sourceBackup = synthetic().manifest.sourceBackup;
    expect(() => stationStageDraftSchema.parse(draft)).toThrow("New-empty cannot include");
  });

  it.each(["synthetic", "import-rehearsal"] as const)("derives full archive and record digests for %s, including preserved operating/publication pins", async (kind) => {
    const archive = createHfFixture();
    archive.publications = [{ id: "reviewed-source", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1", audience: "owner", publicationVersion: 1, reviewedAt: FIXTURE_DATE }];
    const draft = synthetic(archive);
    draft.manifest.kind = kind;
    const candidate = await prepareStationGeneration(draft);
    expect(candidate.archive).toEqual(archive);
    expect(candidate.seal.archiveDigest).toBe(await digestWorkbenchJson(archive));
    expect(candidate.seal.recordManifest.map((record) => [record.kind, record.id])).toEqual(expect.arrayContaining([["operating", "operating"], ["publication-source", "reviewed-source"]]));
    const revision = candidate.seal.recordManifest.find((record) => record.kind === "revision")!;
    expect(revision.bodyDigest).toBe(await digestWorkbenchJson(archive.revisions[0]));
    expect(revision.versionId).toBe(revision.id);
    expect(candidate.seal.proofClass).toBe(kind);
    expect(candidate.seal.legacyCutoverAuthorized).toBe(false);
    expect(candidate.seal.externalArtifactsVerified).toBe(false);
    expect(candidate.seal.verificationLimits).toContain("owner-source-parity-unverified");
    expect(await verifyStationGeneration(candidate)).toEqual(candidate);
  });

  it("validates the complete aggregate rather than trusting individually shaped records", async () => {
    const draft = synthetic();
    draft.archive.revisions[0].connections[0].to.portId = "dangling-port";
    await expect(prepareStationGeneration(draft)).rejects.toThrow("Invalid connection endpoint");
    const missingBibliography = synthetic();
    missingBibliography.archive.revisions[0].equipment[0].modelId = "missing-model";
    await expect(prepareStationGeneration(missingBibliography)).rejects.toThrow();
    const unsupportedVersion = newEmpty();
    Object.assign(unsupportedVersion.archive, { schemaVersion: 2 });
    await expect(prepareStationGeneration(unsupportedVersion)).rejects.toThrow();
  });

  it("rejects owner mismatch and cyclic source generation identity", () => {
    const owner = synthetic();
    owner.manifest.ownerId = "other-owner";
    expect(() => stationStageDraftSchema.parse(owner)).toThrow("owner must match");
    const backup = synthetic();
    backup.manifest.sourceBackup!.ownerId = "other-owner";
    expect(() => stationStageDraftSchema.parse(backup)).toThrow("backup owner");
    const source = synthetic();
    source.manifest.sourceGenerationId = source.manifest.generationId;
    expect(() => stationStageDraftSchema.parse(source)).toThrow("itself as its source");
  });

  it("requires exact record manifest coverage and immutable revision identity", () => {
    const missing = synthetic();
    missing.manifest.recordVersions.pop();
    expect(() => stationStageDraftSchema.parse(missing)).toThrow("complete supplied archive");
    const extra = synthetic();
    extra.manifest.recordVersions.push({ kind: "location", id: "unknown", versionId: "v1" });
    expect(() => stationStageDraftSchema.parse(extra)).toThrow("not in the supplied archive");
    const duplicate = synthetic();
    duplicate.manifest.recordVersions.push(duplicate.manifest.recordVersions[0]);
    expect(() => stationStageDraftSchema.parse(duplicate)).toThrow("Duplicate record-version");
    const revision = synthetic();
    revision.manifest.recordVersions.find((record) => record.kind === "revision")!.versionId = "another-body-version";
    expect(() => stationStageDraftSchema.parse(revision)).toThrow("immutable revision ID");
  });

  it("requires raw capture metadata and an original backup reference/digest for imports", () => {
    const noBackup = synthetic();
    noBackup.manifest.sourceBackup = null;
    expect(() => stationStageDraftSchema.parse(noBackup)).toThrow("source backup");
    const noCapture = synthetic();
    noCapture.manifest.rawCaptures = [];
    expect(() => stationStageDraftSchema.parse(noCapture)).toThrow("raw capture metadata");
    const wrongEncoding = synthetic();
    Object.assign(wrongEncoding.manifest.sourceBackup!, { encoding: "canonical-json-v1" });
    expect(stationStageDraftSchema.safeParse(wrongEncoding).success).toBe(false);
  });

  it("preserves actual source identifiers and backup/media references without trimming", async () => {
    const draft = synthetic();
    draft.manifest.sourceBackup!.reference = " private-fixture/backup with spaces ";
    const capture = draft.manifest.rawCaptures[0];
    capture.sourceId = " legacy source id ";
    if (capture.state !== "captured") throw new Error("Expected capture");
    capture.artifactReference = " private-fixture/source with spaces ";
    const candidate = await prepareStationGeneration(draft);
    expect(candidate.manifest.sourceBackup!.reference).toBe(draft.manifest.sourceBackup!.reference);
    expect(candidate.manifest.rawCaptures[0].sourceId).toBe(" legacy source id ");
    expect(await verifyStationGeneration(candidate)).toEqual(candidate);
  });

  it("retains exact raw strings, reserved JSON keys, zero and unknowns while recomputing canonical payload digest", async () => {
    const draft = synthetic();
    draft.archive.locations[0].coordinates = { latitude: 0, longitude: 0 };
    draft.archive.inventory[0].legacy = [{ kind: "radio", sourceId: "original", sourceVersion: 0, payload: JSON.parse('{"__proto__":{"constructor":false},"raw":null,"unicode":"\\ud800"}') }];
    const capture = draft.manifest.rawCaptures[0];
    if (capture.state !== "captured") throw new Error("Expected capture");
    const originalString = capture.rawPayload;
    const candidate = await prepareStationGeneration(draft);
    const actual = candidate.manifest.rawCaptures[0];
    if (actual.state !== "captured") throw new Error("Expected capture");
    expect(actual.rawPayload).toBe(originalString);
    expect(actual.canonicalPayloadDigest).toBe(await digestWorkbenchJson(originalString));
    expect(actual.digest).toBe("b".repeat(64)); // External artifact digest is preserved, not recomputed/claimed verified.
    expect(candidate.archive.locations[0].coordinates).toEqual({ latitude: 0, longitude: 0 });
    expect(candidate.archive.inventory[0].legacy[0].payload.__proto__).toEqual({ constructor: false });
    expect(candidate.manifest.rawCaptures[0].sourceVersion.state).toBe("unknown");
    expect(await verifyStationGeneration(candidate)).toEqual(candidate);
    capture.rawPayload = JSON.parse('{"__proto__":0,"constructor":false}');
    const objectCandidate = await prepareStationGeneration(draft);
    expect(canonicalWorkbenchJson(objectCandidate)).toContain('"__proto__":0');
  });

  it("rejects an incorrect canonical raw digest and a claimed digest without the payload", async () => {
    const draft = synthetic();
    const capture = draft.manifest.rawCaptures[0];
    if (capture.state !== "captured") throw new Error("Expected capture");
    capture.canonicalPayloadDigest = "0".repeat(64);
    await expect(prepareStationGeneration(draft)).rejects.toThrow("Raw canonical payload digest mismatch");
    delete capture.rawPayload;
    expect(() => stationStageDraftSchema.parse(draft)).toThrow("requires its actual supplied raw payload");
    delete capture.canonicalPayloadDigest;
    const candidate = await prepareStationGeneration(draft);
    expect(candidate.seal.externalArtifactsVerified).toBe(false);
    expect(candidate.manifest.rawCaptures[0]).not.toHaveProperty("canonicalPayloadDigest");
  });

  it("checks capture/mapping/finding identities and destination references", () => {
    const missingCapture = synthetic();
    missingCapture.manifest.sourceMappings[0].captureId = "missing";
    expect(() => stationStageDraftSchema.parse(missingCapture)).toThrow("missing capture");
    const missingDestination = synthetic();
    missingDestination.manifest.sourceMappings[0].destinations = [{ kind: "equipment", id: "missing" }];
    expect(() => stationStageDraftSchema.parse(missingDestination)).toThrow("destination is not");
    const duplicate = synthetic();
    duplicate.manifest.rawCaptures.push(duplicate.manifest.rawCaptures[0]);
    expect(() => stationStageDraftSchema.parse(duplicate)).toThrow("Duplicate raw capture");
    const duplicateMapping = synthetic();
    duplicateMapping.manifest.sourceMappings.push({ ...duplicateMapping.manifest.sourceMappings[0], id: "second" });
    expect(() => stationStageDraftSchema.parse(duplicateMapping)).toThrow("source occurrence");
    const findings = synthetic();
    findings.manifest.parityFindings.push({ id: "finding", sourceCaptureIds: ["missing"], path: ["radios", 0], code: "missing-field", severity: "warning", message: "Raw field was not recorded" });
    expect(() => stationStageDraftSchema.parse(findings)).toThrow("missing capture");
  });

  it("accounts for deduplicated media IDs from live and historical equipment, retaining missing observations", async () => {
    const archive = createHfFixture();
    archive.revisions[0].equipment[0].privateMetadata.manualMediaIds = ["historical-manual"];
    archive.revisions[0].equipment[0].privateMetadata.galleryImageIds = ["private-photo", "historical-gallery", "private-photo"];
    archive.inventory[0].privateMetadata.primaryImageId = "primary-image";
    const draft = synthetic(archive);
    const candidate = await prepareStationGeneration(draft);
    expect(candidate.seal.canonicalMediaIds).toEqual(["historical-gallery", "historical-manual", "primary-image", "private-photo", "private-receipt"]);
    expect(candidate.manifest.mediaAvailability.every((entry) => entry.state === "missing")).toBe(true);
    const missing = structuredClone(draft);
    missing.manifest.mediaAvailability.pop();
    expect(() => stationStageDraftSchema.parse(missing)).toThrow("requires an availability observation");
    const extra = structuredClone(draft);
    extra.manifest.mediaAvailability.push({ imageId: "unknown-raw-legacy-photo", state: "unverified", reference: null, reason: "Must remain raw recovery" });
    expect(() => stationStageDraftSchema.parse(extra)).toThrow("not referenced");
    const duplicate = structuredClone(draft);
    duplicate.manifest.mediaAvailability.push(duplicate.manifest.mediaAvailability[0]);
    expect(() => stationStageDraftSchema.parse(duplicate)).toThrow("Duplicate media");
  });

  it("never upgrades available media metadata or caller parity text into trusted verification", async () => {
    const draft = synthetic();
    draft.manifest.mediaAvailability[0] = { imageId: draft.manifest.mediaAvailability[0].imageId, state: "available", reference: "private-fixture/photo.jpg", digest: "c".repeat(64) };
    draft.manifest.parityFindings.push({ id: "claim", sourceCaptureIds: ["raw-shack"], path: [], code: "claimed-parity", severity: "info", message: "Caller says everything passed" });
    const candidate = await prepareStationGeneration(draft);
    expect(candidate.seal.externalArtifactsVerified).toBe(false);
    expect(candidate.seal.legacyCutoverAuthorized).toBe(false);
    expect(candidate.seal.verificationLimits).toContain("capture-completeness-unverified");
    Object.assign(draft.manifest, { parityPassed: true });
    expect(stationStageDraftSchema.safeParse(draft).success).toBe(false);
  });
});

describe("generation integrity and isolation", () => {
  it("detaches before asynchronous work and freezes the entire candidate", async () => {
    const draft = synthetic();
    const pending = prepareStationGeneration(draft);
    draft.archive.inventory[0].label = "Changed during digest";
    const candidate = await pending;
    expect(candidate.archive.inventory[0].label).not.toBe("Changed during digest");
    expect(Object.isFrozen(candidate.archive.revisions[0].equipment)).toBe(true);
    expect(Object.isFrozen(candidate.manifest.rawCaptures[0])).toBe(true);
    expect(Object.isFrozen(candidate.seal.recordManifest[0])).toBe(true);
    const verified = await verifyStationGeneration(candidate);
    expect(verified).not.toBe(candidate);
    expect(verified).toEqual(candidate);
  });

  it("rejects altered body/manifest/seal content and forged verification flags", async () => {
    const candidate = await prepareStationGeneration(synthetic());
    const changes: Array<(value: StationGenerationCandidate) => void> = [
      (value) => { value.archive.inventory[0].label = "Changed"; },
      (value) => { value.manifest.sourceBackup!.reference = "different-backup"; },
      (value) => { value.seal.archiveDigest = "0".repeat(64); },
      (value) => { value.seal.recordManifest[0].bodyDigest = "0".repeat(64); },
      (value) => { value.seal.canonicalMediaIds = []; },
      (value) => { Object.assign(value.seal, { legacyCutoverAuthorized: true }); },
      (value) => { Object.assign(value.seal, { externalArtifactsVerified: true }); },
    ];
    for (const change of changes) {
      const changed = JSON.parse(canonicalWorkbenchJson(candidate)) as StationGenerationCandidate;
      change(changed);
      await expect(verifyStationGeneration(changed)).rejects.toThrow();
    }
    expect(stationGenerationCandidateSchema.safeParse({ ...candidate, passed: true }).success).toBe(false);
  });

  it("recomputes derived proof rather than trusting a caller-rehashed wrong archive digest", async () => {
    const candidate = JSON.parse(canonicalWorkbenchJson(await prepareStationGeneration(synthetic()))) as StationGenerationCandidate;
    candidate.seal.archiveDigest = "0".repeat(64);
    const { sealDigest: _old, ...seal } = candidate.seal;
    candidate.seal.sealDigest = await digestWorkbenchJson({ manifest: candidate.manifest, archive: candidate.archive, seal });
    await expect(verifyStationGeneration(candidate)).rejects.toThrow("derived manifest digest mismatch");
  });

  it("allows object key reordering but rejects schema normalization of sealed identity", async () => {
    const candidate = await prepareStationGeneration(newEmpty());
    const reordered = Object.fromEntries(Object.entries(candidate).reverse());
    expect(await verifyStationGeneration(reordered)).toEqual(candidate);
    const changed = JSON.parse(canonicalWorkbenchJson(candidate)) as StationGenerationCandidate;
    changed.manifest.generationId = " new-generation ";
    await expect(verifyStationGeneration(changed)).rejects.toThrow("schema-normalized");
  });

  it("rejects accessors before touching manifests or raw payloads", async () => {
    const getter = vi.fn(() => newEmpty().manifest);
    const input = Object.defineProperty({ archive: newEmpty().archive }, "manifest", { enumerable: true, get: getter });
    expect(stationStageDraftSchema.safeParse(input).success).toBe(false);
    await expect(prepareStationGeneration(input)).rejects.toThrow("accessors");
    await expect(verifyStationGeneration(input)).rejects.toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
  });
});

import { z } from "zod";
import { workbenchArchiveSchema, type DeepReadonly, type WorkbenchArchive } from "@/lib/station/workbench/contracts";
import { stationEntityKindSchema, type StationEntityKind } from "@/lib/station/workbench/storage/operations";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

const id = z.string().trim().min(1);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const instant = z.string().datetime({ offset: true });
// Source locators are captured provenance; trimming could change a real artifact
// name or original identifier. Reject blank locators without normalizing them.
const locator = z.string().refine((value) => value.trim().length > 0, "Source locator cannot be blank");
const integer = z.number().int().nonnegative();
const identity = z.object({ kind: stationEntityKindSchema, id }).strict();
const version = identity.extend({ versionId: id });
const path = z.array(z.union([z.string(), integer]));
const severity = z.enum(["info", "warning", "error"]);
const diagnostic = z.object({ code: id, severity, path, message: id }).strict();
const proofClass = z.enum(["new-empty", "synthetic", "import-rehearsal"]);
const sourceVersion = z.discriminatedUnion("state", [
  z.object({ state: z.literal("known"), value: integer }).strict(),
  z.object({ state: z.literal("unknown"), reason: id }).strict(),
]);
const captureBase = z.object({ id, sourceNamespace: locator, sourceId: locator, sourceVersion, capturedAt: instant }).strict();
const rawCapture = z.discriminatedUnion("state", [
  captureBase.extend({
    state: z.literal("captured"), artifactReference: locator, digest,
    // Plain JSON is enforced by the enclosing preflight, before Zod reads it.
    rawPayload: z.unknown().optional(), canonicalPayloadDigest: digest.optional(),
  }),
  captureBase.extend({ state: z.literal("missing"), reason: id }),
  captureBase.extend({ state: z.literal("unavailable"), reason: id }),
]);
const mediaAvailability = z.discriminatedUnion("state", [
  z.object({ imageId: id, state: z.literal("available"), reference: locator, digest }).strict(),
  z.object({ imageId: id, state: z.literal("missing"), reference: locator.nullable(), reason: id }).strict(),
  z.object({ imageId: id, state: z.literal("unverified"), reference: locator.nullable(), digest: digest.optional(), reason: id }).strict(),
]);
const manifestSchema = z.object({
  schemaVersion: z.literal(1), kind: proofClass, ownerId: id, generationId: id,
  sourceGenerationId: id.nullable(), createdAt: instant,
  recordVersions: z.array(version),
  sourceBackup: z.object({ ownerId: id, reference: locator, digest, encoding: z.enum(["exact-bytes", "utf16le-code-units"]) }).strict().nullable(),
  rawCaptures: z.array(rawCapture),
  sourceMappings: z.array(z.object({
    id, captureId: id, sourcePath: path, occurrence: integer, adapterVersion: id,
    status: z.enum(["mapped", "needs-review", "quarantined", "retained-only"]),
    destinations: z.array(identity), diagnostics: z.array(diagnostic),
  }).strict()),
  mediaAvailability: z.array(mediaAvailability),
  // These are caller-supplied observations, never a trusted cutover disposition.
  parityFindings: z.array(z.object({ id, sourceCaptureIds: z.array(id), path, code: id, severity, message: id }).strict()),
}).strict();
const draftObject = z.object({ manifest: manifestSchema, archive: workbenchArchiveSchema }).strict();
type ParsedDraft = z.infer<typeof draftObject>;
const key = (entry: { kind: StationEntityKind; id: string }) => JSON.stringify([entry.kind, entry.id]);

function detach(input: unknown, ctx: z.RefinementCtx): unknown {
  try { return JSON.parse(canonicalWorkbenchJson(input)); }
  catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Stage requires plain JSON", fatal: true });
    return z.NEVER;
  }
}

/** This inventory is derived from the whole supplied aggregate, including retained
 * revisions and imported operating/publication pins. It does not author a selection. */
function archiveRecords(archive: WorkbenchArchive): { kind: StationEntityKind; id: string; body: unknown }[] {
  return [
    ...archive.models.map((body) => ({ kind: "model" as const, id: body.id, body })),
    ...archive.inventory.map((body) => ({ kind: "equipment" as const, id: body.id, body })),
    ...archive.evidence.map((body) => ({ kind: "evidence" as const, id: body.id, body })),
    ...archive.locations.map((body) => ({ kind: "location" as const, id: body.id, body })),
    ...archive.setups.map((body) => ({ kind: "setup" as const, id: body.id, body })),
    ...archive.revisions.map((body) => ({ kind: "revision" as const, id: body.id, body })),
    ...archive.layouts.map((body) => ({ kind: "layout" as const, id: body.id, body })),
    ...archive.experiments.map((body) => ({ kind: "experiment" as const, id: body.id, body })),
    ...(archive.operating ? [{ kind: "operating" as const, id: "operating", body: archive.operating }] : []),
    ...archive.publications.map((body) => ({ kind: "publication-source" as const, id: body.id, body })),
  ];
}

function mediaIds(archive: WorkbenchArchive): Set<string> {
  const result = new Set<string>();
  for (const equipment of [...archive.inventory, ...archive.revisions.flatMap((revision) => revision.equipment)]) {
    const metadata = equipment.privateMetadata;
    for (const mediaId of [
      ...metadata.imageIds, ...metadata.receiptMediaIds, ...(metadata.manualMediaIds ?? []),
      ...(metadata.galleryImageIds ?? []), ...(metadata.primaryImageId ? [metadata.primaryImageId] : []),
    ]) result.add(mediaId);
  }
  return result;
}

function checkDraft({ manifest, archive }: ParsedDraft, ctx: z.RefinementCtx): void {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (manifest.ownerId !== archive.ownerId) issue("Manifest and archive owner must match");
  if (manifest.sourceGenerationId === manifest.generationId) issue("Generation cannot name itself as its source");
  const records = new Map(archiveRecords(archive).map((record) => [key(record), record]));
  const supplied = new Set<string>();
  for (const record of manifest.recordVersions) {
    const recordKey = key(record);
    if (supplied.has(recordKey)) issue("Duplicate record-version identity");
    supplied.add(recordKey);
    if (!records.has(recordKey)) issue("Record-version identity is not in the supplied archive");
    if (record.kind === "revision" && record.id !== record.versionId) issue("Revision version must equal immutable revision ID");
  }
  if ([...records.keys()].some((recordKey) => !supplied.has(recordKey))) issue("Record-version manifest must cover the complete supplied archive");

  if (manifest.kind === "new-empty") {
    if (records.size !== 0) issue("New-empty requires every archive collection empty and operating null");
    if (manifest.sourceGenerationId !== null || manifest.sourceBackup !== null || manifest.rawCaptures.length || manifest.sourceMappings.length || manifest.mediaAvailability.length) issue("New-empty cannot include source lineage, backups, captures, mappings or media");
  } else {
    if (!manifest.sourceBackup || !manifest.rawCaptures.length) issue("Synthetic/import rehearsal requires a source backup and raw capture metadata");
  }
  if (manifest.sourceBackup && manifest.sourceBackup.ownerId !== manifest.ownerId) issue("Source backup owner must match manifest owner");
  const captures = new Set<string>();
  for (const capture of manifest.rawCaptures) {
    if (captures.has(capture.id)) issue("Duplicate raw capture identity");
    captures.add(capture.id);
    if (capture.state === "captured" && capture.canonicalPayloadDigest !== undefined && !Object.prototype.hasOwnProperty.call(capture, "rawPayload")) issue("Canonical payload digest requires its actual supplied raw payload");
  }
  const mappings = new Set<string>();
  const mappedSources = new Set<string>();
  for (const mapping of manifest.sourceMappings) {
    if (mappings.has(mapping.id)) issue("Duplicate source mapping identity");
    mappings.add(mapping.id);
    if (!captures.has(mapping.captureId)) issue("Source mapping references missing capture");
    const sourceKey = JSON.stringify([mapping.captureId, mapping.sourcePath, mapping.occurrence]);
    if (mappedSources.has(sourceKey)) issue("Duplicate mapping for source occurrence");
    mappedSources.add(sourceKey);
    const destinations = new Set<string>();
    for (const destination of mapping.destinations) {
      const destinationKey = key(destination);
      if (destinations.has(destinationKey)) issue("Duplicate mapping destination");
      destinations.add(destinationKey);
      if (!records.has(destinationKey)) issue("Source mapping destination is not in supplied archive");
    }
    if (mapping.status === "mapped" && mapping.destinations.length === 0) issue("Mapped source requires a canonical destination");
  }
  const findings = new Set<string>();
  for (const finding of manifest.parityFindings) {
    if (findings.has(finding.id)) issue("Duplicate parity finding identity");
    findings.add(finding.id);
    const references = new Set<string>();
    for (const captureId of finding.sourceCaptureIds) {
      if (!captures.has(captureId)) issue("Parity finding references missing capture");
      if (references.has(captureId)) issue("Duplicate parity capture reference");
      references.add(captureId);
    }
  }
  const requiredMedia = mediaIds(archive);
  const observedMedia = new Set<string>();
  for (const observation of manifest.mediaAvailability) {
    if (observedMedia.has(observation.imageId)) issue("Duplicate media availability identity");
    observedMedia.add(observation.imageId);
    if (!requiredMedia.has(observation.imageId)) issue("Media availability is not referenced by canonical equipment");
  }
  if ([...requiredMedia].some((mediaId) => !observedMedia.has(mediaId))) issue("Every canonical equipment media ID requires an availability observation");
}

const verificationLimits = [
  "external-backup-bytes-unverified", "external-media-bytes-unverified", "capture-completeness-unverified",
  "owner-source-parity-unverified", "synthetic-proof-is-not-operator-evidence",
] as const;
const sealObject = z.object({
  schemaVersion: z.literal(1), archiveSchemaVersion: z.literal(1), proofClass,
  archiveDigest: digest, manifestDigest: digest,
  recordManifest: z.array(version.extend({ bodyDigest: digest })),
  canonicalMediaIds: z.array(id),
  validation: z.object({ suppliedArchiveReferences: z.literal("validated"), recordManifestCoverage: z.literal("complete"), ownerBinding: z.literal("matched") }).strict(),
  legacyCutoverAuthorized: z.literal(false), externalArtifactsVerified: z.literal(false),
  verificationLimits: z.tuple([
    z.literal(verificationLimits[0]), z.literal(verificationLimits[1]), z.literal(verificationLimits[2]),
    z.literal(verificationLimits[3]), z.literal(verificationLimits[4]),
  ]),
  sealDigest: digest,
}).strict();
export const stationStageDraftSchema = z.preprocess(detach, draftObject.superRefine(checkDraft));
export const stationGenerationCandidateSchema = z.preprocess(detach, draftObject.extend({ seal: sealObject }).superRefine(checkDraft));
export type StationStageDraft = z.infer<typeof stationStageDraftSchema>;
export type StationGenerationCandidate = z.infer<typeof stationGenerationCandidateSchema>;
export type StationGenerationSeal = z.infer<typeof sealObject>;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Pure validation of the complete SUPPLIED archive and manifest. No artifact
 * reads, capture-completeness claim, actual operator parity or pointer change.
 * Synthetic/rehearsal seals never authorize replacing a legacy reader. */
export async function prepareStationGeneration(input: unknown): Promise<DeepReadonly<StationGenerationCandidate>> {
  const draft = stationStageDraftSchema.parse(input);
  for (const capture of draft.manifest.rawCaptures) {
    if (capture.state === "captured" && Object.prototype.hasOwnProperty.call(capture, "rawPayload")) {
      const actual = await digestWorkbenchJson(capture.rawPayload);
      if (capture.canonicalPayloadDigest !== undefined && capture.canonicalPayloadDigest !== actual) throw new TypeError("Raw canonical payload digest mismatch");
      capture.canonicalPayloadDigest = actual;
    }
  }
  const records = new Map(archiveRecords(draft.archive).map((record) => [key(record), record]));
  const recordManifest = await Promise.all(draft.manifest.recordVersions.map(async (record) => ({
    ...record, bodyDigest: await digestWorkbenchJson(records.get(key(record))!.body),
  })));
  const seal = {
    schemaVersion: 1 as const, archiveSchemaVersion: draft.archive.schemaVersion, proofClass: draft.manifest.kind,
    archiveDigest: await digestWorkbenchJson(draft.archive), manifestDigest: await digestWorkbenchJson(draft.manifest),
    recordManifest, canonicalMediaIds: [...mediaIds(draft.archive)].sort(),
    validation: { suppliedArchiveReferences: "validated" as const, recordManifestCoverage: "complete" as const, ownerBinding: "matched" as const },
    legacyCutoverAuthorized: false as const, externalArtifactsVerified: false as const, verificationLimits: [...verificationLimits],
  };
  const sealDigest = await digestWorkbenchJson({ ...draft, seal });
  return freeze(stationGenerationCandidateSchema.parse({ ...draft, seal: { ...seal, sealDigest } }));
}

/** Recompute all derived claims and hashes. A caller cannot hash a false "passed"
 * claim into a valid seal. External artifact metadata remains unverified. */
export async function verifyStationGeneration(input: unknown): Promise<DeepReadonly<StationGenerationCandidate>> {
  const original = canonicalWorkbenchJson(input);
  const candidate = stationGenerationCandidateSchema.parse(JSON.parse(original));
  if (canonicalWorkbenchJson(candidate) !== original) throw new TypeError("Sealed generation must already have schema-normalized canonical content");
  const expected = await prepareStationGeneration({ manifest: candidate.manifest, archive: candidate.archive });
  if (canonicalWorkbenchJson(expected) !== original) throw new TypeError("Generation seal or derived manifest digest mismatch");
  return expected;
}

import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHfFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import { stationArchiveIdentities } from "@/lib/station/workbench/storage/state";
import { prepareStationGeneration, verifyStationGeneration, type StationStageDraft } from "@/lib/station/workbench/storage/staging";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";
import {
  prepareStationStageChunks, verifyStationStageChunks, stationStageChunksSchema, STATION_STAGE_CHUNK_BYTES,
  type StationStageChunks,
} from "@/lib/station/workbench/storage/stageChunks";

function draft(): StationStageDraft {
  const archive = createHfFixture();
  const media = new Set([...archive.inventory, ...archive.revisions.flatMap((revision) => revision.equipment)].flatMap(({ privateMetadata: item }) => [
    ...item.imageIds, ...item.receiptMediaIds, ...(item.manualMediaIds ?? []), ...(item.galleryImageIds ?? []), ...(item.primaryImageId ? [item.primaryImageId] : []),
  ]));
  return { archive, manifest: {
    schemaVersion: 1, kind: "synthetic", ownerId: FIXTURE_OWNER, generationId: "new-generation", sourceGenerationId: "old-generation", createdAt: FIXTURE_DATE,
    recordVersions: stationArchiveIdentities(archive).map((item) => ({ ...item, versionId: item.kind === "revision" ? item.id : `${item.id}-v1` })),
    sourceBackup: { ownerId: FIXTURE_OWNER, reference: " original backup ", digest: "a".repeat(64), encoding: "utf16le-code-units" },
    rawCaptures: [{ id: "capture", sourceNamespace: " localStorage ", sourceId: "raw", sourceVersion: { state: "known", value: 0 }, capturedAt: FIXTURE_DATE,
      state: "captured", artifactReference: "raw/source", digest: "b".repeat(64), rawPayload: { original: [0, false, null] } }],
    sourceMappings: [{ id: "mapping", captureId: "capture", sourcePath: ["items", 0], occurrence: 0, adapterVersion: "v1", status: "retained-only", destinations: [], diagnostics: [] }],
    mediaAvailability: [...media].map((imageId) => ({ imageId, state: "missing", reference: null, reason: "Synthetic media unavailable" })),
    parityFindings: [{ id: "finding", sourceCaptureIds: ["capture"], path: [], code: "unverified", severity: "warning", message: "Operator parity unavailable" }],
  } };
}
async function bundle(input = draft()) {
  return stationStageChunksSchema.parse(await prepareStationStageChunks({ stageId: "stage", candidate: await prepareStationGeneration(input) }));
}
async function refreshPlan(value: StationStageChunks): Promise<void> {
  const { planDigest: _digest, ...header } = value.plan;
  void _digest;
  value.plan.planDigest = await digestWorkbenchJson(header);
  value.payloads.forEach((payload) => { payload.planDigest = value.plan.planDigest; });
}
async function rawDigest(bytes: Uint8Array): Promise<string> {
  return Buffer.from(await webcrypto.subtle.digest("SHA-256", new Uint8Array(bytes))).toString("hex");
}
/** Construct a consistently hashed transport bundle for deliberately bad JSON. */
async function replaceBytes(value: StationStageChunks, bytes: Uint8Array): Promise<void> {
  value.plan.byteLength = bytes.length;
  value.plan.candidateDigest = await rawDigest(bytes);
  value.plan.chunks = [];
  value.payloads = [];
  for (let offset = 0; offset < bytes.length; offset += STATION_STAGE_CHUNK_BYTES) {
    const part = bytes.subarray(offset, offset + STATION_STAGE_CHUNK_BYTES);
    const ordinal = value.plan.chunks.length;
    value.plan.chunks.push({ ordinal, byteLength: part.length, digest: await rawDigest(part) });
    value.payloads.push({ ownerId: value.plan.ownerId, stageId: value.plan.stageId, generationId: value.plan.generationId,
      planDigest: value.plan.planDigest, ordinal, bytesBase64: Buffer.from(part).toString("base64") });
  }
  await refreshPlan(value);
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("inactive stage canonical byte chunks", () => {
  it("plans a valid candidate at its exact 128-container boundary without counting the request wrapper", async () => {
    const input = draft();
    const capture = input.manifest.rawCaptures[0];
    if (capture.state !== "captured") throw new Error("Fixture");
    let payload: unknown = 0;
    for (let depth = 0; depth < 124; depth++) payload = { child: payload };
    capture.rawPayload = payload;
    const candidate = await prepareStationGeneration(input);
    expect(await verifyStationGeneration(candidate)).toEqual(candidate);
    const chunks = await prepareStationStageChunks({ stageId: "stage", candidate });
    expect(await verifyStationStageChunks(chunks)).toEqual(candidate);
    capture.rawPayload = { child: payload };
    await expect(prepareStationGeneration(input)).rejects.toThrow(/128 nested containers/);
  });
  it.each(["missing", "extra", "hidden-extra", "symbol", "prototype", "array", "hidden-stage", "hidden-candidate", "stage-getter", "candidate-getter"])("rejects malformed %s wrapper without invoking getters", async (change) => {
    const candidate = await prepareStationGeneration(draft());
    let input: object = { stageId: "stage", candidate };
    const getter = vi.fn(() => candidate);
    if (change === "missing") input = { stageId: "stage" };
    if (change === "extra") input = { stageId: "stage", candidate, extra: 1 };
    if (change === "hidden-extra") Object.defineProperty(input, "extra", { value: 1 });
    if (change === "symbol") Object.defineProperty(input, Symbol("hidden"), { value: 1 });
    if (change === "prototype") input = Object.assign(Object.create({ inherited: true }), input);
    if (change === "array") input = ["stage", candidate];
    if (change === "hidden-stage") Object.defineProperty(input, "stageId", { enumerable: false });
    if (change === "hidden-candidate") Object.defineProperty(input, "candidate", { enumerable: false });
    if (change === "stage-getter") Object.defineProperty(input, "stageId", { get: getter, enumerable: true });
    if (change === "candidate-getter") Object.defineProperty(input, "candidate", { get: getter, enumerable: true });
    await expect(prepareStationStageChunks(input)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it("accepts a plain null-prototype wrapper and detaches before asynchronous caller mutation", async () => {
    const candidate = JSON.parse(canonicalWorkbenchJson(await prepareStationGeneration(draft())));
    const original = structuredClone(candidate);
    const request = Object.assign(Object.create(null), { stageId: "stage", candidate });
    const pending = prepareStationStageChunks(request);
    request.stageId = "changed-stage";
    candidate.manifest.ownerId = "changed-owner";
    candidate.archive.inventory[0].label = "Changed after call";
    const result = await pending;
    expect(result.plan.stageId).toBe("stage");
    expect(await verifyStationStageChunks(result)).toEqual(original);
  });
  it("round-trips an explicit new-empty generation without granting cutover", async () => {
    const input = draft();
    input.archive = { schemaVersion: 1, ownerId: FIXTURE_OWNER, models: [], inventory: [], evidence: [], locations: [], setups: [], revisions: [], layouts: [], experiments: [], publications: [], operating: null };
    input.manifest = { ...input.manifest, kind: "new-empty", sourceGenerationId: null, sourceBackup: null,
      recordVersions: [], rawCaptures: [], sourceMappings: [], mediaAvailability: [], parityFindings: [] };
    const restored = await verifyStationStageChunks(await bundle(input));
    expect(restored.archive).toEqual(input.archive);
    expect(restored.seal).toMatchObject({ proofClass: "new-empty", legacyCutoverAuthorized: false, externalArtifactsVerified: false });
  });
  it("plans deterministically and restores the complete candidate/provenance without authorization", async () => {
    const candidate = await prepareStationGeneration(draft());
    const one = await prepareStationStageChunks({ stageId: "stage", candidate });
    expect(await prepareStationStageChunks({ stageId: "stage", candidate })).toEqual(one);
    const restored = await verifyStationStageChunks(one);
    expect(restored).toEqual(candidate);
    expect(restored.seal.legacyCutoverAuthorized).toBe(false);
    expect(restored.seal.externalArtifactsVerified).toBe(false);
    expect(Object.isFrozen(one.plan.chunks)).toBe(true);
    expect(Object.isFrozen(restored.manifest)).toBe(true);
  });
  it("preserves supplied collection order rather than sorting identities", async () => {
    const input = draft();
    const original = await bundle(input);
    input.archive.inventory.reverse();
    input.manifest.recordVersions.reverse();
    const changed = await bundle(input);
    expect(changed.plan.candidateDigest).not.toBe(original.plan.candidateDigest);
    const restored = await verifyStationStageChunks(changed);
    expect(restored.archive.inventory.map(({ id }) => id)).toEqual(input.archive.inventory.map(({ id }) => id));
    expect(restored.manifest.recordVersions).toEqual(input.manifest.recordVersions);
  });
  it("splits a large raw record and preserves reserved keys, zero, null and lone surrogates", async () => {
    const input = draft();
    const capture = input.manifest.rawCaptures[0];
    if (capture.state !== "captured") throw new Error("Fixture");
    capture.rawPayload = JSON.parse('{"__proto__":{"constructor":[0,false,null]},"lone":"\\ud800","low":"\\udc00"}');
    (capture.rawPayload as Record<string, unknown>).large = "x".repeat(STATION_STAGE_CHUNK_BYTES * 2);
    const value = await bundle(input);
    expect(value.payloads.length).toBeGreaterThan(2);
    value.payloads.reverse();
    const restored = await verifyStationStageChunks(value);
    const raw = restored.manifest.rawCaptures[0];
    expect(raw.state === "captured" && raw.rawPayload).toEqual(capture.rawPayload);
  });
  it("joins bytes before decoding a multibyte character split across the fixed boundary", async () => {
    const input = draft();
    const capture = input.manifest.rawCaptures[0];
    if (capture.state !== "captured") throw new Error("Fixture");
    capture.rawPayload = "🛰";
    const small = await prepareStationGeneration(input);
    const prefix = canonicalWorkbenchJson(small).split("🛰")[0];
    const padding = STATION_STAGE_CHUNK_BYTES - 1 - new TextEncoder().encode(prefix).length;
    capture.rawPayload = "x".repeat(padding) + "🛰";
    const value = await bundle(input);
    const first = Buffer.from(value.payloads[0].bytesBase64, "base64");
    expect(first[first.length - 1]).toBe(0xf0);
    expect((await verifyStationStageChunks(value)).manifest.rawCaptures[0]).toMatchObject({ rawPayload: capture.rawPayload });
  });
  it.each(["ownerId", "stageId", "generationId", "planDigest"] as const)("rejects wrong payload %s", async (field) => {
    const value = await bundle();
    value.payloads[0][field] = field === "planDigest" ? "c".repeat(64) : "wrong";
    await expect(verifyStationStageChunks(value)).rejects.toThrow(/binding/);
  });
  it.each(["duplicate", "gap", "extra", "unexpected", "negative"])("rejects %s payload inventory", async (change) => {
    const value = await bundle();
    if (change === "duplicate" || change === "extra") value.payloads.push({ ...value.payloads[0] });
    if (change === "gap") value.payloads.pop();
    if (change === "unexpected") value.payloads[0].ordinal = 99;
    if (change === "negative") value.payloads[0].ordinal = -1;
    await expect(verifyStationStageChunks(value)).rejects.toThrow();
  });
  it("rejects duplicate ordinals even when total payload count is correct", async () => {
    const input = draft();
    const capture = input.manifest.rawCaptures[0];
    if (capture.state !== "captured") throw new Error("Fixture");
    capture.rawPayload = "x".repeat(STATION_STAGE_CHUNK_BYTES);
    const value = await bundle(input);
    expect(value.payloads).toHaveLength(2);
    value.payloads[1] = { ...value.payloads[0] };
    await expect(verifyStationStageChunks(value)).rejects.toThrow(/Duplicate/);
  });
  it.each(["scope", "source", "seal", "candidate"])("rejects consistently rehashed but wrong %s binding", async (change) => {
    const value = await bundle();
    if (change === "scope") { value.plan.generationId = "different"; value.payloads.forEach((part) => { part.generationId = "different"; }); }
    if (change === "source") value.plan.sourceGenerationId = "different-source";
    if (change === "seal") value.plan.sealDigest = "c".repeat(64);
    if (change === "candidate") value.plan.candidateDigest = "c".repeat(64);
    await refreshPlan(value);
    await expect(verifyStationStageChunks(value)).rejects.toThrow(/binding|digest/);
  });
  it.each(["alphabet", "oversized", "length", "padding"])("rejects %s payload before decoding", async (change) => {
    const value = await bundle();
    if (change === "alphabet") value.payloads[0].bytesBase64 = "!" + value.payloads[0].bytesBase64.slice(1);
    if (change === "oversized") value.payloads[0].bytesBase64 = "A".repeat(400000);
    if (change === "length") value.payloads[0].bytesBase64 = "AAAA";
    if (change === "padding") {
      value.payloads[0].bytesBase64 = value.payloads[0].bytesBase64.slice(0, -4) + "AB==";
    }
    const decoder = vi.spyOn(globalThis, "atob");
    await expect(verifyStationStageChunks(value)).rejects.toThrow();
    expect(decoder).not.toHaveBeenCalled();
  });
  it("rejects altered plan and payload digests", async () => {
    const value = await bundle();
    value.plan.chunks[0].digest = "c".repeat(64);
    await expect(verifyStationStageChunks(value)).rejects.toThrow(/plan digest/);
    await refreshPlan(value);
    await expect(verifyStationStageChunks(value)).rejects.toThrow(/payload digest/);
  });
  it.each(["duplicate-key", "whitespace", "invalid-utf8", "bom"])("rejects %s bytes even with consistent transport hashes", async (change) => {
    const value = await bundle();
    const original = Buffer.from(value.payloads[0].bytesBase64, "base64").toString("utf8");
    const text = change === "duplicate-key" ? original.replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1') : ` ${original}`;
    const bytes = change === "invalid-utf8" ? new Uint8Array([0xff])
      : change === "bom" ? new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(original)]) : new TextEncoder().encode(text);
    await replaceBytes(value, bytes);
    await expect(verifyStationStageChunks(value)).rejects.toThrow();
  });
  it("rejects false candidate seals before planning and after consistently rehashed reconstruction", async () => {
    const input = draft();
    const candidate = JSON.parse(canonicalWorkbenchJson(await prepareStationGeneration(input)));
    candidate.seal.legacyCutoverAuthorized = true;
    await expect(prepareStationStageChunks({ stageId: "stage", candidate })).rejects.toThrow();
    const value = await bundle(input);
    await replaceBytes(value, new TextEncoder().encode(canonicalWorkbenchJson(candidate)));
    await expect(verifyStationStageChunks(value)).rejects.toThrow();
  });
  it("rejects unsafe metadata and getters without invocation", async () => {
    const value = await bundle();
    value.plan.byteLength = Number.MAX_SAFE_INTEGER + 1;
    await expect(verifyStationStageChunks(value)).rejects.toThrow();
    let invoked = false;
    await expect(prepareStationStageChunks(Object.defineProperty({ stageId: "stage" }, "candidate", { enumerable: true, get() { invoked = true; return null; } }))).rejects.toThrow(/accessors/);
    expect(invoked).toBe(false);
  });
});

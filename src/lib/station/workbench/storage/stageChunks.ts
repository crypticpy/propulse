/** Pure inactive-stage byte planning. No durable writes, materialization,
 * activation or external-artifact verification. Memory remains O(full candidate):
 * chunk limits bound each payload, not total allocation or browser quota. */
import { z } from "zod";
import type { DeepReadonly } from "@/lib/station/workbench/contracts";
import { verifyStationGeneration, type StationGenerationCandidate } from "@/lib/station/workbench/storage/staging";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

export const STATION_STAGE_CHUNK_BYTES = 262144;
const MAX_BASE64_LENGTH = Math.ceil(STATION_STAGE_CHUNK_BYTES / 3) * 4;
const id = z.string().min(1).refine((value) => value.trim() === value, "Identity must be unpadded");
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const ordinal = z.number().int().nonnegative().safe();
const size = z.number().int().positive().safe();
const descriptor = z.object({ ordinal, byteLength: size.max(STATION_STAGE_CHUNK_BYTES), digest }).strict();
const planObject = z.object({
  schemaVersion: z.literal(1), ownerId: id, stageId: id, generationId: id, sourceGenerationId: id.nullable(),
  sealDigest: digest, candidateDigest: digest, encoding: z.literal("canonical-workbench-json-utf8"),
  chunkByteLimit: z.literal(STATION_STAGE_CHUNK_BYTES), byteLength: size, chunks: z.array(descriptor).min(1), planDigest: digest,
}).strict().superRefine((plan, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (plan.generationId === plan.sourceGenerationId) issue("Generation cannot name itself as its source");
  if (plan.chunks.length !== Math.ceil(plan.byteLength / STATION_STAGE_CHUNK_BYTES)) issue("Chunk inventory does not match candidate byte length");
  plan.chunks.forEach((chunk, index) => {
    if (chunk.ordinal !== index) issue("Chunk ordinals must be contiguous and ordered");
    const expected = index === plan.chunks.length - 1 ? plan.byteLength - index * STATION_STAGE_CHUNK_BYTES : STATION_STAGE_CHUNK_BYTES;
    if (chunk.byteLength !== expected) issue("Chunk length does not match fixed chunking policy");
  });
});
const payloadObject = z.object({
  ownerId: id, stageId: id, generationId: id, planDigest: digest, ordinal,
  // Length is checked before decoding; the verifier also checks alphabet,
  // padding bits and exact expected decoded length before allocating bytes.
  bytesBase64: z.string().min(4).max(MAX_BASE64_LENGTH).superRefine((value, ctx) => {
    if (value.length < 4 || value.length > MAX_BASE64_LENGTH) return;
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    const length = value.length / 4 * 3 - padding;
    try {
      if (!Number.isInteger(length) || length > STATION_STAGE_CHUNK_BYTES) throw new TypeError("Invalid encoded chunk length");
      validateBase64(value, length);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Invalid base64 payload" });
    }
  }),
}).strict();
function detach(input: unknown, ctx: z.RefinementCtx): unknown {
  try { return JSON.parse(canonicalWorkbenchJson(input)); }
  catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Plain JSON required", fatal: true });
    return z.NEVER;
  }
}
function freeze<T>(input: T): DeepReadonly<T> {
  if (input && typeof input === "object") { Object.values(input).forEach(freeze); Object.freeze(input); }
  return input as DeepReadonly<T>;
}
export const stationStageChunkPlanSchema = z.preprocess(detach, planObject);
export const stationStageChunkPayloadSchema = z.preprocess(detach, payloadObject);
export const stationStageChunksSchema = z.preprocess(detach, z.object({ plan: planObject, payloads: z.array(payloadObject) }).strict());
export type StationStageChunkPlan = z.infer<typeof stationStageChunkPlanSchema>;
export type StationStageChunkPayload = z.infer<typeof stationStageChunkPayloadSchema>;
export type StationStageChunks = z.infer<typeof stationStageChunksSchema>;

async function bytesDigest(bytes: Uint8Array): Promise<string> {
  const value = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function encodeBase64(bytes: Uint8Array): string {
  // Avoid spreading a full chunk onto the JavaScript call stack.
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function validateBase64(value: string, expectedLength: number): void {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  if (value.length > MAX_BASE64_LENGTH || value.length !== Math.ceil(expectedLength / 3) * 4
    || /[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding))) {
    throw new TypeError("Invalid or oversized canonical base64 payload");
  }
  if (value.length / 4 * 3 - padding !== expectedLength
    || (padding === 2 && (alphabet.indexOf(value[value.length - 3]) & 15) !== 0)
    || (padding === 1 && (alphabet.indexOf(value[value.length - 2]) & 3) !== 0)) {
    throw new TypeError("Noncanonical base64 padding or decoded length mismatch");
  }
}

/** Validate only the request wrapper here. Recursively encoding it would charge
 * an extra container against the candidate's independently defined depth limit.
 * The generation verifier synchronously detaches candidate before its first await. */
function planningRequest(input: unknown): { stageId: string; candidate: unknown } {
  if (input === null || typeof input !== "object"
    || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new TypeError("Chunk planning request requires a plain object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 2 || !keys.includes("stageId") || !keys.includes("candidate")) {
    throw new TypeError("Chunk planning request requires exactly stageId and candidate");
  }
  for (const key of ["stageId", "candidate"]) {
    const property = descriptors[key];
    if (!property.enumerable || !("value" in property)) {
      throw new TypeError("Chunk planning request requires enumerable data properties without accessors");
    }
  }
  return { stageId: id.parse(descriptors.stageId.value), candidate: descriptors.candidate.value };
}

/** Verify and detach first. Source backup digests remain metadata: candidate
 * canonical bytes are never described as exact original external backup bytes. */
export async function prepareStationStageChunks(input: unknown): Promise<DeepReadonly<StationStageChunks>> {
  const request = planningRequest(input);
  const candidate = await verifyStationGeneration(request.candidate);
  const bytes = new TextEncoder().encode(canonicalWorkbenchJson(candidate));
  const chunks: StationStageChunkPlan["chunks"] = [];
  const encoded: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += STATION_STAGE_CHUNK_BYTES) {
    const part = bytes.subarray(offset, offset + STATION_STAGE_CHUNK_BYTES);
    chunks.push({ ordinal: chunks.length, byteLength: part.length, digest: await bytesDigest(part) });
    encoded.push(encodeBase64(part));
  }
  const header = {
    schemaVersion: 1 as const, ownerId: candidate.manifest.ownerId, stageId: request.stageId,
    generationId: candidate.manifest.generationId, sourceGenerationId: candidate.manifest.sourceGenerationId,
    sealDigest: candidate.seal.sealDigest, candidateDigest: await bytesDigest(bytes),
    encoding: "canonical-workbench-json-utf8" as const, chunkByteLimit: STATION_STAGE_CHUNK_BYTES,
    byteLength: bytes.length, chunks,
  };
  const plan = { ...header, planDigest: await digestWorkbenchJson(header) };
  return freeze(stationStageChunksSchema.parse({ plan, payloads: encoded.map((bytesBase64, ordinal) => ({
    ownerId: plan.ownerId, stageId: plan.stageId, generationId: plan.generationId, planDigest: plan.planDigest, ordinal, bytesBase64,
  })) }));
}

/** Verify exact inventory and actual lengths before full reassembly allocation.
 * Payload arrival order is irrelevant; plan descriptor order is protocol data.
 * Joining bytes before UTF-8 decoding preserves split multibyte characters. */
export async function verifyStationStageChunks(input: unknown): Promise<DeepReadonly<StationGenerationCandidate>> {
  const bundle = stationStageChunksSchema.parse(input);
  const { planDigest, ...header } = bundle.plan;
  if (await digestWorkbenchJson(header) !== planDigest) throw new TypeError("Chunk plan digest mismatch");
  const plan = bundle.plan;
  if (bundle.payloads.length !== plan.chunks.length) throw new TypeError("Payload inventory does not match chunk plan");
  const ordered = new Map<number, StationStageChunkPayload>();
  for (const payload of bundle.payloads) {
    if (payload.ownerId !== plan.ownerId || payload.stageId !== plan.stageId || payload.generationId !== plan.generationId || payload.planDigest !== planDigest) {
      throw new TypeError("Chunk payload scope or plan binding mismatch");
    }
    if (ordered.has(payload.ordinal) || payload.ordinal >= plan.chunks.length) throw new TypeError("Duplicate or unexpected chunk ordinal");
    validateBase64(payload.bytesBase64, plan.chunks[payload.ordinal].byteLength);
    ordered.set(payload.ordinal, payload);
  }
  const parts: Uint8Array[] = [];
  for (const chunk of plan.chunks) {
    const payload = ordered.get(chunk.ordinal);
    if (!payload) throw new TypeError("Missing chunk payload");
    const binary = atob(payload.bytesBase64);
    if (binary.length !== chunk.byteLength) throw new TypeError("Decoded chunk length mismatch");
    const part = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (await bytesDigest(part) !== chunk.digest) throw new TypeError("Chunk payload digest mismatch");
    parts.push(part);
  }
  const bytes = new Uint8Array(plan.byteLength);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  if (await bytesDigest(bytes) !== plan.candidateDigest) throw new TypeError("Reassembled candidate digest mismatch");
  // Preserve a BOM as a character, so JSON parsing rejects it rather than
  // silently stripping a noncanonical byte prefix.
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  const canonical = new TextEncoder().encode(canonicalWorkbenchJson(parsed));
  if (canonical.length !== bytes.length || canonical.some((byte, index) => byte !== bytes[index])) {
    throw new TypeError("Reassembled candidate bytes are not exact canonical JSON");
  }
  const candidate = await verifyStationGeneration(parsed);
  if (candidate.manifest.ownerId !== plan.ownerId || candidate.manifest.generationId !== plan.generationId
    || candidate.manifest.sourceGenerationId !== plan.sourceGenerationId || candidate.seal.sealDigest !== plan.sealDigest) {
    throw new TypeError("Reassembled candidate does not match stage plan binding");
  }
  return candidate;
}

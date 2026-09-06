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
const planMetadataObject = z.object({
  schemaVersion: z.literal(1), ownerId: id, stageId: id, generationId: id, sourceGenerationId: id.nullable(),
  sealDigest: digest, candidateDigest: digest, encoding: z.literal("canonical-workbench-json-utf8"),
  chunkByteLimit: z.literal(STATION_STAGE_CHUNK_BYTES), byteLength: size, planDigest: digest,
}).strict();
const planObject = planMetadataObject.extend({ chunks: z.array(descriptor).min(1) }).strict().superRefine((plan, ctx) => {
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
/** Standalone parser facades, deliberately not composable Zod schemas. Zod's
 * outer type detection reads then/catch before preprocess, so raw input must
 * pass our descriptor/primitive guards before entering any Zod parser. */
function guardedParser<S extends z.ZodTypeAny>(schema: S, preflight: (input: unknown) => unknown) {
  const safeParse = (input: unknown): z.SafeParseReturnType<unknown, z.infer<S>> => {
    try {
      const captured = preflight(input);
      return schema.safeParse(JSON.parse(canonicalWorkbenchJson(captured)));
    } catch (error) {
      return { success: false, error: error instanceof z.ZodError ? error : new z.ZodError([{
        code: z.ZodIssueCode.custom, path: [], message: error instanceof Error ? error.message : "Plain JSON required",
      }]) };
    }
  };
  return Object.freeze({
    safeParse,
    parse(input: unknown): z.infer<S> {
      const result = safeParse(input);
      if (!result.success) throw result.error;
      return result.data;
    },
  });
}
function freeze<T>(input: T): DeepReadonly<T> {
  if (input && typeof input === "object") { Object.values(input).forEach(freeze); Object.freeze(input); }
  return input as DeepReadonly<T>;
}
const bundleObject = z.object({ plan: planObject, payloads: z.array(payloadObject) }).strict();
export const stationStageChunkPlanSchema = guardedParser(planObject, preflightPlan);
export const stationStageChunkPayloadSchema = guardedParser(payloadObject, preflightPayload);
export const stationStageChunksSchema = guardedParser(bundleObject, preflightBundle);
export type StationStageChunkPlan = z.infer<typeof planObject>;
export type StationStageChunkPayload = z.infer<typeof payloadObject>;
export type StationStageChunks = z.infer<typeof bundleObject>;

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

/** Read exact shallow structure without copying or traversing string payloads.
 * All values are captured through descriptors; accessors never run. */
function shallowFields(input: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== "object"
    || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new TypeError("Stage chunk metadata requires a plain object");
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
    throw new TypeError("Unexpected or missing stage chunk metadata fields");
  }
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const property = Object.getOwnPropertyDescriptor(input, key);
    if (!property || !property.enumerable || !("value" in property)) throw new TypeError("Stage chunk metadata requires enumerable data properties without accessors");
    result[key] = property.value;
  }
  return result;
}

/** Check cardinality before enumerating array keys or elements. In particular,
 * a huge sparse array cannot make us allocate a descriptor inventory first. */
function inventoryArray(input: unknown, expectedLength: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new TypeError("Stage chunk inventory requires ordinary arrays");
  const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (length !== expectedLength) throw new TypeError("Chunk inventory does not match candidate byte length");
  return input;
}
function inventoryValues(input: unknown[], expectedLength: number): unknown[] {
  if (Reflect.ownKeys(input).length !== expectedLength + 1) throw new TypeError("Stage chunk inventory must be dense and have no extra fields");
  const result: unknown[] = [];
  for (let index = 0; index < expectedLength; index++) {
    const property = Object.getOwnPropertyDescriptor(input, String(index));
    if (!property || !property.enumerable || !("value" in property)) throw new TypeError("Stage chunk inventory requires enumerable data elements without accessors or holes");
    result.push(property.value);
  }
  return result;
}
/** Zod's generic type detection can inspect then/catch on object values. Reject
 * nonprimitive scalar inputs before passing even a captured object to Zod. */
function primitiveScalars(fields: Record<string, unknown>, numberKeys: readonly string[], nullableStringKeys: readonly string[] = []): Record<string, unknown> {
  for (const [key, value] of Object.entries(fields)) {
    if (numberKeys.includes(key) ? typeof value !== "number"
      : !(typeof value === "string" || (value === null && nullableStringKeys.includes(key)))) {
      throw new TypeError("Stage chunk scalar metadata has an invalid primitive type");
    }
  }
  return fields;
}
function planParts(input: unknown) {
  const metadataKeys = Object.keys(planMetadataObject.shape);
  const fields = shallowFields(input, [...metadataKeys, "chunks"]);
  const metadata = planMetadataObject.parse(primitiveScalars(Object.fromEntries(metadataKeys.map((key) => [key, fields[key]])),
    ["schemaVersion", "chunkByteLimit", "byteLength"], ["sourceGenerationId"]));
  const count = Math.ceil(metadata.byteLength / STATION_STAGE_CHUNK_BYTES);
  return { metadata, count, chunks: inventoryArray(fields.chunks, count) };
}
function capturedPlan(parts: ReturnType<typeof planParts>) {
  const chunks = inventoryValues(parts.chunks, parts.count).map((item) => descriptor.parse(
    primitiveScalars(shallowFields(item, ["ordinal", "byteLength", "digest"]), ["ordinal", "byteLength"])));
  return planObject.parse({ ...parts.metadata, chunks });
}
function preflightPlan(input: unknown) {
  return capturedPlan(planParts(input));
}
function preflightPayload(input: unknown) {
  // This scalar-only schema bounds base64 length before scanning its alphabet.
  // Unknown nested values fail their scalar schema without being serialized.
  return payloadObject.parse(primitiveScalars(shallowFields(input, Object.keys(payloadObject.shape)), ["ordinal"]));
}
function preflightBundle(input: unknown) {
  const wrapper = shallowFields(input, ["plan", "payloads"]);
  const parts = planParts(wrapper.plan);
  const payloadArray = inventoryArray(wrapper.payloads, parts.count);
  // Both cardinalities have passed before either inventory is enumerated.
  const plan = capturedPlan(parts);
  const seen = new Set<number>();
  let decodedLength = 0;
  let encodedLength = 0;
  const payloads = inventoryValues(payloadArray, parts.count).map((item) => {
    const payload = preflightPayload(item);
    if (payload.ownerId !== plan.ownerId || payload.stageId !== plan.stageId || payload.generationId !== plan.generationId || payload.planDigest !== plan.planDigest) {
      throw new TypeError("Chunk payload scope or plan binding mismatch");
    }
    if (seen.has(payload.ordinal) || payload.ordinal >= parts.count) throw new TypeError("Duplicate or unexpected chunk ordinal");
    seen.add(payload.ordinal);
    const expected = plan.chunks[payload.ordinal].byteLength;
    validateBase64(payload.bytesBase64, expected);
    decodedLength += expected;
    encodedLength += payload.bytesBase64.length;
    if (!Number.isSafeInteger(decodedLength) || !Number.isSafeInteger(encodedLength)) throw new TypeError("Unsafe aggregate chunk length");
    return payload;
  });
  const expectedEncoded = plan.chunks.reduce((total, chunk) => total + Math.ceil(chunk.byteLength / 3) * 4, 0);
  if (decodedLength !== plan.byteLength || encodedLength !== expectedEncoded) throw new TypeError("Aggregate chunk lengths do not match plan");
  return { plan, payloads };
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
  if (typeof descriptors.stageId.value !== "string") throw new TypeError("Stage identity must be a primitive string");
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

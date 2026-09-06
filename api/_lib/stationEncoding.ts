/** Lossless storage primitives, not domain validation or authorization.
 * PostgreSQL must store canonicalText as TEXT and retain its exact bytes for
 * hashing; jsonb round-trips cannot preserve all accepted NUL/surrogate values.
 * Do not regenerate these hashes with jsonb::text. Relational row/key ordering
 * does not supply domain collection order, which callers must preserve. */
import { z } from "zod";
import { canonicalWorkbenchJson } from "../../src/lib/station/workbench/storage/serialization";

export interface EncodedStationBody {
  readonly canonicalText: string;
  readonly payloadDigest: string;
}
const bodySchema = z.object({
  canonicalText: z.string(),
  payloadDigest: z.string().regex(/^[0-9a-f]{64}$/, "Expected lowercase SHA-256 hex"),
}).strict();

async function digestText(canonicalText: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalText);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function freeze(value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function parseCanonicalText(text: string): unknown {
  const value: unknown = JSON.parse(text);
  if (canonicalWorkbenchJson(value) !== text) throw new TypeError("Station storage text is not exact canonical JSON");
  return value;
}
function checkedId(input: unknown): string {
  if (typeof input !== "string" || input.length === 0 || input.trim() !== input) {
    throw new TypeError("Station domain ID must be a nonempty, unpadded string");
  }
  return input;
}

/** Snapshot the body synchronously before the first asynchronous hash. */
export async function encodeStationBody(input: unknown): Promise<EncodedStationBody> {
  const canonicalText = canonicalWorkbenchJson(input);
  return Object.freeze({ canonicalText, payloadDigest: await digestText(canonicalText) });
}

/** Detach the envelope before inspecting fields or awaiting hashing. Callers
 * must still parse the returned frozen unknown using the applicable schema. */
export async function decodeStationBody(input: unknown): Promise<unknown> {
  const encoded = bodySchema.parse(JSON.parse(canonicalWorkbenchJson(input)));
  const value = parseCanonicalText(encoded.canonicalText);
  if (await digestText(encoded.canonicalText) !== encoded.payloadDigest) throw new TypeError("Station storage digest mismatch");
  return freeze(value);
}

/** Opaque keys are canonical JSON STRING text, stored with COLLATE C by the
 * future SQL schema. No UUID coercion, Unicode normalization, or ID trimming.
 * JSON escaping keeps NUL and lone UTF-16 surrogates lossless in PostgreSQL TEXT. */
export function encodeStationId(input: unknown): string {
  return canonicalWorkbenchJson(checkedId(input));
}
export function decodeStationId(input: unknown): string {
  if (typeof input !== "string") throw new TypeError("Encoded station ID must be text");
  return checkedId(parseCanonicalText(input));
}

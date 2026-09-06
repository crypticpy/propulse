import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "../../src/lib/station/workbench/storage/serialization";
import { decodeStationBody, decodeStationId, encodeStationBody, encodeStationId } from "./stationEncoding";

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("lossless canonical station body storage", () => {
  it("hashes exact canonical text consistently with the existing workbench codec", async () => {
    const input = { b: "y", a: [0, "x"] };
    const result = await encodeStationBody(input);
    expect(result.canonicalText).toBe('{"a":[0,"x"],"b":"y"}');
    expect(result.payloadDigest).toBe(sha256(result.canonicalText));
    expect(result.payloadDigest).toBe(await digestWorkbenchJson(input));
    expect(Object.isFrozen(result)).toBe(true);
    expect(await decodeStationBody(result)).toEqual(input);
  });

  it("preserves NUL, lone surrogates, reserved keys, nested order and distinct Unicode spellings", async () => {
    const input = JSON.parse('{"__proto__":{"constructor":"retained"}}');
    input.values = ["\0", "\ud800", "\udc00", "😀", "é", "e\u0301", "�"];
    input["key\0\ud800"] = { nested: ["second", "first"] };
    const encoded = await encodeStationBody(input);
    expect(encoded.canonicalText).not.toContain("\0");
    expect(encoded.canonicalText).toContain("\\u0000");
    expect(encoded.canonicalText).toContain("\\ud800");
    expect(encoded.canonicalText).toContain("\\udc00");
    const decoded = await decodeStationBody(encoded);
    expect(decoded).toEqual(input);
    expect(canonicalWorkbenchJson(decoded)).toBe(encoded.canonicalText);
    expect(Object.prototype.hasOwnProperty.call(decoded, "__proto__")).toBe(true);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen((decoded as { values: unknown[] }).values)).toBe(true);
  });

  it.each([null, true, 3, "text", ["b", "a"]])("retains canonical JSON scalar/array %j without inventing a domain schema", async (value) => {
    expect(await decodeStationBody(await encodeStationBody(value))).toEqual(value);
  });

  it.each([' {"a":1}', '{"b":1,"a":2}', '{"a":1,"a":1}', '1.0', '-0', '1e0', '"\\u0061"', '"\\uD800"'])("rejects noncanonical text %s even with a matching hash", async (canonicalText) => {
    await expect(decodeStationBody({ canonicalText, payloadDigest: sha256(canonicalText) })).rejects.toThrow(/canonical JSON/);
  });

  it.each(["{", '"\0"', '1e400'])("rejects malformed or nonfinite text %j", async (canonicalText) => {
    await expect(decodeStationBody({ canonicalText, payloadDigest: sha256(canonicalText) })).rejects.toThrow();
  });

  it("rejects changed text, changed hash, extra envelope properties and malformed digests", async () => {
    const encoded = await encodeStationBody({ value: "original" });
    await expect(decodeStationBody({ ...encoded, canonicalText: '{"value":"changed"}' })).rejects.toThrow(/digest mismatch/);
    for (const payloadDigest of ["0".repeat(64), "A".repeat(64), "short"]) {
      await expect(decodeStationBody({ ...encoded, payloadDigest })).rejects.toThrow();
    }
    await expect(decodeStationBody({ ...encoded, extra: true })).rejects.toThrow();
  });

  it("detaches before hashing so concurrent caller mutation cannot change encoded or decoded values", async () => {
    const input = { values: ["before"] };
    const pending = encodeStationBody(input);
    input.values[0] = "after";
    const encoded = await pending;
    expect(encoded.canonicalText).toBe('{"values":["before"]}');
    const mutable = { ...encoded };
    const decoded = decodeStationBody(mutable);
    mutable.canonicalText = '{"values":["changed"]}';
    mutable.payloadDigest = "0".repeat(64);
    expect(await decoded).toEqual({ values: ["before"] });
  });

  it("rejects accessors before reading their values on bodies and encoded envelopes", async () => {
    let reads = 0;
    const getter = { enumerable: true, get: () => { reads++; return "secret"; } };
    await expect(encodeStationBody(Object.defineProperty({}, "value", getter))).rejects.toThrow(/accessors/);
    await expect(decodeStationBody(Object.defineProperty({}, "canonicalText", getter))).rejects.toThrow(/accessors/);
    expect(reads).toBe(0);
  });

  it("rejects non-JSON bodies before hashing without invoking toJSON", async () => {
    const hash = vi.spyOn(crypto.subtle, "digest");
    const toJSON = vi.fn(() => ({ value: "coerced" }));
    for (const value of [{ toJSON }, new Date(), { value: undefined }, { value: Number.NaN }, new Array(2)]) {
      await expect(encodeStationBody(value)).rejects.toThrow();
    }
    expect(toJSON).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });
});

describe("canonical JSON string station keys", () => {
  const ids = ["simple", "\0", "\ud800", "\udc00", "a\0b", "😀", "é", "e\u0301", "�", "__proto__", "constructor", "a/b", 'quote"back\\slash'];
  it.each(ids)("round-trips opaque ID %j exactly", (id) => {
    const text = encodeStationId(id);
    expect(text).toBe(canonicalWorkbenchJson(id));
    expect(text).not.toContain("\0");
    expect(decodeStationId(text)).toBe(id);
  });
  it("keeps different Unicode and surrogate identities distinct", () => {
    expect(new Set(ids.map(encodeStationId)).size).toBe(ids.length);
  });
  it.each(["", " padded", "padded ", "\t", 1, null, undefined, {}, ["id"]])("rejects invalid ID %j without trimming or coercion", (id) => {
    expect(() => encodeStationId(id)).toThrow(/nonempty, unpadded/);
  });
  it.each(['""', '" padded"', '"padded "', 'null', '1', '{}', '["id"]', ' "id"', '"\\u0069d"', '"\\uD800"', '"a\\/b"'])("rejects noncanonical or non-ID key text %s", (text) => {
    expect(() => decodeStationId(text)).toThrow();
  });
  it("rejects boxed/coercible input without invoking accessors or conversion hooks", () => {
    const valueOf = vi.fn(() => "id");
    const input = { valueOf, toString: valueOf };
    expect(() => encodeStationId(input)).toThrow();
    expect(() => decodeStationId(input)).toThrow();
    expect(valueOf).not.toHaveBeenCalled();
  });
});

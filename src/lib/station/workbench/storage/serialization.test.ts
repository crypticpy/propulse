import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

describe("workbench canonical JSON", () => {
  it("sorts every object's keys by UTF-16, including numeric-looking keys", () => {
    const first = { z: { b: 2, a: 1 }, "2": false, "10": true, a: null };
    const second = { a: null, "10": true, z: { a: 1, b: 2 }, "2": false };
    expect(canonicalWorkbenchJson(first)).toBe('{"10":true,"2":false,"a":null,"z":{"a":1,"b":2}}');
    expect(canonicalWorkbenchJson(second)).toBe(canonicalWorkbenchJson(first));
    expect(canonicalWorkbenchJson({ "\ue000": 1, "😀": 2, A: 3 })).toBe('{"A":3,"😀":2,"\ue000":1}');
  });

  it("preserves array order and explicit false, zero, empty text and null", () => {
    expect(canonicalWorkbenchJson([false, 0, "", null])).toBe('[false,0,"",null]');
    expect(canonicalWorkbenchJson([1, 2])).not.toBe(canonicalWorkbenchJson([2, 1]));
  });

  it("uses JSON scalar escaping and number spelling, with negative zero canonicalized to zero", () => {
    for (const value of [null, true, false, 0, -0, 1e-7, 1e21, Number.MAX_VALUE, "\"\\\n\t\u0000"]) {
      expect(canonicalWorkbenchJson(value)).toBe(JSON.stringify(value));
    }
    expect(canonicalWorkbenchJson(-0)).toBe("0");
  });

  it("retains own reserved keys and accepts null-prototype/frozen objects without mutation", () => {
    const source = JSON.parse('{"constructor":{"prototype":false},"__proto__":{"x":0}}');
    const nullPrototype = Object.assign(Object.create(null), { nested: source });
    Object.freeze(source.__proto__);
    Object.freeze(source.constructor);
    Object.freeze(source);
    Object.freeze(nullPrototype);
    expect(canonicalWorkbenchJson(nullPrototype)).toBe('{"nested":{"__proto__":{"x":0},"constructor":{"prototype":false}}}');
    expect(Object.getPrototypeOf(source)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(nullPrototype)).toBeNull();
  });

  it("preserves valid Unicode without normalizing distinct strings", () => {
    expect(canonicalWorkbenchJson({ "📻": "é e\u0301 汉字 \ufffd" })).toBe('{"📻":"é é 汉字 �"}');
    expect(canonicalWorkbenchJson("é")).not.toBe(canonicalWorkbenchJson("e\u0301"));
  });

  it.each([
    ["\ud800", '"\\ud800"'],
    ["\udfff", '"\\udfff"'],
    ["x\ud800y", '"x\\ud800y"'],
    ["\ud800\ud800", '"\\ud800\\ud800"'],
    ["\udc00\ud800", '"\\udc00\\ud800"'],
    ["ok😀\ud800", '"ok😀\\ud800"'],
  ])("preserves lone surrogates in %j as exact JSON escapes in values and keys", (value, encoded) => {
    expect(canonicalWorkbenchJson(value)).toBe(encoded);
    expect(canonicalWorkbenchJson({ [value]: 1 })).toBe(`{${encoded}:1}`);
    expect(JSON.parse(canonicalWorkbenchJson(value))).toBe(value);
    expect(Object.keys(JSON.parse(canonicalWorkbenchJson({ [value]: 1 })))).toEqual([value]);
  });

  it.each([undefined, NaN, Infinity, -Infinity, 1n, Symbol("value"), () => 1])("rejects non-JSON scalar %s at root and nested positions", (value) => {
    expect(() => canonicalWorkbenchJson(value)).toThrow(TypeError);
    expect(() => canonicalWorkbenchJson({ value })).toThrow(TypeError);
    expect(() => canonicalWorkbenchJson([value])).toThrow(TypeError);
  });

  it("rejects non-plain prototypes and boxed values", () => {
    class Custom { value = 1; }
    class CustomArray extends Array<number> {}
    for (const value of [new Custom(), new CustomArray(), new Date(0), new Map(), new Set(), /x/, new Number(1), new String("x"), new Uint8Array([1]), Object.create({ inherited: 1 })]) {
      expect(() => canonicalWorkbenchJson(value)).toThrow("plain objects and arrays");
    }
  });

  it("rejects getters and setters without invoking them, including array indices", () => {
    const getter = vi.fn(() => 1);
    const setter = vi.fn();
    const object = Object.defineProperty({}, "value", { enumerable: true, get: getter });
    const setterOnly = Object.defineProperty({}, "value", { enumerable: true, set: setter });
    const array = Object.defineProperty([0], "0", { enumerable: true, get: getter });
    for (const value of [object, setterOnly, array]) expect(() => canonicalWorkbenchJson(value)).toThrow("accessors");
    expect(getter).not.toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
  });

  it("does not call toJSON", () => {
    const toJSON = vi.fn(() => ({ replaced: true }));
    expect(() => canonicalWorkbenchJson({ toJSON })).toThrow("non-JSON");
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("rejects symbol keys and hidden data instead of silently omitting them", () => {
    for (const value of [{ [Symbol("hidden")]: 1 }, Object.defineProperty({}, "hidden", { value: 1 }), Object.defineProperty([1], "0", { enumerable: false }), Object.assign([1], { [Symbol("hidden")]: 2 })]) {
      expect(() => canonicalWorkbenchJson(value)).toThrow(TypeError);
    }
  });

  it("rejects holes and extra array properties, including a hole compensated by an extra key", () => {
    const sparse = Array(2);
    sparse[1] = 1;
    const compensated = Object.assign(sparse, { extra: 2 });
    for (const value of [Array(1), compensated, Object.assign([1], { extra: 2 })]) {
      expect(() => canonicalWorkbenchJson(value)).toThrow(TypeError);
    }
  });

  it("rejects actual cycles but permits shared non-cyclic objects", () => {
    const object: Record<string, unknown> = {};
    object.self = object;
    const array: unknown[] = [];
    array.push({ array });
    expect(() => canonicalWorkbenchJson(object)).toThrow("cycles");
    expect(() => canonicalWorkbenchJson(array)).toThrow("cycles");
    const shared = { value: 1 };
    expect(canonicalWorkbenchJson([shared, shared])).toBe('[{"value":1},{"value":1}]');
  });

  it("accepts exactly 128 nested containers and rejects 129, for objects and arrays", () => {
    for (const wrap of [(value: unknown) => [value], (value: unknown) => ({ value })]) {
      let input: unknown = 0;
      for (let depth = 0; depth < 128; depth += 1) input = wrap(input);
      expect(() => canonicalWorkbenchJson(input)).not.toThrow();
      expect(() => canonicalWorkbenchJson(wrap(input))).toThrow("128 nested containers");
    }
  });
});

describe("workbench JSON digest", () => {
  // jsdom does not supply SubtleCrypto; use Node's real Web Crypto, not a digest mock.
  beforeEach(() => vi.stubGlobal("crypto", webcrypto));

  it("matches known SHA-256 vectors of canonical UTF-8 JSON", async () => {
    expect(await digestWorkbenchJson({})).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    expect(await digestWorkbenchJson(null)).toBe("74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b");
  });

  it("is stable across object insertion order and changes for array order or values", async () => {
    const original = await digestWorkbenchJson({ z: [false, 0], a: "📻" });
    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(await digestWorkbenchJson({ a: "📻", z: [false, 0] })).toBe(original);
    expect(await digestWorkbenchJson({ a: "📻", z: [0, false] })).not.toBe(original);
    expect(await digestWorkbenchJson({ a: "📻", z: [false, 1] })).not.toBe(original);
    expect(await digestWorkbenchJson(JSON.parse('{"__proto__":0}'))).not.toBe(await digestWorkbenchJson({}));
  });

  it("keeps lone high/low surrogates and the replacement character distinct in value and key digests", async () => {
    const strings = ["\ud800", "\udfff", "\ufffd"];
    const values = await Promise.all(strings.map((value) => digestWorkbenchJson(value)));
    const keys = await Promise.all(strings.map((key) => digestWorkbenchJson({ [key]: 1 })));
    expect(new Set(values).size).toBe(3);
    expect(new Set(keys).size).toBe(3);
    expect(canonicalWorkbenchJson("\ufffd")).toBe('"�"');
    // A literal backslash-u sequence also differs from a preserved UTF-16 code unit.
    expect(await digestWorkbenchJson("\\ud800")).not.toBe(values[0]);
  });

  it("still rejects non-JSON input before hashing", async () => {
    await expect(digestWorkbenchJson({ value: undefined })).rejects.toThrow("non-JSON");
  });
});

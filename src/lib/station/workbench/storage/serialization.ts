const MAX_CONTAINER_DEPTH = 128;

/**
 * Workbench canonical JSON algorithm (not a claim of RFC 8785 compliance):
 * - Accept null, booleans, finite numbers, strings, dense plain
 *   arrays, and objects with Object.prototype or null prototypes only.
 * - Read own enumerable string-key data descriptors, rejecting accessors,
 *   symbols, hidden properties, and array properties other than indices/length.
 *   Descriptor reads preserve literal __proto__/constructor keys; no toJSON runs.
 * - Sort object keys with JS default UTF-16 ordering; preserve array order.
 *   JSON.stringify supplies scalar escaping/number spelling, including -0 -> 0.
 *   Strings are not Unicode-normalized. JSON.stringify preserves lone UTF-16
 *   surrogates in keys and values as ASCII \uXXXX escapes before UTF-8 encoding,
 *   keeping them distinct from each other and the replacement character.
 * - Reject cycles and nesting beyond 128 containers (root container depth 1,
 *   scalar root depth 0). Repeated references outside the ancestor path are valid.
 * No input is mutated and no runtime storage, clock, or network is consulted.
 */
export function canonicalWorkbenchJson(input: unknown): string {
  const ancestors = new Set<object>();

  const encode = (value: unknown, containerDepth: number): string => {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("Workbench JSON requires finite numbers");
      return JSON.stringify(value);
    }
    if (typeof value !== "object") throw new TypeError("Workbench JSON contains a non-JSON value");
    if (containerDepth >= MAX_CONTAINER_DEPTH) throw new TypeError("Workbench JSON exceeds 128 nested containers");
    if (ancestors.has(value)) throw new TypeError("Workbench JSON cannot contain cycles");

    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Workbench JSON requires plain objects and arrays");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Workbench JSON cannot contain symbol keys");

    ancestors.add(value);
    try {
      if (array) {
        const length: number = descriptors.length.value;
        if (keys.length !== length + 1) throw new TypeError("Workbench JSON requires dense arrays without extra properties");
        const items: string[] = [];
        for (let index = 0; index < length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(descriptors, String(index))?.value as PropertyDescriptor | undefined;
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
            throw new TypeError("Workbench JSON requires enumerable array data elements without holes or accessors");
          }
          items.push(encode(descriptor.value, containerDepth + 1));
        }
        return `[${items.join(",")}]`;
      }

      const entries = (keys as string[]).sort().map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("Workbench JSON requires enumerable data properties without accessors");
        }
        return `${JSON.stringify(key)}:${encode(descriptor.value, containerDepth + 1)}`;
      });
      return `{${entries.join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  };

  return encode(input, 0);
}

/** SHA-256 of the canonical JSON's UTF-8 bytes, encoded as lowercase hex. */
export async function digestWorkbenchJson(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalWorkbenchJson(input));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

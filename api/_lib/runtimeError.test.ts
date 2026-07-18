import { describe, expect, it } from "vitest";
import { isErrorNamed } from "./runtimeError";

describe("isErrorNamed", () => {
  it("classifies error-like objects without requiring a DOMException global", () => {
    expect(isErrorNamed({ name: "AbortError" }, "AbortError")).toBe(true);
    expect(isErrorNamed({ name: "TimeoutError" }, "AbortError", "TimeoutError")).toBe(true);
    expect(isErrorNamed(new TypeError("offline"), "AbortError")).toBe(false);
    expect(isErrorNamed(null, "AbortError")).toBe(false);
  });
});

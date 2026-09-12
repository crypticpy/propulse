import { describe, expect, it } from "vitest";
import {
  parseColorValue,
  readLegacyColor,
  serializeLegacyColor,
  type ColorValuePolicy,
} from "./colorValues";

// Actual SDR defaults and workspace heatmap expressions; no DOM/theme resolution.
const policy: ColorValuePolicy = {
  representations: ["auto", "hex", "css-rgb", "token"],
  tokens: ["--su-muted-rgb", "--su-success-rgb", "--su-warning-rgb"],
};

describe("lossless appearance color values", () => {
  it("requires the exact auto sentinel used by SDR renderers", () => {
    expect(parseColorValue("auto", policy).ok).toBe(true);
    for (const source of [" auto ", "auto\n", "\tauto"]) {
      expect(parseColorValue(source, policy).ok).toBe(false);
      const read = readLegacyColor(source, policy);
      expect(read.status).toBe("unrecognized");
      if (read.status === "invalid") throw new Error("Preserve existing strings");
      expect(serializeLegacyColor(read)).toBe(source);
    }
  });

  it.each([
    ["auto", "auto"],
    ["#000000", "hex"],
    ["#ABCdef", "hex"],
    ["rgba(0, 40, 60, 0.85)", "css-rgb"],
    ["rgb(0, 40, 60)", "css-rgb"],
    ["rgb(var(--su-muted-rgb))", "token"],
    ["rgb(var(--su-success-rgb) / 0.5)", "token"],
    ["rgb(var(--su-warning-rgb) / 0.7)", "token"],
    ["  rgba(0,40,60,.85)  ", "css-rgb"],
  ])(
    "round-trips %s without forcing hex or resolving theme tokens",
    (source, kind) => {
      const read = readLegacyColor(source, policy);
      expect(read.status).toBe("recognized");
      if (read.status !== "recognized")
        throw new Error("Expected supported legacy fixture");
      expect(read.value.kind).toBe(kind);
      expect(serializeLegacyColor(read)).toBe(source);
    },
  );

  it("extracts alpha without losing the translucent original string", () => {
    expect(parseColorValue("rgba(0, 40, 60, 0.85)", policy)).toEqual({
      ok: true,
      value: {
        kind: "css-rgb",
        source: "rgba(0, 40, 60, 0.85)",
        channels: [0, 40, 60],
        alpha: 0.85,
      },
    });
    expect(parseColorValue("rgb(var(--su-success-rgb) / 0.5)", policy)).toEqual(
      {
        ok: true,
        value: {
          kind: "token",
          source: "rgb(var(--su-success-rgb) / 0.5)",
          token: "--su-success-rgb",
          alpha: 0.5,
        },
      },
    );
  });

  it.each(["#abc", "#abcd", "#aabbccdd"])(
    "requires an explicit hex-format opt-in for %s",
    (source) => {
      expect(parseColorValue(source, policy).ok).toBe(false);
      expect(
        parseColorValue(source, {
          representations: ["hex"],
          hexLengths: [3, 4, 6, 8],
        }).ok,
      ).toBe(true);
    },
  );

  it.each(["auto", "rgba(0, 40, 60, 0.85)", "rgb(var(--su-success-rgb))"])(
    "does not admit %s into a custom-primary hex policy",
    (value) => {
      expect(parseColorValue(value, { representations: ["hex"] }).ok).toBe(
        false,
      );
    },
  );

  it.each([
    "rgba(0, 0, 0, 0)",
    "rgba(255, 255, 255, 1)",
    "rgb(0.5, 40, 255)",
    "rgb(var(--su-muted-rgb) / 0)",
  ])("accepts bounded numeric channels/alpha: %s", (value) => {
    expect(parseColorValue(value, policy).ok).toBe(true);
  });

  it.each([
    "#12345g",
    "#12345",
    "AUTO",
    "rgb(256, 0, 0)",
    "rgb(-1, 0, 0)",
    "rgba(0, 0, 0, 1.01)",
    "rgba(0, 0, 0, -0.1)",
    "rgba(0, 0, 0)",
    "rgb(0, 0, 0, 1)",
    "rgba(NaN, 0, 0, 1)",
    "rgba(0, 0, 0, Infinity)",
    "rgb(0% 20% 30%)",
    "rgb(var(--unknown-rgb))",
    "rgb(var(--su-muted-rgb) / 2)",
    "rgb(var(--su-muted-rgb, 0 0 0))",
    "rgb(var(--su-muted-rgb) / calc(1 / 2))",
    "url(https://example.com/color)",
    "#abcdef; color: red",
    "",
  ])(
    "rejects unsupported new edit %s without erasing the legacy source",
    (source) => {
      expect(parseColorValue(source, policy).ok).toBe(false);
      const read = readLegacyColor(source, policy);
      expect(read.status).toBe("unrecognized");
      if (read.status === "invalid")
        throw new Error("A string must remain available for no-op/cancel");
      expect(serializeLegacyColor(read)).toBe(source);
    },
  );

  it.each([null, undefined, 0, false, {}, []])(
    "does not stringify non-color data %s",
    (value) => {
      expect(readLegacyColor(value, policy)).toMatchObject({
        status: "invalid",
        issue: { code: "unsupported-color" },
      });
    },
  );

  it("requires both the token representation and its exact allowlisted name", () => {
    const source = "rgb(var(--su-muted-rgb))";
    expect(parseColorValue(source, { representations: ["token"] }).ok).toBe(
      false,
    );
    expect(
      parseColorValue(source, {
        representations: ["hex"],
        tokens: ["--su-muted-rgb"],
      }).ok,
    ).toBe(false);
    expect(parseColorValue("rgb(var(--SU-muted-rgb))", policy).ok).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import { parseColorValue } from "./colorValues";
import {
  parseSettingPatch,
  resetSetting,
  resolveSettingPatch,
} from "./settingValues";
import type { SettingControl, SettingSpec } from "./types";

const customPrimary: SettingSpec<string | null> = {
  id: "theme.customPrimary",
  scope: "global",
  label: "Custom primary color",
  defaultValue: null,
  control: { kind: "color", representations: ["hex"] },
  parse(input) {
    if (input === null) return { ok: true, value: null };
    const parsed = parseColorValue(input, { representations: ["hex"] });
    return parsed.ok ? { ok: true, value: parsed.value.source } : parsed;
  },
};

const opacity: SettingSpec<number> = {
  id: "map.nvisOpacity",
  scope: "map",
  label: "NVIS opacity",
  defaultValue: 0.35,
  control: { kind: "range", min: 0.1, max: 0.8, step: 0.05 },
  parse: (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0.1 &&
    value <= 0.8
      ? { ok: true, value }
      : {
          ok: false,
          issue: { code: "opacity", message: "Use a number from 0.1 to 0.8." },
        },
};

describe("appearance setting patches", () => {
  it("distinguishes a missing override, explicit null, and an invalid edit", () => {
    const previous = "#ABCdef";
    const missing = parseSettingPatch(customPrimary, {}, "customPrimary");
    const cleared = parseSettingPatch(
      customPrimary,
      { customPrimary: null },
      "customPrimary",
    );
    const invalid = parseSettingPatch(
      customPrimary,
      { customPrimary: "rgba(0, 40, 60, 0.85)" },
      "customPrimary",
    );
    expect(missing).toEqual({ status: "missing" });
    expect(cleared).toEqual({ status: "valid", value: null });
    expect(invalid.status).toBe("invalid");
    expect(resolveSettingPatch(previous, missing)).toEqual({
      status: "missing",
      value: previous,
    });
    expect(resolveSettingPatch<string | null>(previous, cleared)).toEqual({
      status: "valid",
      value: null,
    });
    expect(resolveSettingPatch(previous, invalid)).toMatchObject({
      status: "invalid",
      value: previous,
      issue: { code: "unsupported-color" },
    });
    expect(resetSetting(customPrimary)).toBeNull();
  });

  it.each([undefined, "", 0, false, "#fff", "#12345678"])(
    "does not interpret a present %s as missing, clear or reset",
    (value) => {
      const patch = parseSettingPatch(
        customPrimary,
        { customPrimary: value },
        "customPrimary",
      );
      expect(patch.status).toBe("invalid");
      expect(resolveSettingPatch("#abcdef", patch).value).toBe("#abcdef");
    },
  );

  it("only reads own fields, including an explicit JSON __proto__ field", () => {
    const inherited = Object.create({ customPrimary: "#123456" });
    expect(
      parseSettingPatch(customPrimary, inherited, "customPrimary"),
    ).toEqual({ status: "missing" });
    for (const key of ["constructor", "__proto__"]) {
      expect(parseSettingPatch(customPrimary, {}, key)).toEqual({
        status: "missing",
      });
    }
    expect(
      parseSettingPatch(
        customPrimary,
        JSON.parse('{"__proto__":"#123456"}'),
        "__proto__",
      ),
    ).toEqual({ status: "valid", value: "#123456" });
  });

  it.each([null, undefined, [], "settings", 4])(
    "rejects a non-record %s without changing a value",
    (record) => {
      const outcome = resolveSettingPatch(
        "#123456",
        parseSettingPatch(customPrimary, record, "customPrimary"),
      );
      expect(outcome).toMatchObject({
        status: "invalid",
        value: "#123456",
        issue: { code: "invalid-record" },
      });
    },
  );

  it("leaves range normalization to its parser and keeps reset separate", () => {
    const patch = parseSettingPatch(opacity, { opacity: 0.373 }, "opacity");
    expect(resolveSettingPatch(0.7, patch).value).toBe(0.373);
    expect(resetSetting(opacity)).toBe(0.35);
    for (const value of [NaN, Infinity, -Infinity, 0, 0.09, 0.81, 1.1, "0.5"]) {
      const outcome = resolveSettingPatch(
        0.7,
        parseSettingPatch(opacity, { opacity: value }, "opacity"),
      );
      expect(outcome.status).toBe("invalid");
      expect(outcome.value).toBe(0.7);
    }
  });

  it("preserves a domain parser's deliberate clamp instead of adding another policy", () => {
    const clampOpacity: SettingSpec<number> = {
      ...opacity,
      parse: (input) =>
        typeof input === "number" && Number.isFinite(input)
          ? { ok: true, value: Math.max(0.1, Math.min(0.8, input)) }
          : opacity.parse(input),
    };
    expect(
      parseSettingPatch(clampOpacity, { opacity: 1.4 }, "opacity"),
    ).toEqual({ status: "valid", value: 0.8 });
  });

  it("retains option order, domain scope and narrow parsed types", () => {
    type Mode = "mode" | "band" | "snr" | "age";
    const choices = ["mode", "band", "snr", "age"] as const;
    const spec: SettingSpec<Mode> = {
      id: "map.spotColorMode",
      scope: "map",
      label: "Spot color",
      defaultValue: "mode",
      control: {
        kind: "select",
        options: choices.map((value) => ({ value, label: value })),
      },
      parse: (input) =>
        typeof input === "string" && choices.some((value) => value === input)
          ? { ok: true, value: input as Mode }
          : {
              ok: false,
              issue: { code: "mode", message: "Choose a spot color mode." },
            },
    };
    expect(
      spec.control?.kind === "select" &&
        spec.control.options.map(({ value }) => value),
    ).toEqual(choices);
    expect(spec.scope).toBe("map");
    const parsed = parseSettingPatch(spec, { mode: "snr" }, "mode");
    if (parsed.status === "valid")
      expectTypeOf(parsed.value).toEqualTypeOf<Mode>();
    expect(
      resolveSettingPatch<Mode>(
        "age",
        parseSettingPatch(spec, { mode: "unknown" }, "mode"),
      ).value,
    ).toBe("age");
    expectTypeOf<
      Extract<SettingControl<Mode>, { kind: "range" }>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<SettingControl<number>, { kind: "toggle" }>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<SettingControl<boolean>, { kind: "toggle" }>
    >().toEqualTypeOf<{ readonly kind: "toggle" }>();
  });
});

it("supports independent wall choices and SDR/workspace string adapters", () => {
  type WallTheme = "pulse" | "classic" | "brass";
  const themes = ["pulse", "classic", "brass"] as const;
  const wall: SettingSpec<WallTheme> = {
    id: "wall.theme",
    scope: "wall",
    label: "Wall theme",
    defaultValue: "pulse",
    control: {
      kind: "select",
      options: themes.map((value) => ({ value, label: value })),
    },
    parse: (input) =>
      themes.some((value) => value === input)
        ? { ok: true, value: input as WallTheme }
        : {
            ok: false,
            issue: { code: "wall-theme", message: "Choose a wall theme." },
          },
  };
  expect(wall.scope).toBe("wall");
  expect(
    wall.control?.kind === "select" &&
      wall.control.options.map((option) => option.value),
  ).toEqual(["pulse", "classic", "brass"]);
  expect(resetSetting(wall)).toBe("pulse");
  const selected = parseSettingPatch(wall, { theme: "brass" }, "theme");
  expect(selected).toEqual({ status: "valid", value: "brass" });
  if (selected.status === "valid")
    expectTypeOf(selected.value).toEqualTypeOf<WallTheme>();
  expect(
    resolveSettingPatch<WallTheme>(
      "classic",
      parseSettingPatch(wall, { theme: "dark" }, "theme"),
    ).value,
  ).toBe("classic");

  for (const [id, scope, source, representations] of [
    ["sdr.spectrumLineColor", "global", "auto", ["auto", "hex"]],
    [
      "workspace.bucketColor",
      "workspace",
      "rgb(var(--su-success-rgb) / 0.5)",
      ["hex", "token"],
    ],
  ] as const) {
    const spec: SettingSpec<string> = {
      id,
      scope,
      label: id,
      defaultValue: source,
      control: { kind: "color", representations },
      parse: (input) => {
        const result = parseColorValue(input, {
          representations,
          tokens: ["--su-success-rgb"],
        });
        return result.ok ? { ok: true, value: result.value.source } : result;
      },
    };
    expect(spec.scope).toBe(scope);
    const parsed = parseSettingPatch(spec, { color: source }, "color");
    expect(parsed).toEqual({ status: "valid", value: source });
    expect(resetSetting(spec)).toBe(source);
    if (parsed.status === "valid")
      expectTypeOf(parsed.value).toEqualTypeOf<string>();
    expect(
      resolveSettingPatch(
        source,
        parseSettingPatch(spec, { color: "invalid" }, "color"),
      ).value,
    ).toBe(source);
  }
});

it("keeps the core dependency-free with only local type imports", () => {
  for (const file of ["types.ts", "settingValues.ts", "colorValues.ts"]) {
    const source = ts.createSourceFile(
      file,
      readFileSync(resolve("src/lib/appearance", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        expect(node.importClause?.isTypeOnly).toBe(true);
        expect(
          ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text,
        ).toBe("./types");
      }
      if (ts.isExportDeclaration(node))
        expect(node.moduleSpecifier).toBeUndefined();
      if (ts.isCallExpression(node)) {
        expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
        expect(
          ts.isIdentifier(node.expression) &&
            node.expression.text === "require",
        ).toBe(false);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

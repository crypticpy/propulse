import type { ColorRepresentation, ParseResult, SettingIssue } from "./types";

type ColorSource<K extends ColorRepresentation> = {
  readonly kind: K;
  /** Exact input spelling, including whitespace; persistence remains a string. */
  readonly source: string;
};

export type ColorValue =
  | ColorSource<"auto">
  | ColorSource<"hex">
  | (ColorSource<"css-rgb"> & {
      readonly channels: readonly [number, number, number];
      readonly alpha: number;
    })
  | (ColorSource<"token"> & {
      readonly token: string;
      readonly alpha: number;
    });

export interface ColorValuePolicy {
  readonly representations: readonly ColorRepresentation[];
  /** Defaults to six digits; a field must explicitly opt into other formats. */
  readonly hexLengths?: readonly (3 | 4 | 6 | 8)[];
  /** Exact channel-token names, including the leading --. No DOM resolution. */
  readonly tokens?: readonly string[];
}

const NUMBER = "(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)";
const RGB = new RegExp(
  `^(rgb|rgba)\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*,\\s*(${NUMBER})(?:\\s*,\\s*(${NUMBER}))?\\s*\\)$`,
);
const TOKEN = new RegExp(
  `^rgb\\(\\s*var\\(\\s*(--[a-zA-Z0-9_-]+)\\s*\\)(?:\\s*\\/\\s*(${NUMBER}))?\\s*\\)$`,
);

function invalid(): ParseResult<never> {
  return {
    ok: false,
    issue: {
      code: "unsupported-color",
      message: "Use a color format and value supported by this setting.",
    },
  };
}

/**
 * Deliberately bounded grammar: auto, opted-in hex lengths, comma-form numeric
 * rgb/rgba, and rgb(var(allowed-channel-token) / optional numeric alpha).
 * Channels are 0–255; alpha is 0–1. No percentages, named colors, CSS fallback
 * expressions or arbitrary functions. Other existing strings can round-trip
 * through readLegacyColor without being accepted as new edits.
 */
export function parseColorValue(
  input: unknown,
  policy: ColorValuePolicy,
): ParseResult<ColorValue> {
  if (typeof input !== "string") return invalid();
  const value = input.trim();
  const allows = (kind: ColorRepresentation) =>
    policy.representations.includes(kind);
  if (input === "auto" && allows("auto")) {
    return { ok: true, value: { kind: "auto", source: input } };
  }
  if (
    allows("hex") &&
    /^#[0-9a-fA-F]+$/.test(value) &&
    (policy.hexLengths ?? [6]).some((length) => value.length === length + 1)
  ) {
    return { ok: true, value: { kind: "hex", source: input } };
  }
  const rgb = allows("css-rgb") ? RGB.exec(value) : null;
  if (rgb) {
    const hasAlpha = rgb[5] !== undefined;
    if ((rgb[1] === "rgba") !== hasAlpha) return invalid();
    const channels = [Number(rgb[2]), Number(rgb[3]), Number(rgb[4])] as const;
    const alpha = hasAlpha ? Number(rgb[5]) : 1;
    if (channels.some((channel) => channel > 255) || alpha > 1)
      return invalid();
    return {
      ok: true,
      value: { kind: "css-rgb", source: input, channels, alpha },
    };
  }
  const token = allows("token") ? TOKEN.exec(value) : null;
  if (token && policy.tokens?.includes(token[1])) {
    const alpha = token[2] === undefined ? 1 : Number(token[2]);
    if (alpha > 1) return invalid();
    return {
      ok: true,
      value: { kind: "token", source: input, token: token[1], alpha },
    };
  }
  return invalid();
}

/** Adapter envelope only: never persist this discriminated object. */
export type LegacyColorRead =
  | { readonly status: "recognized"; readonly value: ColorValue }
  | {
      readonly status: "unrecognized";
      readonly source: string;
      readonly issue: SettingIssue;
    }
  | { readonly status: "invalid"; readonly issue: SettingIssue };

export function readLegacyColor(
  input: unknown,
  policy: ColorValuePolicy,
): LegacyColorRead {
  const parsed = parseColorValue(input, policy);
  if (parsed.ok) return { status: "recognized", value: parsed.value };
  return typeof input === "string"
    ? { status: "unrecognized", source: input, issue: parsed.issue }
    : { status: "invalid", issue: parsed.issue };
}

/** No-op/cancel preserves legacy strings; callers must parse new edits first. */
export function serializeLegacyColor(
  color: Exclude<LegacyColorRead, { status: "invalid" }>,
): string {
  return color.status === "recognized" ? color.value.source : color.source;
}

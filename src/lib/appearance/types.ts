/** Metadata only: scopes describe meaning, not storage or transport ownership. */
export type SettingScope = "global" | "map" | "workspace" | "wall" | "entity";
export type SettingValue = string | number | boolean | null;
export type ColorRepresentation = "auto" | "hex" | "css-rgb" | "token";

export interface SettingIssue {
  readonly code: string;
  readonly message: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: SettingIssue };

export interface SettingOption<T> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
}

/** Range metadata describes a control; the field parser owns clamp/reject policy. */
export type SettingControl<T> =
  | { readonly kind: "select"; readonly options: readonly SettingOption<T>[] }
  | ([T] extends [boolean] ? { readonly kind: "toggle" } : never)
  | ([T] extends [number]
      ? {
          readonly kind: "range";
          readonly min: number;
          readonly max: number;
          readonly step: number;
          readonly unit?: string;
        }
      : never)
  | ([T] extends [string | null]
      ? {
          readonly kind: "color";
          readonly representations: readonly ColorRepresentation[];
        }
      : never);

/** Scalar settings avoid shared mutable defaults; domains own collection resets. */
export interface SettingSpec<T extends SettingValue> {
  readonly id: string;
  readonly scope: SettingScope;
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: T;
  readonly control?: SettingControl<T>;
  readonly parse: (input: unknown) => ParseResult<T>;
}

export type SettingPatch<T> =
  | { readonly status: "missing" }
  | { readonly status: "valid"; readonly value: T }
  | { readonly status: "invalid"; readonly issue: SettingIssue };

export type ResolvedSettingPatch<T> =
  | { readonly status: "missing" | "valid"; readonly value: T }
  | {
      readonly status: "invalid";
      readonly value: T;
      readonly issue: SettingIssue;
    };

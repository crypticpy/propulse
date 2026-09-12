import type {
  ResolvedSettingPatch,
  SettingPatch,
  SettingSpec,
  SettingValue,
} from "./types";

/** Reset is an explicit operation, never a consequence of an invalid edit. */
export function resetSetting<T extends SettingValue>(spec: SettingSpec<T>): T {
  return spec.defaultValue;
}

/** Missing properties differ from present undefined/null; inherited keys are ignored. */
export function parseSettingPatch<T extends SettingValue>(
  spec: SettingSpec<T>,
  record: unknown,
  key: string,
): SettingPatch<T> {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return {
      status: "invalid",
      issue: { code: "invalid-record", message: "Expected a settings object." },
    };
  }
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return { status: "missing" };
  }
  const parsed = spec.parse((record as Record<string, unknown>)[key]);
  return parsed.ok
    ? { status: "valid", value: parsed.value }
    : { status: "invalid", issue: parsed.issue };
}

/** Domain adapters decide when to persist/apply; this helper performs no writes. */
export function resolveSettingPatch<T>(
  current: T,
  patch: SettingPatch<T>,
): ResolvedSettingPatch<T> {
  if (patch.status === "invalid") {
    return { status: "invalid", value: current, issue: patch.issue };
  }
  return {
    status: patch.status,
    value: patch.status === "valid" ? patch.value : current,
  };
}

/** Bounded portable view/preset backup. Pure codec: no store, storage or network I/O. */
import { z } from "zod";
import { presetRecipeSchema, type PresetRecipe } from "../contracts";
import { libraryValueSchema, viewDraftSchema, type LibraryValue, type ViewDraft } from "./schema";

/** Same envelope version as the accepted view/migration schemas. */
export const VIEW_LIBRARY_BACKUP_VERSION = 1;
export const VIEW_LIBRARY_BACKUP_KIND = "propulse-view-library";
/** Documented migration/capture payload ceiling; do not raise. */
export const VIEW_LIBRARY_BACKUP_LIMIT_BYTES = 2 * 1024 * 1024;
/** Documented migration recipe collection ceiling; applied per kind. */
export const VIEW_LIBRARY_BACKUP_MAX_ITEMS = 64;

export type ViewLibraryBackupDrafts = { views: ViewDraft[]; presets: PresetRecipe[] };
export type ViewLibraryBackup = {
  appName: "propulse";
  kind: typeof VIEW_LIBRARY_BACKUP_KIND;
  version: typeof VIEW_LIBRARY_BACKUP_VERSION;
  exportedAt: string;
  views: ViewDraft[];
  presets: PresetRecipe[];
};
export type BackupCodecResult<T> =
  | { status: "ok"; value: T; warnings: string[] }
  | { status: "invalid"; message: string };

const encoder = new TextEncoder();
type PortableLibraryValue = Exclude<LibraryValue, { kind: "display" }>;
function parsePortableValue(input: unknown): PortableLibraryValue | null {
  const parsed = libraryValueSchema.safeParse(input);
  if (!parsed.success || parsed.data.kind === "display") return null;
  return parsed.data;
}
const backupEnvelopeSchema = z.object({
  appName: z.literal("propulse"),
  kind: z.literal(VIEW_LIBRARY_BACKUP_KIND),
  version: z.literal(VIEW_LIBRARY_BACKUP_VERSION),
  exportedAt: z.string().datetime({ offset: true }),
  views: z.array(viewDraftSchema).max(VIEW_LIBRARY_BACKUP_MAX_ITEMS),
  presets: z.array(presetRecipeSchema).max(VIEW_LIBRARY_BACKUP_MAX_ITEMS),
}).strict().superRefine((backup, ctx) => {
  if (new Set(backup.views.map((view) => view.id)).size !== backup.views.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate view ID" });
  }
  if (new Set(backup.presets.map((preset) => preset.id)).size !== backup.presets.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate preset ID" });
  }
  for (const preset of backup.presets) {
    if (!parsePortableValue({ kind: "preset", data: preset })) {
      ctx.addIssue({ code: "custom", message: `Invalid preset ${preset.id}` });
    }
  }
});

function invalid(message: string): BackupCodecResult<never> {
  return { status: "invalid", message };
}
function ok<T>(value: T, warnings: string[] = []): BackupCodecResult<T> {
  return { status: "ok", value, warnings };
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function secretKey(key: string): boolean {
  return /(?:token|password|secret|apikey|credential|authorization)/i.test(key.replace(/[^a-z0-9]/gi, ""));
}

/** Reject getters, prototypes, credentials, cycles and oversized JSON. Caller receives a copy. */
export function cloneBoundedBackupJson(input: unknown): BackupCodecResult<unknown> {
  const seen = new Set<object>();
  let nodes = 0;
  let textLength = 0;
  function valid(value: unknown, depth: number): boolean {
    if (++nodes > 50_000 || depth > 20) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") {
      textLength += value.length;
      return textLength <= VIEW_LIBRARY_BACKUP_LIMIT_BYTES;
    }
    if (typeof value !== "object" || seen.has(value)) return false;
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      return false;
    }
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (Array.isArray(value) && (keys.length !== value.length + 1 ||
        keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key))))) {
      return false;
    }
    for (const key of keys) {
      if (Array.isArray(value) && key === "length") continue;
      if (typeof key !== "string" || key.length > 256 || /^(?:__proto__|prototype|constructor)$/i.test(key) || secretKey(key)) {
        return false;
      }
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable || !valid(descriptor.value, depth + 1)) return false;
    }
    seen.delete(value);
    return true;
  }
  try {
    if (!valid(input, 0)) return invalid("Backup must be bounded plain JSON without credentials");
    const json = JSON.stringify(input);
    if (json === undefined || encoder.encode(json).length > VIEW_LIBRARY_BACKUP_LIMIT_BYTES) {
      return invalid("Backup exceeds 2 MiB");
    }
    return ok(structuredClone(input));
  } catch {
    return invalid("Backup must be bounded plain JSON without credentials");
  }
}

function parsePayload(payload: unknown): BackupCodecResult<unknown> {
  if (typeof payload === "string") {
    if (encoder.encode(payload).length > VIEW_LIBRARY_BACKUP_LIMIT_BYTES) return invalid("Backup exceeds 2 MiB");
    try { return parsePayload(JSON.parse(payload)); }
    catch { return invalid("Invalid JSON"); }
  }
  return cloneBoundedBackupJson(payload);
}

function stripRecordIdentity(value: Record<string, unknown>): Record<string, unknown> {
  const { ownerId: _ownerId, revision: _revision, ...rest } = value;
  return rest;
}

function readLibraryValue(raw: unknown, warnings: string[]): PortableLibraryValue | "skip" | null {
  if (!isPlainObject(raw)) return null;
  if ("operationId" in raw || "expectedRevision" in raw || "operation" in raw) {
    warnings.push("Pending operations were omitted from the portable backup");
    return "skip";
  }
  if ("value" in raw && "kind" in raw && "id" in raw) {
    if (raw.value === null) {
      warnings.push("Tombstones were omitted from the portable backup");
      return "skip";
    }
    if (raw.kind === "display" || (isPlainObject(raw.value) && raw.value.kind === "display")) {
      warnings.push("Display assignments and device identity were omitted from the portable backup");
      return "skip";
    }
    if (!isPlainObject(raw.value)) return null;
    const value = raw.value;
    const data = isPlainObject(value.data) ? stripRecordIdentity(value.data) : value.data;
    const parsed = parsePortableValue({ kind: value.kind, data });
    if (!parsed || raw.kind !== parsed.kind || raw.id !== parsed.data.id) return null;
    return parsed;
  }
  if (raw.kind === "display") {
    warnings.push("Display assignments and device identity were omitted from the portable backup");
    return "skip";
  }
  const data = isPlainObject(raw.data) ? stripRecordIdentity(raw.data) : raw.data;
  return parsePortableValue({ kind: raw.kind, data });
}

/**
 * Encode complete view/preset LibraryValue snapshots as bounded JSON.
 * Omits owner IDs, revisions, tombstones, pending operations and display assignments.
 * Restore callers must supply ownership, fresh IDs and save/CAS policy.
 */
export function encodeViewLibraryBackup(
  snapshots: readonly unknown[],
  options: { exportedAt: string },
): BackupCodecResult<string> {
  if (!Array.isArray(snapshots)) return invalid("View-library backup requires an array of snapshots");
  const warnings: string[] = [];
  const views: ViewDraft[] = [];
  const presets: PresetRecipe[] = [];
  for (const snapshot of snapshots) {
    const value = readLibraryValue(snapshot, warnings);
    if (value === "skip") continue;
    if (!value) return invalid("Invalid or mismatched library snapshot");
    if (value.kind === "view") views.push(value.data);
    else presets.push(value.data);
  }
  const exportedAt = options.exportedAt;
  const envelope = backupEnvelopeSchema.safeParse({
    appName: "propulse", kind: VIEW_LIBRARY_BACKUP_KIND, version: VIEW_LIBRARY_BACKUP_VERSION,
    exportedAt, views, presets,
  });
  if (!envelope.success) {
    const message = envelope.error.issues[0]?.message ?? "Invalid view-library backup";
    if (message.includes("Duplicate")) return invalid(message);
    return invalid("Invalid view-library backup");
  }
  const json = JSON.stringify(envelope.data);
  if (encoder.encode(json).length > VIEW_LIBRARY_BACKUP_LIMIT_BYTES) return invalid("Backup exceeds 2 MiB");
  return ok(json, [...new Set(warnings)]);
}

/**
 * Parse a portable backup into drafts only. Never writes, activates, publishes
 * or overwrites current records.
 */
export function decodeViewLibraryBackup(payload: unknown): BackupCodecResult<ViewLibraryBackupDrafts> {
  const parsed = parsePayload(payload);
  if (parsed.status !== "ok") return parsed;
  if (!isPlainObject(parsed.value)) return invalid("Invalid file format: expected JSON object");
  const record = parsed.value;
  if (record.appName !== "propulse" || record.kind !== VIEW_LIBRARY_BACKUP_KIND) {
    return invalid("Invalid backup file: not a PropulSE view-library backup");
  }
  if (typeof record.version !== "number") return invalid("Invalid backup: missing version number");
  if (record.version > VIEW_LIBRARY_BACKUP_VERSION) {
    return invalid(`Incompatible backup version ${record.version}. This app supports version ${VIEW_LIBRARY_BACKUP_VERSION} or lower.`);
  }
  if (record.version !== VIEW_LIBRARY_BACKUP_VERSION) return invalid("Invalid backup: unsupported version");
  const envelope = backupEnvelopeSchema.safeParse(record);
  if (!envelope.success) {
    const message = envelope.error.issues[0]?.message ?? "Invalid view-library backup";
    if (message.includes("Duplicate")) return invalid(message);
    return invalid("Invalid view-library backup");
  }
  return ok({ views: structuredClone(envelope.data.views), presets: structuredClone(envelope.data.presets) });
}

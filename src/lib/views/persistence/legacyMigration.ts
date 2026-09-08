import { z } from "zod";
import { contractIdSchema } from "../spotContracts";
import { sceneSnapshotSchema, type ViewConfiguration } from "../contracts";
import { viewDraftSchema, libraryValueSchema } from "./schema";

export const LEGACY_VIEW_MIGRATION_VERSION = 1;
const MAX_MIGRATION_BYTES = 2 * 1024 * 1024;

/** Captured JSON only. Credentials/transient state must be omitted by the capture adapter.
 * Unknown non-secret fields are retained for rollback; nothing in this backup is applied.
 */
const backupSchema = z.unknown().transform((input, ctx): unknown => {
  const seen = new Set<object>();
  let nodes = 0;
  let textLength = 0;
  function valid(value: unknown, depth: number): boolean {
    if (++nodes > 50_000 || depth > 20) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") {
      textLength += value.length;
      return textLength <= MAX_MIGRATION_BYTES;
    }
    if (typeof value !== "object" || seen.has(value)) return false;
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (Array.isArray(value) && (keys.length !== value.length + 1 || keys.some((key) => key !== "length" &&
        (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key))))) return false;
    for (const key of keys) {
      if (Array.isArray(value) && key === "length") continue;
      if (typeof key !== "string" || key.length > 256 || /^(?:__proto__|prototype|constructor)$/i.test(key) ||
          /(?:token|password|secret|apikey|credential|authorization)/i.test(key.replace(/[^a-z0-9]/gi, ""))) return false;
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable || !valid(descriptor.value, depth + 1)) return false;
    }
    seen.delete(value);
    return true;
  }
  try {
    if (input && typeof input === "object" && !Array.isArray(input) && valid(input, 0) &&
        new TextEncoder().encode(JSON.stringify(input)).length <= MAX_MIGRATION_BYTES) return structuredClone(input);
  } catch { /* Reject cycles, getters and non-JSON inputs. */ }
  ctx.addIssue({ code: "custom", message: "Legacy backup must be bounded plain JSON without credentials" });
  return z.NEVER;
});

const seed = (family: ViewConfiguration["family"]) => viewDraftSchema.refine((view) => view.config.family === family, "Seed family mismatch");
export const legacyMigrationPlanSchema = z.object({
  version: z.literal(LEGACY_VIEW_MIGRATION_VERSION),
  ownerId: contractIdSchema,
  /** A device capture is claimed once across owners; account captures are owner-scoped. */
  source: z.enum(["device", "account"]),
  backup: backupSchema,
  views: z.object({ normal: seed("normal"), pro: seed("pro"), lite: seed("lite"), hamclock: seed("hamclock") }).strict(),
  presets: z.array(libraryValueSchema.options[1].shape.data).max(64),
  /** Complete legacy scene snapshots retained for later explicit display assignment. */
  scenes: z.array(sceneSnapshotSchema).max(24),
  warnings: z.array(z.string().min(1).max(500)).max(100),
}).strict().superRefine((plan, ctx) => {
  const views = Object.values(plan.views);
  if (new Set(views.map((view) => view.id)).size !== views.length ||
      new Set(plan.presets.map((preset) => preset.id)).size !== plan.presets.length ||
      new Set(plan.scenes.map((scene) => scene.id)).size !== plan.scenes.length) {
    ctx.addIssue({ code: "custom", message: "Migration identities must be unique within each kind" });
  }
  for (const scene of plan.scenes) {
    const checked = viewDraftSchema.safeParse({ id: scene.id, name: scene.name, schemaVersion: 1, sourcePreset: null, config: scene.config });
    if (!checked.success) ctx.addIssue({ code: "custom", message: "Invalid legacy scene configuration" });
  }
  if (new TextEncoder().encode(JSON.stringify(plan)).length > MAX_MIGRATION_BYTES) {
    ctx.addIssue({ code: "custom", message: "Legacy migration exceeds 2 MiB" });
  }
});
export type LegacyMigrationPlan = z.infer<typeof legacyMigrationPlanSchema>;
export interface LegacyMigrationJournal {
  key: string;
  mode: "local" | "account";
  plan: LegacyMigrationPlan;
  operationIds: string[];
}
export type LegacyMigrationResult =
  | { status: "migrated" | "existing"; journal: LegacyMigrationJournal }
  | { status: "invalid" | "forbidden" | "conflict" | "unavailable"; message: string };

export const legacyMigrationKey = (ownerId: string, source: LegacyMigrationPlan["source"]): string =>
  source === "device" ? "legacy-device-v1" : `legacy-account-v1:${ownerId}`;

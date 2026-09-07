import { z } from "zod";
import { contractIdSchema } from "../spotContracts";
import { displayAssignmentSchema, presetRecipeSchema, savedViewSchema, type ViewConfiguration } from "../contracts";
import { persistedWidgetSchemas } from "@/lib/hamclock/widgetSchemas";
import { canonicalJson } from "./canonical";

export const libraryKindSchema = z.enum(["view", "preset", "display"]);
export const libraryRevisionSchema = z.number().int().nonnegative().safe();
function validateWidgets(config: ViewConfiguration, ctx: z.RefinementCtx): void {
  for (const widget of config.presentation.hamclock.widgets) {
    const registered = Object.prototype.hasOwnProperty.call(persistedWidgetSchemas, widget.tileId) ? persistedWidgetSchemas[widget.tileId] : undefined;
    if (!registered || widget.schemaVersion !== registered.version || !registered.schema.safeParse(widget.config).success) {
      ctx.addIssue({ code: "custom", message: `Unsupported or invalid widget configuration: ${widget.tileId}` });
    }
  }
}
export const viewDraftSchema = savedViewSchema.omit({ ownerId: true, revision: true })
  .superRefine((draft, ctx) => validateWidgets(draft.config, ctx));
export const displayDraftSchema = z.unknown().transform((input, ctx) => {
  if (!input || typeof input !== "object" || Array.isArray(input) || "revision" in input) {
    ctx.addIssue({ code: "custom", message: "Display draft must omit the server revision" });
    return z.NEVER;
  }
  const parsed = displayAssignmentSchema.safeParse({ ...input, revision: 1 });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) ctx.addIssue(issue);
    return z.NEVER;
  }
  const { revision: _revision, ...draft } = parsed.data;
  for (const scene of draft.scenes) validateWidgets(scene.config, ctx);
  return draft;
});
export const libraryValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("view"), data: viewDraftSchema }).strict(),
  z.object({ kind: z.literal("preset"), data: presetRecipeSchema.superRefine((recipe, ctx) => {
    if (recipe.kind === "display") validateWidgets(recipe.config, ctx);
  }) }).strict(),
  z.object({ kind: z.literal("display"), data: displayDraftSchema }).strict(),
]);
export const libraryRecordSchema = z.object({
  ownerId: contractIdSchema,
  kind: libraryKindSchema,
  id: contractIdSchema,
  revision: libraryRevisionSchema.refine((revision) => revision > 0),
  /** Tombstones retain revision history so stale creates cannot resurrect deleted views. */
  value: libraryValueSchema.nullable(),
}).strict().superRefine((record, ctx) => {
  if (record.value && (record.kind !== record.value.kind ||
      (record.value.kind !== "display" && record.id !== record.value.data.id))) {
    ctx.addIssue({ code: "custom", message: "Document identity and payload disagree" });
  }
});
export const libraryOperationSchema = z.object({
  operationId: contractIdSchema,
  ownerId: contractIdSchema,
  kind: libraryKindSchema,
  id: contractIdSchema,
  expectedRevision: libraryRevisionSchema.refine((revision) => revision < Number.MAX_SAFE_INTEGER),
  value: libraryValueSchema.nullable(),
}).strict().superRefine((operation, ctx) => {
  if (operation.value && (operation.kind !== operation.value.kind ||
      (operation.value.kind !== "display" && operation.id !== operation.value.data.id))) {
    ctx.addIssue({ code: "custom", message: "Operation identity and payload disagree" });
  }
  if (operation.kind === "display" && operation.value === null) {
    ctx.addIssue({ code: "custom", message: "Removing a display assignment is a separate device lifecycle action" });
  }
  if (operation.value === null && operation.expectedRevision === 0) {
    ctx.addIssue({ code: "custom", message: "Deletion requires an existing revision" });
  }
});
export const pendingOperationSchema = z.object({
  operation: libraryOperationSchema,
  state: z.enum(["queued", "conflict", "rejected"]),
  message: z.string().max(500).nullable(),
  current: libraryRecordSchema.nullable(),
}).strict();

export type LibraryKind = z.infer<typeof libraryKindSchema>;
export type LibraryValue = z.infer<typeof libraryValueSchema>;
export type LibraryRecord = z.infer<typeof libraryRecordSchema>;
export type LibraryOperation = z.infer<typeof libraryOperationSchema>;
export type PendingOperation = z.infer<typeof pendingOperationSchema>;
export type ViewDraft = z.infer<typeof viewDraftSchema>;
export type DisplayDraft = z.infer<typeof displayDraftSchema>;
export type CommitResult =
  | { status: "saved"; record: LibraryRecord }
  | { status: "conflict"; current: LibraryRecord | null }
  | { status: "invalid" | "forbidden" | "unavailable"; message: string };

export const commitResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), record: libraryRecordSchema }).strict(),
  z.object({ status: z.literal("conflict"), current: libraryRecordSchema.nullable() }).strict(),
  z.object({ status: z.literal("invalid"), message: z.string().max(500) }).strict(),
  z.object({ status: z.literal("forbidden"), message: z.string().max(500) }).strict(),
  z.object({ status: z.literal("unavailable"), message: z.string().max(500) }).strict(),
]);

/** Server validates/authenticates independently; this is also used at the cache boundary. */
export function validateCommitResult(operation: LibraryOperation, rawResult: unknown): CommitResult {
  const checked = commitResultSchema.safeParse(rawResult);
  if (!checked.success) return { status: "invalid", message: "Invalid server acknowledgement" };
  const result = checked.data;
  if (result.status !== "saved" && result.status !== "conflict") return result;
  const raw = result.status === "saved" ? result.record : result.current;
  if (raw === null && result.status === "conflict") return result;
  const parsed = libraryRecordSchema.safeParse(raw);
  if (!parsed.success || parsed.data.ownerId !== operation.ownerId ||
      parsed.data.kind !== operation.kind || parsed.data.id !== operation.id) {
    return { status: "invalid", message: "Server returned a mismatched library record" };
  }
  if (result.status === "saved" && (parsed.data.revision !== operation.expectedRevision + 1 ||
      canonicalJson(parsed.data.value) !== canonicalJson(operation.value))) {
    return { status: "invalid", message: "Server acknowledgement does not match the requested save" };
  }
  return result.status === "saved" ? { status: "saved", record: parsed.data } : { status: "conflict", current: parsed.data };
}

/** Pure delivery bookkeeping contracts. Parsing is not server authority, and
 * callers must supply independently verified local receipt metadata. These
 * helpers do not authenticate transport, alter receipts/heads, or send work. */
import { z } from "zod";
import type { DeepReadonly } from "@/lib/station/workbench/contracts";
import { stationEntityKindSchema } from "@/lib/station/workbench/storage/operations";
import { canonicalWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

const id = z.string().min(1).refine((value) => value.trim() === value, "Identity must be unpadded");
const digest = z.string().regex(/^[0-9a-f]{64}$/, "Digest must be lowercase SHA-256 hex");
const targetKey = (head: { kind: string; id: string }) => JSON.stringify([head.kind, head.id]);
const headsSchema = z.array(z.object({ kind: stationEntityKindSchema, id, versionId: id, deleted: z.boolean() }).strict())
  .superRefine((heads, ctx) => {
    const keys = new Set<string>();
    heads.forEach((head, index) => {
      if (keys.has(targetKey(head))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate committed head target", path: [index] });
      keys.add(targetKey(head));
      if (head.kind === "operating" && head.id !== "operating") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid operating singleton", path: [index] });
      if (head.kind === "revision" && (head.deleted || head.id !== head.versionId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid immutable revision head", path: [index] });
    });
  });
const identity = { ownerId: id, generationId: id, operationId: id, payloadDigest: digest };
const bindingObject = z.object({ ...identity, committedHeads: headsSchema }).strict();
const resultObject = z.discriminatedUnion("outcome", [
  z.object({ schemaVersion: z.literal(1), ...identity, outcome: z.literal("accepted"), committedHeads: headsSchema }).strict(),
  z.object({ schemaVersion: z.literal(1), ...identity, outcome: z.literal("rejected"),
    reason: z.object({ code: id, message: z.string() }).strict(),
  }).strict(),
]);

/** JSON preflight runs before property access by Zod; getters never execute. */
function detach(input: unknown, ctx: z.RefinementCtx): unknown {
  try { return JSON.parse(canonicalWorkbenchJson(input)); }
  catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Plain JSON required", fatal: true });
    return z.NEVER;
  }
}
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value as DeepReadonly<T>;
}
export const stationDeliveryResultSchema = z.preprocess(detach, resultObject);
export const stationDeliveryBindingSchema = z.preprocess(detach, bindingObject);
export type StationDeliveryResult = z.infer<typeof stationDeliveryResultSchema>;
/** Trusted local metadata is a caller obligation, not a property proven by this type. */
export type StationDeliveryBinding = z.infer<typeof stationDeliveryBindingSchema>;

export function parseStationDeliveryResult(input: unknown): DeepReadonly<StationDeliveryResult> {
  return freeze(stationDeliveryResultSchema.parse(input));
}

function checkBinding(result: StationDeliveryResult, binding: StationDeliveryBinding): void {
  if (result.ownerId !== binding.ownerId || result.generationId !== binding.generationId
    || result.operationId !== binding.operationId || result.payloadDigest !== binding.payloadDigest) {
    throw new TypeError("Delivery result does not match trusted local operation metadata");
  }
  // Ordering is part of the receipt: nextHeads followed by tombstones. Do not
  // normalize arrays or silently accept a transformed server version token.
  if (result.outcome === "accepted" && canonicalWorkbenchJson(result.committedHeads) !== canonicalWorkbenchJson(binding.committedHeads)) {
    throw new TypeError("Accepted result must match exact committed heads and receipt order");
  }
}

export function bindStationDeliveryResult(input: unknown, trustedLocalMetadata: unknown): DeepReadonly<StationDeliveryResult> {
  const result = stationDeliveryResultSchema.parse(input);
  checkBinding(result, stationDeliveryBindingSchema.parse(trustedLocalMetadata));
  return freeze(result);
}

/** Permanent local receipts remain unchanged. Changed rejection details count
 * as a conflicting terminal outcome; a retry cannot replace the first result. */
export function compareStationDeliveryResults(previous: unknown, incoming: unknown, trustedLocalMetadata: unknown): DeepReadonly<{
  status: "recorded" | "replayed"; result: StationDeliveryResult;
}> {
  const result = bindStationDeliveryResult(incoming, trustedLocalMetadata);
  if (previous === null) return freeze({ status: "recorded" as const, result }) as DeepReadonly<{ status: "recorded"; result: StationDeliveryResult }>;
  const original = bindStationDeliveryResult(previous, trustedLocalMetadata);
  if (canonicalWorkbenchJson(original) !== canonicalWorkbenchJson(result)) throw new TypeError("Conflicting terminal delivery outcome");
  return freeze({ status: "replayed" as const, result }) as DeepReadonly<{ status: "replayed"; result: StationDeliveryResult }>;
}

const graphObject = z.object({ ownerId: id, generationId: id, operations: z.array(bindingObject.extend({
  localStatus: z.enum(["committed", "conflict"]), dependencyOperationIds: z.array(id), terminalResult: resultObject.nullable(),
}).strict()) }).strict();
export const stationDeliveryGraphSchema = z.preprocess(detach, graphObject);
export type StationDeliveryGraph = z.infer<typeof stationDeliveryGraphSchema>;
export interface StationDeliveryReadiness {
  operationId: string;
  status: "ready" | "waiting" | "acknowledged" | "rejected" | "conflicted" | "blocked";
  /** Transitive rejection/local-conflict roots, in lexical operation-ID order. */
  blockedByOperationIds: string[];
  /** Immediate dependencies lacking acknowledgment, in declared order. */
  waitingForOperationIds: string[];
}

/** Evaluate a complete owner/generation dependency graph, including acknowledged
 * prerequisites retained in the local ledger. This is readiness only: it grants
 * no server authority or sender lease and advances no clock, cursor or sequence. */
export function evaluateStationDeliveryGraph(input: unknown): DeepReadonly<StationDeliveryReadiness[]> {
  const graph = stationDeliveryGraphSchema.parse(input);
  const nodes = new Map<string, StationDeliveryGraph["operations"][number]>();
  for (const node of graph.operations) {
    if (node.ownerId !== graph.ownerId || node.generationId !== graph.generationId) throw new TypeError("Cross-owner or cross-generation delivery reference");
    if (nodes.has(node.operationId)) throw new TypeError("Duplicate delivery operation");
    if (new Set(node.dependencyOperationIds).size !== node.dependencyOperationIds.length) throw new TypeError("Duplicate delivery dependency");
    if (node.localStatus === "conflict" && (node.terminalResult !== null || node.committedHeads.length !== 0)) {
      throw new TypeError("Local conflict cannot have a terminal server result or committed heads");
    }
    if (node.terminalResult !== null) checkBinding(node.terminalResult, node);
    nodes.set(node.operationId, node);
  }
  for (const node of nodes.values()) {
    if (node.dependencyOperationIds.some((dependency) => !nodes.has(dependency))) throw new TypeError("Missing delivery dependency");
  }
  // Iterative DFS avoids imposing an arbitrary maximum chain length or using
  // JavaScript recursion depth as a hidden queue-size limit.
  const evaluated = new Map<string, StationDeliveryReadiness>();
  const visiting = new Set<string>();
  for (const node of nodes.values()) {
    const stack = [{ operationId: node.operationId, exiting: false }];
    while (stack.length) {
      const entry = stack.pop()!;
      if (evaluated.has(entry.operationId)) continue;
      const current = nodes.get(entry.operationId)!;
      if (!entry.exiting) {
        if (visiting.has(entry.operationId)) throw new TypeError("Cyclic delivery dependencies");
        visiting.add(entry.operationId);
        stack.push({ ...entry, exiting: true });
        for (const dependency of [...current.dependencyOperationIds].reverse()) stack.push({ operationId: dependency, exiting: false });
        continue;
      }
      visiting.delete(entry.operationId);
      const dependencies = current.dependencyOperationIds.map((dependency) => evaluated.get(dependency)!);
      const waiting = dependencies.filter((dependency) => dependency.status !== "acknowledged").map((dependency) => dependency.operationId);
      const blockers = [...new Set(dependencies.flatMap((dependency) => dependency.status === "rejected" || dependency.status === "conflicted"
        ? [dependency.operationId, ...dependency.blockedByOperationIds] : dependency.blockedByOperationIds))].sort();
      if (current.terminalResult?.outcome === "accepted" && waiting.length) throw new TypeError("Acknowledged operation requires acknowledged prerequisites");
      const status = current.localStatus === "conflict" ? "conflicted"
        : current.terminalResult?.outcome === "accepted" ? "acknowledged"
          : current.terminalResult?.outcome === "rejected" ? "rejected"
            : blockers.length ? "blocked" : waiting.length ? "waiting" : "ready";
      evaluated.set(entry.operationId, { operationId: entry.operationId, status, blockedByOperationIds: blockers, waitingForOperationIds: waiting });
    }
  }
  return freeze(graph.operations.map((node) => evaluated.get(node.operationId)!));
}

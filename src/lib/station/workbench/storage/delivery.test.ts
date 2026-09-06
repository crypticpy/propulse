import { describe, expect, it } from "vitest";
import {
  bindStationDeliveryResult, compareStationDeliveryResults, evaluateStationDeliveryGraph, parseStationDeliveryResult, stationDeliveryResultSchema,
  type StationDeliveryBinding, type StationDeliveryGraph, type StationDeliveryResult,
} from "@/lib/station/workbench/storage/delivery";

function binding(operationId = "A"): StationDeliveryBinding {
  return { ownerId: "owner", generationId: "generation", operationId, payloadDigest: "a".repeat(64),
    committedHeads: [{ kind: "equipment", id: operationId, versionId: `${operationId}-v1`, deleted: false }] };
}
function accepted(metadata = binding()): StationDeliveryResult {
  return { schemaVersion: 1, ...structuredClone(metadata), outcome: "accepted" };
}
function rejected(metadata = binding()): StationDeliveryResult {
  const { ownerId, generationId, operationId, payloadDigest } = metadata;
  const identity = { ownerId, generationId, operationId, payloadDigest };
  return { schemaVersion: 1, ...identity, outcome: "rejected", reason: { code: "head-conflict", message: "Remote head changed" } };
}
function node(operationId: string, dependencyOperationIds: string[] = []): StationDeliveryGraph["operations"][number] {
  return { ...binding(operationId), localStatus: "committed", dependencyOperationIds, terminalResult: null };
}
function graph(): StationDeliveryGraph {
  return { ownerId: "owner", generationId: "generation", operations: [node("A"), node("B", ["A"]), node("C", ["B"]), node("D")] };
}

describe("terminal station delivery contracts", () => {
  it("binds exact accepted heads including tombstones without changing the local receipt", () => {
    const local = binding();
    local.committedHeads.push({ kind: "location", id: "old-location", versionId: "deleted-v2", deleted: true });
    const before = structuredClone(local);
    const output = bindStationDeliveryResult(accepted(local), local);
    expect(output).toEqual(accepted(local));
    expect(local).toEqual(before);
    expect(Object.isFrozen(output)).toBe(true);
    if (output.outcome === "accepted") expect(Object.isFrozen(output.committedHeads[0])).toBe(true);
  });
  it.each(["missing", "extra", "token", "deleted", "order"])("rejects %s changes to accepted receipt heads", (change) => {
    const local = binding();
    local.committedHeads.push({ kind: "location", id: "old-location", versionId: "deleted-v2", deleted: true });
    const result = accepted(local);
    if (result.outcome !== "accepted") throw new Error("Fixture");
    if (change === "missing") result.committedHeads.pop();
    if (change === "extra") result.committedHeads.push({ kind: "equipment", id: "other", versionId: "other-v1", deleted: false });
    if (change === "token") result.committedHeads[0].versionId = "server-transformed";
    if (change === "deleted") result.committedHeads[1].deleted = false;
    if (change === "order") result.committedHeads.reverse();
    expect(() => bindStationDeliveryResult(result, local)).toThrow(/exact committed heads/);
  });
  it.each(["ownerId", "generationId", "operationId", "payloadDigest"] as const)("rejects mismatched %s", (field) => {
    const result = accepted();
    result[field] = field === "payloadDigest" ? "b".repeat(64) : "other";
    expect(() => bindStationDeliveryResult(result, binding())).toThrow(/trusted local/);
  });
  it.each(["", " padded", "trailing "])("rejects malformed identity %j", (operationId) => {
    expect(() => parseStationDeliveryResult({ ...accepted(), operationId })).toThrow();
  });
  it.each(["short", "A".repeat(64), "g".repeat(64)])("rejects malformed digest %s", (payloadDigest) => {
    expect(() => parseStationDeliveryResult({ ...accepted(), payloadDigest })).toThrow();
  });
  it("rejects duplicate targets, wrong singleton IDs and revision tombstones", () => {
    const result = accepted();
    if (result.outcome !== "accepted") throw new Error("Fixture");
    result.committedHeads.push({ ...result.committedHeads[0] });
    expect(() => parseStationDeliveryResult(result)).toThrow(/Duplicate/);
    result.committedHeads = [{ kind: "operating", id: "random", versionId: "v1", deleted: false }];
    expect(() => parseStationDeliveryResult(result)).toThrow(/singleton/);
    result.committedHeads = [{ kind: "revision", id: "r1", versionId: "r1", deleted: true }];
    expect(() => parseStationDeliveryResult(result)).toThrow(/immutable/);
  });
  it("records once, replays exactly, and rejects contradictory or altered rejection outcomes", () => {
    const local = binding();
    expect(compareStationDeliveryResults(null, accepted(), local).status).toBe("recorded");
    expect(compareStationDeliveryResults(accepted(), accepted(), local).status).toBe("replayed");
    expect(compareStationDeliveryResults(rejected(), rejected(), local).status).toBe("replayed");
    expect(() => compareStationDeliveryResults(accepted(), rejected(), local)).toThrow(/Conflicting terminal/);
    expect(() => compareStationDeliveryResults(rejected(), accepted(), local)).toThrow(/Conflicting terminal/);
    const changed = rejected();
    if (changed.outcome === "rejected") changed.reason.message = "Different explanation";
    expect(() => compareStationDeliveryResults(rejected(), changed, local)).toThrow(/Conflicting terminal/);
  });
  it("does not invoke getters or allow unknown fields, non-JSON values, or prototype keys", () => {
    let calls = 0;
    const input = Object.defineProperty({}, "outcome", { enumerable: true, get: () => { calls++; return "accepted"; } });
    expect(() => parseStationDeliveryResult(input)).toThrow(/accessors/);
    expect(calls).toBe(0);
    expect(() => parseStationDeliveryResult({ ...accepted(), cursor: "not-authorized" })).toThrow();
    expect(() => parseStationDeliveryResult({ ...accepted(), extra: Number.NaN })).toThrow(/finite/);
    const reserved = JSON.parse(JSON.stringify(accepted()).replace('{', '{"__proto__":{},'));
    expect(() => parseStationDeliveryResult(reserved)).toThrow();
  });
});

describe("pure station delivery readiness", () => {
  it("requires acknowledged dependencies and leaves independent D ready", () => {
    const input = graph();
    expect(evaluateStationDeliveryGraph(input).map(({ status }) => status)).toEqual(["ready", "waiting", "waiting", "ready"]);
    input.operations[0].terminalResult = accepted(binding("A"));
    expect(evaluateStationDeliveryGraph(input).map(({ status }) => status)).toEqual(["acknowledged", "ready", "waiting", "ready"]);
  });
  it("blocks A→B→C plus later E transitively while retaining every input", () => {
    const input = graph();
    input.operations[0].terminalResult = rejected(binding("A"));
    input.operations.push(node("E", ["B", "C"]));
    const before = structuredClone(input);
    const output = evaluateStationDeliveryGraph(input);
    expect(output.map(({ status }) => status)).toEqual(["rejected", "blocked", "blocked", "ready", "blocked"]);
    for (const index of [1, 2, 4]) expect(output[index].blockedByOperationIds).toEqual(["A"]);
    expect(input).toEqual(before);
    expect(Object.isFrozen(output[4].blockedByOperationIds)).toBe(true);
  });
  it("acknowledges A after local B without rolling back B or changing receipt metadata", () => {
    const input = graph();
    const local = { currentHead: "B-v1", pointer: "generation", sequence: 2, receipt: binding("A") };
    const before = structuredClone(local);
    const outcome = compareStationDeliveryResults(null, accepted(), local.receipt);
    input.operations[0].terminalResult = stationDeliveryResultSchema.parse(outcome.result);
    expect(evaluateStationDeliveryGraph(input)[1].status).toBe("ready");
    expect(local).toEqual(before);
    expect(compareStationDeliveryResults(outcome.result, accepted(), local.receipt).status).toBe("replayed");
  });
  it.each(["missing", "duplicate-node", "duplicate-edge", "self-cycle", "cycle", "owner", "generation"])("rejects %s graph references", (invalid) => {
    const input = graph();
    if (invalid === "missing") input.operations[1].dependencyOperationIds = ["missing"];
    if (invalid === "duplicate-node") input.operations.push(node("A"));
    if (invalid === "duplicate-edge") input.operations[1].dependencyOperationIds.push("A");
    if (invalid === "self-cycle") input.operations[0].dependencyOperationIds = ["A"];
    if (invalid === "cycle") input.operations[0].dependencyOperationIds = ["C"];
    if (invalid === "owner") input.operations[0].ownerId = "other";
    if (invalid === "generation") input.operations[0].generationId = "other";
    expect(() => evaluateStationDeliveryGraph(input)).toThrow(/Missing|Duplicate|Cyclic|Cross-/);
  });
  it.each(["accepted", "rejected"])("rejects %s terminal results on a local conflict", (outcome) => {
    const input = graph();
    input.operations[0].localStatus = "conflict";
    input.operations[0].committedHeads = [];
    input.operations[0].terminalResult = outcome === "accepted" ? accepted({ ...binding(), committedHeads: [] }) : rejected();
    expect(() => evaluateStationDeliveryGraph(input)).toThrow(/Local conflict/);
  });
  it("keeps local conflicts unsendable and blocks their dependents", () => {
    const input = graph();
    input.operations[0].localStatus = "conflict";
    input.operations[0].committedHeads = [];
    expect(evaluateStationDeliveryGraph(input).map(({ status }) => status)).toEqual(["conflicted", "blocked", "blocked", "ready"]);
  });
  it("rejects acknowledgment with unacknowledged prerequisites", () => {
    const input = graph();
    input.operations[1].terminalResult = accepted(binding("B"));
    expect(() => evaluateStationDeliveryGraph(input)).toThrow(/acknowledged prerequisites/);
  });
  it("handles a diamond in arbitrary input order without false cycle detection", () => {
    const input = graph();
    input.operations = [node("D", ["B", "C"]), node("C", ["A"]), node("A"), node("B", ["A"])];
    expect(evaluateStationDeliveryGraph(input).map(({ status }) => status)).toEqual(["waiting", "waiting", "ready", "waiting"]);
  });
  it("supports an empty graph without inventing work", () => {
    expect(evaluateStationDeliveryGraph({ ...graph(), operations: [] })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { parseWorkbenchArchive, workbenchArchiveSchema } from "@/lib/station/workbench/contracts";
import { prepareSetupClone } from "@/lib/station/workbench/revisions/services";
import { createHfFixture } from "@/lib/station/workbench/fixtures";

function fixture() {
  const archive = createHfFixture();
  const revision = archive.revisions[0];
  const connection = revision.connections[0];
  const cable = revision.equipment.find((item) => item.id === revision.cableRuns[0].baseCableInstanceId)!;
  cable.ports = ["a", "b"].map((id) => ({ id, label: id, signal: "rf", direction: "bidirectional", role: "through", connector: { state: "known", family: "pl259", gender: "male" }, ratings: {} }));
  cable.internalPaths = [{ id: "through", fromPortId: "a", toPortId: "b", signal: "rf" }];
  connection.connectorInterface = { kind: "cable", fromPortId: "a", toPortId: "b", internalPathId: "through" };
  return archive;
}

describe("explicit physical cable mating interfaces", () => {
  it("preserves legacy unknown bindings and independent pinned cable ends", () => {
    expect(workbenchArchiveSchema.safeParse(createHfFixture()).success).toBe(true);
    const archive = fixture();
    const parsed = parseWorkbenchArchive(archive);
    expect(parsed.revisions[0].connections[0].connectorInterface).toEqual({ kind: "cable", fromPortId: "a", toPortId: "b", internalPathId: "through" });
    expect(Object.isFrozen(parsed.revisions[0].connections[0].connectorInterface)).toBe(true);
    expect(parsed.inventory).toEqual(archive.inventory);
  });
  it("preserves physical cable-end identity while cloning setup-local graph IDs", () => {
    const archive = fixture();
    const revision = archive.revisions[0];
    const proposal = prepareSetupClone(archive, {
      setupId: "clone", revisionId: "clone-r1", name: "Clone", createdAt: revision.createdAt, sourceRevisionId: revision.id,
      idMap: {
        connections: Object.fromEntries(revision.connections.map((item) => [item.id, `clone-${item.id}`])),
        cableRuns: Object.fromEntries(revision.cableRuns.map((item) => [item.id, `clone-${item.id}`])),
        routes: Object.fromEntries(revision.routes.map((item) => [item.id, `clone-${item.id}`])),
      },
    });
    expect(proposal.revision.connections[0].connectorInterface).toEqual(revision.connections[0].connectorInterface);
    expect(proposal.revision.connections[0].runId).toBe(`clone-${revision.connections[0].runId}`);
    expect(proposal.revision.cableRuns[0].baseCableInstanceId).toBe(revision.cableRuns[0].baseCableInstanceId);
  });
  it("retains unknown cable port signals for downstream assessment", () => {
    const archive = fixture();
    const cable = archive.revisions[0].equipment.find((item) => item.kind === "cable")!;
    cable.ports.forEach((port) => { port.signal = "unknown"; });
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
  });
  it("rejects using one physical cable for two distinct connections", () => {
    const archive = fixture();
    const revision = archive.revisions[0];
    revision.connections.push({ ...structuredClone(revision.connections[0]), id: "other", runId: "other-run" });
    revision.cableRuns.push({ ...structuredClone(revision.cableRuns[0]), id: "other-run", connections: [{ connectionId: "other", reverse: false }] });
    revision.routes[0].analysis = { state: "documentation-only", reasons: ["Unmodeled branch"] };
    archive.operating = null;
    const parsed = workbenchArchiveSchema.safeParse(archive);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message.includes("Physical cable is bound"))).toBe(true);
  });
  it("supports an explicitly reversed physical through path", () => {
    const archive = fixture();
    archive.revisions[0].connections[0].connectorInterface = { kind: "cable", fromPortId: "b", toPortId: "a", internalPathId: "through" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
  });
  it.each([false, true])("rejects reusing a bound termination as an ordinary endpoint regardless of order (%s)", (reverse) => {
    const archive = fixture();
    const revision = archive.revisions[0];
    revision.connections.push({
      id: "extra-cable-edge", label: "Conflicting cable end", signal: "rf", runId: null,
      from: { instanceId: revision.cableRuns[0].baseCableInstanceId!, portId: "a" },
      to: revision.connections[0].to, connectorInterface: { kind: "direct" },
    });
    if (reverse) revision.connections.reverse();
    const parsed = workbenchArchiveSchema.safeParse(archive);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message.includes("Bound cable termination is also"))).toBe(true);
  });
  it.each([
    ["missing end", (a: ReturnType<typeof fixture>) => { a.revisions[0].connections[0].connectorInterface = { kind: "cable", fromPortId: "missing", toPortId: "b", internalPathId: "through" }; }],
    ["same end", (a: ReturnType<typeof fixture>) => { a.revisions[0].connections[0].connectorInterface = { kind: "cable", fromPortId: "a", toPortId: "a", internalPathId: "through" }; }],
    ["missing path", (a: ReturnType<typeof fixture>) => { a.revisions[0].connections[0].connectorInterface = { kind: "cable", fromPortId: "a", toPortId: "b", internalPathId: "missing" }; }],
    ["missing run", (a: ReturnType<typeof fixture>) => { a.revisions[0].connections[0].runId = null; }],
    ["wrong signal", (a: ReturnType<typeof fixture>) => { const c = a.revisions[0].equipment.find((e) => e.kind === "cable")!; c.ports.forEach((p) => { p.signal = "power"; }); c.internalPaths[0].signal = "power"; }],
    ["only direct interfaces", (a: ReturnType<typeof fixture>) => { a.revisions[0].connections[0].connectorInterface = { kind: "direct" }; }],
    ["self interface", (a: ReturnType<typeof fixture>) => { a.revisions[0].connections[0].from = { instanceId: a.revisions[0].cableRuns[0].baseCableInstanceId!, portId: "a" }; }],
  ])("rejects %s", (_name, change) => {
    const archive = fixture(); change(archive);
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });
});

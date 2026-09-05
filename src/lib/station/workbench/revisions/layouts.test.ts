import { describe, expect, it } from "vitest";
import { parseWorkbenchArchive } from "@/lib/station/workbench/contracts";
import { createHfFixture, createExperimentFixture } from "@/lib/station/workbench/fixtures";
import { prepareLayout, prepareLayoutUpdate, type LayoutContent } from "@/lib/station/workbench/revisions/layouts";

const content = (): LayoutContent => ({ positions: [], groups: [], viewport: { x: 0, y: 0, zoom: 1 } });

describe("W03 layout proposals", () => {
  it.each(["diagram", "list", "rack"] as const)("arranges %s without touching graph, history or operating state", (view) => {
    const archive = createExperimentFixture();
    const before = structuredClone(archive);
    const revision = archive.revisions[0];
    const input = { id: `new-${view}`, setupId: revision.setupId, revisionId: revision.id, view, ...content(), itemOrder: revision.equipment.map((item) => item.id).reverse(), preferences: { showLabels: true, showGrid: false } };
    const proposal = prepareLayout(archive, input);
    expect(archive).toEqual(before);
    const assembled = parseWorkbenchArchive({ ...archive, layouts: [...archive.layouts, proposal] });
    expect(assembled.revisions).toEqual(before.revisions);
    expect(assembled.operating).toEqual(before.operating);
    expect(assembled.experiments).toEqual(before.experiments);
    expect(assembled.publications).toEqual(before.publications);
    input.itemOrder.reverse();
    expect(proposal.itemOrder).not.toEqual(input.itemOrder);
    expect(Object.isFrozen(proposal.preferences)).toBe(true);
  });

  it("replaces all presentation fields while retaining layout identity and revision", () => {
    const archive = createHfFixture();
    archive.layouts[0].itemOrder = archive.revisions[0].equipment.map((item) => item.id);
    archive.layouts[0].preferences = { showPorts: true };
    const before = structuredClone(archive);
    const update = prepareLayoutUpdate(archive, archive.layouts[0].id, content());
    expect(update).toEqual({ id: before.layouts[0].id, ownerId: before.ownerId, setupId: before.layouts[0].setupId, revisionId: before.layouts[0].revisionId, view: before.layouts[0].view, ...content() });
    expect(update).not.toHaveProperty("preferences");
    expect(archive).toEqual(before);
    expect(Object.isFrozen(update.viewport)).toBe(true);
  });

  it.each([
    { itemOrder: ["radio"] },
    { itemOrder: ["radio", "radio"] },
    { positions: [{ instanceId: "missing", x: 0, y: 0, groupId: null }] },
    { positions: [{ instanceId: "radio", x: 0, y: 0, groupId: "missing" }] },
    { viewport: { x: 0, y: 0, zoom: 0 } },
    { revisionId: "different" },
    { connections: [] },
  ])("rejects corrupt or graph-changing content: %j", (patch) => {
    const archive = createHfFixture();
    expect(() => prepareLayoutUpdate(archive, archive.layouts[0].id, { ...content(), ...patch })).toThrow();
  });

  it("rejects duplicate identity, cross-setup reference and missing layout", () => {
    const archive = createHfFixture();
    expect(() => prepareLayout(archive, archive.layouts[0])).toThrow();
    expect(() => prepareLayout(archive, { ...archive.layouts[0], id: "new", setupId: "other" })).toThrow();
    expect(() => prepareLayoutUpdate(archive, "missing", content())).toThrow();
  });
});

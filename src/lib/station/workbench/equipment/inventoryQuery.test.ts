import { describe, expect, it } from "vitest";
import {
  createExperimentFixture,
  createHfFixture,
  createInlineAndLayersFixture,
  FIXTURE_DATE,
  FIXTURE_OWNER,
} from "@/lib/station/workbench/fixtures";
import {
  createLegacyInventoryFixture,
  INVENTORY_FIXTURE_OWNER,
} from "@/lib/station/workbench/equipment/inventoryFixtures";
import { mapLegacyEquipment } from "@/lib/station/workbench/equipment/legacyAdapters";
import {
  describeLegacyInventoryArchiveIssues,
  projectLegacyInventoryArchive,
  queryEquipmentUsedIn,
  queryEquipmentUsedInFromLegacy,
  queryTypedInventory,
} from "@/lib/station/workbench/equipment/inventoryQuery";
import { findEquipmentUsage } from "@/lib/station/workbench/equipment/services";

describe("inventoryQuery typed inventory adapter", () => {
  it("lists all five equipment kinds and retains unwired accessories", () => {
    const archive = createInlineAndLayersFixture();
    const items = queryTypedInventory(archive, FIXTURE_OWNER);
    expect(items.some((item) => item.kind === "radio")).toBe(true);
    expect(items.some((item) => item.kind === "antenna")).toBe(true);
    expect(items.some((item) => item.kind === "cable")).toBe(true);
    expect(items.some((item) => item.kind === "inline")).toBe(true);
    expect(items.some((item) => item.kind === "accessory")).toBe(true);
    const retainedAccessory = items.find((item) => item.id === "spare-accessory");
    expect(retainedAccessory?.kind).toBe("accessory");
    expect(retainedAccessory?.unwired).toBe(false);
    expect(retainedAccessory?.currentSetupIds).toEqual(["home-hf"]);
  });

  it("enforces owner scope on typed inventory reads", () => {
    const archive = createHfFixture();
    expect(() => queryTypedInventory(archive, "another-account")).toThrow(/owning account/);
    expect(() => queryTypedInventory(archive, "")).toThrow(/owning account/);
  });
});

describe("inventoryQuery Used in view-model (W02)", () => {
  it("distinguishes draft membership, pinned revisions, operating and publications", () => {
    const archive = createExperimentFixture();
    archive.publications.push({
      id: "published",
      ownerId: FIXTURE_OWNER,
      setupId: "home-hf",
      revisionId: "home-r1",
      audience: "visitor",
      publicationVersion: 1,
      reviewedAt: FIXTURE_DATE,
    });
    const view = queryEquipmentUsedIn(archive, FIXTURE_OWNER, "radio");
    expect(view.references.some((entry) => entry.role === "current-draft")).toBe(true);
    expect(view.references.some((entry) => entry.role === "pinned-revision")).toBe(true);
    expect(view.references.some((entry) => entry.role === "experiment")).toBe(true);
    expect(view.references.some((entry) => entry.role === "publication")).toBe(true);
    expect(view.references.filter((entry) => entry.isCurrentMembership).length).toBeGreaterThan(0);
    expect(view.references.filter((entry) => entry.isHistorical).length).toBeGreaterThan(0);
    expect(view.removeFromSetupHelp).toMatch(/Remove from setup/i);
    expect(view.deleteInventoryHelp).toMatch(/Delete or retire inventory/i);
  });

  it("does not leak private metadata through usage JSON", () => {
    const archive = createHfFixture();
    const usages = findEquipmentUsage(archive, "radio", FIXTURE_OWNER);
    const view = queryEquipmentUsedIn(archive, FIXTURE_OWNER, "radio");
    expect(JSON.stringify(usages)).not.toContain("PRIVATE-SERIAL");
    expect(JSON.stringify(view)).not.toContain("PRIVATE-SERIAL");
    expect(JSON.stringify(view)).not.toContain("Private workshop notes");
  });

  it("rejects cross-owner Used in reads", () => {
    const archive = createHfFixture();
    expect(() => queryEquipmentUsedIn(archive, "another-account", "radio")).toThrow(/owning account/);
  });
});

describe("inventoryQuery legacy shack projection", () => {
  it("maps every declared legacy inventory kind into the projection", () => {
    const snapshot = createLegacyInventoryFixture();
    const context = {
      ownerId: INVENTORY_FIXTURE_OWNER,
      sourceVersion: 0,
      capturedAt: FIXTURE_DATE,
    };
    for (const radio of snapshot.radios) {
      expect(mapLegacyEquipment("radio", radio, { ...context, sourceId: radio.id }).status).not.toBe("quarantined");
    }
    for (const antenna of snapshot.antennas) {
      expect(mapLegacyEquipment("antenna", antenna, { ...context, sourceId: antenna.id }).status).not.toBe("quarantined");
    }
    for (const feedline of snapshot.feedlines) {
      expect(mapLegacyEquipment("feedline", feedline, { ...context, sourceId: feedline.id }).status).not.toBe("quarantined");
    }
    for (const accessory of snapshot.accessories) {
      expect(mapLegacyEquipment("accessory", accessory, { ...context, sourceId: accessory.id }).status).not.toBe("quarantined");
    }
    for (const inline of snapshot.inlineComponents) {
      expect(mapLegacyEquipment("inline", inline, { ...context, sourceId: inline.id }).status).not.toBe("quarantined");
    }
  });

  it("projects shared gear across setups and marks unwired inventory", () => {
    const snapshot = createLegacyInventoryFixture();
    const issues = describeLegacyInventoryArchiveIssues(snapshot, INVENTORY_FIXTURE_OWNER, FIXTURE_DATE);
    expect(issues, issues.join("; ")).toEqual([]);
    const archive = projectLegacyInventoryArchive(snapshot, INVENTORY_FIXTURE_OWNER, FIXTURE_DATE);
    expect(archive).not.toBeNull();
    const feedline = queryEquipmentUsedIn(archive!, INVENTORY_FIXTURE_OWNER, "shared-coax");
    expect(feedline.references.some((entry) => entry.role === "current-draft")).toBe(true);
    expect(feedline.references.filter((entry) => entry.setupId === "home-hf")).toHaveLength(2);
    expect(feedline.references.filter((entry) => entry.setupId === "portable")).toHaveLength(2);
    expect(feedline.references.some((entry) => entry.role === "current-draft")).toBe(true);

    const unwired = queryEquipmentUsedIn(archive!, INVENTORY_FIXTURE_OWNER, "unwired-psu");
    expect(unwired.unwired).toBe(true);
    expect(unwired.references).toHaveLength(0);
  });

  it("reads Used in from legacy snapshot without exposing private fields", () => {
    const snapshot = createLegacyInventoryFixture();
    const view = queryEquipmentUsedInFromLegacy(
      snapshot,
      INVENTORY_FIXTURE_OWNER,
      "shared-radio",
      FIXTURE_DATE,
    );
    expect(view).not.toBeNull();
    expect(view!.references.length).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toContain("PRIVATE");
  });
});

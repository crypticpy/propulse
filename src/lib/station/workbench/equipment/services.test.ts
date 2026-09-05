import { describe, expect, it } from "vitest";
import {
  type EquipmentInstance, type EquipmentModel, type Evidence,
  parseWorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import { createExperimentFixture, createHfFixture, createPortableSharedFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import { mapLegacyEquipment, mapLegacyRadioModel } from "@/lib/station/workbench/equipment/legacyAdapters";
import {
  createEquipment, findEquipmentUsage, instantiateModelPorts,
  resolveCatalogReceiver, retireEquipment, updateEquipment,
} from "@/lib/station/workbench/equipment/services";

function spareRadio(): EquipmentInstance {
  const item = structuredClone(createHfFixture().inventory[0]);
  item.id = "second-radio";
  return item;
}

function catalogFixture() {
  const archive = createHfFixture();
  const report = (id: string, reportType: "manufacturer" | "independent-test"): Evidence => ({
    id, ownerId: FIXTURE_OWNER, kind: "report", reportType,
    source: `${reportType} report`, recordedAt: FIXTURE_DATE,
    citation: { name: `${reportType} lab`, url: "https://example.com/report", license: "Synthetic fixture", notes: "A report about the model, not this serial number" },
    measurementContext: { state: "unknown", reason: "Legacy report did not retain conditions" },
  });
  archive.evidence.push(report("factory", "manufacturer"), report("tested", "independent-test"));
  archive.models[0].fields = {
    "radio.receiver.rmdr": { state: "known", value: 90, unit: "dB", evidenceId: "factory" },
    "radio.receiver.sensitivity": { state: "known", value: 0.0000002, unit: "V", evidenceId: "factory" },
    "radio.testedSpecs.rmdr": { state: "known", value: 95, unit: "dB", evidenceId: "tested" },
  };
  return archive;
}

describe("equipment preparation services", () => {
  it("creates a distinct partial/custom instance without changing inventory, catalog or pinned revisions", () => {
    const archive = parseWorkbenchArchive(createHfFixture());
    const input = spareRadio();
    input.modelId = null;
    input.fields = { "radio.maxPower": { state: "unknown", reason: "Homebrew build still in progress" } };
    const result = createEquipment(archive, input);
    input.privateMetadata.imageIds.push("later-input-photo");
    input.ports[0].label = "Changed input label";
    expect(result.privateMetadata.imageIds).toEqual(["private-photo"]);
    expect(result.ports[0].label).toBe("antenna");
    expect(result.modelId).toBeNull();
    expect(archive.inventory).toHaveLength(3);
    expect(archive.revisions[0].equipment).toHaveLength(3);
    expect(Object.isFrozen(result.privateMetadata.imageIds)).toBe(true);
    expect(() => createEquipment(archive, archive.inventory[0])).toThrow(/Duplicate inventory/);
    expect(() => createEquipment(archive, { ...input, ownerId: "another-account" })).toThrow(/Cross-owner/);
    expect(() => createEquipment(archive, { ...input, retiredAt: "2026-09-06T12:00:00Z" })).toThrow(/retired/);
    expect(() => createEquipment(archive, { ...input, lifecycle: "retired" })).toThrow(/retirement date/);
  });

  it("merges edits while preserving private metadata, explicit zeros, raw recovery and historical operating inputs", () => {
    const archive = createHfFixture();
    const radio = archive.inventory[0];
    radio.privateMetadata.manualNotes = "Private restoration instructions";
    radio.privateMetadata.galleryImageIds = ["original-gallery"];
    radio.legacy.push({ kind: "radio", sourceId: "original", sourceVersion: 1, payload: { unknownNested: { keep: true } } });
    radio.fields = { "radio.maxPower": { state: "known", value: 100, unit: "W", evidenceId: "declared" } };
    const original = structuredClone(archive);
    const result = updateEquipment(archive, "radio", {
      label: "New nickname", privateMetadata: { notes: "New private note", manualNotes: undefined },
      fields: { "radio.customPowerLimit": { state: "known", value: 0, unit: "W", evidenceId: "declared" } },
      facts: { powerLimit: { state: "known", value: 0, unit: "W", evidenceId: "declared" } },
    });
    expect(result.privateMetadata).toMatchObject({ serialNumber: "PRIVATE-SERIAL", manualNotes: "Private restoration instructions", galleryImageIds: ["original-gallery"], notes: "New private note" });
    expect(result.fields?.["radio.maxPower"]).toMatchObject({ value: 100 });
    expect(result.fields?.["radio.customPowerLimit"]).toMatchObject({ value: 0 });
    expect(result.legacy).toEqual(radio.legacy);
    expect(archive).toEqual(original);
    expect(result.id).toBe("radio");
    expect(() => updateEquipment(archive, "radio", { id: "renumbered" })).toThrow();
    expect(() => updateEquipment(archive, "radio", { kind: "antenna" })).toThrow();
  });

  it("explicitly clears an optional primary-photo reference while preserving gallery, other metadata and pins", () => {
    const archive = createHfFixture();
    archive.inventory[0].privateMetadata.primaryImageId = "private-photo";
    archive.inventory[0].privateMetadata.galleryImageIds = ["gallery-photo", "private-photo"];
    archive.inventory[0].privateMetadata.manualNotes = "Keep these instructions";
    const original = structuredClone(archive);
    const result = updateEquipment(archive, "radio", { clearPrivateMetadata: ["primaryImageId"] });
    expect(result.privateMetadata).not.toHaveProperty("primaryImageId");
    expect(result.privateMetadata.galleryImageIds).toEqual(["gallery-photo", "private-photo"]);
    expect(result.privateMetadata.imageIds).toEqual(["private-photo"]);
    expect(result.privateMetadata.receiptMediaIds).toEqual(["private-receipt"]);
    expect(result.privateMetadata.manualNotes).toBe("Keep these instructions");
    expect(result.privateMetadata.serialNumber).toBe("PRIVATE-SERIAL");
    expect(archive).toEqual(original);
    expect(Object.isFrozen(result.privateMetadata)).toBe(true);
    expect(() => updateEquipment(archive, "radio", { privateMetadata: { primaryImageId: "new-photo" }, clearPrivateMetadata: ["primaryImageId"] })).toThrow(/Cannot set and clear/);
    expect(() => updateEquipment(archive, "radio", { privateMetadata: { primaryImageId: undefined }, clearPrivateMetadata: ["primaryImageId"] })).toThrow(/Cannot set and clear/);
    for (const key of ["imageIds", "receiptMediaIds", "notAField", "__proto__"]) {
      expect(() => updateEquipment(archive, "radio", { clearPrivateMetadata: [key] })).toThrow(/Only optional/);
    }
    expect(() => updateEquipment(archive, "radio", { clearPrivateMetadata: ["primaryImageId", "primaryImageId"] })).toThrow(/Duplicate/);
    const emptyRequiredArrays = updateEquipment(archive, "radio", { privateMetadata: { imageIds: [], receiptMediaIds: [] } });
    expect(emptyRequiredArrays.privateMetadata.imageIds).toEqual([]);
    expect(emptyRequiredArrays.privateMetadata.receiptMediaIds).toEqual([]);
  });

  it("rejects dangling evidence, foreign measurement subjects, incompatible models and invalid units atomically", () => {
    const archive = createHfFixture();
    archive.evidence.push({
      id: "other-reading", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Owner instrument",
      observedAt: FIXTURE_DATE, point: { kind: "equipment", instanceId: "antenna", description: "Feedpoint" },
      reading: { value: 20, unit: "W" }, quantityKind: "rf-power", context: { kind: "rf", frequencyHz: 14_200_000 }, method: "Synthetic test",
    });
    const original = structuredClone(archive);
    expect(() => updateEquipment(archive, "radio", { modelId: "missing" })).toThrow(/Missing model/);
    expect(() => updateEquipment(archive, "antenna", { modelId: "hf-model" })).toThrow(/Model kind/);
    expect(() => updateEquipment(archive, "radio", { fields: { "radio.maxPower": { state: "known", value: 20, unit: "W", evidenceId: "missing" } } })).toThrow();
    expect(() => updateEquipment(archive, "radio", { fields: { "radio.maxPower": { state: "known", value: 20, unit: "W", evidenceId: "other-reading" } } })).toThrow();
    expect(() => updateEquipment(archive, "radio", { fields: { "radio.maxPower": { state: "known", value: 20, unit: "m", evidenceId: "declared" } } })).toThrow();
    expect(archive).toEqual(original);
  });

  it("retires shared equipment without removing references or changing saved source snapshots", () => {
    const archive = createPortableSharedFixture();
    const before = structuredClone(archive);
    const result = retireEquipment(archive, "radio", "2026-09-06T12:00:00Z");
    expect(result.lifecycle).toBe("retired");
    expect(result.retiredAt).toBe("2026-09-06T12:00:00Z");
    expect(result.privateMetadata).toEqual(archive.inventory[0].privateMetadata);
    expect(archive).toEqual(before);
    expect(archive.revisions.every((revision) => revision.equipment[0].lifecycle === "owned")).toBe(true);
    expect(() => retireEquipment(archive, "radio", "2020-01-01T00:00:00Z")).toThrow(/precede/);
    const changed = { ...archive, inventory: archive.inventory.map((item) => item.id === result.id ? structuredClone(result) : item) };
    expect(retireEquipment(changed, "radio", "2026-09-07T12:00:00Z").retiredAt).toBe(result.retiredAt);
    const restored = updateEquipment(changed, "radio", { lifecycle: "owned" });
    expect(restored.retiredAt).toBeUndefined();
  });
});

describe("explicit port templates", () => {
  function switchModel(): EquipmentModel {
    const port = createHfFixture().inventory[0].ports[0];
    return { id: "switch-model", origin: "custom", kind: "accessory", name: "Switch", specifications: {},
      portTemplates: [{ ...port, id: "common", role: "switch-common" }, { ...port, id: "throw", role: "switch-throw" }],
      internalPathTemplates: [{ id: "pair", fromPortId: "common", toPortId: "throw", signal: "rf", exclusiveGroupId: "selector" }],
    };
  }

  it("keeps supplied IDs across catalog order/label changes, clones ports and remaps internal endpoints", () => {
    const model = switchModel();
    const mapping = { portIds: { common: "instance-common", throw: "instance-throw" }, pathIds: { pair: "instance-pair" } };
    const first = instantiateModelPorts(model, mapping);
    model.portTemplates.reverse();
    model.portTemplates[0].label = "Renamed catalog port";
    const second = instantiateModelPorts(model, mapping);
    expect(first.ports.find((port) => port.templateId === "throw")?.id).toBe("instance-throw");
    expect(second.ports.find((port) => port.templateId === "throw")?.id).toBe("instance-throw");
    expect(first.ports[1].label).toBe("antenna");
    expect(first.internalPaths[0]).toMatchObject({ id: "instance-pair", fromPortId: "instance-common", toPortId: "instance-throw", exclusiveGroupId: "selector" });
    expect(Object.isFrozen(first.ports[0].connector)).toBe(true);
  });

  it("rejects incomplete, duplicate and extra mappings instead of manufacturing identities", () => {
    const model = switchModel();
    expect(() => instantiateModelPorts(model, { portIds: { common: "x" }, pathIds: { pair: "p" } })).toThrow();
    expect(() => instantiateModelPorts(model, { portIds: { common: "x", throw: "x" }, pathIds: { pair: "p" } })).toThrow();
    expect(() => instantiateModelPorts(model, { portIds: { common: "x", throw: "y", spare: "z" }, pathIds: { pair: "p" } })).toThrow();
    model.portTemplates[0].ratings = { "port.maxPower": { state: "known", value: 50, unit: "m", evidenceId: "declared" } };
    expect(() => instantiateModelPorts(model, { portIds: { common: "x", throw: "y" }, pathIds: { pair: "p" } })).toThrow(/requires W/);
    model.portTemplates[0].ratings = {};
    model.portTemplates[0].signal = "power";
    expect(() => instantiateModelPorts(model, { portIds: { common: "x", throw: "y" }, pathIds: { pair: "p" } })).toThrow(/signal mismatch/);
    model.portTemplates[0].signal = "rf";
    model.internalPathTemplates![0].toPortId = "missing";
    expect(() => instantiateModelPorts(model, { portIds: { common: "x", throw: "y" }, pathIds: { pair: "p" } })).toThrow(/Invalid internal path/);
  });
});

describe("catalog source selection and usage", () => {
  it("honors instance/global source choices without filling a partial tested group from factory or changing evidence kind", () => {
    const archive = catalogFixture();
    const original = structuredClone(archive);
    const selected = resolveCatalogReceiver(archive, "radio", true);
    expect(selected.selectedSource).toBe("tested");
    expect(selected.fields.rmdr).toMatchObject({ value: 95 });
    expect(selected.fields.sensitivity.state).toBe("unknown");
    expect(selected.evidence).toMatchObject([{ kind: "report", reportType: "independent-test", citation: { license: "Synthetic fixture" } }]);
    expect(archive).toEqual(original);
    archive.inventory[0].privateMetadata.specPreference = "factory";
    expect(resolveCatalogReceiver(archive, "radio", true).selectedSource).toBe("factory");
    archive.inventory[0].privateMetadata.specPreference = "tested";
    expect(resolveCatalogReceiver(archive, "radio", false).selectedSource).toBe("tested");
    archive.inventory[0].privateMetadata.specPreference = "global";
    expect(resolveCatalogReceiver(archive, "radio", false).selectedSource).toBe("factory");
    expect(Object.isFrozen(selected.fields)).toBe(true);
  });

  it("keeps a physical receiver measurement separate from the selected catalog report and rejects model relabeling", () => {
    const archive = catalogFixture();
    archive.evidence.push({
      id: "physical", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Owner's instrument",
      observedAt: FIXTURE_DATE, point: { kind: "equipment", instanceId: "radio", description: "This serial number" },
      reading: { value: 80, unit: "dB" }, quantityKind: "other", context: { kind: "rf", frequencyHz: 14_200_000 }, method: "Synthetic receiver test",
    });
    archive.inventory[0].fields = { "radio.receiver.rmdr": { state: "known", value: 80, unit: "dB", evidenceId: "physical" } };
    const selected = resolveCatalogReceiver(archive, "radio", false);
    expect(selected.fields.rmdr).toMatchObject({ value: 90, evidenceId: "factory" });
    expect(selected.evidence.some((entry) => entry.kind === "measurement")).toBe(false);
    expect(archive.inventory[0].fields["radio.receiver.rmdr"]).toMatchObject({ value: 80, evidenceId: "physical" });
    archive.models[0].fields!["radio.receiver.rmdr"] = archive.inventory[0].fields["radio.receiver.rmdr"];
    expect(() => resolveCatalogReceiver(archive, "radio", false)).toThrow(/subject/);
  });

  it("reports absent and all-unknown tested data fallback and unknown catalog data", () => {
    const archive = catalogFixture();
    archive.models[0].fields!["radio.testedSpecs.rmdr"] = { state: "unknown", reason: "No usable lab result" };
    expect(resolveCatalogReceiver(archive, "radio", true).selectedSource).toBe("factory");
    delete archive.models[0].fields!["radio.testedSpecs.rmdr"];
    const fallback = resolveCatalogReceiver(archive, "radio", true);
    expect(fallback.selectedSource).toBe("factory");
    expect(fallback.fallbackReason).toMatch(/unavailable/);
    archive.inventory[0].modelId = null;
    const custom = resolveCatalogReceiver(archive, "radio", true);
    expect(custom.selectedSource).toBe("unknown");
    expect(Object.values(custom.fields).every((field) => field.state === "unknown")).toBe(true);
    expect(custom.evidence).toEqual([]);
  });

  it("carries imported model citations separately from the selected fields without inventing an attribution link", () => {
    const rawModel = {
      id: "imported-model", manufacturer: "Example", model: "One", receiver: { rmdr: 90 },
      testedSpecs: { rmdr: 95 }, maxPower: 100, minPower: 0, modes: ["SSB"], bands: ["20m"], tier: "midrange",
      sources: [{ name: "Original report", url: "https://example.test/report", license: "Attribution", notes: "Test conditions" }],
    };
    const context = { ownerId: FIXTURE_OWNER, sourceVersion: 1, capturedAt: FIXTURE_DATE };
    const model = mapLegacyRadioModel(rawModel, { ...context, sourceId: rawModel.id, origin: "catalog", reportTypes: { 0: "independent-test" } });
    const item = mapLegacyEquipment("radio", { id: "imported-radio", equipmentId: rawModel.id, nickname: "My radio", addedAt: FIXTURE_DATE, specPreference: "tested" }, { ...context, sourceId: "imported-radio" });
    if (model.status === "quarantined" || item.status === "quarantined") throw new Error("Synthetic imports must produce proposals");
    const archive = parseWorkbenchArchive({
      schemaVersion: 1, ownerId: FIXTURE_OWNER, models: [model.value], inventory: [item.value],
      evidence: [...model.evidence, ...item.evidence], locations: [], setups: [], revisions: [], layouts: [],
      experiments: [], publications: [], operating: null,
    });
    const selected = resolveCatalogReceiver(archive, "imported-radio", true);
    expect(selected.fields.rmdr).toMatchObject({ state: "known", value: 95 });
    expect(selected.modelCitations).toContainEqual(expect.objectContaining({
      kind: "report", reportType: "independent-test", citation: rawModel.sources[0],
    }));
    const actualCitation = selected.modelCitations.find((entry) => entry.citation.name === "Original report");
    expect(selected.evidence.some((entry) => entry.id === actualCitation?.id)).toBe(false);
    expect(selected.evidence).toContainEqual(expect.objectContaining({ citation: { name: "Unattributed legacy tested specifications" } }));
    rawModel.sources[0].notes = "Changed after import";
    expect(actualCitation?.citation.notes).toBe("Test conditions");
    expect(Object.isFrozen(actualCitation?.citation)).toBe(true);
  });

  it("reports every reference role from pins even after a newer draft drops that item, without exposing private contents", () => {
    const archive = createExperimentFixture();
    archive.publications.push({ id: "published", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1", audience: "visitor", publicationVersion: 1, reviewedAt: FIXTURE_DATE });
    const before = structuredClone(archive);
    const usages = findEquipmentUsage(archive, "radio", FIXTURE_OWNER);
    expect(new Set(usages.map((entry) => entry.kind))).toEqual(new Set(["draft", "revision", "experiment-baseline", "experiment-candidate", "operating", "publication"]));
    expect(usages.filter((entry) => entry.kind === "revision")).toHaveLength(2);
    expect(usages.find((entry) => entry.kind === "publication")?.revisionId).toBe("home-r1");
    expect(JSON.stringify(usages)).not.toContain("PRIVATE-SERIAL");
    expect(archive).toEqual(before);
    expect(Object.isFrozen(usages)).toBe(true);
    const emptyDraft = structuredClone(archive.revisions[1]);
    emptyDraft.id = "empty-draft";
    emptyDraft.parentRevisionId = "home-r2";
    emptyDraft.equipment = [];
    emptyDraft.models = [];
    emptyDraft.connections = [];
    emptyDraft.cableRuns = [];
    emptyDraft.routes = [];
    archive.revisions.push(emptyDraft);
    archive.setups[0].draftRevisionId = emptyDraft.id;
    const afterRemoval = findEquipmentUsage(archive, "radio", FIXTURE_OWNER);
    expect(afterRemoval.some((entry) => entry.kind === "draft")).toBe(false);
    expect(afterRemoval.filter((entry) => entry.kind === "revision")).toHaveLength(2);
    expect(afterRemoval.some((entry) => entry.kind === "operating")).toBe(true);
    expect(afterRemoval.some((entry) => entry.kind === "publication")).toBe(true);
    expect(() => findEquipmentUsage(archive, "radio", "another-account")).toThrow(/owning account/);
    expect(() => findEquipmentUsage(archive, "unknown", FIXTURE_OWNER)).toThrow(/Unknown equipment/);
  });
});

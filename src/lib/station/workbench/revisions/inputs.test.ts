import { describe, expect, it } from "vitest";
import { parseWorkbenchArchive, type Evidence } from "@/lib/station/workbench/contracts";
import {
  createHfFixture, createInlineAndLayersFixture, createPortableSharedFixture,
  createReceiveOnlyFixture, createUnsupportedBranchFixture, FIXTURE_DATE, FIXTURE_OWNER,
} from "@/lib/station/workbench/fixtures";
import { assessRevisionTopology, resolveRevisionInputs } from "@/lib/station/workbench/revisions/inputs";

const recovery = { sourceId: "import-source", sourceVersion: 1 };
const contextReport: Evidence = {
  id: "bibliography-only", ownerId: FIXTURE_OWNER, kind: "report", reportType: "unknown",
  source: "Unclassified original citation", recordedAt: FIXTURE_DATE,
  citation: { name: "Original bibliography", notes: "Preserve even without a directly cited metric" },
  measurementContext: { state: "unknown", reason: "Not recorded" },
};

describe("W03 resolved revision inputs", () => {
  it("captures selected gear in explicit order plus model, evidence and complete bibliography", () => {
    const archive = createHfFixture();
    archive.evidence.push(contextReport, { id: "unrelated", ownerId: FIXTURE_OWNER, kind: "declared", source: "Another item", recordedAt: FIXTURE_DATE });
    archive.models[0].sourceReportIds = [contextReport.id];
    const resolved = resolveRevisionInputs(archive, { instanceIds: ["antenna", "radio"], locationId: "home" });
    expect(resolved.equipment.map((item) => item.id)).toEqual(["antenna", "radio"]);
    expect(resolved.models.map((item) => item.id)).toEqual(["hf-model"]);
    expect(resolved.evidence.map((item) => item.id)).toEqual(["declared", "bibliography-only"]);
    expect(resolved.location).toEqual(archive.locations[0]);
    expect(resolved).not.toHaveProperty("settings");
    expect(resolved).not.toHaveProperty("operating");
  });

  it("captures field and port-rating evidence without changing ownership or measurement identity", () => {
    const archive = createHfFixture();
    const measurement: Evidence = {
      id: "radio-power", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Synthetic test", observedAt: FIXTURE_DATE,
      point: { kind: "port", instanceId: "radio", portId: "antenna" }, reading: { value: 100, unit: "W" }, quantityKind: "rf-power",
      context: { kind: "rf", frequencyHz: 14_200_000 }, method: "Synthetic dummy-load test",
    };
    archive.evidence.push(measurement);
    archive.inventory[0].ports[0].ratings["port.rfPower"] = { state: "known", value: 100, unit: "W", evidenceId: measurement.id };
    archive.inventory[0].fields = { "equipment.modelNumber": { state: "known", value: "Custom", evidenceId: "declared" } };
    const resolved = resolveRevisionInputs(archive, { instanceIds: ["radio"], locationId: null });
    expect(resolved.evidence).toContainEqual(measurement);
    expect(resolved.equipment[0].ports[0].id).toBe("antenna");
    expect(resolved.location).toBeNull();
  });

  it("includes explicit settings/cable evidence and rejects missing or duplicate source requests", () => {
    const archive = createHfFixture();
    archive.evidence.push({ id: "settings-only", ownerId: FIXTURE_OWNER, kind: "declared", source: "Requested operating settings", recordedAt: FIXTURE_DATE });
    const selection = { instanceIds: ["radio"], locationId: null, evidenceIds: ["settings-only", "declared"] };
    expect(resolveRevisionInputs(archive, selection).evidence.map((item) => item.id)).toEqual(["declared", "settings-only"]);
    expect(() => resolveRevisionInputs(archive, { ...selection, evidenceIds: ["missing"] })).toThrow("Missing explicit evidence");
    expect(() => resolveRevisionInputs(archive, { ...selection, evidenceIds: ["declared", "declared"] })).toThrow("Duplicate explicit evidence");
  });

  it("does not invent membership to satisfy an explicitly requested measurement point", () => {
    const archive = createHfFixture();
    archive.evidence.push({
      id: "antenna-only", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Synthetic antenna check", observedAt: FIXTURE_DATE,
      point: { kind: "port", instanceId: "antenna", portId: "feed" }, reading: { value: 1.5, unit: "ratio" }, quantityKind: "swr",
      context: { kind: "rf", frequencyHz: 14_200_000 }, method: "Synthetic method",
    });
    expect(() => resolveRevisionInputs(archive, { instanceIds: ["radio"], locationId: null, evidenceIds: ["antenna-only"] })).toThrow("unselected equipment");
  });

  it("returns detached deeply immutable snapshots including private legacy/media and location", () => {
    const archive = createHfFixture();
    archive.inventory[0].legacy = [{ kind: "radio", sourceId: "old", sourceVersion: 24, payload: JSON.parse('{"__proto__":{"preserved":true},"future":[0,false,null]}') }];
    const resolved = resolveRevisionInputs(archive, { instanceIds: ["radio"], locationId: "home" });
    const saved = JSON.stringify(resolved);
    archive.inventory[0].privateMetadata.imageIds.push("another-photo");
    archive.models[0].name = "Updated catalog name";
    archive.evidence[0].source = "Changed declaration";
    archive.locations[0].coordinates!.latitude = 0;
    expect(JSON.stringify(resolved)).toBe(saved);
    expect(Object.isFrozen(resolved.equipment[0].legacy[0].payload)).toBe(true);
    expect(Object.isFrozen(resolved.equipment[0].ports)).toBe(true);
    expect(Object.isFrozen(resolved.models[0].specifications)).toBe(true);
    expect(Object.isFrozen(resolved.location?.coordinates)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(resolved.equipment[0].legacy[0].payload, "__proto__")).toBe(true);
  });

  it("retains unwired side accessories and retirement instead of cloning or reviving equipment", () => {
    const archive = createInlineAndLayersFixture();
    const spare = archive.inventory.find((item) => item.id === "spare-accessory")!;
    spare.lifecycle = "retired";
    spare.retiredAt = "2026-09-06T12:00:00Z";
    const original = JSON.stringify(archive);
    const resolved = resolveRevisionInputs(archive, { instanceIds: ["spare-accessory", "supply"], locationId: null });
    expect(resolved.equipment.map((item) => item.id)).toEqual(["spare-accessory", "supply"]);
    expect(resolved.equipment[0]).toMatchObject({ lifecycle: "retired", ports: [], retiredAt: spare.retiredAt });
    expect(resolved.models).toEqual([]);
    expect(JSON.stringify(archive)).toBe(original);
  });

  it("keeps every non-RF accessory category selected without requiring edges", () => {
    const archive = createHfFixture();
    const categories = ["power_supply", "grounding", "rotator", "keyer", "audio_dsp"];
    const members = categories.map((category) => ({
      ...structuredClone(archive.inventory[2]), id: `side-${category}`, label: category,
      kind: "accessory" as const, fields: { "accessory.category": { state: "known" as const, value: category, evidenceId: "declared" } },
    }));
    archive.inventory.push(...members);
    const resolved = resolveRevisionInputs(archive, { instanceIds: members.map((item) => item.id), locationId: null });
    expect(resolved.equipment).toEqual(members);
    expect(resolved.equipment.every((item) => item.ports.length === 0 && item.internalPaths.length === 0)).toBe(true);
    expect(resolved).not.toHaveProperty("connections");
  });

  it("captures shared physical IDs once and leaves old reviewed snapshots and operating choice alone", () => {
    const archive = createPortableSharedFixture();
    const historical = structuredClone(archive.revisions);
    archive.inventory[0].label = "New live label";
    const resolved = resolveRevisionInputs(archive, { instanceIds: ["radio"], locationId: "park" });
    expect(resolved.equipment).toHaveLength(1);
    expect(resolved.equipment[0]).toMatchObject({ id: "radio", label: "New live label" });
    expect(archive.revisions).toEqual(historical);
    expect(archive.operating?.revisionId).toBe("home-r1");
    expect(resolved.location?.activationRef).toBe("SYNTHETIC-1");
  });

  it("allows an empty draft selection without inventing default gear, location or measurements", () => {
    expect(resolveRevisionInputs(createHfFixture(), { instanceIds: [], locationId: null })).toEqual({ equipment: [], models: [], evidence: [], location: null });
  });

  it.each([
    { instanceIds: ["radio", "radio"], locationId: "home" },
    { instanceIds: ["missing"], locationId: "home" },
    { instanceIds: ["radio"], locationId: "missing" },
  ])("rejects duplicate/dangling explicit selection %#", (selection) => {
    expect(() => resolveRevisionInputs(createHfFixture(), selection)).toThrow();
  });

  it("rejects invalid cross-owner or missing dependencies before capturing a partial snapshot", () => {
    const archive = createHfFixture();
    archive.evidence[0].ownerId = "other-owner";
    expect(() => resolveRevisionInputs(archive, { instanceIds: ["radio"], locationId: "home" })).toThrow();
    archive.evidence[0].ownerId = FIXTURE_OWNER;
    archive.models = [];
    expect(() => resolveRevisionInputs(archive, { instanceIds: ["radio"], locationId: "home" })).toThrow();
  });
});

describe("W03 selected revision structural assessment", () => {
  it("reports explicit unknowns without replacing them or suggesting engine support", () => {
    const archive = createHfFixture();
    const before = JSON.stringify(archive);
    const result = assessRevisionTopology(archive, "home-r1", recovery);
    expect(result.status).toBe("incomplete");
    expect(result.diagnostics.some((item) => item.code === "unknown-input")).toBe(true);
    expect(result.diagnostics.some((item) => item.code === "unknown-port" && item.instanceId === "radio" && item.portId === "antenna")).toBe(true);
    expect(result.recovery).toBeNull();
    expect(result).not.toHaveProperty("supported");
    expect(JSON.stringify(archive)).toBe(before);
  });

  it("returns structural candidate only when declared topology inputs contain no explicit unknowns", () => {
    const archive = createHfFixture();
    const revision = archive.revisions[0];
    revision.equipment[1].facts.gain = { state: "known", value: 0, unit: "dBi", evidenceId: "declared" };
    revision.cableRuns[0].lengthMeters = { state: "known", value: 0, unit: "m", evidenceId: "declared" };
    revision.equipment[0].ports[0].role = "source";
    revision.equipment[1].ports[0].role = "load";
    for (const item of revision.equipment) item.ports.forEach((port) => { port.connector = { state: "known", family: "bnc", gender: "female" }; });
    const result = assessRevisionTopology(archive, revision.id, recovery);
    expect(result.status).toBe("candidate");
    expect(result.diagnostics).toEqual([]);
    expect(result).not.toHaveProperty("engineSupported");
  });

  it("keeps unsupported branches intact and explains their documented limit", () => {
    const archive = createUnsupportedBranchFixture();
    const result = assessRevisionTopology(archive, "home-r1", recovery);
    expect(result.status).toBe("unsupported");
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ category: "unsupported", routeId: "main", code: "documented-limit" })]));
    expect(archive.revisions[0].connections).toHaveLength(2);
    expect(result.recovery).toBeNull();
  });

  it("does not require transmit power on a receive-only route or wiring for spare members", () => {
    const archive = createReceiveOnlyFixture();
    archive.revisions[0].settings.requestedPowerWatts = { state: "unknown", reason: "Receive only" };
    const result = assessRevisionTopology(archive, "home-r1", recovery);
    expect(result.diagnostics.some((item) => item.path[item.path.length - 1] === "requestedPowerWatts")).toBe(false);
    const withSpare = assessRevisionTopology(createInlineAndLayersFixture(), "home-r1", recovery);
    expect(withSpare.diagnostics.some((item) => item.instanceId === "spare-accessory")).toBe(false);
  });

  it("retains invalid dangling topology privately with source identity and raw unknown properties", () => {
    const archive = createHfFixture();
    archive.revisions[0].connections[0].to.portId = "missing-port";
    const raw = JSON.parse(JSON.stringify(archive));
    Object.defineProperty(raw, "__proto__", { value: { sourceExtension: true }, enumerable: true });
    const result = assessRevisionTopology(raw, "home-r1", recovery);
    expect(result.status).toBe("invalid");
    expect(result.recovery).toMatchObject({ kind: "workbench", sourceId: "import-source", sourceVersion: 1 });
    expect(JSON.stringify(result.recovery?.payload.archive)).toBe(JSON.stringify(raw));
    expect(Object.isFrozen(result.recovery?.payload)).toBe(true);
    expect(raw.revisions[0].connections[0].to.portId).toBe("missing-port");
  });

  it("reports a missing selected revision and distinguishes non-JSON recovery failure", () => {
    const missing = assessRevisionTopology(createHfFixture(), "missing-revision", recovery);
    expect(missing.status).toBe("invalid");
    expect(missing.diagnostics[0].code).toBe("missing-revision");
    expect(missing.recovery).not.toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const corrupt = assessRevisionTopology(cyclic, "missing", recovery);
    expect(corrupt.status).toBe("invalid");
    expect(corrupt.recovery).toBeNull();
    expect(corrupt.diagnostics.some((item) => item.code === "recovery-unavailable")).toBe(true);
  });

  it("reads only the chosen revision for completeness and never updates the draft or operating pin", () => {
    const archive = createPortableSharedFixture();
    archive.revisions[1].settings.requestedPowerWatts = { state: "unknown", reason: "Portable setting pending" };
    const before = parseWorkbenchArchive(archive);
    const home = assessRevisionTopology(archive, "home-r1", recovery);
    expect(home.diagnostics.some((item) => item.message === "Portable setting pending")).toBe(false);
    const portable = assessRevisionTopology(archive, "portable-r1", recovery);
    expect(portable.diagnostics.some((item) => item.message === "Portable setting pending")).toBe(true);
    expect(parseWorkbenchArchive(archive)).toEqual(before);
  });
});

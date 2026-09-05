import { describe, expect, it } from "vitest";
import { evidenceSchema, publishedProfileSchema, workbenchArchiveSchema } from "@/lib/station/workbench/contracts";
import {
  createExperimentFixture, createHfFixture, createInlineAndLayersFixture, createMultipleCableRunsFixture,
  createPortableSharedFixture, createSwitchedFixture, FIXTURE_DATE, FIXTURE_OWNER,
} from "@/lib/station/workbench/fixtures";

function measuredFixture(quantityKind: "antenna-gain" | "relative-gain", unit: string) {
  const archive = createHfFixture();
  archive.revisions[0].evidence.push(evidenceSchema.parse({
    id: "gain-reading", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Synthetic bench result",
    observedAt: FIXTURE_DATE, point: { kind: "port", instanceId: "antenna", portId: "feed" },
    reading: { value: 2, unit }, quantityKind, context: { kind: "rf", frequencyHz: 14_200_000 }, method: "Synthetic method",
  }));
  archive.revisions[0].equipment[1].facts.gain = { state: "known", value: 2, unit, evidenceId: "gain-reading" };
  return archive;
}

describe("W01 review boundary regressions", () => {
  it("keeps run identity, base cable and inline order independent of route choice", () => {
    const archive = createMultipleCableRunsFixture();
    const revision = archive.revisions[0];
    const before = structuredClone(revision.cableRuns);
    expect(before.map((run) => run.id)).toEqual(["main-run", "legacy-run-a"]);
    expect(before[1].inlineItems.map((item) => item.instanceId)).toEqual(["run-adapter", "run-choke"]);
    expect(before[1].legacy[0]).toMatchObject({ sourceId: "legacy-run-a", payload: { inlineComponentIds: ["run-adapter", "run-choke"] } });
    revision.routes[0].hops = [revision.routes[0].hops[0],
      { kind: "internal", instanceId: "switch", internalPathId: "select-b", reverse: false },
      { kind: "connection", connectionId: "switch-b", reverse: false },
    ];
    expect(workbenchArchiveSchema.parse(archive).revisions[0].cableRuns).toEqual(before);
    const candidate = structuredClone(revision);
    candidate.id = "home-r2";
    candidate.parentRevisionId = revision.id;
    candidate.cableRuns[1].label = "Edited second run";
    archive.revisions.push(candidate);
    archive.setups[0].draftRevisionId = candidate.id;
    expect(workbenchArchiveSchema.parse(archive).revisions[0].cableRuns).toEqual(before);
  });

  it.each([
    ["dangling edge run", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].connections[2].runId = "absent"; }],
    ["dangling segment", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].connections[0].connectionId = "absent"; }],
    ["wrong base kind", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].baseCableInstanceId = "radio"; }],
    ["reordered inline gear", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].inlineItems.reverse(); }],
    ["reordered edges", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].connections.reverse(); }],
    ["duplicate run ID", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].id = "main-run"; }],
    ["duplicate segment", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].connections[1] = structuredClone(a.revisions[0].cableRuns[1].connections[0]); }],
    ["missing inline port path", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].inlineItems[0].internalPathId = "missing"; }],
    ["missing edge membership", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].connections[2].runId = null; }],
    ["wrong run unit", (a: ReturnType<typeof createMultipleCableRunsFixture>) => { a.revisions[0].cableRuns[1].lengthMeters = { state: "known", value: 40, unit: "ft", evidenceId: "declared" }; }],
  ])("rejects cable run %s", (_name, mutate) => {
    const archive = createMultipleCableRunsFixture();
    mutate(archive);
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("distinguishes antenna gain dBi from relative/amplifier gain dB", () => {
    expect(workbenchArchiveSchema.safeParse(measuredFixture("antenna-gain", "dBi")).success).toBe(true);
    expect(workbenchArchiveSchema.safeParse(measuredFixture("relative-gain", "dB")).success).toBe(true);
    expect(workbenchArchiveSchema.safeParse(measuredFixture("antenna-gain", "dB")).success).toBe(false);
    expect(workbenchArchiveSchema.safeParse(measuredFixture("relative-gain", "dBi")).success).toBe(false);
    const archive = measuredFixture("relative-gain", "dB");
    const measurement = archive.revisions[0].evidence[1];
    if (measurement.kind !== "measurement") throw new Error("Expected measurement");
    measurement.context = { kind: "not-applicable", reason: "Frequency not recorded" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("rejects copying matching measurements onto another physical item, port or model", () => {
    const archive = measuredFixture("antenna-gain", "dBi");
    const revision = archive.revisions[0];
    const measuredFact = structuredClone(revision.equipment[1].facts.gain);
    revision.equipment[0].facts.copiedGain = measuredFact;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    delete revision.equipment[0].facts.copiedGain;
    revision.equipment[1].ports[0].ratings.gain = measuredFact;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    revision.equipment[1].ports.push({ ...structuredClone(revision.equipment[1].ports[0]), id: "other-port" });
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    revision.equipment[1].ports.pop();
    revision.models[0].specifications.gain = measuredFact;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("rejects an unmodeled internal splitter but retains it as documentation", () => {
    const archive = createSwitchedFixture();
    const revision = archive.revisions[0];
    const selector = revision.equipment.find((item) => item.id === "switch")!;
    selector.internalPaths.forEach((path) => { delete path.exclusiveGroupId; });
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    revision.routes[0].analysis = { state: "documentation-only", reasons: ["Non-exclusive internal splitter has no supported analysis"] };
    archive.operating = null;
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
  });

  it("keeps non-RF documentation out of RF branch detection on unknown ports", () => {
    const archive = createInlineAndLayersFixture();
    const revision = archive.revisions[0];
    const radio = revision.equipment.find((item) => item.id === "radio")!;
    radio.ports[0].signal = "unknown";
    for (const connection of revision.connections.filter((item) => item.signal !== "rf")) {
      const auxiliaryPortId = connection.to.portId;
      connection.to.portId = "antenna";
      radio.internalPaths.push({
        id: `${connection.signal}-documentation`, fromPortId: "antenna", toPortId: auxiliaryPortId,
        signal: connection.signal,
      });
    }
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    expect(archive.revisions[0].routes[0].analysis.state).toBe("candidate");
  });

  it("allows experiments within one setup and rejects unrelated setup revisions", () => {
    const experiment = createExperimentFixture().experiments[0];
    const archive = createPortableSharedFixture();
    archive.experiments.push({ ...experiment, candidateRevisionId: "portable-r1" });
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    expect(workbenchArchiveSchema.safeParse(createExperimentFixture()).success).toBe(true);
  });

  it("accepts owner preview through the same safe output and private source contracts", () => {
    const profile = { id: "preview", ownerId: FIXTURE_OWNER, publicationVersion: 1, audience: "owner", displayName: "Operator", biography: "", featuredSetup: null, regionLabel: null, publicMediaIds: [], modules: [] };
    expect(publishedProfileSchema.safeParse(profile).success).toBe(true);
    expect(publishedProfileSchema.safeParse({ ...profile, privateMetadata: { serialNumber: "private" } }).success).toBe(false);
    const archive = createHfFixture();
    archive.publications.push({ id: "owner-preview", ownerId: FIXTURE_OWNER, setupId: "home-hf", revisionId: "home-r1", audience: "owner", publicationVersion: 1, reviewedAt: FIXTURE_DATE });
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { workbenchArchiveSchema, type WorkbenchArchive } from "@/lib/station/workbench/contracts";
import { createExperimentFixture, createPortableSharedFixture } from "@/lib/station/workbench/fixtures";

describe("W03 transition contracts", () => {
  it("accepts earlier imported records and explicit edit/restore provenance", () => {
    const archive = createExperimentFixture();
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    archive.revisions[0].transition = { kind: "initial" };
    archive.revisions[1].transition = { kind: "edit" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    archive.revisions[1].transition = { kind: "restore", sourceRevisionId: archive.revisions[0].id };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
  });

  it.each(["initial", "clone"] as const)("rejects parented %s transitions", (kind) => {
    const archive = createExperimentFixture();
    archive.revisions[1].transition = kind === "initial" ? { kind } : { kind, sourceRevisionId: archive.revisions[0].id };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it.each(["edit", "restore"] as const)("requires parent for %s transitions", (kind) => {
    const archive = createExperimentFixture();
    archive.revisions[0].transition = kind === "edit" ? { kind } : { kind, sourceRevisionId: archive.revisions[1].id };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("rejects missing/self/cross-setup restore and same-setup clone provenance", () => {
    const archive = createPortableSharedFixture();
    for (const sourceRevisionId of ["missing", archive.revisions[1].id]) {
      archive.revisions[1].transition = { kind: "clone", sourceRevisionId };
      expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    }
    archive.revisions[1].transition = { kind: "clone", sourceRevisionId: archive.revisions[0].id };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    archive.revisions[1].transition = { kind: "restore", sourceRevisionId: archive.revisions[0].id };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    const sameSetup = createExperimentFixture();
    sameSetup.revisions[1].parentRevisionId = null;
    sameSetup.revisions[1].transition = { kind: "clone", sourceRevisionId: sameSetup.revisions[0].id };
    expect(workbenchArchiveSchema.safeParse(sameSetup).success).toBe(false);
  });

  it("rejects cycles combining clone source and revision parent history", () => {
    const archive = createPortableSharedFixture();
    archive.revisions[0].transition = { kind: "clone", sourceRevisionId: archive.revisions[1].id };
    archive.revisions[1].transition = { kind: "clone", sourceRevisionId: archive.revisions[0].id };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("validates long newest-first histories and detects a deep cycle without recursion", () => {
    const count = 15000;
    const archive: WorkbenchArchive = {
      schemaVersion: 1, ownerId: "owner", inventory: [], models: [], evidence: [], locations: [], layouts: [], experiments: [], publications: [], operating: null,
      setups: [{ id: "setup", ownerId: "owner", name: "History", locationId: null, draftRevisionId: `r${count - 1}`, archivedAt: null, legacy: [] }],
      revisions: Array.from({ length: count }, (_, index): WorkbenchArchive["revisions"][number] => ({
        id: `r${index}`, ownerId: "owner", setupId: "setup", parentRevisionId: index ? `r${index - 1}` : null,
        createdAt: "2026-09-05T00:00:00Z", equipment: [], models: [], evidence: [], location: null, connections: [], cableRuns: [], routes: [],
        settings: { frequencyHz: { state: "unknown", reason: "Undeclared" }, requestedPowerWatts: { state: "unknown", reason: "Undeclared" }, mode: null }, notes: "",
      })).reverse(),
    };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    archive.revisions[count - 1].parentRevisionId = `r${count - 1}`;
    const result = workbenchArchiveSchema.safeParse(archive);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("provenance cycle"))).toBe(true);
  });

  it("keeps explicit band intent optional and never infers it from frequency", () => {
    const archive = createExperimentFixture();
    expect(workbenchArchiveSchema.parse(archive).revisions[0].settings).not.toHaveProperty("bandId");
    archive.revisions[0].settings.bandId = "20m";
    archive.revisions[1].settings.bandId = null;
    const parsed = workbenchArchiveSchema.parse(archive);
    expect(parsed.revisions[0].settings.bandId).toBe("20m");
    expect(parsed.revisions[1].settings.bandId).toBeNull();
  });
});

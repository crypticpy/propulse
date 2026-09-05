import { describe, expect, it } from "vitest";
import { workbenchArchiveSchema } from "@/lib/station/workbench/contracts";
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

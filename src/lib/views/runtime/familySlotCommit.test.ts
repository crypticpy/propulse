/**
 * The two commit outcomes a Settings surface reports to the user, proved
 * against real runtimes and real storage: a mounted map keeps the state the
 * user built up, and a write that does not land is not called "applied".
 */
import { describe, expect, it } from "vitest";
import { createViewConfiguration } from "../defaults";
import { commitViewToFamilySlot } from "./familySlotCommit";
import { createViewRuntime } from "./createViewRuntime";
import { registerRuntimeWriter } from "./registry";
import { createMemoryWorkingStorage, type WorkingSlotStorage } from "./workingStorage";

function configWithLimit(spotLimit: number) {
  const config = createViewConfiguration("normal");
  return {
    ...config,
    spots: { ...config.spots, filters: { ...config.spots.filters, spotLimit } },
  };
}

describe("commitViewToFamilySlot", () => {
  it("keeps the live map's selection and expansion when it patches a mounted runtime", () => {
    const runtime = createViewRuntime({
      binding: {
        ownerId: "owner-a",
        slotId: "normal",
        kind: "interactive",
        sourceView: null,
        displayId: null,
      },
      storage: createMemoryWorkingStorage(),
      storageNamespace: "acct:owner-a",
      persistWorking: true,
    });
    const release = registerRuntimeWriter(runtime);
    runtime.selectSpot("report-1", { lat: 40, lon: -3 });
    runtime.setExpandedGroups(["group-1"]);

    const target = commitViewToFamilySlot({
      ownerId: "owner-a",
      slotId: "normal",
      config: configWithLimit(10),
    });

    expect(target).toBe("runtime");
    const snapshot = runtime.getSnapshot();
    expect(snapshot.config.spots.filters.spotLimit).toBe(10);
    // `replaceWorkingView` commits EMPTY_INTERACTION; a preference change must
    // not throw away what the operator is looking at.
    expect(snapshot.interaction.selectedReportId).toBe("report-1");
    expect(snapshot.interaction.expandedGroupIds).toEqual(["group-1"]);

    release();
    runtime.dispose();
  });

  it("reports a storage write that did not land as failed rather than applied", () => {
    const real = createMemoryWorkingStorage();
    // Shaped like `createSessionWorkingStorage` under quota pressure or private
    // mode: the write throws inside, is swallowed, and nothing is stored.
    const lossy: WorkingSlotStorage = { ...real, write: () => {} };

    expect(
      commitViewToFamilySlot({
        ownerId: "owner-b",
        slotId: "pro",
        config: configWithLimit(10),
        storage: lossy,
      }),
    ).toBe("failed");

    expect(
      commitViewToFamilySlot({
        ownerId: "owner-b",
        slotId: "pro",
        config: configWithLimit(10),
        storage: real,
      }),
    ).toBe("storage");
  });
});

import { describe, expect, it } from "vitest";
import {
  enqueueGearDeletionIntent,
  enqueueGearDeletionIntents,
  gearDeletionKey,
  removeAcknowledgedGearDeletions,
} from "./shackDeletionIntent";

describe("shackDeletionIntent", () => {
  it("dedupes deletion intents by table and record id", () => {
    const first = enqueueGearDeletionIntent([], "antennas", "ant-1");
    const second = enqueueGearDeletionIntent(first, "antennas", "ant-1");

    expect(second).toHaveLength(1);
    expect(gearDeletionKey(second[0])).toBe("antennas:ant-1");
  });

  it("queues multiple intents in one batch", () => {
    const pending = enqueueGearDeletionIntents([], [
      { table: "custom_radios", recordId: "custom-1" },
      { table: "user_radios", recordId: "radio-1" },
    ]);

    expect(pending).toHaveLength(2);
  });

  it("removes only acknowledged intents", () => {
    const pending = enqueueGearDeletionIntents([], [
      { table: "antennas", recordId: "ant-1" },
      { table: "feedlines", recordId: "feed-1" },
    ]);

    const remaining = removeAcknowledgedGearDeletions(pending, [
      "antennas:ant-1",
    ]);

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.recordId).toBe("feed-1");
  });
});

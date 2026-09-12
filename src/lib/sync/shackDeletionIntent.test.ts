import { describe, expect, it } from "vitest";
import {
  enqueueGearDeletionIntent,
  enqueueGearDeletionIntents,
  gearDeletionKey,
  removeAcknowledgedGearDeletions,
} from "./shackDeletionIntent";

describe("shackDeletionIntent", () => {
  it("dedupes deletion intents by table and record id", () => {
    const first = enqueueGearDeletionIntent([], "user-1", "antennas", "ant-1");
    const second = enqueueGearDeletionIntent(
      first,
      "user-1",
      "antennas",
      "ant-1",
    );

    expect(second).toHaveLength(1);
    expect(gearDeletionKey(second[0])).toBe("antennas:ant-1");
  });

  it("keeps separate intents for the same table:recordId under different owners", () => {
    const first = enqueueGearDeletionIntent([], "user-A", "antennas", "ant-1");
    const second = enqueueGearDeletionIntent(
      first,
      "user-B",
      "antennas",
      "ant-1",
    );

    expect(second).toHaveLength(2);
    expect(second.map((entry) => entry.ownerId).sort()).toEqual([
      "user-A",
      "user-B",
    ]);
  });

  it("records the owner id on each intent", () => {
    const pending = enqueueGearDeletionIntent([], "user-1", "antennas", "ant-1");

    expect(pending[0]?.ownerId).toBe("user-1");
  });

  it("queues multiple intents in one batch", () => {
    const pending = enqueueGearDeletionIntents([], "user-1", [
      { table: "custom_radios", recordId: "custom-1" },
      { table: "user_radios", recordId: "radio-1" },
    ]);

    expect(pending).toHaveLength(2);
    expect(pending.every((entry) => entry.ownerId === "user-1")).toBe(true);
  });

  it("removes only acknowledged intents for the matching owner", () => {
    const pending = enqueueGearDeletionIntents([], "user-1", [
      { table: "antennas", recordId: "ant-1" },
      { table: "feedlines", recordId: "feed-1" },
    ]);

    const remaining = removeAcknowledgedGearDeletions(
      pending,
      ["antennas:ant-1"],
      "user-1",
    );

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.recordId).toBe("feed-1");
  });

  it("does not ack an intent that matches the key but not the owner", () => {
    const pending = enqueueGearDeletionIntent(
      [],
      "user-A",
      "antennas",
      "ant-1",
    );

    const remaining = removeAcknowledgedGearDeletions(
      pending,
      ["antennas:ant-1"],
      "user-B",
    );

    expect(remaining).toHaveLength(1);
  });
});

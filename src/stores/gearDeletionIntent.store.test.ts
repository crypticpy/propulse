import { beforeEach, describe, expect, it } from "vitest";
import type { UserAccessory } from "@/types/shack";

const { useShackStore } = await import("./shackStore");

function accessory(id: string): UserAccessory {
  return {
    id,
    name: `Accessory ${id}`,
    category: "tuner",
    addedAt: "2026-01-01T00:00:00.000Z",
  } as UserAccessory;
}

beforeEach(() => {
  useShackStore.setState({
    accessories: [],
    pendingGearDeletions: [],
  });
});

describe("shackStore gear deletion intents (#326)", () => {
  it("records a pending deletion when gear is removed locally", () => {
    useShackStore.setState({ accessories: [accessory("acc-1")] });

    useShackStore.getState().removeAccessory("acc-1");

    expect(useShackStore.getState().accessories).toEqual([]);
    expect(useShackStore.getState().pendingGearDeletions).toEqual([
      expect.objectContaining({
        table: "accessories",
        recordId: "acc-1",
      }),
    ]);
  });

  it("keeps pending deletions across reload until ack", () => {
    useShackStore.setState({
      accessories: [accessory("acc-1")],
      pendingGearDeletions: [],
    });
    useShackStore.getState().removeAccessory("acc-1");

    useShackStore.getState().acknowledgeGearDeletions(["accessories:acc-2"]);
    expect(useShackStore.getState().pendingGearDeletions).toHaveLength(1);

    useShackStore.getState().acknowledgeGearDeletions(["accessories:acc-1"]);
    expect(useShackStore.getState().pendingGearDeletions).toEqual([]);
  });
});

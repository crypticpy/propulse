import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccessory } from "@/types/shack";

vi.mock("@/lib/db/imageStore", () => ({
  deleteImage: vi.fn(async () => {}),
}));

const { deleteImage } = await import("@/lib/db/imageStore");
const { useShackStore } = await import("./shackStore");
const { useProfileStore } = await import("./profileStore");

const sharedPhotoId = "shared-photo-id";

function photographedAccessory(id: string, name: string): UserAccessory {
  return {
    id,
    name,
    category: "tuner",
    imageId: sharedPhotoId,
    addedAt: "2026-01-01T00:00:00.000Z",
  } as UserAccessory;
}

beforeEach(() => {
  vi.mocked(deleteImage).mockClear();
  useProfileStore.setState({ profileImageId: undefined });
  useShackStore.setState({
    accessories: [],
    radios: [],
    antennas: [],
    feedlines: [],
    inlineComponents: [],
  });
});

describe("shared equipment photo detach (#325)", () => {
  it("removing one duplicate preserves the shared blob for the survivor", () => {
    const original = photographedAccessory("acc-1", "ATU");
    useShackStore.setState({ accessories: [original] });

    const duplicateId = useShackStore.getState().duplicateAccessory("acc-1");
    expect(duplicateId).toBeTruthy();

    useShackStore.getState().removeAccessory("acc-1");

    expect(useShackStore.getState().accessories).toHaveLength(1);
    expect(useShackStore.getState().accessories[0]?.imageId).toBe(
      sharedPhotoId,
    );
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it("clears a photo from one item without deleting a duplicate reference", () => {
    const original = photographedAccessory("acc-1", "ATU");
    useShackStore.setState({ accessories: [original] });
    useShackStore.getState().duplicateAccessory("acc-1");

    useShackStore.getState().clearEquipmentImage("accessory", "acc-1");

    const accessories = useShackStore.getState().accessories;
    expect(accessories.find((a) => a.id === "acc-1")?.imageId).toBeUndefined();
    expect(accessories.find((a) => a.id !== "acc-1")?.imageId).toBe(
      sharedPhotoId,
    );
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it("deletes the blob only after the last reference is removed", () => {
    const original = photographedAccessory("acc-1", "ATU");
    useShackStore.setState({ accessories: [original] });
    const duplicateId = useShackStore.getState().duplicateAccessory("acc-1");
    expect(duplicateId).toBeTruthy();

    useShackStore.getState().removeAccessory("acc-1");
    useShackStore.getState().removeAccessory(duplicateId!);

    expect(useShackStore.getState().accessories).toHaveLength(0);
    expect(deleteImage).toHaveBeenCalledTimes(1);
    expect(deleteImage).toHaveBeenCalledWith(sharedPhotoId);
  });

  it("keeps a profile photo when the same id is still referenced by gear", () => {
    useProfileStore.setState({ profileImageId: sharedPhotoId });
    useShackStore.setState({
      accessories: [photographedAccessory("acc-1", "ATU")],
    });

    useProfileStore.getState().setProfileImageId(undefined);

    expect(useProfileStore.getState().profileImageId).toBeUndefined();
    expect(deleteImage).not.toHaveBeenCalled();
  });
});

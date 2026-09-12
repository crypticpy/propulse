import { describe, expect, it, vi } from "vitest";
import {
  collectReferencedImageIds,
  countImageReferences,
  deleteImageIfUnreferenced,
  type ImageReferenceSnapshot,
} from "./imageReferences";

vi.mock("@/lib/db/imageStore", () => ({
  deleteImage: vi.fn(async () => {}),
}));

const { deleteImage } = await import("@/lib/db/imageStore");

const snapshot: ImageReferenceSnapshot = {
  profileImageId: "profile-photo",
  radios: [
    { imageId: "radio-cover", galleryImageIds: ["gallery-a"] },
    { imageId: "shared-photo" },
  ],
  antennas: [{ imageId: "shared-photo" }],
  feedlines: [],
  accessories: [{ galleryImageIds: ["gallery-a", "gallery-b"] }],
  inlineComponents: [],
};

describe("imageReferences", () => {
  it("counts duplicate references across inventory and profile", () => {
    expect(collectReferencedImageIds(snapshot).size).toBe(5);
    expect(countImageReferences("shared-photo", snapshot)).toBe(2);
    expect(countImageReferences("gallery-a", snapshot)).toBe(2);
  });

  it("skips physical deletion while another reference remains", async () => {
    vi.mocked(deleteImage).mockClear();

    const deleted = await deleteImageIfUnreferenced("shared-photo", snapshot);

    expect(deleted).toBe(false);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it("deletes only proven orphans", async () => {
    vi.mocked(deleteImage).mockClear();

    const deleted = await deleteImageIfUnreferenced("orphan-photo", snapshot);

    expect(deleted).toBe(true);
    expect(deleteImage).toHaveBeenCalledWith("orphan-photo");
  });
});

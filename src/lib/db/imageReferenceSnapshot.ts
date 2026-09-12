import { useProfileStore } from "@/stores/profileStore";
import { useShackStore } from "@/stores/shackStore";
import {
  collectEquipmentImageIds,
  deleteImageIfUnreferenced,
  type ImageReferenceSnapshot,
} from "@/lib/db/imageReferences";

export function getLiveImageReferenceSnapshot(): ImageReferenceSnapshot {
  const shack = useShackStore.getState();
  const profile = useProfileStore.getState();
  return {
    profileImageId: profile.profileImageId,
    radios: shack.radios,
    antennas: shack.antennas,
    feedlines: shack.feedlines,
    accessories: shack.accessories,
    inlineComponents: shack.inlineComponents,
  };
}

export function purgeUnreferencedImages(imageIds: Iterable<string>): void {
  const snapshot = getLiveImageReferenceSnapshot();
  for (const imageId of imageIds) {
    deleteImageIfUnreferenced(imageId, snapshot).catch(() => {
      /* best-effort cleanup */
    });
  }
}

export { collectEquipmentImageIds };

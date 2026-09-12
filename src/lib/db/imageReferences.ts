import { deleteImage } from "@/lib/db/imageStore";

export interface ImageReferenceSnapshot {
  profileImageId?: string | null;
  radios: ReadonlyArray<{
    imageId?: string;
    galleryImageIds?: readonly string[];
  }>;
  antennas: ReadonlyArray<{
    imageId?: string;
    galleryImageIds?: readonly string[];
  }>;
  feedlines: ReadonlyArray<{ imageId?: string }>;
  accessories: ReadonlyArray<{
    imageId?: string;
    galleryImageIds?: readonly string[];
  }>;
  inlineComponents: ReadonlyArray<{ imageId?: string }>;
}

export function collectReferencedImageIds(
  snapshot: ImageReferenceSnapshot,
): Set<string> {
  const ids = new Set<string>();

  if (snapshot.profileImageId) {
    ids.add(snapshot.profileImageId);
  }

  for (const radio of snapshot.radios) {
    if (radio.imageId) ids.add(radio.imageId);
    for (const gid of radio.galleryImageIds ?? []) {
      ids.add(gid);
    }
  }

  for (const antenna of snapshot.antennas) {
    if (antenna.imageId) ids.add(antenna.imageId);
    for (const gid of antenna.galleryImageIds ?? []) {
      ids.add(gid);
    }
  }

  for (const feedline of snapshot.feedlines) {
    if (feedline.imageId) ids.add(feedline.imageId);
  }

  for (const accessory of snapshot.accessories) {
    if (accessory.imageId) ids.add(accessory.imageId);
    for (const gid of accessory.galleryImageIds ?? []) {
      ids.add(gid);
    }
  }

  for (const inline of snapshot.inlineComponents) {
    if (inline.imageId) ids.add(inline.imageId);
  }

  return ids;
}

export function countImageReferences(
  imageId: string,
  snapshot: ImageReferenceSnapshot,
): number {
  let count = 0;

  if (snapshot.profileImageId === imageId) {
    count += 1;
  }

  for (const radio of snapshot.radios) {
    if (radio.imageId === imageId) count += 1;
    for (const gid of radio.galleryImageIds ?? []) {
      if (gid === imageId) count += 1;
    }
  }

  for (const antenna of snapshot.antennas) {
    if (antenna.imageId === imageId) count += 1;
    for (const gid of antenna.galleryImageIds ?? []) {
      if (gid === imageId) count += 1;
    }
  }

  for (const feedline of snapshot.feedlines) {
    if (feedline.imageId === imageId) count += 1;
  }

  for (const accessory of snapshot.accessories) {
    if (accessory.imageId === imageId) count += 1;
    for (const gid of accessory.galleryImageIds ?? []) {
      if (gid === imageId) count += 1;
    }
  }

  for (const inline of snapshot.inlineComponents) {
    if (inline.imageId === imageId) count += 1;
  }

  return count;
}

export function isImageReferenced(
  imageId: string,
  snapshot: ImageReferenceSnapshot,
): boolean {
  return countImageReferences(imageId, snapshot) > 0;
}

export function collectEquipmentImageIds(
  item:
    | {
        imageId?: string;
        galleryImageIds?: readonly string[];
      }
    | undefined,
): string[] {
  if (!item) return [];
  const ids: string[] = [];
  if (item.imageId) ids.push(item.imageId);
  for (const gid of item.galleryImageIds ?? []) {
    ids.push(gid);
  }
  return ids;
}

/** Deletes the blob only when no inventory/profile reference remains. */
export async function deleteImageIfUnreferenced(
  imageId: string,
  snapshot: ImageReferenceSnapshot,
): Promise<boolean> {
  if (isImageReferenced(imageId, snapshot)) {
    return false;
  }
  await deleteImage(imageId);
  return true;
}

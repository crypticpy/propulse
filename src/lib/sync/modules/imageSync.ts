/**
 * Image sync module — Tier 3 (Lazy)
 *
 * Syncs equipment and profile images between IndexedDB and Supabase Storage.
 *   - Storage bucket: `equipment-images`
 *   - Storage path pattern: `{userId}/{imageId}.jpg`
 *   - Metadata table: `user_images`
 *
 * `push` full-scans referenced local blobs. `processQueue` uploads explicitly
 * scheduled `user_images` entries and leaves failures queued for retry.
 */

import { getSupabase } from "@/lib/supabase";
import { collectReferencedImageIds } from "@/lib/db/imageReferences";
import { getLiveImageReferenceSnapshot } from "@/lib/db/imageReferenceSnapshot";
import {
  getImage,
  storeImageWithId,
  getAllImageIds,
} from "@/lib/db/imageStore";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";
import {
  computeImagePullCheckpoint,
  imageSyncDeltaFilter,
  parseImageSyncCursor,
} from "./imageSyncCursor";

// ─── Constants ──────────────────────────────────────────────────────────────

const BUCKET = "equipment-images";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Helper: untyped `.from()` for tables not yet in generated Supabase types.
 * Returns `any` so the caller must apply their own row types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedFrom = (table: string) => getSupabase().from(table as any) as any;

// ─── Row type for user_images metadata ──────────────────────────────────────

interface UserImageRow {
  id: string;
  user_id: string;
  storage_path: string;
  width: number;
  height: number;
  size_bytes: number;
  created_at: string;
}

async function fetchServerImageIds(userId: string): Promise<Set<string>> {
  const { data: serverRows, error: serverError } = (await untypedFrom(
    "user_images",
  )
    .select("id")
    .eq("user_id", userId)) as {
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  };

  if (serverError) {
    throw new Error(
      `[imageSync] Failed to query server metadata: ${serverError.message}`,
    );
  }

  return new Set((serverRows ?? []).map((r) => r.id));
}

/** true when the blob and metadata both landed for this owner. */
async function uploadLocalImage(
  userId: string,
  imageId: string,
): Promise<boolean> {
  const stored = await getImage(imageId);
  if (!stored) {
    console.warn(
      `[imageSync] Image ${imageId} referenced but not found in IDB, skipping`,
    );
    return false;
  }

  const storagePath = `${userId}/${imageId}.jpg`;
  const supabase = getSupabase();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, stored.blob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error(
      `[imageSync] Storage upload failed for ${imageId}: ${uploadError.message}`,
    );
    return false;
  }

  const { error: metaError } = await untypedFrom("user_images").upsert(
    {
      id: imageId,
      user_id: userId,
      storage_path: storagePath,
      width: stored.width,
      height: stored.height,
      size_bytes: stored.blob.size,
      created_at: stored.createdAt,
    },
    { onConflict: "id" },
  );

  if (metaError) {
    console.error(
      `[imageSync] Metadata upsert failed for ${imageId}: ${metaError.message}`,
    );
    return false;
  }

  return true;
}

// ─── Sync Module ────────────────────────────────────────────────────────────

export const imageSync: SyncModule = {
  name: "images",
  tier: "lazy",
  tables: ["user_images"] as SyncableTable[],

  // ── Push ──────────────────────────────────────────────────────────────────

  async push(userId: string): Promise<void> {
    const referencedIds = collectReferencedImageIds(
      getLiveImageReferenceSnapshot(),
    );

    if (referencedIds.size === 0) {
      console.log("[imageSync] No referenced images to push");
      return;
    }

    const serverIds = await fetchServerImageIds(userId);
    const missingIds = [...referencedIds].filter((id) => !serverIds.has(id));

    if (missingIds.length === 0) {
      console.log("[imageSync] All referenced images already on server");
      return;
    }

    let uploadedCount = 0;
    let failedCount = 0;

    for (const imageId of missingIds) {
      try {
        const uploaded = await uploadLocalImage(userId, imageId);
        if (uploaded) uploadedCount++;
        else failedCount++;
      } catch (err) {
        failedCount++;
        console.error(
          `[imageSync] Unexpected error uploading image ${imageId}:`,
          err,
        );
      }
    }

    console.log(
      `[imageSync] Uploaded ${uploadedCount} of ${missingIds.length} images`,
    );

    if (failedCount > 0) {
      throw new Error(
        `[imageSync] ${failedCount} of ${missingIds.length} image uploads did not complete`,
      );
    }
  },

  // ── Pull ──────────────────────────────────────────────────────────────────

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    // Fetch user_images rows (delta if since is provided)
    let query = untypedFrom("user_images")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    // A null filter means a full scan: either the first pull or the one-time
    // migration of a legacy timestamp-only cursor (see imageSyncDeltaFilter).
    const deltaFilter = imageSyncDeltaFilter(parseImageSyncCursor(since));
    if (deltaFilter) {
      query = query.or(
        `created_at.gt.${deltaFilter.createdAt},and(created_at.eq.${deltaFilter.createdAt},id.gt.${deltaFilter.afterId})`,
      );
    }

    const { data: rows, error: queryError } = (await query) as {
      data: UserImageRow[] | null;
      error: { message: string } | null;
    };

    if (queryError) {
      throw new Error(
        `[imageSync] Failed to pull image metadata: ${queryError.message}`,
      );
    }

    if (!rows || rows.length === 0) {
      return null;
    }

    // Get local imageIds to find what's missing
    const localIds = new Set(await getAllImageIds());

    let downloadedCount = 0;
    const processedIds = new Set<string>();

    for (const row of rows) {
      // Skip images already in IDB
      if (localIds.has(row.id)) {
        processedIds.add(row.id);
        continue;
      }

      try {
        // Download blob from Supabase Storage
        const { data: blob, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(row.storage_path);

        if (downloadError) {
          console.error(
            `[imageSync] Storage download failed for ${row.id}: ${downloadError.message}`,
          );
          continue;
        }

        if (!blob) {
          console.warn(
            `[imageSync] Downloaded null blob for ${row.id}, skipping`,
          );
          continue;
        }

        // Store in IDB with the existing server ID
        await storeImageWithId(row.id, blob, row.width, row.height);
        processedIds.add(row.id);
        downloadedCount++;
      } catch (err) {
        console.error(
          `[imageSync] Unexpected error downloading image ${row.id}:`,
          err,
        );
      }
    }

    console.log(
      `[imageSync] Downloaded ${downloadedCount} of ${rows.length} images`,
    );

    return computeImagePullCheckpoint(rows, (id) => processedIds.has(id));
  },

  async processQueue(
    userId: string,
    entries: WriteQueueEntry[],
  ): Promise<string[]> {
    if (entries.length === 0) return [];

    const referencedIds = collectReferencedImageIds(
      getLiveImageReferenceSnapshot(),
    );
    const serverIds = await fetchServerImageIds(userId);
    const processed: string[] = [];

    for (const entry of entries) {
      if (entry.operation !== "upsert") {
        processed.push(entry.queueId);
        continue;
      }

      const imageId = entry.data.id;
      if (typeof imageId !== "string" || imageId.length === 0) continue;

      if (!referencedIds.has(imageId) || serverIds.has(imageId)) {
        processed.push(entry.queueId);
        continue;
      }

      try {
        const uploaded = await uploadLocalImage(userId, imageId);
        if (uploaded) {
          serverIds.add(imageId);
          processed.push(entry.queueId);
        }
      } catch (err) {
        console.error(
          `[imageSync] Unexpected error uploading image ${imageId}:`,
          err,
        );
      }
    }

    return processed;
  },
};

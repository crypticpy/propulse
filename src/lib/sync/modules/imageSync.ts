/**
 * Image sync module — Tier 3 (Lazy)
 *
 * Syncs equipment and profile images between IndexedDB and Supabase Storage.
 *   - Storage bucket: `equipment-images`
 *   - Storage path pattern: `{userId}/{imageId}.jpg`
 *   - Metadata table: `user_images`
 *
 * Uses full-scan push (no processQueue). Images are uploaded to Supabase
 * Storage and metadata is tracked in the `user_images` table for delta pulls.
 */

import { getSupabase } from "@/lib/supabase";
import { useShackStore } from "@/stores/shackStore";
import { useProfileStore } from "@/stores/profileStore";
import {
  getImage,
  storeImageWithId,
  getAllImageIds,
} from "@/lib/db/imageStore";
import type { SyncModule, SyncableTable } from "../types";

// ─── Constants ──────────────────────────────────────────────────────────────

const BUCKET = "equipment-images";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Helper: untyped `.from()` for tables not yet in generated Supabase types.
 * Returns `any` so the caller must apply their own row types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedFrom = (table: string) => getSupabase().from(table as any) as any;

/**
 * Collect all imageIds referenced across shackStore and profileStore.
 * Returns a deduplicated set of non-empty image IDs.
 */
function collectReferencedImageIds(): Set<string> {
  const ids = new Set<string>();

  // --- ShackStore ---
  const shack = useShackStore.getState();

  for (const radio of shack.radios) {
    if (radio.imageId) ids.add(radio.imageId);
    if (radio.galleryImageIds) {
      for (const gid of radio.galleryImageIds) ids.add(gid);
    }
  }

  for (const antenna of shack.antennas) {
    if (antenna.imageId) ids.add(antenna.imageId);
    if (antenna.galleryImageIds) {
      for (const gid of antenna.galleryImageIds) ids.add(gid);
    }
  }

  for (const feedline of shack.feedlines) {
    if (feedline.imageId) ids.add(feedline.imageId);
  }

  for (const accessory of shack.accessories) {
    if (accessory.imageId) ids.add(accessory.imageId);
    if (accessory.galleryImageIds) {
      for (const gid of accessory.galleryImageIds) ids.add(gid);
    }
  }

  for (const inline of shack.inlineComponents) {
    if (inline.imageId) ids.add(inline.imageId);
  }

  // --- ProfileStore ---
  const profile = useProfileStore.getState();
  if (profile.profileImageId) ids.add(profile.profileImageId);

  return ids;
}

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

// ─── Sync Module ────────────────────────────────────────────────────────────

export const imageSync: SyncModule = {
  name: "images",
  tier: "lazy",
  tables: ["user_images"] as SyncableTable[],

  // ── Push ──────────────────────────────────────────────────────────────────

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const referencedIds = collectReferencedImageIds();

    if (referencedIds.size === 0) {
      console.log("[imageSync] No referenced images to push");
      return;
    }

    // Get existing server metadata to find what's missing
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

    const serverIds = new Set((serverRows ?? []).map((r) => r.id));

    // Find imageIds that are local but not on server
    const missingIds = [...referencedIds].filter((id) => !serverIds.has(id));

    if (missingIds.length === 0) {
      console.log("[imageSync] All referenced images already on server");
      return;
    }

    let uploadedCount = 0;

    for (const imageId of missingIds) {
      try {
        const stored = await getImage(imageId);
        if (!stored) {
          console.warn(
            `[imageSync] Image ${imageId} referenced but not found in IDB, skipping`,
          );
          continue;
        }

        const storagePath = `${userId}/${imageId}.jpg`;

        // Upload blob to Supabase Storage
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
          continue;
        }

        // Insert metadata row
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
          continue;
        }

        uploadedCount++;
      } catch (err) {
        console.error(
          `[imageSync] Unexpected error uploading image ${imageId}:`,
          err,
        );
      }
    }

    console.log(
      `[imageSync] Uploaded ${uploadedCount} of ${missingIds.length} images`,
    );
  },

  // ── Pull ──────────────────────────────────────────────────────────────────

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    // Fetch user_images rows (delta if since is provided)
    let query = untypedFrom("user_images").select("*").eq("user_id", userId);

    if (since) {
      query = query.gt("created_at", since);
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
      console.log("[imageSync] No new images to pull");
      return null;
    }

    // Get local imageIds to find what's missing
    const localIds = new Set(await getAllImageIds());

    let downloadedCount = 0;
    let maxCreatedAt: string | null = null;

    for (const row of rows) {
      // Track max created_at for delta sync cursor
      if (!maxCreatedAt || row.created_at > maxCreatedAt) {
        maxCreatedAt = row.created_at;
      }

      // Skip images already in IDB
      if (localIds.has(row.id)) {
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

    return maxCreatedAt;
  },

  // ── processQueue — not used (push handles via full scan) ──────────────────

  async processQueue(): Promise<string[]> {
    return [];
  },
};

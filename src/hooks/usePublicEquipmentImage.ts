/**
 * Public equipment photo URL from the existing equipment-images bucket.
 * Path: {userId}/{imageId}.jpg — same as imageSync. Falls back to null on miss.
 */

import { useMemo } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

const BUCKET = "equipment-images";

export function publicEquipmentImageUrl(
  ownerUserId: string | undefined,
  imageId: string | undefined,
): string | null {
  if (!ownerUserId || !imageId || !isSupabaseConfigured) return null;
  try {
    const { data } = getSupabase()
      .storage.from(BUCKET)
      .getPublicUrl(`${ownerUserId}/${imageId}.jpg`);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}

export function usePublicEquipmentImage(
  ownerUserId: string | undefined,
  imageId: string | undefined,
): string | null {
  return useMemo(
    () => publicEquipmentImageUrl(ownerUserId, imageId),
    [ownerUserId, imageId],
  );
}

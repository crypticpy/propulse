/**
 * React hook that converts an image ID (UUID stored in IndexedDB)
 * into a renderable object URL. Manages a reference-counted cache
 * so multiple components sharing the same imageId reuse one URL.
 */

import { useState, useEffect, useRef } from "react";
import { getImage } from "@/lib/db/imageStore";

// ---------------------------------------------------------------------------
// Module-level object URL cache with reference counting
// ---------------------------------------------------------------------------

interface CacheEntry {
  url: string;
  refCount: number;
}

const urlCache = new Map<string, CacheEntry>();

function retainUrl(imageId: string, url: string): void {
  const existing = urlCache.get(imageId);
  if (existing) {
    existing.refCount++;
  } else {
    urlCache.set(imageId, { url, refCount: 1 });
  }
}

function releaseUrl(imageId: string): void {
  const entry = urlCache.get(imageId);
  if (!entry) return;

  entry.refCount--;
  if (entry.refCount <= 0) {
    URL.revokeObjectURL(entry.url);
    urlCache.delete(imageId);
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseImageUrlResult {
  /** Object URL for the image, or null while loading / if no imageId */
  url: string | null;
  /** True while the image is being loaded from IndexedDB */
  loading: boolean;
}

/**
 * Load an image from IndexedDB by its UUID and return a renderable object URL.
 *
 * - Caches object URLs at module level with reference counting so that
 *   multiple components displaying the same image share a single URL.
 * - Automatically revokes the URL when the last consumer unmounts.
 * - Abort-safe: if `imageId` changes before the IDB read completes,
 *   the stale result is discarded.
 *
 * @param imageId - UUID of the image in the propulse-images database, or undefined
 */
export function useImageUrl(imageId: string | undefined): UseImageUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Track the "current" imageId so we can ignore stale IDB responses
  const currentIdRef = useRef(imageId);
  currentIdRef.current = imageId;

  useEffect(() => {
    // Nothing to load
    if (!imageId) {
      setUrl(null);
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = urlCache.get(imageId);
    if (cached) {
      retainUrl(imageId, cached.url);
      setUrl(cached.url);
      setLoading(false);

      return () => {
        releaseUrl(imageId);
      };
    }

    // Load from IndexedDB
    let released = false;
    setLoading(true);

    getImage(imageId)
      .then((stored) => {
        // Abort if the imageId changed while we were loading
        if (currentIdRef.current !== imageId || released) return;

        if (stored) {
          const objectUrl = URL.createObjectURL(stored.blob);
          retainUrl(imageId, objectUrl);
          setUrl(objectUrl);
        } else {
          setUrl(null);
        }
      })
      .catch((err) => {
        console.warn("Failed to load image from IndexedDB:", err);
        if (currentIdRef.current === imageId && !released) {
          setUrl(null);
        }
      })
      .finally(() => {
        if (currentIdRef.current === imageId && !released) {
          setLoading(false);
        }
      });

    return () => {
      released = true;
      releaseUrl(imageId);
    };
  }, [imageId]);

  return { url, loading };
}

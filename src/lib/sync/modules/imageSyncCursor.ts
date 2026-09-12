/** Compound cursor: `${created_at}|${id}` — backward-compatible with plain ISO timestamps. */

export interface ImageSyncCursor {
  createdAt: string | null;
  afterId: string | null;
}

export interface ImageSyncRowRef {
  id: string;
  created_at: string;
}

const CURSOR_SEP = "|";

export function encodeImageSyncCursor(createdAt: string, id: string): string {
  return `${createdAt}${CURSOR_SEP}${id}`;
}

export function parseImageSyncCursor(since: string | null): ImageSyncCursor {
  if (!since) {
    return { createdAt: null, afterId: null };
  }
  const sep = since.indexOf(CURSOR_SEP);
  if (sep === -1) {
    return { createdAt: since, afterId: null };
  }
  return {
    createdAt: since.slice(0, sep),
    afterId: since.slice(sep + 1) || null,
  };
}

export function compareImageSyncRows(
  a: ImageSyncRowRef,
  b: ImageSyncRowRef,
): number {
  const byTime = a.created_at.localeCompare(b.created_at);
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
}

/**
 * Advance the pull checkpoint only through rows processed in order.
 * Stops at the first failure so failed (and same-timestamp trailing) rows
 * remain discoverable on the next delta pull.
 */
export function computeImagePullCheckpoint(
  rows: ReadonlyArray<ImageSyncRowRef>,
  wasProcessed: (id: string) => boolean,
): string | null {
  if (rows.length === 0) {
    return null;
  }

  const sorted = [...rows].sort(compareImageSyncRows);
  let checkpoint: string | null = null;
  let blocked = false;

  for (const row of sorted) {
    if (blocked) {
      continue;
    }
    if (wasProcessed(row.id)) {
      checkpoint = encodeImageSyncCursor(row.created_at, row.id);
    } else {
      blocked = true;
    }
  }

  return checkpoint;
}

/**
 * Build the delta filter for a pull.
 *
 * `null` means "scan everything". That covers the first ever pull and also the
 * one-time migration of a legacy timestamp-only cursor: the old implementation
 * advanced that cursor past failed downloads, so a `created_at > cursor` filter
 * would hide exactly the rows this cursor scheme exists to recover. The scan
 * persists a compound cursor, after which normal delta filtering resumes.
 */
export function imageSyncDeltaFilter(
  cursor: ImageSyncCursor,
): { op: "compound"; createdAt: string; afterId: string } | null {
  if (!cursor.createdAt || !cursor.afterId) {
    return null;
  }
  return {
    op: "compound",
    createdAt: cursor.createdAt,
    afterId: cursor.afterId,
  };
}

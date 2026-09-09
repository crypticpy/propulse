import type { ViewConfiguration } from "../contracts";
import { getRuntimeWriter } from "./registry";
import { ownerNamespace } from "./ids";
import type { FamilySlotId } from "./slots";
import {
  createMemoryWorkingStorage,
  createSessionWorkingStorage,
  defaultSessionStorage,
  type WorkingSlotStorage,
} from "./workingStorage";

/**
 * Commit seam for surfaces that edit a view outside its map host.
 *
 * A Settings surface has no host, so it edits a non-persisting `preview`
 * runtime and then commits explicitly into one family slot. There are two
 * places that slot's configuration can live, and both have to be covered:
 *
 * - a mounted host owns it in memory (`registry.ts`), so the commit is
 *   `replaceWorkingView` on that runtime and the host re-renders at once;
 * - no host is mounted (the usual case: Settings and the map are separate
 *   routes), so the commit is a working-slot record the host recovers on its
 *   next mount (`createViewRuntime` -> `shouldRecoverWorking`).
 *
 * Nothing here resolves an "active view": the caller names the address.
 */

function defaultStorage(): WorkingSlotStorage {
  const session = defaultSessionStorage();
  return session ? createSessionWorkingStorage(session) : createMemoryWorkingStorage();
}

/** Configuration a family slot would recover on its next mount, if any. */
export function readFamilySlotConfig(
  ownerId: string | null,
  slotId: FamilySlotId,
  storage: WorkingSlotStorage = defaultStorage(),
): ViewConfiguration | null {
  const record = storage.read(ownerNamespace(ownerId), slotId);
  // Family slots are unsourced, so a record carrying a source identity belongs
  // to a saved view this slot is no longer bound to; `shouldRecoverWorking`
  // would reject it too.
  if (!record || record.sourceView !== null) return null;
  return record.config;
}

export type FamilySlotCommitTarget = "runtime" | "storage";

/**
 * Writes `config` into one family slot for one owner. Returns where it landed
 * so the caller can tell the user whether a mounted map changed now or will
 * change when it next opens.
 */
export function commitViewToFamilySlot(options: {
  ownerId: string | null;
  slotId: FamilySlotId;
  config: ViewConfiguration;
  storage?: WorkingSlotStorage;
}): FamilySlotCommitTarget {
  const { ownerId, slotId, config } = options;
  const address = {
    ownerId: ownerId && ownerId.length > 0 ? ownerId : ownerNamespace(ownerId),
    slotId,
    kind: "interactive" as const,
  };
  const live = getRuntimeWriter(address);
  if (live && !live.isDisposed()) {
    // The host persists its own working slot on write, so this covers both
    // the live render and the next mount.
    live.replaceWorkingView(config);
    return "runtime";
  }
  const storage = options.storage ?? defaultStorage();
  const namespace = ownerNamespace(ownerId);
  const previous = storage.read(namespace, slotId);
  storage.write(namespace, slotId, {
    config,
    workingRevision: (previous?.workingRevision ?? 0) + 1,
    sourceView: null,
  });
  return "storage";
}

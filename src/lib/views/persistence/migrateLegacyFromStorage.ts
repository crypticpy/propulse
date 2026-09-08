import type { IndexedViewLibrary } from "./indexedLibrary";
import { captureLegacyViews, type LegacyStorageReader } from "./legacyCapture";
import { convertLegacyViewCapture, type LegacyConversionOptions } from "./legacyViewConversion";
import type { LegacyMigrationResult } from "./legacyMigration";

/** Explicit bootstrap action, not a global listener. No legacy key is written or removed.
 * An existing capture wins before reading possibly changed/corrupt legacy values.
 */
export async function migrateLegacyFromStorage(
  library: IndexedViewLibrary,
  storage: { local: LegacyStorageReader; session: LegacyStorageReader },
  options: LegacyConversionOptions & { mode: "local" | "account" },
  lifecycle: { signal: AbortSignal; isActive: () => boolean },
): Promise<LegacyMigrationResult> {
  const active = () => !lifecycle.signal.aborted && lifecycle.isActive() && options.ownerId === library.ownerId;
  const forbidden = (): LegacyMigrationResult => ({ status: "forbidden", message: "Legacy migration owner/session ended" });
  if (!active()) return forbidden();
  try {
    const existing = await library.legacyMigration("device");
    if (!active()) return forbidden();
    if (existing) return existing.mode === options.mode
      ? { status: "existing", journal: existing }
      : { status: "conflict", message: "Migration mode changed; copy saved views explicitly" };
    const capture = captureLegacyViews(storage.local, storage.session);
    if (!active()) return forbidden();
    const plan = convertLegacyViewCapture(capture, options);
    if (!active()) return forbidden();
    return await library.migrateLegacy(plan, options.mode, lifecycle);
  } catch {
    return active()
      ? { status: "unavailable", message: "Legacy capture/conversion was not committed; original settings were retained" }
      : forbidden();
  }
}

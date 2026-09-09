import type { IndexedViewLibrary } from "./indexedLibrary";
import type { LegacyStorageReader } from "./legacyCapture";
import type { LegacyConversionOptions } from "./legacyViewConversion";
import { migrateLegacyFromStorage } from "./migrateLegacyFromStorage";

export type ViewLibraryBootstrapResult =
  | { status: "ready"; migration: "migrated" | "existing" | "other-owner" }
  | { status: "forbidden" | "unavailable"; message: string };

export type ViewLibraryBootstrapOptions = Pick<LegacyConversionOptions, "ownerId" | "layerPresets"> & {
  mode: "local" | "account";
};

/** Prepare one owner's library without activating a view or rereading another owner's legacy settings. */
export async function bootstrapViewLibrary(
  library: IndexedViewLibrary,
  readers: { local: LegacyStorageReader; session: LegacyStorageReader },
  options: ViewLibraryBootstrapOptions,
  lifecycle: { signal: AbortSignal; isActive: () => boolean },
): Promise<ViewLibraryBootstrapResult> {
  const active = () => !lifecycle.signal.aborted && lifecycle.isActive() && options.ownerId === library.ownerId;
  const forbidden = (): ViewLibraryBootstrapResult => ({
    status: "forbidden", message: "View library bootstrap owner/session ended",
  });
  if (!active()) return forbidden();
  try {
    const deviceOwner = await library.deviceMigrationOwner();
    if (!active()) return forbidden();
    if (deviceOwner !== null && deviceOwner !== options.ownerId) {
      return { status: "ready", migration: "other-owner" };
    }
    const result = await migrateLegacyFromStorage(library, readers, options, lifecycle);
    if (!active()) return forbidden();
    if (result.status === "migrated" || result.status === "existing") {
      return { status: "ready", migration: result.status };
    }
    return {
      status: result.status === "forbidden" ? "forbidden" : "unavailable",
      message: "message" in result ? result.message : "View library migration did not complete",
    };
  } catch {
    return active()
      ? { status: "unavailable", message: "View library bootstrap did not complete; original settings were retained" }
      : forbidden();
  }
}

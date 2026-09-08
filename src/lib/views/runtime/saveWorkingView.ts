import type { SaveResult, SavedView, ViewRepository, ViewRuntime } from "../contracts";
import { viewConfigurationSchema } from "../contracts";

/**
 * SP-02 persistence seam: runtime never imports IndexedDB/HTTP internals.
 * Callers inject the merged `ViewRepository`. Saving a library record must not
 * activate any other mounted runtime.
 */
export async function saveWorkingViewCopy(
  runtime: ViewRuntime,
  repository: ViewRepository,
  draft: {
    id: string;
    name: string;
    expectedRevision: number;
    sourcePreset?: SavedView["sourcePreset"];
  },
): Promise<SaveResult<SavedView>> {
  const config = viewConfigurationSchema.parse(
    JSON.parse(JSON.stringify(runtime.getSnapshot().config)),
  );
  return repository.saveView(runtime.binding.ownerId, {
    id: draft.id,
    name: draft.name,
    schemaVersion: 1,
    config,
    sourcePreset: draft.sourcePreset ?? null,
  }, draft.expectedRevision);
}

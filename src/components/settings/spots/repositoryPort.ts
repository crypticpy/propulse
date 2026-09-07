/**
 * Adapts the merged persistence classes onto the UI-owned library port.
 * Nothing here reaches into IndexedDB or HTTP internals; it only calls the
 * exported repository surface with an explicitly bound owner.
 */
import type { PresetRecipe, SavedView } from "@/lib/views/contracts";
import { presetRecipeSchema, savedViewSchema } from "@/lib/views/contracts";
import type { IndexedViewLibrary } from "@/lib/views/persistence/indexedLibrary";
import type { RevisionedViewRepository } from "@/lib/views/persistence/repository";
import type { SpotsLibraryEntry, SpotsLibraryPort } from "./types";

export function createRepositoryLibraryPort(
  repository: RevisionedViewRepository,
  library: IndexedViewLibrary,
  ownerId: string,
): SpotsLibraryPort {
  return {
    async listViews(): Promise<SpotsLibraryEntry<SavedView>[]> {
      const records = await library.list("view");
      return records.flatMap((record) => {
        if (record.value?.kind !== "view") return [];
        const parsed = savedViewSchema.safeParse({
          ...record.value.data,
          ownerId,
          revision: record.revision,
        });
        return parsed.success
          ? [{ id: record.id, revision: record.revision, value: parsed.data }]
          : [];
      });
    },
    async listPresets(): Promise<SpotsLibraryEntry<PresetRecipe>[]> {
      const records = await library.list("preset");
      return records.flatMap((record) => {
        if (record.value?.kind !== "preset") return [];
        const parsed = presetRecipeSchema.safeParse(record.value.data);
        return parsed.success
          ? [{ id: record.id, revision: record.revision, value: parsed.data }]
          : [];
      });
    },
    saveView(view, expectedRevision) {
      return repository.saveView(ownerId, view, expectedRevision);
    },
    savePreset(preset, expectedRevision) {
      return repository.savePreset(ownerId, preset, expectedRevision);
    },
    deleteEntry(kind, id, expectedRevision) {
      return repository.deleteEntry(ownerId, kind, id, expectedRevision);
    },
  };
}

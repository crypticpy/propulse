/**
 * Deterministic fixtures for the Spots & Paths preference surfaces.
 *
 * Every helper builds its own runtime, scoped store and library. Nothing is
 * shared between instances, so a test can mount two independent views and prove
 * that editing one never reaches the other.
 */
import type { PresetRecipe, SavedView, SaveResult, ViewConfiguration } from "@/lib/views/contracts";
import { createViewConfiguration } from "@/lib/views/defaults";
import { copyViewConfiguration, type FeedAvailability } from "@/lib/views/presets";
import {
  createMemoryWorkingStorage,
  createViewRuntime,
  createViewScopedStore,
  type ScopedViewRuntime,
  type ViewScopedStoreHandle,
} from "@/lib/views/runtime";
import type { SpotsLibraryEntry, SpotsLibraryPort } from "./types";

export interface TestViewHandle {
  runtime: ScopedViewRuntime;
  view: ViewScopedStoreHandle;
  dispose: () => void;
}

/** One isolated running view. `slotId`/`ownerId` differ per call by default. */
export function createTestView(options: {
  ownerId?: string;
  slotId?: string;
  seed?: ViewConfiguration;
  family?: ViewConfiguration["family"];
} = {}): TestViewHandle {
  const ownerId = options.ownerId ?? "owner-test";
  const slotId = options.slotId ?? "pro";
  const runtime = createViewRuntime({
    binding: { ownerId, slotId, kind: "interactive", sourceView: null, displayId: null },
    seed: options.seed ?? createViewConfiguration(options.family ?? "pro"),
    storage: createMemoryWorkingStorage(),
    persistWorking: false,
  });
  const view = createViewScopedStore(runtime);
  return {
    runtime,
    view,
    dispose() {
      view.destroy();
      runtime.dispose();
    },
  };
}

export function createSavedViewFixture(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: "view-1",
    ownerId: "owner-test",
    name: "Station Monitor",
    schemaVersion: 1,
    revision: 1,
    config: copyViewConfiguration(createViewConfiguration("pro")),
    sourcePreset: null,
    ...overrides,
  };
}

export const ALL_FEEDS_AVAILABLE: readonly FeedAvailability[] = [
  { source: "PSKReporter", enabled: true, authorized: true, connected: true },
  { source: "RBN", enabled: true, authorized: true, connected: true },
  { source: "Cluster", enabled: true, authorized: true, connected: true },
  { source: "WSJT-X", enabled: true, authorized: true, connected: true },
];

export const WSJTX_UNAVAILABLE: readonly FeedAvailability[] = [
  { source: "PSKReporter", enabled: true, authorized: true, connected: true },
  { source: "RBN", enabled: true, authorized: true, connected: true },
  { source: "Cluster", enabled: true, authorized: true, connected: false, reason: "not connected" },
  { source: "WSJT-X", enabled: false, authorized: true, connected: false, reason: "no local WSJT-X" },
];

export interface MemoryLibraryPort extends SpotsLibraryPort {
  /** Force the next write to return this result instead of committing. */
  failNextWith: (result: SaveResult<never> | null) => void;
  seedView: (view: SavedView) => void;
  seedPreset: (preset: PresetRecipe, revision?: number) => void;
  calls: { kind: string; id: string; expectedRevision: number }[];
}

/** In-memory stand-in for the revisioned library. Conflict/offline results are explicit. */
export function createMemoryLibraryPort(): MemoryLibraryPort {
  const views = new Map<string, SpotsLibraryEntry<SavedView>>();
  const presets = new Map<string, SpotsLibraryEntry<PresetRecipe>>();
  const calls: { kind: string; id: string; expectedRevision: number }[] = [];
  let forced: SaveResult<never> | null = null;

  const takeForced = <T>(): SaveResult<T> | null => {
    const result = forced;
    forced = null;
    return result as SaveResult<T> | null;
  };

  return {
    calls,
    failNextWith(result) {
      forced = result;
    },
    seedView(view) {
      views.set(view.id, { id: view.id, revision: view.revision, value: view });
    },
    seedPreset(preset, revision = 1) {
      presets.set(preset.id, { id: preset.id, revision, value: preset });
    },
    async listViews() {
      return [...views.values()].sort((left, right) => left.id.localeCompare(right.id));
    },
    async listPresets() {
      return [...presets.values()].sort((left, right) => left.id.localeCompare(right.id));
    },
    async saveView(draft, expectedRevision) {
      calls.push({ kind: "view", id: draft.id, expectedRevision });
      const override = takeForced<SavedView>();
      if (override) return override;
      const existing = views.get(draft.id);
      if ((existing?.revision ?? 0) !== expectedRevision) {
        return { status: "conflict", current: existing?.value ?? null };
      }
      const revision = expectedRevision + 1;
      const record: SavedView = { ...draft, ownerId: "owner-test", revision };
      views.set(draft.id, { id: draft.id, revision, value: record });
      return { status: "saved", record };
    },
    async savePreset(preset, expectedRevision) {
      calls.push({ kind: "preset", id: preset.id, expectedRevision });
      const override = takeForced<{ revision: number }>();
      if (override) return override;
      const existing = presets.get(preset.id);
      if ((existing?.revision ?? 0) !== expectedRevision) {
        return { status: "conflict", current: existing ? { revision: existing.revision } : null };
      }
      const revision = expectedRevision + 1;
      presets.set(preset.id, { id: preset.id, revision, value: preset });
      return { status: "saved", record: { revision } };
    },
    async deleteEntry(kind, id, expectedRevision) {
      calls.push({ kind: `delete:${kind}`, id, expectedRevision });
      const override = takeForced<{ revision: number }>();
      if (override) return override;
      const store = kind === "view" ? views : presets;
      const existing = store.get(id);
      if ((existing?.revision ?? 0) !== expectedRevision) {
        return { status: "conflict", current: existing ? { revision: existing.revision } : null };
      }
      store.delete(id);
      return { status: "saved", record: { revision: expectedRevision + 1 } };
    },
  };
}

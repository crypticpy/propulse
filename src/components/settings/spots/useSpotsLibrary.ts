/**
 * Named-view and custom-preset library operations for the Presets surfaces.
 *
 * The port is injected. Conflicts, queued offline writes and rejections are
 * surfaced as notices rather than being retried silently, so a failed save can
 * never be presented as a stored one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PresetRecipe, SavedView, SaveResult } from "@/lib/views/contracts";
import { copyViewConfiguration } from "@/lib/views/presets";
import type { SpotsLibraryEntry, SpotsLibraryPort } from "./types";

export type LibraryNoticeKind = "saved" | "conflict" | "offline" | "rejected";

export interface LibraryNotice {
  kind: LibraryNoticeKind;
  message: string;
}

export interface SpotsLibraryController {
  views: SpotsLibraryEntry<SavedView>[];
  presets: SpotsLibraryEntry<PresetRecipe>[];
  loading: boolean;
  notice: LibraryNotice | null;
  dismissNotice: () => void;
  refresh: () => Promise<void>;
  /** Store the given configuration under a new name. Returns the stored record. */
  createView: (input: {
    name: string;
    config: SavedView["config"];
    sourcePreset?: SavedView["sourcePreset"];
  }) => Promise<SavedView | null>;
  updateView: (entry: SpotsLibraryEntry<SavedView>, config: SavedView["config"]) => Promise<SavedView | null>;
  renameView: (entry: SpotsLibraryEntry<SavedView>, name: string) => Promise<SavedView | null>;
  duplicateView: (entry: SpotsLibraryEntry<SavedView>, name: string) => Promise<SavedView | null>;
  deleteView: (entry: SpotsLibraryEntry<SavedView>) => Promise<boolean>;
  savePreset: (recipe: PresetRecipe, expectedRevision?: number) => Promise<boolean>;
  deletePreset: (entry: SpotsLibraryEntry<PresetRecipe>) => Promise<boolean>;
}

const NOTICES: Record<string, LibraryNotice> = {
  saved: { kind: "saved", message: "Saved." },
  conflict: {
    kind: "conflict",
    message: "This entry changed elsewhere. Reload it, then re-apply your changes.",
  },
  pending: {
    kind: "offline",
    message: "Not stored yet. The change is queued and will be sent when the connection returns.",
  },
};

function noticeFor(result: SaveResult<unknown>): LibraryNotice {
  if (result.status === "saved") return NOTICES.saved;
  if (result.status === "conflict") return NOTICES.conflict;
  if (result.status === "pending") return NOTICES.pending;
  return { kind: "rejected", message: result.message };
}

export function newLibraryId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function useSpotsLibrary(library: SpotsLibraryPort): SpotsLibraryController {
  const [views, setViews] = useState<SpotsLibraryEntry<SavedView>[]>([]);
  const [presets, setPresets] = useState<SpotsLibraryEntry<PresetRecipe>[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<LibraryNotice | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextViews, nextPresets] = await Promise.all([
        library.listViews(),
        library.listPresets(),
      ]);
      if (!alive.current) return;
      setViews(nextViews);
      setPresets(nextPresets);
    } catch {
      if (alive.current) {
        setNotice({
          kind: "offline",
          message: "The saved view library could not be read. Stored entries are unchanged.",
        });
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [library]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commitView = useCallback(
    async (
      draft: Omit<SavedView, "ownerId" | "revision">,
      expectedRevision: number,
    ): Promise<SavedView | null> => {
      const result = await library.saveView(draft, expectedRevision);
      if (!alive.current) return null;
      setNotice(noticeFor(result));
      if (result.status !== "saved") return null;
      await refresh();
      return result.record;
    },
    [library, refresh],
  );

  const createView = useCallback<SpotsLibraryController["createView"]>(
    ({ name, config, sourcePreset }) =>
      commitView(
        {
          id: newLibraryId("view"),
          name,
          schemaVersion: 1,
          config: copyViewConfiguration(config),
          sourcePreset: sourcePreset ?? null,
        },
        0,
      ),
    [commitView],
  );

  const updateView = useCallback<SpotsLibraryController["updateView"]>(
    (entry, config) =>
      commitView(
        {
          id: entry.id,
          name: entry.value.name,
          schemaVersion: 1,
          config: copyViewConfiguration(config),
          sourcePreset: entry.value.sourcePreset,
        },
        entry.revision,
      ),
    [commitView],
  );

  const renameView = useCallback<SpotsLibraryController["renameView"]>(
    (entry, name) =>
      commitView(
        {
          id: entry.id,
          name,
          schemaVersion: 1,
          config: copyViewConfiguration(entry.value.config),
          sourcePreset: entry.value.sourcePreset,
        },
        entry.revision,
      ),
    [commitView],
  );

  const duplicateView = useCallback<SpotsLibraryController["duplicateView"]>(
    (entry, name) =>
      commitView(
        {
          id: newLibraryId("view"),
          name,
          schemaVersion: 1,
          config: copyViewConfiguration(entry.value.config),
          sourcePreset: entry.value.sourcePreset,
        },
        0,
      ),
    [commitView],
  );

  const deleteView = useCallback<SpotsLibraryController["deleteView"]>(
    async (entry) => {
      const result = await library.deleteEntry("view", entry.id, entry.revision);
      if (!alive.current) return false;
      setNotice(noticeFor(result));
      if (result.status !== "saved") return false;
      await refresh();
      return true;
    },
    [library, refresh],
  );

  const savePreset = useCallback<SpotsLibraryController["savePreset"]>(
    async (recipe, expectedRevision = 0) => {
      const result = await library.savePreset(recipe, expectedRevision);
      if (!alive.current) return false;
      setNotice(noticeFor(result));
      if (result.status !== "saved") return false;
      await refresh();
      return true;
    },
    [library, refresh],
  );

  const deletePreset = useCallback<SpotsLibraryController["deletePreset"]>(
    async (entry) => {
      const result = await library.deleteEntry("preset", entry.id, entry.revision);
      if (!alive.current) return false;
      setNotice(noticeFor(result));
      if (result.status !== "saved") return false;
      await refresh();
      return true;
    },
    [library, refresh],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  return useMemo(
    () => ({
      views, presets, loading, notice, dismissNotice, refresh,
      createView, updateView, renameView, duplicateView, deleteView,
      savePreset, deletePreset,
    }),
    [
      views, presets, loading, notice, dismissNotice, refresh,
      createView, updateView, renameView, duplicateView, deleteView,
      savePreset, deletePreset,
    ],
  );
}

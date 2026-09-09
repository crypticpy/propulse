import { create } from "zustand";
import type { IndexedViewLibrary } from "@/lib/views/persistence/indexedLibrary";
import type { RevisionedViewRepository } from "@/lib/views/persistence/repository";

/** Account library lifecycle only; never an active-view or working-preference selector. */
export interface ViewLibrarySessionState {
  epoch: object | null;
  ownerId: string | null;
  phase: "waiting" | "loading" | "ready" | "unavailable";
  repository: RevisionedViewRepository | null;
  library: IndexedViewLibrary | null;
  message: string | null;
}
export const useViewLibrarySessionStore = create<ViewLibrarySessionState>(() => ({
  epoch: null, ownerId: null, phase: "waiting", repository: null, library: null, message: null,
}));

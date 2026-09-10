import { create } from "zustand";
import type { PathPointInspectorProps } from "./PathPointInspector";

export type RayPathInspectorSnapshot = Omit<
  PathPointInspectorProps,
  "portalTarget" | "inline"
>;

interface RayPathInspectorStore {
  ownerId: string | null;
  snapshot: RayPathInspectorSnapshot | null;
  publish: (ownerId: string, snapshot: RayPathInspectorSnapshot | null) => void;
}

export const useRayPathInspectorStore = create<RayPathInspectorStore>((set) => ({
  ownerId: null,
  snapshot: null,
  publish: (ownerId, snapshot) =>
    set((state) => {
      if (snapshot === null) {
        return state.ownerId === ownerId
          ? { ownerId: null, snapshot: null }
          : state;
      }
      return { ownerId, snapshot };
    }),
}));

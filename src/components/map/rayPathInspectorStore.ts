import { create } from "zustand";
import type {
  PathPointInspectorOpen,
  PathPointInspectorProps,
} from "./PathPointInspector";

/** Which of the two great-circle routes an arc draws. */
export type RayPathKind = "short" | "long";

export type RayPathInspectorSnapshot = Omit<
  PathPointInspectorProps,
  "portalTarget" | "inline" | "hideTrigger" | "triggerLabel"
> & {
  /** Labels this owner's keyboard trigger; see `pathPointsTriggerLabel`. */
  pathKind: RayPathKind;
};

/**
 * In `pathMode: "both"` two arcs publish here, and each one needs its own
 * keyboard entry point -- a single "Path points" trigger would only ever open
 * the arbitrated owner's list, leaving the other route's points unreachable
 * without a pointer (#872 review round 3). Named by route, not by owner id:
 * the id is a path descriptor id and means nothing read aloud.
 */
export function pathPointsTriggerLabel(kind: RayPathKind): string {
  return kind === "short" ? "Short path points" : "Long path points";
}

export interface RayPathInspectorTrigger {
  ownerId: string;
  pathKind: RayPathKind;
  label: string;
  onOpenList: (() => void) | undefined;
}

/**
 * One trigger per owner that actually has points to list, ordered short route
 * first so the tab order does not depend on which arc published last.
 */
export function selectTriggers(
  entries: Record<string, { snapshot: RayPathInspectorSnapshot }>,
): RayPathInspectorTrigger[] {
  return Object.entries(entries)
    .filter(([, entry]) => entry.snapshot.pointSet.points.length > 0)
    .map(([ownerId, entry]) => ({
      ownerId,
      pathKind: entry.snapshot.pathKind,
      label: pathPointsTriggerLabel(entry.snapshot.pathKind),
      onOpenList: entry.snapshot.onOpenList,
    }))
    .sort((a, b) =>
      a.pathKind === b.pathKind
        ? a.ownerId.localeCompare(b.ownerId)
        : a.pathKind === "short"
          ? -1
          : 1,
    );
}

export interface RayPathInspectorEntry {
  snapshot: RayPathInspectorSnapshot;
  /** Publish order, so the newest of two equally open arcs wins. */
  seq: number;
}

interface RayPathInspectorStore {
  /** Every mounted arc's latest snapshot, keyed by its owner id. */
  entries: Record<string, RayPathInspectorEntry>;
  /** The one snapshot the overlay renders, chosen by `selectActiveOwner`. */
  active: RayPathInspectorSnapshot | null;
  activeOwnerId: string | null;
  nextSeq: number;
  publish: (ownerId: string, snapshot: RayPathInspectorSnapshot | null) => void;
}

/**
 * How much of the inspector each state needs on screen. `hover` must never
 * displace an open panel: in `pathMode: "both"` the short and long arcs are
 * two owners sharing this store, and merely moving the pointer across the
 * other arc used to overwrite an open card. The owner that lost the card
 * stays internally open, so it never republishes, and its panel was gone for
 * good (#872 review round).
 */
const OPEN_PRIORITY: Record<PathPointInspectorOpen, number> = {
  closed: 0,
  hover: 1,
  path: 2,
  card: 2,
};

/** The two states that put a dismissable panel on screen. */
export function isPanelOpen(open: PathPointInspectorOpen): boolean {
  return open === "card" || open === "path";
}

/**
 * Highest priority wins; ties go to the most recently published owner.
 * A `closed` entry still wins over nothing at all, because
 * `PathPointInspector` renders the always-available "Path points" keyboard
 * trigger even when no panel is open -- the Three.js hit areas are not
 * DOM-focusable, so unmounting the inspector at rest would leave the path
 * points with no keyboard entry point at all (#872 review round).
 */
export function selectActiveOwner(
  entries: Record<string, RayPathInspectorEntry>,
): string | null {
  let bestId: string | null = null;
  let bestPriority = -1;
  let bestSeq = -1;
  for (const [ownerId, entry] of Object.entries(entries)) {
    const priority = OPEN_PRIORITY[entry.snapshot.open];
    if (
      priority > bestPriority ||
      (priority === bestPriority && entry.seq > bestSeq)
    ) {
      bestId = ownerId;
      bestPriority = priority;
      bestSeq = entry.seq;
    }
  }
  return bestId;
}

export const useRayPathInspectorStore = create<RayPathInspectorStore>(
  (set, get) => ({
    entries: {},
    active: null,
    activeOwnerId: null,
    nextSeq: 0,
    /**
     * Publishing an open panel makes it the only open panel. In
     * `pathMode: "both"` the operator could open the short route's card and
     * then the long route's: both owners sat at panel priority, so dismissing
     * the long card handed the panel straight back to the stale short one and
     * the card the operator had just closed reappeared (#872 review round 4).
     *
     * Every other owner's open panel is therefore demoted to `closed` in the
     * store AND dismissed through its own `onClose`, so the owning arc's
     * internal state agrees: a demotion the arc never heard about would be
     * republished verbatim the next time anything else in its snapshot moved
     * (a hover on its own trace re-publishes `open` as it stands).
     *
     * Hover is left alone. It is not a panel, it cannot be dismissed, and the
     * priority table already keeps it from displacing one.
     */
    publish: (ownerId, snapshot) => {
      const dismissals: Array<() => void> = [];
      if (snapshot !== null && isPanelOpen(snapshot.open)) {
        for (const [otherId, entry] of Object.entries(get().entries)) {
          if (otherId === ownerId) continue;
          if (isPanelOpen(entry.snapshot.open)) {
            dismissals.push(entry.snapshot.onClose);
          }
        }
      }

      set((state) => {
        const entries = { ...state.entries };
        if (snapshot === null) {
          if (!(ownerId in entries)) return state;
          delete entries[ownerId];
        } else {
          entries[ownerId] = { snapshot, seq: state.nextSeq };
          if (isPanelOpen(snapshot.open)) {
            for (const [otherId, entry] of Object.entries(entries)) {
              if (otherId === ownerId) continue;
              if (!isPanelOpen(entry.snapshot.open)) continue;
              entries[otherId] = {
                ...entry,
                snapshot: { ...entry.snapshot, open: "closed" },
              };
            }
          }
        }
        const activeOwnerId = selectActiveOwner(entries);
        return {
          entries,
          nextSeq: state.nextSeq + 1,
          activeOwnerId,
          active: activeOwnerId ? entries[activeOwnerId].snapshot : null,
        };
      });

      // After the store is consistent: these run the owning arcs' own close
      // handlers, which republish them as closed.
      for (const dismiss of dismissals) dismiss();
    },
  }),
);

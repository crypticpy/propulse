/**
 * Owner arbitration for the shared ray-path inspector store (#872 review).
 *
 * In `pathMode: "both"` the short and the long `RayPathArc` are two owners
 * publishing into this one store. Two things the first cut got wrong:
 *
 * 1. A transient hover on one arc overwrote the other arc's OPEN card. The
 *    displaced owner stays internally open, so it never republishes, and its
 *    panel was gone until something else changed its state.
 * 2. `closed` published `null`, which unmounted `PathPointInspector` and with
 *    it the always-rendered "Path points" keyboard trigger -- the only
 *    keyboard entry point, since the in-scene hit areas are Three.js objects
 *    and not DOM-focusable.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { PathPointSet } from "@/lib/spots/pathPoints";
import {
  selectActiveOwner,
  useRayPathInspectorStore,
  type RayPathInspectorSnapshot,
} from "./rayPathInspectorStore";
import type { PathPointInspectorOpen } from "./PathPointInspector";

function emptyPointSet(pathId: string): PathPointSet {
  return { pathId, status: "ready", unavailableReason: null, points: [] };
}

function snapshot(
  pathId: string,
  open: PathPointInspectorOpen,
): RayPathInspectorSnapshot {
  return {
    pointSet: emptyPointSet(pathId),
    selectedId: open === "card" ? `${pathId}-point` : null,
    hoveredId: open === "hover" ? `${pathId}-point` : null,
    open,
    anchor: { x: 10, y: 10 },
    onSelect: () => {},
    onClose: () => {},
  };
}

const publish = (ownerId: string, open: PathPointInspectorOpen | null) =>
  useRayPathInspectorStore
    .getState()
    .publish(ownerId, open === null ? null : snapshot(ownerId, open));

beforeEach(() => {
  useRayPathInspectorStore.setState({
    entries: {},
    active: null,
    activeOwnerId: null,
    nextSeq: 0,
  });
});

describe("rayPathInspectorStore owner arbitration (#872 review)", () => {
  it("keeps a closed snapshot active so the keyboard trigger stays mounted", () => {
    publish("short", "closed");
    const state = useRayPathInspectorStore.getState();
    expect(state.activeOwnerId).toBe("short");
    expect(state.active?.open).toBe("closed");
  });

  it("does not let another arc's hover displace an open card", () => {
    publish("short", "card");
    publish("long", "hover");

    const state = useRayPathInspectorStore.getState();
    expect(state.activeOwnerId).toBe("short");
    expect(state.active?.open).toBe("card");
  });

  it("leaves the open card active after the other arc's hover clears", () => {
    publish("short", "card");
    publish("long", "hover");
    // Pointer leaves the long arc: it republishes as closed, the short arc
    // never republishes because its own state did not change.
    publish("long", "closed");

    const state = useRayPathInspectorStore.getState();
    expect(state.activeOwnerId).toBe("short");
    expect(state.active?.open).toBe("card");
  });

  it("prefers a hover over a closed arc", () => {
    publish("short", "closed");
    publish("long", "hover");
    expect(useRayPathInspectorStore.getState().activeOwnerId).toBe("long");
  });

  it("gives the newest owner the panel when both are open", () => {
    publish("short", "card");
    publish("long", "path");
    expect(useRayPathInspectorStore.getState().activeOwnerId).toBe("long");
  });

  it("falls back to the remaining owner when the active one unmounts", () => {
    publish("short", "card");
    publish("long", "closed");
    publish("short", null);

    const state = useRayPathInspectorStore.getState();
    expect(state.activeOwnerId).toBe("long");
    expect(state.active?.open).toBe("closed");
  });

  it("clears the overlay when the last owner unmounts", () => {
    publish("short", "closed");
    publish("short", null);

    const state = useRayPathInspectorStore.getState();
    expect(state.activeOwnerId).toBeNull();
    expect(state.active).toBeNull();
  });

  it("ignores a null publish from an owner that holds nothing", () => {
    publish("short", "card");
    const before = useRayPathInspectorStore.getState();
    publish("long", null);
    expect(useRayPathInspectorStore.getState()).toBe(before);
  });

  it("selects nothing from an empty entry map", () => {
    expect(selectActiveOwner({})).toBeNull();
  });
});

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
  pathPointsTriggerLabel,
  selectActiveOwner,
  selectTriggers,
  useRayPathInspectorStore,
  type RayPathInspectorSnapshot,
} from "./rayPathInspectorStore";
import type { PathPointInspectorOpen } from "./PathPointInspector";

function pathPoint(pathId: string): PathPointSet["points"][number] {
  return {
    id: `${pathId}-point`,
    pathId,
    hopIndex: 0,
    role: "ray-apex",
    coordinates: { lat: 40, lon: -74 },
    displayHeightKm: 300,
    modeledHeightKm: 300,
    layer: "F2",
    locationPrecision: "modeled",
    explanation: "Synthetic fixture point.",
    model: {
      name: "Fixture model",
      version: "fixture",
      modeledAtMs: 0,
      inputsAsOfMs: null,
      explanation: "Fixture.",
    },
  };
}

function emptyPointSet(pathId: string): PathPointSet {
  return { pathId, status: "ready", unavailableReason: null, points: [] };
}

function snapshot(
  pathId: string,
  open: PathPointInspectorOpen,
): RayPathInspectorSnapshot {
  return {
    pathKind: pathId === "long" ? "long" : "short",
    pointSet: emptyPointSet(pathId),
    selectedId: open === "card" ? `${pathId}-point` : null,
    hoveredId: open === "hover" ? `${pathId}-point` : null,
    open,
    anchor: { x: 10, y: 10 },
    onSelect: () => {},
    onClose: () => {},
  };
}

/** The same snapshot with one listable point, so it earns a trigger. */
function withPoints(
  base: RayPathInspectorSnapshot,
): RayPathInspectorSnapshot {
  return {
    ...base,
    pointSet: {
      ...base.pointSet,
      points: [pathPoint(base.pointSet.pathId)],
    },
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

/**
 * A stand-in for one `RayPathArc`: it holds its own `open` state and
 * republishes on every change, with the same handler semantics as the real
 * component (`handleHover` keeps an open panel open, `handleClose` clears
 * everything). The round-4 defect only shows up through that internal state:
 * a demotion the arc never hears about is republished verbatim the next time
 * anything moves.
 */
function makeArc(ownerId: string) {
  let open: PathPointInspectorOpen = "closed";
  const republish = () => {
    useRayPathInspectorStore.getState().publish(ownerId, {
      ...withPoints(snapshot(ownerId, open)),
      onClose: () => {
        open = "closed";
        republish();
      },
    });
  };
  return {
    get open() {
      return open;
    },
    mount() {
      republish();
    },
    openCard() {
      open = "card";
      republish();
    },
    hover() {
      // `RayPathArc.handleHover`: a hover never downgrades an open panel.
      open = open === "card" || open === "path" ? open : "hover";
      republish();
    },
    close() {
      open = "closed";
      republish();
    },
  };
}

describe("one card at a time across owners (#872 review round 4)", () => {
  it("demotes the other arc's card when a second card opens", () => {
    const short = makeArc("short");
    const long = makeArc("long");
    short.mount();
    long.mount();

    short.openCard();
    long.openCard();

    const state = useRayPathInspectorStore.getState();
    expect(state.activeOwnerId).toBe("long");
    expect(state.entries.short.snapshot.open).toBe("closed");
    // The owning arc agrees, so it cannot republish the stale card.
    expect(short.open).toBe("closed");
  });

  it("closes everything when the second card is dismissed", () => {
    const short = makeArc("short");
    const long = makeArc("long");
    short.mount();
    long.mount();

    short.openCard();
    long.openCard();
    long.close(); // Escape / the card's Close button

    const state = useRayPathInspectorStore.getState();
    expect(state.active?.open).toBe("closed");
    expect(
      Object.values(state.entries).map((entry) => entry.snapshot.open),
    ).toEqual(["closed", "closed"]);
  });

  it("does not resurrect a card when the other arc is hovered after a close", () => {
    const short = makeArc("short");
    const long = makeArc("long");
    short.mount();
    long.mount();

    short.openCard();
    long.openCard();
    long.close();
    short.hover();

    const state = useRayPathInspectorStore.getState();
    expect(state.active?.open).toBe("hover");
    expect(
      Object.values(state.entries).some(
        (entry) =>
          entry.snapshot.open === "card" || entry.snapshot.open === "path",
      ),
    ).toBe(false);
  });
});

describe("selectTriggers (#872 review round 3)", () => {
  it("names one trigger per route so both arcs are keyboard-reachable", () => {
    const triggers = selectTriggers({
      long: { snapshot: withPoints(snapshot("long", "closed")) },
      short: { snapshot: withPoints(snapshot("short", "card")) },
    });
    expect(triggers.map((trigger) => trigger.label)).toEqual([
      "Short path points",
      "Long path points",
    ]);
  });

  it("skips an owner with nothing to list", () => {
    const triggers = selectTriggers({
      short: { snapshot: withPoints(snapshot("short", "closed")) },
      long: { snapshot: snapshot("long", "closed") },
    });
    expect(triggers).toHaveLength(1);
    expect(triggers[0].ownerId).toBe("short");
  });

  it("labels by route, never by owner id", () => {
    expect(pathPointsTriggerLabel("short")).toBe("Short path points");
    expect(pathPointsTriggerLabel("long")).toBe("Long path points");
  });
});

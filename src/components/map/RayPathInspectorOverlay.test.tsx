/**
 * The overlay is the only DOM mount of `PathPointInspector` on the globe
 * (#872): `RayPathArc` lives inside the r3f `<Canvas>` and publishes state
 * instead of rendering it. `PathPointInspector` renders an always-available
 * sr-only "Path points" button, and the in-scene hit areas are Three.js
 * objects that no keyboard can reach, so that button is the only keyboard
 * entry point to the path points -- it has to survive the closed state.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { PathPointSet } from "@/lib/spots/pathPoints";
import { RayPathInspectorOverlay } from "./RayPathInspectorOverlay";
import {
  useRayPathInspectorStore,
  type RayPathInspectorSnapshot,
} from "./rayPathInspectorStore";
import type { PathPointInspectorOpen } from "./PathPointInspector";

function snapshot(
  pathId: string,
  open: PathPointInspectorOpen,
): RayPathInspectorSnapshot {
  const pointSet: PathPointSet = {
    pathId,
    status: "ready",
    unavailableReason: null,
    points: [],
  };
  return {
    pointSet,
    selectedId: null,
    hoveredId: null,
    open,
    anchor: { x: 20, y: 20 },
    onSelect: () => {},
    onClose: () => {},
  };
}

beforeEach(() => {
  useRayPathInspectorStore.setState({
    entries: {},
    active: null,
    activeOwnerId: null,
    nextSeq: 0,
  });
});

describe("RayPathInspectorOverlay (#872)", () => {
  it("keeps the Path points keyboard trigger mounted while the inspector is closed", () => {
    const portal = document.createElement("div");
    document.body.appendChild(portal);
    useRayPathInspectorStore
      .getState()
      .publish("short", snapshot("short", "closed"));

    render(<RayPathInspectorOverlay portalTarget={portal} />);

    expect(
      screen.getByRole("button", { name: "Path points" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    portal.remove();
  });

  it("renders nothing when no arc is publishing", () => {
    const portal = document.createElement("div");
    document.body.appendChild(portal);

    render(<RayPathInspectorOverlay portalTarget={portal} />);

    expect(screen.queryByRole("button", { name: "Path points" })).toBeNull();
    portal.remove();
  });

  it("shows the open panel of one arc while the other arc is only hovered", () => {
    const portal = document.createElement("div");
    document.body.appendChild(portal);
    const publish = useRayPathInspectorStore.getState().publish;
    publish("short", snapshot("short", "path"));
    publish("long", snapshot("long", "hover"));

    render(<RayPathInspectorOverlay portalTarget={portal} />);

    expect(screen.getByRole("dialog", { name: "Path point details" })).toBeTruthy();
    portal.remove();
  });
});

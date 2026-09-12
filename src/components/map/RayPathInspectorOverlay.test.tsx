/**
 * The overlay is the only DOM mount of `PathPointInspector` on the globe
 * (#872): `RayPathArc` lives inside the r3f `<Canvas>` and publishes state
 * instead of rendering it. `PathPointInspector` renders an always-available
 * sr-only "Path points" button, and the in-scene hit areas are Three.js
 * objects that no keyboard can reach, so that button is the only keyboard
 * entry point to the path points -- it has to survive the closed state.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PathPointSet } from "@/lib/spots/pathPoints";
import { RayPathInspectorOverlay } from "./RayPathInspectorOverlay";
import {
  useRayPathInspectorStore,
  type RayPathInspectorSnapshot,
} from "./rayPathInspectorStore";
import type { PathPointInspectorOpen } from "./PathPointInspector";

function snapshot(
  pathId: "short" | "long",
  open: PathPointInspectorOpen,
  onOpenList?: () => void,
): RayPathInspectorSnapshot {
  const pointSet: PathPointSet = {
    pathId,
    status: "ready",
    unavailableReason: null,
    points: [
      {
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
      },
    ],
  };
  return {
    pathKind: pathId,
    pointSet,
    selectedId: null,
    hoveredId: null,
    open,
    anchor: { x: 20, y: 20 },
    onSelect: () => {},
    onClose: () => {},
    onOpenList,
  };
}

function mountPortal() {
  const portal = document.createElement("div");
  document.body.appendChild(portal);
  return portal;
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
      screen.getByRole("button", { name: "Short path points" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    portal.remove();
  });

  it("renders nothing when no arc is publishing", () => {
    const portal = document.createElement("div");
    document.body.appendChild(portal);

    render(<RayPathInspectorOverlay portalTarget={portal} />);

    expect(
      screen.queryByRole("button", { name: /path points$/i }),
    ).toBeNull();
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

describe("RayPathInspectorOverlay keyboard triggers per path (#872 review round 3)", () => {
  it("mounts one trigger per arc in pathMode both, named by route", () => {
    const portal = mountPortal();
    const publish = useRayPathInspectorStore.getState().publish;
    publish("short", snapshot("short", "card"));
    publish("long", snapshot("long", "closed"));

    render(<RayPathInspectorOverlay portalTarget={portal} />);

    expect(
      screen.getAllByRole("button", { name: /path points$/i }).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Short path points", "Long path points"]);
    portal.remove();
  });

  it("opens each arc's own list from its own trigger", async () => {
    const portal = mountPortal();
    const openShort = vi.fn();
    const openLong = vi.fn();
    const publish = useRayPathInspectorStore.getState().publish;
    publish("short", snapshot("short", "card", openShort));
    publish("long", snapshot("long", "closed", openLong));

    render(<RayPathInspectorOverlay portalTarget={portal} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Long path points" }));
    expect(openLong).toHaveBeenCalledTimes(1);
    expect(openShort).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Short path points" }));
    expect(openShort).toHaveBeenCalledTimes(1);
    expect(openLong).toHaveBeenCalledTimes(1);
    portal.remove();
  });

  it("mounts exactly one trigger for a single path", () => {
    const portal = mountPortal();
    useRayPathInspectorStore.getState().publish("short", snapshot("short", "closed"));

    render(<RayPathInspectorOverlay portalTarget={portal} />);

    expect(screen.getAllByRole("button", { name: /path points$/i })).toHaveLength(
      1,
    );
    portal.remove();
  });
});

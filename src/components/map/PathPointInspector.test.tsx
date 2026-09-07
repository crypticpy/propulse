import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { traceRayPath } from "@/lib/utils/rayTrace";
import type { PathDescriptor } from "@/lib/views/spotContracts";
import { buildPathPointSet } from "@/lib/spots/pathPoints";
import { PathPointInspector } from "./PathPointInspector";

const DATE = new Date("2026-06-21T18:00:00Z");
const NOW_MS = DATE.getTime();
const NY = { lat: 40.7, lon: -74.0 };
const TOKYO = { lat: 35.7, lon: 139.7 };

const MODEL = {
  name: "ITU-R P.533 ray trace",
  version: "propulse-physics",
  modeledAtMs: NOW_MS,
  inputsAsOfMs: NOW_MS,
  explanation: "Synthetic SP-07 fixture model run.",
};

const path: PathDescriptor = {
  id: "path-ny-tokyo",
  reportIds: [],
  kind: "modeled",
  from: {
    callsign: "W2NYC",
    role: "transmitter",
    location: { kind: "reported-coordinate", coordinates: NY },
  },
  to: {
    callsign: "JA1TYO",
    role: "receiver",
    location: { kind: "reported-coordinate", coordinates: TOKYO },
  },
  direction: "from-to",
  model: MODEL,
};

function pointSet() {
  return buildPathPointSet({
    pathId: path.id,
    path,
    result: traceRayPath({
      startLat: NY.lat,
      startLon: NY.lon,
      endLat: TOKYO.lat,
      endLon: TOKYO.lon,
      frequencyMHz: 14.074,
      date: DATE,
      sfi: 150,
      kp: 2,
      pathMode: "short",
    }),
    nowMs: NOW_MS,
    startLat: NY.lat,
    startLon: NY.lon,
    endLat: TOKYO.lat,
    endLon: TOKYO.lon,
    includeShellHighlights: true,
    layerHeights: calculateLayerHeights(45, 6, 150),
  });
}

describe("PathPointInspector", () => {
  it("opens an anchored card from the keyboard list without WebGL", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const set = pointSet();
    const apex = set.points.find((point) => point.role === "ray-apex")!;

    render(
      <PathPointInspector
        pointSet={set}
        selectedId={apex.id}
        hoveredId={null}
        open="card"
        anchor={{ x: 200, y: 200 }}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Path point details" })).toBeTruthy();
    expect(screen.getByText("Modeled ray apex")).toBeTruthy();
    expect(screen.getByText("Not supplied by the model")).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Path points" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/confidence/i);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("consumes Escape on the window before globe retarget handlers", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onGlobeEscape = vi.fn();
    document.addEventListener("keydown", onGlobeEscape, true);
    const set = pointSet();
    const apex = set.points.find((point) => point.role === "ray-apex")!;
    render(
      <PathPointInspector
        pointSet={set}
        selectedId={apex.id}
        hoveredId={null}
        open="card"
        anchor={{ x: 200, y: 200 }}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onGlobeEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onGlobeEscape, true);
  });

  it("labels shell highlights as decorative, not modeled reflection height", () => {
    const set = pointSet();
    const shell = set.points.find((point) => point.role === "shell-highlight")!;
    render(
      <PathPointInspector
        pointSet={set}
        selectedId={shell.id}
        hoveredId={null}
        open="card"
        anchor={{ x: 200, y: 200 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Decorative shell intersection")).toBeTruthy();
    expect(screen.getByText("Decorative shell height")).toBeTruthy();
    expect(screen.getByText(/not an actual reflection height/i)).toBeTruthy();
  });

  it("shows a specific unavailable state when the model is missing", () => {
    render(
      <PathPointInspector
        pointSet={{
          pathId: "path-ny-tokyo",
          status: "model-unavailable",
          unavailableReason:
            "Path point details are unavailable because the model result is missing.",
          points: [],
        }}
        selectedId={null}
        hoveredId={null}
        open="card"
        anchor={{ x: 120, y: 120 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/model result is missing/i),
    ).toBeTruthy();
  });

  it("fires only the full-path-analysis callback", async () => {
    const user = userEvent.setup();
    const onOpenPathAnalysis = vi.fn();
    const onClose = vi.fn();
    const set = pointSet();
    render(
      <PathPointInspector
        pointSet={set}
        selectedId={null}
        hoveredId={null}
        open="path"
        anchor={{ x: 200, y: 200 }}
        pathSummary="Modeled 4-hop path."
        onSelect={vi.fn()}
        onClose={onClose}
        onOpenPathAnalysis={onOpenPathAnalysis}
      />,
    );
    expect(screen.getByText(/not a measured bounce/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Full path analysis" }));
    expect(onOpenPathAnalysis).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a short hover explanation", () => {
    const set = pointSet();
    const apex = set.points.find((point) => point.role === "ray-apex")!;
    render(
      <PathPointInspector
        pointSet={set}
        selectedId={null}
        hoveredId={apex.id}
        open="hover"
        anchor={{ x: 200, y: 200 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("tooltip").textContent).toMatch(/modeled apex/i);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

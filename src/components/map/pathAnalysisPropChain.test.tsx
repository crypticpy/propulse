/**
 * Functional stand-in for the GlobeView -> RayPathArc -> PathPointInspector
 * prop chain (#931). RayPathArc cannot be mounted under jsdom without a full
 * R3F canvas, so this fixture mirrors RayPathArc's conditional forward at
 * RayPathArc.tsx:858-860.
 */
import { useCallback } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { traceRayPath } from "@/lib/utils/rayTrace";
import type { PathDescriptor } from "@/lib/views/spotContracts";
import { buildPathPointSet } from "@/lib/spots/pathPoints";
import { PathPointInspector } from "./PathPointInspector";
import {
  revealFullscreenPathAnalysis,
  revealPropSpherePathAnalysis,
} from "./openPathAnalysis";

const DATE = new Date("2026-06-21T18:00:00Z");
const NOW_MS = DATE.getTime();
const NY = { lat: 40.7, lon: -74.0 };
const TOKYO = { lat: 35.7, lon: 139.7 };

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
  model: {
    name: "ITU-R P.533 ray trace",
    version: "propulse-physics",
    modeledAtMs: NOW_MS,
    inputsAsOfMs: NOW_MS,
    explanation: "Synthetic SP-07 fixture model run.",
  },
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

function RayPathInspectorChain({
  onOpenPathAnalysis,
}: {
  onOpenPathAnalysis?: () => void;
}) {
  const handleOpenPathAnalysis = useCallback(() => {
    onOpenPathAnalysis?.();
  }, [onOpenPathAnalysis]);

  const set = pointSet();
  return (
    <PathPointInspector
      pointSet={set}
      selectedId={null}
      hoveredId={null}
      open="path"
      anchor={{ x: 200, y: 200 }}
      pathSummary="Modeled 4-hop path."
      onSelect={() => {}}
      onClose={vi.fn()}
      onOpenPathAnalysis={
        onOpenPathAnalysis ? handleOpenPathAnalysis : undefined
      }
    />
  );
}

describe("path analysis prop chain (#931)", () => {
  it("enables Full path analysis and fires the host handler when wired", async () => {
    const user = userEvent.setup();
    const onOpenPathAnalysis = vi.fn();

    render(<RayPathInspectorChain onOpenPathAnalysis={onOpenPathAnalysis} />);

    const button = screen.getByRole("button", {
      name: "Full path analysis",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(onOpenPathAnalysis).toHaveBeenCalledTimes(1);
  });

  it("keeps Full path analysis disabled when the host omits the handler", () => {
    render(<RayPathInspectorChain />);
    expect(
      (screen.getByRole("button", { name: "Full path analysis" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("PropSphere host reveal (#1038 review)", () => {
  function spies() {
    return {
      setActiveTab: vi.fn(),
      setRightPanelExpanded: vi.fn(),
      setRightPanelWidth: vi.fn(),
      setRightPanelMode: vi.fn(),
    };
  }

  it("selects the mobile Path tab in lite mode, where the Lite dock is hidden below lg", () => {
    const s = spies();
    revealPropSpherePathAnalysis({
      isLiteMode: true,
      rightPanelMode: "full",
      rightPanelLastWidth: 320,
      ...s,
    });
    // The bug: lite mode returned after setRightPanelExpanded, leaving the
    // visible `lg:hidden` bottom panel on Bands/Recs/Spots.
    expect(s.setActiveTab).toHaveBeenCalledWith("path");
    expect(s.setRightPanelExpanded).toHaveBeenCalledWith(true);
    // Lite mode has no desktop right column to restore.
    expect(s.setRightPanelMode).not.toHaveBeenCalled();
  });

  it("selects the Path tab and expands the desktop column in non-lite mode", () => {
    const s = spies();
    revealPropSpherePathAnalysis({
      isLiteMode: false,
      rightPanelMode: "hidden",
      rightPanelLastWidth: 360,
      ...s,
    });
    expect(s.setActiveTab).toHaveBeenCalledWith("path");
    expect(s.setRightPanelWidth).toHaveBeenCalledWith(360);
    expect(s.setRightPanelMode).toHaveBeenCalledWith("full");
  });

  it("still selects the Path tab when the desktop column is already full", () => {
    const s = spies();
    revealPropSpherePathAnalysis({
      isLiteMode: false,
      rightPanelMode: "full",
      rightPanelLastWidth: 320,
      ...s,
    });
    expect(s.setActiveTab).toHaveBeenCalledWith("path");
    expect(s.setRightPanelMode).not.toHaveBeenCalled();
    expect(s.setRightPanelWidth).not.toHaveBeenCalled();
  });
});

describe("FullscreenPropSphere host reveal (#1038 review)", () => {
  it("leaves ambient mode so the revealed panel is not opacity-0", () => {
    const setAmbientMode = vi.fn();
    const toggleProPanelCollapse = vi.fn();
    const bringToFront = vi.fn();
    revealFullscreenPathAnalysis({
      pathPanelCollapsed: true,
      setAmbientMode,
      toggleProPanelCollapse,
      bringToFront,
    });
    expect(setAmbientMode).toHaveBeenCalledWith(false);
    expect(toggleProPanelCollapse).toHaveBeenCalledWith("path-analysis");
    expect(bringToFront).toHaveBeenCalledWith("path-analysis");
  });

  it("leaves ambient mode even when the panel is already uncollapsed", () => {
    const setAmbientMode = vi.fn();
    const toggleProPanelCollapse = vi.fn();
    const bringToFront = vi.fn();
    revealFullscreenPathAnalysis({
      pathPanelCollapsed: false,
      setAmbientMode,
      toggleProPanelCollapse,
      bringToFront,
    });
    expect(setAmbientMode).toHaveBeenCalledWith(false);
    expect(toggleProPanelCollapse).not.toHaveBeenCalled();
    expect(bringToFront).toHaveBeenCalledWith("path-analysis");
  });
});

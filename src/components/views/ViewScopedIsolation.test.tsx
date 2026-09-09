import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ViewProvider } from "./ViewProvider";
import { useViewRuntime } from "./ViewRuntimeContext";
import {
  createMemoryWorkingStorage,
  displaySlotId,
  namedSlotId,
} from "@/lib/views/runtime";
import { useViewEffectiveSpots } from "@/hooks/useViewClusterSpots";
import {
  useUpdateViewPresentation,
  useViewInteraction,
  useViewPresentation,
} from "@/hooks/useViewPresentation";
import { useViewScopedStore } from "@/hooks/useViewScopedStore";
import { useViewSpotFocus } from "@/hooks/useSpotFocus";
import { commitViewSpotSelection } from "@/hooks/useMapSpotSelection";
import { ingestOperatingMonitorReportForTests, resetOperatingMonitorForTests } from "@/hooks/useOperatingMonitor";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "grid-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    dxGrid: "GG87",
    ...overrides,
  };
}

function IsolationProbe({ id, spots }: { id: string; spots: readonly DXSpot[] }) {
  const presentation = useViewPresentation();
  const interaction = useViewInteraction();
  const effective = useViewEffectiveSpots();
  const { focusedSpot } = useViewSpotFocus(spots);
  const updatePresentation = useUpdateViewPresentation();
  const scoped = useViewScopedStore();
  const runtime = useViewRuntime();
  return (
    <div>
      <span data-testid={`${id}-slot`}>{runtime.binding.slotId}</span>
      <span data-testid={`${id}-proj`}>{presentation.projection}</span>
      <span data-testid={`${id}-scale`}>{presentation.textScale}</span>
      <span data-testid={`${id}-bands`}>{effective.filters.bands.join(",") || "all"}</span>
      <span data-testid={`${id}-follow`}>{String(runtime.getSnapshot().config.context.followRadio)}</span>
      <span data-testid={`${id}-sel`}>{interaction.selectedReportId ?? "none"}</span>
      <span data-testid={`${id}-focus`}>{focusedSpot ? String(focusedSpot.dxLat) : "none"}</span>
      <button
        type="button"
        onClick={() => {
          updatePresentation({
            ...JSON.parse(JSON.stringify(presentation)),
            projection: "azimuthal",
          });
        }}
      >
        {id}-azimuthal
      </button>
      <button
        type="button"
        onClick={() => {
          scoped.updateWorkingView({
            context: { ...runtime.getSnapshot().config.context, followRadio: true },
          });
        }}
      >
        {id}-follow
      </button>
      <button
        type="button"
        onClick={() => {
          const spotsConfig = JSON.parse(JSON.stringify(runtime.getSnapshot().config.spots));
          spotsConfig.filters.bands = ["40m"];
          spotsConfig.filters.modes = {
            all: false, categories: [], modes: ["FT8"],
            includeUnknown: true, includeInferred: true,
          };
          scoped.updateWorkingView({ spots: spotsConfig });
        }}
      >
        {id}-manual
      </button>
      <button
        type="button"
        onClick={() => commitViewSpotSelection(runtime, spots[0] ?? dxSpot())}
      >
        {id}-select
      </button>
    </div>
  );
}

const originalDx = useDXStore.getState().selectedSpot;
const originalMapTarget = useMapStore.getState().target;

describe("ViewProvider scoped adapters", () => {
  beforeEach(() => {
    resetOperatingMonitorForTests();
    ingestOperatingMonitorReportForTests({
      sender: "test-rig",
      band: "20m",
      mode: "CW",
      frequency: 14074,
    });
  });

  afterEach(() => {
    useDXStore.setState({ selectedSpot: originalDx });
    useMapStore.setState({ target: originalMapTarget });
  });

  it("isolates presentation, follow, manual filters, and focus across two family runtimes", async () => {
    const user = userEvent.setup();
    const storage = createMemoryWorkingStorage();
    const spots = [dxSpot()];
    render(
      <>
        <ViewProvider ownerId="owner-a" slot="normal" storage={storage}>
          <IsolationProbe id="monitor" spots={spots} />
        </ViewProvider>
        <ViewProvider ownerId="owner-a" slot="hamclock" storage={storage}>
          <IsolationProbe id="wall" spots={spots} />
        </ViewProvider>
      </>,
    );
    expect(screen.getByTestId("monitor-proj").textContent).toBe("globe");
    expect(screen.getByTestId("wall-proj").textContent).toBe("flat");
    await user.click(screen.getByRole("button", { name: "monitor-follow" }));
    expect(screen.getByTestId("monitor-follow").textContent).toBe("true");
    expect(screen.getByTestId("monitor-bands").textContent).toBe("20m");
    expect(screen.getByTestId("wall-follow").textContent).toBe("false");
    expect(screen.getByTestId("wall-bands").textContent).toBe("all");
    await user.click(screen.getByRole("button", { name: "wall-manual" }));
    expect(screen.getByTestId("wall-bands").textContent).toBe("40m");
    expect(screen.getByTestId("wall-follow").textContent).toBe("false");
    expect(screen.getByTestId("monitor-bands").textContent).toBe("20m");
    await user.click(screen.getByRole("button", { name: "monitor-azimuthal" }));
    expect(screen.getByTestId("monitor-proj").textContent).toBe("azimuthal");
    expect(screen.getByTestId("wall-proj").textContent).toBe("flat");
    await user.click(screen.getByRole("button", { name: "monitor-select" }));
    expect(screen.getByTestId("monitor-sel").textContent).toBe("grid-1");
    expect(screen.getByTestId("monitor-focus").textContent).toBe("-22.5");
    expect(screen.getByTestId("wall-sel").textContent).toBe("none");
    expect(screen.getByTestId("wall-focus").textContent).toBe("none");
    // Per-runtime interaction (selectedReportId, focus) stays isolated per
    // slot above. The legacy dxStore/mapStore writes are additive and
    // global now — commitViewSpotSelection (useMapSpotSelection.ts) writes
    // them for every host until #707. See BoundViewHost.test.tsx.
    expect(useDXStore.getState().selectedSpot?.id).toBe("grid-1");
    expect(useMapStore.getState().target).toMatchObject({ lat: -22.5, lon: -43 });
  });

  it("isolates two named copies and two display instances in one tree", async () => {
    const user = userEvent.setup();
    const storage = createMemoryWorkingStorage();
    render(
      <>
        <ViewProvider ownerId="owner-a" slot={namedSlotId("one")} sourceView={{ id: "one", revision: 1 }} storage={storage}>
          <IsolationProbe id="one" spots={[]} />
        </ViewProvider>
        <ViewProvider ownerId="owner-a" slot={namedSlotId("two")} sourceView={{ id: "two", revision: 1 }} storage={storage}>
          <IsolationProbe id="two" spots={[]} />
        </ViewProvider>
        <ViewProvider ownerId="owner-a" slot={displaySlotId("tv1")} kind="display">
          <IsolationProbe id="tv1" spots={[]} />
        </ViewProvider>
        <ViewProvider ownerId="owner-a" slot={displaySlotId("tv2")} kind="display">
          <IsolationProbe id="tv2" spots={[]} />
        </ViewProvider>
      </>,
    );
    await user.click(screen.getByRole("button", { name: "one-azimuthal" }));
    await user.click(screen.getByRole("button", { name: "tv1-manual" }));
    expect(screen.getByTestId("one-proj").textContent).toBe("azimuthal");
    expect(screen.getByTestId("two-proj").textContent).toBe("globe");
    expect(screen.getByTestId("tv1-bands").textContent).toBe("40m");
    expect(screen.getByTestId("tv2-bands").textContent).toBe("all");
    expect(screen.getByTestId("tv1-slot").textContent).toBe("display:tv1");
    expect(screen.getByTestId("tv2-slot").textContent).toBe("display:tv2");
  });
});

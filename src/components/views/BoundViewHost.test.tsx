import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BoundSelectionClear, BoundViewHost } from "./BoundViewHost";
import { usePropSphereFamilySlot } from "./usePropSphereFamilySlot";
import { useViewRuntime } from "./ViewRuntimeContext";
import { commitViewSpotSelection } from "@/hooks/useMapSpotSelection";
import { useViewInteraction } from "@/hooks/useViewPresentation";
import { createMemoryWorkingStorage } from "@/lib/views/runtime";
import { useAuthStore } from "@/stores/authStore";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore, type LayoutMode } from "@/stores/mapStore";
import type { DXSpot } from "@/types/dxcluster";

function dxSpot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "grid-1",
    spotter: "K1ABC",
    dx: "JA1XYZ",
    frequency: 14074,
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    dxLat: 35,
    dxLon: 139,
    ...overrides,
  };
}

function IsolationProbe({ id }: { id: string }) {
  const runtime = useViewRuntime();
  const interaction = useViewInteraction();
  return (
    <div>
      <span data-testid={`${id}-slot`}>{runtime.binding.slotId}</span>
      <span data-testid={`${id}-owner`}>{runtime.binding.ownerId}</span>
      <span data-testid={`${id}-instance`}>{runtime.instanceId}</span>
      <span data-testid={`${id}-sel`}>
        {interaction.selectedReportId ?? "none"}
      </span>
      <button
        type="button"
        onClick={() => commitViewSpotSelection(runtime, dxSpot())}
      >
        {id}-select
      </button>
    </div>
  );
}

function FamilySlotProbe({ layoutMode }: { layoutMode: LayoutMode }) {
  const slot = usePropSphereFamilySlot(layoutMode);
  return <span data-testid="family-slot">{slot}</span>;
}

afterEach(() => {
  useAuthStore.setState({ user: null, session: null });
});

describe("BoundViewHost", () => {
  it("isolates selection across PropSphere and HamClock hosts without writing globals", async () => {
    const user = userEvent.setup();
    const storage = createMemoryWorkingStorage();
    const dxSelected = useDXStore.getState().selectedSpot;
    const mapTarget = useMapStore.getState().target;
    render(
      <>
        <BoundViewHost slot="normal" storage={storage}>
          <IsolationProbe id="monitor" />
        </BoundViewHost>
        <BoundViewHost slot="hamclock" storage={storage}>
          <IsolationProbe id="wall" />
        </BoundViewHost>
      </>,
    );
    expect(screen.getByTestId("monitor-slot").textContent).toBe("normal");
    expect(screen.getByTestId("wall-slot").textContent).toBe("hamclock");
    expect(screen.getByTestId("monitor-instance").textContent).not.toBe(
      screen.getByTestId("wall-instance").textContent,
    );
    await user.click(screen.getByRole("button", { name: "monitor-select" }));
    expect(screen.getByTestId("monitor-sel").textContent).toBe("grid-1");
    expect(screen.getByTestId("wall-sel").textContent).toBe("none");
    expect(useDXStore.getState().selectedSpot).toBe(dxSelected);
    expect(useMapStore.getState().target).toBe(mapTarget);
    await user.click(screen.getByRole("button", { name: "wall-select" }));
    expect(screen.getByTestId("wall-sel").textContent).toBe("grid-1");
    expect(screen.getByTestId("monitor-sel").textContent).toBe("grid-1");
    expect(useDXStore.getState().selectedSpot).toBe(dxSelected);
    expect(useMapStore.getState().target).toBe(mapTarget);
  });

  it("binds the signed-in account as owner and remounts on auth change", () => {
    const storage = createMemoryWorkingStorage();
    act(() => {
      useAuthStore.setState({ user: { id: "acct-42" } as User });
    });
    render(
      <BoundViewHost slot="pro" storage={storage}>
        <IsolationProbe id="pro" />
      </BoundViewHost>,
    );
    expect(screen.getByTestId("pro-owner").textContent).toBe("acct-42");
    const firstId = screen.getByTestId("pro-instance").textContent;
    act(() => {
      useAuthStore.setState({ user: { id: "acct-99" } as User });
    });
    expect(screen.getByTestId("pro-owner").textContent).toBe("acct-99");
    expect(screen.getByTestId("pro-instance").textContent).not.toBe(firstId);
  });

  it("keeps the PropSphere family slot while layoutMode is hamclock", async () => {
    const user = userEvent.setup();
    function Host() {
      const [layoutMode, setLayoutMode] = useState<LayoutMode>("pro");
      return (
        <>
          <button type="button" onClick={() => setLayoutMode("hamclock")}>
            open-hamclock
          </button>
          <FamilySlotProbe layoutMode={layoutMode} />
        </>
      );
    }
    render(<Host />);
    expect(screen.getByTestId("family-slot").textContent).toBe("pro");
    await user.click(screen.getByRole("button", { name: "open-hamclock" }));
    expect(screen.getByTestId("family-slot").textContent).toBe("pro");
  });

  it("clears this runtime's selection through BoundSelectionClear", async () => {
    const user = userEvent.setup();
    const storage = createMemoryWorkingStorage();
    function Host() {
      const clearRef = useRef<(() => void) | null>(null);
      return (
        <BoundViewHost slot="normal" storage={storage}>
          <BoundSelectionClear clearRef={clearRef} />
          <IsolationProbe id="clear" />
          <button type="button" onClick={() => clearRef.current?.()}>
            escape
          </button>
        </BoundViewHost>
      );
    }
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "clear-select" }));
    expect(screen.getByTestId("clear-sel").textContent).toBe("grid-1");
    await user.click(screen.getByRole("button", { name: "escape" }));
    expect(screen.getByTestId("clear-sel").textContent).toBe("none");
  });
});

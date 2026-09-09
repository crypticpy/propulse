/**
 * The slider hook flushes its pending value from an unmount cleanup, and that
 * flush writes through the scoped store to the runtime. Once a host owns the
 * runtime's lifetime that write can land after disposal, and `assertActive`
 * would throw out of a commit-phase cleanup — React re-throws it, so the user
 * gets an error boundary or a white screen for dragging a slider and closing
 * the surface.
 *
 * The disposal here is not simulated: `registerRuntimeWriter` disposes the
 * previous holder of an `ownerId\0slotId\0kind` key synchronously, which is
 * exactly what a second map host mounting on the same slot does.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ViewBinding } from "@/lib/views/contracts";
import {
  createMemoryWorkingStorage,
  createViewRuntime,
  createViewScopedStore,
  registerRuntimeWriter,
  type ViewScopedStoreHandle,
} from "@/lib/views/runtime";
import type { SpotsPreferencesController } from "./types";
import { useSpotsPreferences } from "./useSpotsPreferences";
import { ActivitySection } from "./sections/ActivitySection";

const BINDING: ViewBinding = {
  ownerId: "owner-flush",
  slotId: "normal",
  kind: "interactive",
  sourceView: null,
  displayId: null,
};

function Harness({ view }: { view: ViewScopedStoreHandle }) {
  const controller: SpotsPreferencesController = useSpotsPreferences({ view });
  return <ActivitySection controller={controller} />;
}

describe("debounced slider commit against a disposed runtime", () => {
  it("drops the pending value instead of throwing when the host disposed the runtime first", () => {
    const storage = createMemoryWorkingStorage();
    const runtime = createViewRuntime({ binding: BINDING, storage });
    const release = registerRuntimeWriter(runtime);
    const view = createViewScopedStore(runtime);
    const { unmount } = render(<Harness view={view} />);

    const slider = screen.getByRole("slider", { name: "Maximum reports shown" });
    fireEvent.change(slider, { target: { value: "10" } });
    // Still pending: the commit is debounced to the trailing edge.
    expect(runtime.getSnapshot().config.spots.filters.spotLimit).toBe(150);

    const successor = createViewRuntime({ binding: BINDING, storage });
    const releaseSuccessor = registerRuntimeWriter(successor);
    expect(runtime.isDisposed()).toBe(true);

    expect(() => unmount()).not.toThrow();
    expect(successor.getSnapshot().config.spots.filters.spotLimit).toBe(150);

    releaseSuccessor();
    release();
    view.destroy();
    successor.dispose();
  });

  it("still commits the pending value on unmount while the runtime is alive", () => {
    const storage = createMemoryWorkingStorage();
    const runtime = createViewRuntime({ binding: BINDING, storage });
    const release = registerRuntimeWriter(runtime);
    const view = createViewScopedStore(runtime);
    const { unmount } = render(<Harness view={view} />);

    fireEvent.change(screen.getByRole("slider", { name: "Maximum reports shown" }), {
      target: { value: "10" },
    });
    unmount();

    expect(runtime.getSnapshot().config.spots.filters.spotLimit).toBe(10);
    release();
    view.destroy();
    runtime.dispose();
  });
});

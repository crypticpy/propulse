import { describe, expect, it } from "vitest";
import { createViewRuntime } from "./createViewRuntime";
import { createViewScopedStore } from "./createViewScopedStore";
import type { ViewBinding } from "../contracts";

function binding(slot = "normal"): ViewBinding {
  return { ownerId: "owner-a", slotId: slot, kind: "interactive", sourceView: null, displayId: null };
}

describe("createViewScopedStore", () => {
  it("mirrors one runtime and derives follow without writing configured filters", () => {
    const runtime = createViewRuntime({ binding: binding(), persistWorking: false });
    const handle = createViewScopedStore(runtime);
    runtime.updateWorkingView({
      context: { ...runtime.getSnapshot().config.context, followRadio: true },
    });
    expect(handle.store.getState().followStatus).toBe("paused-missing-radio");
    handle.setRadio({ band: "20m", mode: "CW" });
    expect(handle.store.getState().followStatus).toBe("active");
    expect(handle.store.getState().effectiveSpots.filters.bands).toEqual(["20m"]);
    expect(handle.store.getState().config.spots.filters.bands).toEqual([]);
    const other = createViewRuntime({ binding: binding("hamclock"), persistWorking: false });
    const wall = createViewScopedStore(other);
    expect(wall.store.getState().config.context.followRadio).toBe(false);
    handle.destroy();
    wall.destroy();
    runtime.dispose();
    other.dispose();
  });
});

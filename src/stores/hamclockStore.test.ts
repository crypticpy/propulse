import { beforeEach, describe, expect, it } from "vitest";
import { useHamClockStore } from "./hamclockStore";

describe("hamclockStore panel defaults", () => {
  beforeEach(() => {
    localStorage.clear();
    useHamClockStore.setState({ panelCollapsed: {} });
  });

  it("opens an absent panel that renders collapsed by default on first toggle", () => {
    useHamClockStore.getState().togglePanel("contests", true);

    expect(useHamClockStore.getState().panelCollapsed.contests).toBe(false);
  });

  it("preserves the expanded-by-default behavior of existing panels", () => {
    useHamClockStore.getState().togglePanel("bands");

    expect(useHamClockStore.getState().panelCollapsed.bands).toBe(true);
  });
});

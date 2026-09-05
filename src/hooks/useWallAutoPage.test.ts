import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWallAutoPage } from "./useWallAutoPage";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { DEFAULT_SCENES, useKioskStore } from "@/stores/kioskStore";

function resetStores() {
  useHamClockDisplayStore.getState().resetDisplay();
  useKioskStore.setState({
    active: false,
    activeSceneId: null,
    scenes: DEFAULT_SCENES,
  });
}

beforeEach(() => {
  resetStores();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe("useWallAutoPage", () => {
  it("advances both rails' pages every dwellSeconds while enabled", () => {
    renderHook(() => useWallAutoPage());
    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 0,
      right: 0,
    });

    vi.advanceTimersByTime(30_000);
    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 1,
      right: 1,
    });

    vi.advanceTimersByTime(30_000);
    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 2,
      right: 2,
    });
  });

  it("honors a custom dwellSeconds", () => {
    useHamClockDisplayStore.setState({
      autoPage: { enabled: true, dwellSeconds: 15 },
    });
    renderHook(() => useWallAutoPage());

    vi.advanceTimersByTime(14_999);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(0);

    vi.advanceTimersByTime(1);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(1);
  });

  it("never advances when autoPage.enabled is false", () => {
    useHamClockDisplayStore.setState({
      autoPage: { enabled: false, dwellSeconds: 30 },
    });
    renderHook(() => useWallAutoPage());

    vi.advanceTimersByTime(120_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(0);
  });

  it("pauses on a pointerdown, keydown, touchstart or wheel on a rail, and resumes after 60s of quiet", () => {
    const rail = document.createElement("div");
    rail.className = "hc-rail hc-rail-left";
    document.body.appendChild(rail);

    renderHook(() => useWallAutoPage());

    // Touch the rail well before the next dwell tick would fire.
    vi.advanceTimersByTime(20_000);
    fireEvent.pointerDown(rail);

    // The rest of the original dwell period elapses with no advance.
    vi.advanceTimersByTime(20_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(0);

    // Still quiet, but under 60s since the interaction: still paused.
    vi.advanceTimersByTime(39_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(0);

    // 60s of quiet since the interaction: rotation resumes and a fresh
    // dwell period starts.
    vi.advanceTimersByTime(1_000);
    vi.advanceTimersByTime(30_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(1);

    rail.remove();
  });

  it("pauses on interaction with the wall header", () => {
    const header = document.createElement("header");
    header.className = "hc-hdr";
    document.body.appendChild(header);

    renderHook(() => useWallAutoPage());
    fireEvent.keyDown(header, { key: "a" });

    vi.advanceTimersByTime(30_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(0);

    header.remove();
  });

  it("ignores interactions outside the rails and header", () => {
    const other = document.createElement("div");
    other.className = "hc-status";
    document.body.appendChild(other);

    renderHook(() => useWallAutoPage());
    fireEvent.pointerDown(other);

    vi.advanceTimersByTime(30_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(1);

    other.remove();
  });

  it("suspends entirely while a kiosk scene pins a HamClock page", () => {
    useKioskStore.setState({
      active: true,
      activeSceneId: DEFAULT_SCENES[0].id,
      scenes: DEFAULT_SCENES,
    });

    renderHook(() => useWallAutoPage());
    vi.advanceTimersByTime(120_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(0);
  });

  it("removes its listeners and timers on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useWallAutoPage());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
      true,
    );
    expect(removeSpy).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      true,
    );
    expect(removeSpy).toHaveBeenCalledWith(
      "touchstart",
      expect.any(Function),
      true,
    );
    expect(removeSpy).toHaveBeenCalledWith("wheel", expect.any(Function), true);

    // No further advance happens after unmount even though the timer would
    // otherwise have fired.
    vi.advanceTimersByTime(60_000);
    expect(useHamClockDisplayStore.getState().pageIndex.left).toBe(0);
  });
});

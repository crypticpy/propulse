import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRetainedSolarImage } from "./useRetainedSolarImage";

describe("useRetainedSolarImage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops retaining a decoded image at its hard usability limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const hook = renderHook(
      ({ candidate }) =>
        useRetainedSolarImage("solar-product", candidate, candidate, 60_000),
      { initialProps: { candidate: "/first.png" } },
    );

    act(() => hook.result.current.handleVisibleLoad());
    hook.rerender({ candidate: "/next.png" });
    expect(hook.result.current.visibleUrl).toBe("/first.png");
    expect(hook.result.current.probeUrl).toBe("/next.png");

    act(() => vi.advanceTimersByTime(60_001));
    hook.rerender({ candidate: "/next.png" });
    expect(hook.result.current.hasLoadedImage).toBe(false);
    expect(hook.result.current.visibleUrl).toBe("/next.png");
    expect(hook.result.current.probeUrl).toBeNull();

    hook.unmount();
  });
});

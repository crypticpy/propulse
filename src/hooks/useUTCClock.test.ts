import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMapDisplayTime } from "@/hooks/useUTCClock";

afterEach(() => vi.useRealTimers());

describe("useMapDisplayTime", () => {
  // Moved here from the retired HamClockMoonPanel test (#888): the panel is
  // gone, but PropSphere, PropSphereOpsWindow and useWallReliability still
  // depend on this interval/freeze behaviour.
  it("advances live map display time while absolute scenarios stay fixed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T15:00:00Z"));

    const { result, rerender } = renderHook(
      ({ absoluteTime }) => useMapDisplayTime(2, absoluteTime, 60_000),
      { initialProps: { absoluteTime: null as string | null } },
    );
    expect(result.current.toISOString()).toBe("2026-08-31T17:00:00.000Z");

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe("2026-08-31T17:01:00.000Z");

    rerender({ absoluteTime: "2026-09-01T03:00:00.000Z" });
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ingestOperatingMonitorReportForTests,
  OPERATING_MONITOR_STALE_MS,
  resetOperatingMonitorForTests,
  useOperatingMonitor,
} from "./useOperatingMonitor";

describe("useOperatingMonitor", () => {
  beforeEach(() => {
    resetOperatingMonitorForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetOperatingMonitorForTests();
  });

  it("returns the newest live report", () => {
    const now = Date.now();
    ingestOperatingMonitorReportForTests({
      sender: "rig-a",
      band: "40m",
      mode: "CW",
      frequency: 7.03,
      receivedAt: now - 1_000,
    });
    ingestOperatingMonitorReportForTests({
      sender: "rig-b",
      band: "20m",
      mode: "FT8",
      frequency: 14.074,
      receivedAt: now,
    });

    const { result } = renderHook(() => useOperatingMonitor());
    expect(result.current).toMatchObject({
      sender: "rig-b",
      band: "20m",
      mode: "FT8",
    });
  });

  it("drops a live report at the stale deadline without any further store writes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T03:00:00.000Z"));
    ingestOperatingMonitorReportForTests({
      sender: "rig",
      band: "20m",
      mode: "FT8",
      frequency: 14.074,
      receivedAt: Date.now(),
    });

    const { result } = renderHook(() => useOperatingMonitor());
    expect(result.current?.band).toBe("20m");

    act(() => {
      vi.advanceTimersByTime(OPERATING_MONITOR_STALE_MS - 1);
    });
    expect(result.current?.band).toBe("20m");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBeNull();
  });
});

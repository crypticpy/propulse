import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContestContext } from "./useContestContext";
import { getActiveContests, getUpcomingContests } from "@/lib/data/contestCalendar";

vi.mock("@/lib/contest/contestCalendarSync", () => ({ fetchRemoteCalendar: async () => [], mergeCalendars: (entries: unknown[]) => entries }));
vi.mock("@/lib/data/contestCalendar", async (original) => ({
  ...await original<typeof import("@/lib/data/contestCalendar")>(),
  getActiveContests: vi.fn(() => []),
  getUpcomingContests: vi.fn(() => []),
}));
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
describe("contest planning clock", () => {
  it("evaluates the calendar at the supplied planning instant as the live clock advances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T03:00:00Z"));
    const at = "2026-09-12T12:00:00Z";
    renderHook(() => useContestContext(at));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(vi.mocked(getActiveContests).mock.calls.at(-1)![0]?.toISOString()).toBe("2026-09-12T12:00:00.000Z");
    expect(vi.mocked(getUpcomingContests).mock.calls.at(-1)![0]?.toISOString()).toBe("2026-09-12T12:00:00.000Z");
  });
  it("continues using the live clock when no planning instant is supplied", async () => {
    const before = Date.now();
    renderHook(() => useContestContext());
    await waitFor(() => expect(getActiveContests).toHaveBeenCalled());
    expect(vi.mocked(getActiveContests).mock.calls.at(-1)![0]!.getTime()).toBeGreaterThanOrEqual(before);
  });
});

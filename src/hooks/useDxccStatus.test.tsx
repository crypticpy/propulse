import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invalidateDxccCache, useDxccStatus } from "./useDxccStatus";
import { getWorkedDxccSlots } from "@/lib/db/logStore";

vi.mock("@/lib/db/logStore", () => ({ getWorkedDxccSlots: vi.fn(), getLogEntriesByCallsign: vi.fn() }));
vi.mock("@/lib/data/dxccEntities", () => ({
  getActiveDXCCCount: () => 340,
  lookupEntity: () => ({ entity: { id: 291, name: "United States", prefix: "K" } }),
}));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); invalidateDxccCache(); });

it("ignores an in-flight failure after the logger unmounts", async () => {
  vi.useFakeTimers();
  let reject!: (reason: Error) => void;
  vi.mocked(getWorkedDxccSlots).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const view = renderHook(() => useDxccStatus("W1AW", "20m", "CW"));
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(getWorkedDxccSlots).toHaveBeenCalled();
  view.unmount();
  await act(async () => { reject(new Error("Database closed")); });
  expect(error).not.toHaveBeenCalled();
});

it("does not apply a pending result after the callsign is cleared", async () => {
  vi.useFakeTimers();
  let resolve!: (value: { band: string; mode: string }[]) => void;
  vi.mocked(getWorkedDxccSlots).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result, rerender } = renderHook(({ call }) => useDxccStatus(call, "20m", "CW"), { initialProps: { call: "W1AW" } });
  await act(() => vi.advanceTimersByTimeAsync(200));
  rerender({ call: "" });
  invalidateDxccCache();
  await act(async () => { resolve([]); });
  expect(result.current.status).toBeNull();
  expect(result.current.entity).toBeNull();
  // The cancelled read must not refill the cache after an operator logs a QSO.
  rerender({ call: "K1A" });
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(getWorkedDxccSlots).toHaveBeenCalledTimes(2);
});

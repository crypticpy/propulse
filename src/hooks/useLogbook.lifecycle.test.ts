import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { LogEntry } from "@/lib/db/types";
import { getAllLogEntries } from "@/lib/db/logStore";
import { useLogbook } from "./useLogbook";

vi.mock("@/lib/db/logStore", async (original) => ({
  ...await original<typeof import("@/lib/db/logStore")>(),
  getAllLogEntries: vi.fn(),
}));

function deferred() {
  let resolve!: (rows: LogEntry[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<LogEntry[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => vi.mocked(getAllLogEntries).mockReset());

it("does not process a database result after unmount", async () => {
  const read = deferred();
  vi.mocked(getAllLogEntries).mockReturnValue(read.promise);
  const hook = renderHook(() => useLogbook());
  hook.unmount();
  const rows: LogEntry[] = [];
  const sort = vi.spyOn(rows, "sort");
  await act(async () => { read.resolve(rows); await read.promise; });
  expect(sort).not.toHaveBeenCalled();
});

it("ignores a rejected read after unmount", async () => {
  const read = deferred();
  vi.mocked(getAllLogEntries).mockReturnValue(read.promise);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const hook = renderHook(() => useLogbook());
    hook.unmount();
    await act(async () => { read.reject(new Error("late read")); await read.promise.catch(() => {}); });
    expect(log).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

it("keeps the newest refresh when an older read finishes last", async () => {
  const old = deferred(); const fresh = deferred();
  vi.mocked(getAllLogEntries).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const hook = renderHook(() => useLogbook());
  let refreshed!: Promise<void>;
  act(() => { refreshed = hook.result.current.refresh(); });
  const rows = [{ id: "new", callsign: "W1AW", date: "2026-09-12", timeOn: "12:00" }] as LogEntry[];
  await act(async () => { fresh.resolve(rows); await refreshed; });
  await act(async () => { old.resolve([]); await old.promise; });
  expect(hook.result.current.entries).toEqual(rows);
  expect(hook.result.current.loading).toBe(false);
});

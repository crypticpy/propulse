import { beforeEach, expect, it, vi } from "vitest";
import type { LogEntry } from "@/lib/db/types";
import { logbookSync } from "./modules/logbookSync";
import { QSOSyncEngine } from "./syncEngine";
import { summarizeContacts } from "@/lib/hamclock/recentContacts";

const mocks = vi.hoisted(() => ({
  local: new Map<string, LogEntry>(),
  remote: [] as Record<string, unknown>[],
  pushed: [] as Record<string, unknown>[],
  pushError: null as null | { code: string; message: string },
}));
vi.mock("@/lib/db", () => ({ getDB: async () => ({
  getAll: async () => [...mocks.local.values()],
  transaction: () => ({ done: Promise.resolve(), store: {
    get: async (id: string) => mocks.local.get(id),
    put: async (entry: LogEntry) => { mocks.local.set(entry.id, entry); },
    delete: async (id: string) => { mocks.local.delete(id); },
  } }),
}) }));
vi.mock("@/lib/db/logStore", () => ({ notifyLogEntries: vi.fn() }));
vi.mock("./deviceId", () => ({ getDeviceId: () => "test-device" }));
vi.mock("./syncMeta", () => ({ syncMeta: { setTimestamp: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => {
  const chain = {
    select: () => chain, eq: () => chain, gt: () => chain,
    order: () => chain, limit: () => chain, in: () => chain,
    then: (resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: mocks.remote, error: null })),
    upsert: (rows: Record<string, unknown>[]) => {
      mocks.pushed = rows;
      const result = { data: rows, error: mocks.pushError };
      return Object.assign(Promise.resolve(result), { select: () => Promise.resolve(result) });
    },
  };
  return { from: () => chain };
} }));

const entry: LogEntry = {
  id: "qso", callsign: "K1TEST", frequency: 14074.125, mode: "CW", band: "20m",
  date: "2026-09-07", timeOn: "12:00", grid: "PM95", myGrid: "EM38ab12",
  dxcc: 339, createdAt: "2026-09-07T12:00:00Z", updatedAt: "2026-09-07T12:00:00Z",
};
const row = {
  id: entry.id, user_id: "test-user", callsign: entry.callsign, frequency: entry.frequency,
  mode: entry.mode, band: entry.band, date: entry.date, time_on: entry.timeOn,
  grid: entry.grid, my_grid: entry.myGrid, dxcc: entry.dxcc,
  created_at: entry.createdAt, updated_at: entry.updatedAt, version: 2, device_id: "other-device",
};
beforeEach(() => {
  mocks.local.clear(); mocks.remote = []; mocks.pushed = []; mocks.pushError = null;
  new QSOSyncEngine().resetVersion();
});

it.each(["incremental", "versioned"] as const)("preserves metadata through %s push and a new-device pull", async (kind) => {
  mocks.local.set(entry.id, { ...entry });
  const engine = new QSOSyncEngine();
  if (kind === "incremental") await logbookSync.push("test-user");
  else await engine.pushChanges([entry], "test-user");
  expect(mocks.pushed[0]).toMatchObject({ my_grid: "EM38ab12", dxcc: 339, frequency: 14074.125 });
  mocks.remote = [{ ...row, ...mocks.pushed[0], version: 2 }];
  mocks.local.clear(); engine.resetVersion();
  if (kind === "incremental") await logbookSync.pull("test-user", null);
  else await engine.pullAndApply("test-user");
  expect(mocks.local.get(entry.id)).toMatchObject({ myGrid: "EM38ab12", dxcc: 339, grid: "PM95" });
  const summary = summarizeContacts([...mocks.local.values(), { ...entry, id: "other", dxcc: 338 }]);
  expect(summary.bestDx?.km).toBeGreaterThan(9000);
  expect(summary.uniqueDxcc).toBe(2);
});
it.each(["incremental", "versioned"] as const)("keeps missing %s cloud metadata unknown", async (kind) => {
  mocks.remote = [{ ...row, my_grid: null, dxcc: null }];
  if (kind === "incremental") await logbookSync.pull("test-user", null);
  else await new QSOSyncEngine().pullAndApply("test-user");
  expect(mocks.local.get(entry.id)?.myGrid).toBeUndefined();
  expect(mocks.local.get(entry.id)?.dxcc).toBeUndefined();
});
it("does not invent a home-grid conflict when reading a newer matching server row", async () => {
  mocks.remote = [row];
  mocks.pushError = { code: "23505", message: "conflict" };
  const result = await new QSOSyncEngine().pushChanges([{ ...entry, version: 1 }], "test-user");
  expect(result.conflicts).toEqual([]);
});

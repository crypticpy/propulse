import { beforeEach, expect, it, vi } from "vitest";
import type { LogEntry } from "@/lib/db/types";
import { logbookSync } from "./modules/logbookSync";
import { QSOSyncEngine } from "./syncEngine";
import { summarizeContacts } from "@/lib/hamclock/recentContacts";

const mocks = vi.hoisted(() => ({
  local: new Map<string, LogEntry>(),
  remote: [] as Record<string, unknown>[],
  pushed: [] as Record<string, unknown>[],
  repairs: [] as string[][],
  repairError: false,
  onRepair: null as null | (() => void),
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
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from: () => {
  let rows = [...mocks.remote];
  let repair = false;
  const chain = {
    select: () => chain,
    eq: (field: string, value: unknown) => { rows = rows.filter(row => row[field] === value); return chain; },
    gt: (field: string, value: string | number) => { rows = rows.filter(row => (row[field] as string | number) > value); return chain; },
    order: () => chain,
    limit: (count: number) => { rows = rows.slice(0, count); return chain; },
    in: (field: string, values: string[]) => {
      repair = true; mocks.repairs.push(values);
      rows = rows.filter(row => values.includes(row[field] as string)); return chain;
    },
    then: (resolve: (result: { data: Record<string, unknown>[]; error: null | {message:string} }) => unknown) => {
      if (repair) mocks.onRepair?.();
      return Promise.resolve(resolve({ data: rows, error: repair && mocks.repairError ? {message:"offline"} : null }));
    },
    upsert: (pushed: Record<string, unknown>[]) => {
      mocks.pushed = pushed;
      const result = { data: pushed, error: mocks.pushError };
      return Object.assign(Promise.resolve(result), { select: () => Promise.resolve(result) });
    },
  };
  return chain;
} }) }));

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
  localStorage.clear(); mocks.repairs = []; mocks.repairError = false; mocks.onRepair = null;
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


it.each(["incremental", "versioned"] as const)("repairs old %s rows beyond an advanced cursor once per account", async (kind) => {
  mocks.local.set(entry.id, { ...entry, myGrid: undefined, dxcc: undefined, notes: "offline edit", version: 9 });
  mocks.remote = [row];
  localStorage.setItem("propulse-qso-sync-version", "9");
  const pull = () => kind === "incremental"
    ? logbookSync.pull("test-user", "2026-09-08T00:00:00Z")
    : new QSOSyncEngine().pullAndApply("test-user");
  await pull();
  expect(mocks.local.get(entry.id)).toMatchObject({ myGrid: entry.myGrid, dxcc: 339, notes: "offline edit", version: 9, updatedAt: entry.updatedAt });
  expect(localStorage.getItem("propulse-qso-sync-version")).toBe("9");
  await pull();
  expect(mocks.repairs).toHaveLength(1);
});

it("fills missing home grid during a later versioned merge but retains a recorded local grid", async () => {
  localStorage.setItem("propulse-logbook-metadata-v1:test-user", "done");
  mocks.local.set(entry.id, { ...entry, myGrid: undefined, version: 1, notes: "local edit" });
  mocks.remote = [row];
  await new QSOSyncEngine().pullAndApply("test-user");
  expect(mocks.local.get(entry.id)).toMatchObject({ myGrid: entry.myGrid, notes: "local edit", version: 2 });
  mocks.local.set(entry.id, { ...entry, myGrid: "FN31", version: 2 });
  mocks.remote = [{ ...row, version: 3 }];
  await new QSOSyncEngine().pullAndApply("test-user");
  expect(mocks.local.get(entry.id)?.myGrid).toBe("FN31");
});

it("retries failed repairs, preserves in-flight local edits/deletions, and isolates account markers", async () => {
  mocks.local.set(entry.id, { ...entry, myGrid: undefined, dxcc: undefined });
  mocks.remote = [row]; mocks.repairError = true;
  await expect(logbookSync.pull("test-user", "2026-09-08T00:00:00Z")).rejects.toThrow("metadata repair failed");
  mocks.repairError = false;
  mocks.onRepair = () => { mocks.local.set(entry.id, { ...entry, myGrid: "FN31", dxcc: 291, notes: "new edit" }); };
  await logbookSync.pull("test-user", "2026-09-08T00:00:00Z");
  expect(mocks.local.get(entry.id)).toMatchObject({ myGrid: "FN31", dxcc: 291, notes: "new edit" });
  expect(mocks.repairs).toHaveLength(2);
  mocks.local.set(entry.id, { ...entry, myGrid: undefined, dxcc: undefined });
  mocks.remote = [{ ...row, user_id: "second-user" }];
  mocks.onRepair = () => { mocks.local.delete(entry.id); };
  await logbookSync.pull("second-user", "2026-09-08T00:00:00Z");
  expect(mocks.local.has(entry.id)).toBe(false);
  expect(mocks.repairs).toHaveLength(3);
});

it("repairs more than one batch without resurrecting deleted remote entries", async () => {
  for (let i = 0; i < 105; i++) {
    mocks.local.set(String(i), { ...entry, id: String(i), myGrid: undefined, dxcc: undefined });
    mocks.remote.push({ ...row, id: String(i), deleted_at: i === 104 ? entry.updatedAt : null });
  }
  await logbookSync.pull("test-user", "2026-09-08T00:00:00Z");
  expect(mocks.repairs.map(ids => ids.length)).toEqual([100, 5]);
  expect(mocks.local.get("103")?.myGrid).toBe(entry.myGrid);
  expect(mocks.local.get("104")?.myGrid).toBeUndefined();
});

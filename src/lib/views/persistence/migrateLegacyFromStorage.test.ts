import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, expect, it, vi } from "vitest";
import { IndexedViewLibrary } from "./indexedLibrary";
import { migrateLegacyFromStorage } from "./migrateLegacyFromStorage";

const opened: { name: string; library: IndexedViewLibrary }[] = [];
const make = () => {
  const name = crypto.randomUUID();
  const library = new IndexedViewLibrary("owner-a", name);
  opened.push({ name, library });
  return library;
};
const lifecycle = () => ({ signal: new AbortController().signal, isActive: () => true });
afterEach(async () => {
  for (const { name, library } of opened.splice(0)) { await library.close(); await deleteDB(name); }
});

it("seals a complete capture once and returns its original seeds before rereading changed legacy storage", async () => {
  const library = make();
  const local = { getItem: vi.fn((key: string) => key === "propulse-settings" ? JSON.stringify({ state: { textScale: "xl" }, version: 37 }) : null) };
  const session = { getItem: vi.fn(() => null) };
  const first = await migrateLegacyFromStorage(library, { local, session }, { ownerId: "owner-a", mode: "local" }, lifecycle());
  expect(first.status).toBe("migrated");
  expect(await library.list("view")).toHaveLength(4);
  local.getItem.mockImplementation(() => { throw new Error("Storage now unavailable"); });
  local.getItem.mockClear(); session.getItem.mockClear();
  const repeat = await migrateLegacyFromStorage(library, { local, session }, { ownerId: "owner-a", mode: "local" }, lifecycle());
  expect(repeat.status).toBe("existing");
  expect(local.getItem).not.toHaveBeenCalled();
  expect(session.getItem).not.toHaveBeenCalled();
  if (repeat.status === "existing") expect(repeat.journal.plan.views.pro.config.presentation.textScale).toBe("xl");
});

it("retains originals and leaves no completion journal after a read or conversion failure", async () => {
  const library = make();
  const bad = { getItem: () => { throw new Error("Denied"); } };
  const empty = { getItem: () => null };
  expect((await migrateLegacyFromStorage(library, { local: bad, session: empty }, { ownerId: "owner-a", mode: "local" }, lifecycle())).status).toBe("unavailable");
  const profiles = { getItem: (key: string) => key === "propulse-custom-profiles" ? '[{"id":"custom","name":"Custom"}]' : null };
  expect((await migrateLegacyFromStorage(library, { local: profiles, session: empty }, { ownerId: "owner-a", mode: "local" }, lifecycle())).status).toBe("unavailable");
  expect(await library.list()).toEqual([]);
  expect(await library.legacyMigration("device")).toBeNull();
});

it("does not capture after an account change while waiting for the original journal", async () => {
  const library = make();
  let active = true;
  const original = library.legacyMigration.bind(library);
  vi.spyOn(library, "legacyMigration").mockImplementation(async (source) => {
    const journal = await original(source); active = false; return journal;
  });
  const port = { getItem: vi.fn(() => null) };
  expect((await migrateLegacyFromStorage(library, { local: port, session: port }, { ownerId: "owner-a", mode: "account" }, {
    signal: new AbortController().signal, isActive: () => active,
  })).status).toBe("forbidden");
  expect(port.getItem).not.toHaveBeenCalled();
  expect(await library.pending()).toEqual([]);
});

it.each(["local", "account"] as const)("atomically imports named profiles with the four %s family views", async (mode) => {
  const library = make();
  const entries: Record<string, unknown> = {
    "propulse-settings": { version: 37, state: { spotAge: { maxAgeMinutes: 7 } } },
    "propulse-custom-profiles": [{ id: "my-ssb", name: "My SSB", spotFilters: { bands: ["20m"], modes: ["USB"] } }],
  };
  const local = { getItem: vi.fn((key: string) => key in entries ? JSON.stringify(entries[key]) : null) };
  const result = await migrateLegacyFromStorage(library, { local, session: { getItem: () => null } }, { ownerId: "owner-a", mode }, lifecycle());
  expect(result.status).toBe("migrated");
  const journal = await library.legacyMigration("device");
  expect(journal?.plan.presets[0]).toMatchObject({ id: "my-ssb", kind: "display", config: { spots: { filters: { maxAgeMinutes: 7, modes: { modes: ["SSB"] } } } } });
  expect(await library.list()).toHaveLength(mode === "local" ? 5 : 0);
  expect(await library.pending()).toHaveLength(mode === "account" ? 5 : 0);
  local.getItem.mockImplementation(() => { throw new Error("Must reuse sealed journal"); });
  expect((await migrateLegacyFromStorage(library, { local, session: { getItem: () => null } }, { ownerId: "owner-a", mode }, lifecycle())).status).toBe("existing");
});

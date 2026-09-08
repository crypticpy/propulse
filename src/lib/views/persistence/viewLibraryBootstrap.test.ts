import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, expect, it, vi } from "vitest";
import { IndexedViewLibrary } from "./indexedLibrary";
import { bootstrapViewLibrary } from "./viewLibraryBootstrap";

const opened: IndexedViewLibrary[] = [];
const names = new Set<string>();
const make = (owner = "owner-a", name = crypto.randomUUID()) => {
  const library = new IndexedViewLibrary(owner, name);
  names.add(name); opened.push(library);
  return { library, name };
};
const lifecycle = () => ({ signal: new AbortController().signal, isActive: () => true });
const readers = () => ({ local: { getItem: vi.fn(() => null) }, session: { getItem: vi.fn(() => null) } });
const options = { ownerId: "owner-a", mode: "local" as const };
afterEach(async () => {
  for (const library of opened.splice(0)) await library.close();
  for (const name of names) await deleteDB(name);
  names.clear(); vi.restoreAllMocks();
});

it("prepares four family seeds once and reuses the journal without rereading legacy storage", async () => {
  const { library } = make(); const ports = readers();
  expect(await bootstrapViewLibrary(library, ports, options, lifecycle())).toEqual({ status: "ready", migration: "migrated" });
  expect(await library.list("view")).toHaveLength(4);
  ports.local.getItem.mockReset().mockImplementation(() => { throw new Error("Must not reread"); });
  ports.session.getItem.mockClear();
  expect(await bootstrapViewLibrary(library, ports, options, lifecycle())).toEqual({ status: "ready", migration: "existing" });
  expect(ports.local.getItem).not.toHaveBeenCalled(); expect(ports.session.getItem).not.toHaveBeenCalled();
});

it("leaves another owner's device capture alone without reading storage or creating account records", async () => {
  const first = make();
  await bootstrapViewLibrary(first.library, readers(), options, lifecycle());
  const { library } = make("owner-b", first.name); const ports = readers();
  expect(await bootstrapViewLibrary(library, ports, { ownerId: "owner-b", mode: "account" }, lifecycle())).toEqual({ status: "ready", migration: "other-owner" });
  expect(ports.local.getItem).not.toHaveBeenCalled(); expect(ports.session.getItem).not.toHaveBeenCalled();
  expect(await library.list()).toEqual([]); expect(await library.pending()).toEqual([]);
});

it("does not mark a same-owner mode conflict ready", async () => {
  const { library } = make();
  await bootstrapViewLibrary(library, readers(), options, lifecycle());
  const ports = readers();
  expect(await bootstrapViewLibrary(library, ports, { ...options, mode: "account" }, lifecycle())).toMatchObject({ status: "unavailable" });
  expect(ports.local.getItem).not.toHaveBeenCalled(); expect(await library.pending()).toEqual([]);
});

it("keeps capture and query failures unavailable without creating a journal", async () => {
  const { library } = make(); const ports = readers();
  ports.local.getItem.mockImplementation(() => { throw new Error("Denied"); });
  expect(await bootstrapViewLibrary(library, ports, options, lifecycle())).toMatchObject({ status: "unavailable" });
  expect(await library.legacyMigration("device")).toBeNull();
  vi.spyOn(library, "deviceMigrationOwner").mockRejectedValue(new Error("IDB denied"));
  ports.local.getItem.mockClear();
  expect(await bootstrapViewLibrary(library, ports, options, lifecycle())).toMatchObject({ status: "unavailable" });
  expect(ports.local.getItem).not.toHaveBeenCalled();
});

it.each(["invalid", "conflict", "unavailable"] as const)("does not treat a same-owner %s migration result as ready", async (status) => {
  const { library } = make();
  vi.spyOn(library, "migrateLegacy").mockResolvedValue({ status, message: "Migration failed" });
  expect(await bootstrapViewLibrary(library, readers(), options, lifecycle())).toEqual({ status: "unavailable", message: "Migration failed" });
});

it("rejects an ended session before querying and mismatched owner before capture", async () => {
  const { library } = make(); const ports = readers();
  const query = vi.spyOn(library, "deviceMigrationOwner");
  const controller = new AbortController(); controller.abort();
  expect(await bootstrapViewLibrary(library, ports, options, { signal: controller.signal, isActive: () => true })).toMatchObject({ status: "forbidden" });
  expect(await bootstrapViewLibrary(library, ports, { ...options, ownerId: "owner-b" }, lifecycle())).toMatchObject({ status: "forbidden" });
  expect(query).not.toHaveBeenCalled(); expect(ports.local.getItem).not.toHaveBeenCalled();
});

it("checks lifecycle after the owner query before allowing even a foreign-owner result", async () => {
  const { library } = make(); const ports = readers(); const controller = new AbortController();
  vi.spyOn(library, "deviceMigrationOwner").mockImplementation(async () => { controller.abort(); return "owner-b"; });
  expect(await bootstrapViewLibrary(library, ports, options, { signal: controller.signal, isActive: () => true })).toMatchObject({ status: "forbidden" });
  expect(ports.local.getItem).not.toHaveBeenCalled();
});

it("checks lifecycle after a successful asynchronous migration before returning ready", async () => {
  const { library } = make(); const ports = readers(); let active = true;
  const migrate = library.migrateLegacy.bind(library);
  vi.spyOn(library, "migrateLegacy").mockImplementation(async (...args) => {
    const result = await migrate(...args); active = false; return result;
  });
  expect(await bootstrapViewLibrary(library, ports, options, { signal: new AbortController().signal, isActive: () => active })).toMatchObject({ status: "forbidden" });
});

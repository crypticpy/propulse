import { describe, expect, it, vi } from "vitest";
import { createDisplayAssignmentFixture } from "../fixtures";
import { createViewConfiguration } from "../defaults";
import { getDisplayRecipe } from "../presets";
import {
  decodeViewLibraryBackup,
  encodeViewLibraryBackup,
  VIEW_LIBRARY_BACKUP_KIND,
  VIEW_LIBRARY_BACKUP_LIMIT_BYTES,
  VIEW_LIBRARY_BACKUP_MAX_ITEMS,
  VIEW_LIBRARY_BACKUP_VERSION,
} from "./backupCodec";
import { viewDraftSchema, type LibraryValue, type ViewDraft } from "./schema";

const exportedAt = "2026-09-07T00:00:00.000Z";
function viewSnapshot(id = "station", family: "pro" | "hamclock" = "pro"): Extract<LibraryValue, { kind: "view" }> {
  const config = createViewConfiguration(family);
  if (family === "hamclock") {
    config.presentation.hamclock.widgets = [{ tileId: "recentContacts", schemaVersion: 1, config: { rowCount: 3 } }];
  }
  const data = viewDraftSchema.parse({ id, name: id === "station" ? "Station" : id, schemaVersion: 1, sourcePreset: null, config });
  return { kind: "view", data };
}
function spyIsolation() {
  return {
    getItem: vi.spyOn(Storage.prototype, "getItem"),
    setItem: vi.spyOn(Storage.prototype, "setItem"),
    fetch: vi.spyOn(globalThis, "fetch"),
  };
}

describe("portable view-library backup codec", () => {
  it("roundtrips a complete view and display-kind preset without owner IDs, revisions or TV assignments", () => {
    const spies = spyIsolation();
    const view = viewSnapshot("station", "hamclock");
    const preset: Extract<LibraryValue, { kind: "preset" }> = { kind: "preset", data: getDisplayRecipe("display-station-v1") };
    const record = {
      ownerId: "owner-a", kind: "view" as const, id: "station", revision: 9,
      value: view,
    };
    const display = { kind: "display" as const, data: createDisplayAssignmentFixture() };
    const original = structuredClone([record, preset, display]);
    const encoded = encodeViewLibraryBackup([record, preset, display], { exportedAt });
    expect(encoded.status).toBe("ok");
    if (encoded.status !== "ok") throw new Error("encode");
    expect([record, preset, display]).toEqual(original);
    expect(encoded.warnings.some((warning) => warning.includes("Display assignments"))).toBe(true);
    expect(encoded.value).not.toContain("owner-a");
    expect(encoded.value).not.toContain("\"revision\":9");
    expect(JSON.parse(encoded.value).kind).toBe(VIEW_LIBRARY_BACKUP_KIND);
    expect(JSON.parse(encoded.value).version).toBe(VIEW_LIBRARY_BACKUP_VERSION);
    record.value.data.name = "Mutated input";
    preset.data.name = "Mutated preset";
    const decoded = decodeViewLibraryBackup(encoded.value);
    expect(decoded.status).toBe("ok");
    if (decoded.status !== "ok") throw new Error("decode");
    expect(decoded.value.views).toHaveLength(1);
    expect(decoded.value.views[0]).toMatchObject({ id: "station", name: "Station", schemaVersion: 1 });
    expect(decoded.value.views[0].config.presentation.hamclock.widgets).toEqual([
      { tileId: "recentContacts", schemaVersion: 1, config: { rowCount: 3 } },
    ]);
    expect(decoded.value.presets).toEqual([getDisplayRecipe("display-station-v1")]);
    expect(decoded.value.views[0]).not.toHaveProperty("ownerId");
    expect(decoded.value.views[0]).not.toHaveProperty("revision");
    decoded.value.views[0].name = "Mutated output";
    expect(JSON.parse(encoded.value).views[0].name).toBe("Station");
    expect(spies.getItem).not.toHaveBeenCalled();
    expect(spies.setItem).not.toHaveBeenCalled();
    expect(spies.fetch).not.toHaveBeenCalled();
    spies.getItem.mockRestore();
    spies.setItem.mockRestore();
    spies.fetch.mockRestore();
  });

  it("rejects unknown widgets, duplicate IDs, mismatched IDs and future versions", () => {
    const badWidget = viewSnapshot();
    badWidget.data.config.presentation.hamclock.widgets = [
      { tileId: "unsupportedWidget", schemaVersion: 1, config: { strange: true } },
    ];
    expect(encodeViewLibraryBackup([badWidget], { exportedAt }).status).toBe("invalid");
    const duplicate = encodeViewLibraryBackup([viewSnapshot("station"), viewSnapshot("station")], { exportedAt });
    expect(duplicate).toMatchObject({ status: "invalid", message: "Duplicate view ID" });
    const mismatched = encodeViewLibraryBackup([{
      ownerId: "owner-a", kind: "view", id: "other", revision: 1, value: viewSnapshot("station"),
    }], { exportedAt });
    expect(mismatched.status).toBe("invalid");
    const valid = encodeViewLibraryBackup([viewSnapshot()], { exportedAt });
    if (valid.status !== "ok") throw new Error("encode");
    const future = JSON.parse(valid.value);
    future.version = VIEW_LIBRARY_BACKUP_VERSION + 1;
    expect(decodeViewLibraryBackup(future)).toMatchObject({
      status: "invalid",
      message: expect.stringContaining("Incompatible backup version"),
    });
    expect(decodeViewLibraryBackup("{not json")).toMatchObject({ status: "invalid", message: "Invalid JSON" });
  });

  it("fails closed on byte and collection bounds", () => {
    const tooMany: ViewDraft[] = Array.from({ length: VIEW_LIBRARY_BACKUP_MAX_ITEMS + 1 }, (_, n) => viewSnapshot(`view-${n}`).data);
    expect(encodeViewLibraryBackup(tooMany.map((data) => ({ kind: "view" as const, data })), { exportedAt }).status).toBe("invalid");
    const oversized = "x".repeat(VIEW_LIBRARY_BACKUP_LIMIT_BYTES + 1);
    expect(decodeViewLibraryBackup(oversized)).toMatchObject({ status: "invalid", message: "Backup exceeds 2 MiB" });
  });

  it("rejects prototype keys, getters and credential fields without executing accessors", () => {
    const getter = {
      appName: "propulse",
      kind: VIEW_LIBRARY_BACKUP_KIND,
      version: 1,
      exportedAt,
      views: [],
      presets: [],
      get password() { throw new Error("getter ran"); },
    };
    expect(decodeViewLibraryBackup(getter)).toMatchObject({ status: "invalid" });
    const proto = JSON.parse(JSON.stringify({
      appName: "propulse", kind: VIEW_LIBRARY_BACKUP_KIND, version: 1, exportedAt, views: [], presets: [],
    }));
    Object.defineProperty(proto, "__proto__", { value: { polluted: true }, enumerable: true });
    expect(decodeViewLibraryBackup(proto).status).toBe("invalid");
    const secret = encodeViewLibraryBackup([viewSnapshot()], { exportedAt });
    if (secret.status !== "ok") throw new Error("encode");
    const parsed = JSON.parse(secret.value);
    parsed.accessToken = "stolen";
    expect(decodeViewLibraryBackup(parsed).status).toBe("invalid");
  });

  it("omits tombstones and pending operations rather than restoring them as drafts", () => {
    const tombstone = { ownerId: "owner-a", kind: "view" as const, id: "gone", revision: 2, value: null };
    const pending = { operationId: "op-1", ownerId: "owner-a", kind: "view", id: "queued", expectedRevision: 1, value: viewSnapshot("queued") };
    const encoded = encodeViewLibraryBackup([tombstone, pending, viewSnapshot()], { exportedAt });
    expect(encoded.status).toBe("ok");
    if (encoded.status !== "ok") throw new Error("encode");
    expect(JSON.parse(encoded.value).views.map((view: { id: string }) => view.id)).toEqual(["station"]);
    expect(encoded.warnings.some((warning) => warning.includes("Tombstones"))).toBe(true);
    expect(encoded.warnings.some((warning) => warning.includes("Pending"))).toBe(true);
  });
});

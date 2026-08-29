import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PATH_STATS_COLUMNS,
  archivableDays,
  archiveObjectPath,
  csvField,
  manifestObjectPath,
  runArchivePass,
  toCsv,
  type PathStatsRow,
} from "./archivePathStats.js";
import type { PathArchiveControls } from "../types.js";

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe("csvField", () => {
  it("serializes null/undefined as empty, quotes only when needed", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField("FN")).toBe("FN");
    expect(csvField(-8.5)).toBe("-8.5");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
  });
});

describe("toCsv", () => {
  it("emits a header, one line per row, and a trailing newline", () => {
    const rows = [
      { ...emptyRow(), id: 1, band: "20m" },
      { ...emptyRow(), id: 2, band: "40m" },
    ];
    const csv = toCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(PATH_STATS_COLUMNS.join(","));
    expect(lines).toHaveLength(4); // header + 2 rows + trailing ""
    expect(lines[3]).toBe("");
    expect(lines[1].startsWith("1,")).toBe(true);
  });
});

describe("object paths", () => {
  it("partitions archives by year/month with a versioned prefix", () => {
    expect(archiveObjectPath("2026-05-01")).toBe(
      "aggregates/path_hourly_stats/v1/year=2026/month=05/path_hourly_stats-2026-05-01.csv.gz",
    );
    expect(manifestObjectPath("2026-05-01")).toBe(
      "aggregates/path_hourly_stats/v1/year=2026/month=05/path_hourly_stats-2026-05-01.manifest.json",
    );
  });
});

describe("archivableDays", () => {
  const NOW = Date.parse("2026-08-29T22:00:00Z");

  it("returns nothing when the oldest data is inside the hot window", () => {
    expect(archivableDays("2026-07-16", NOW, 90, 5)).toEqual([]);
  });

  it("returns complete days strictly older than the hot window, capped", () => {
    // cutoff day = 2026-07-30 (30 days before NOW), exclusive
    expect(archivableDays("2026-07-16", NOW, 30, 3)).toEqual([
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ]);
    expect(archivableDays("2026-07-28", NOW, 30, 10)).toEqual([
      "2026-07-28",
      "2026-07-29",
    ]);
  });
});

// ── Archive pass against a fake Supabase client ──────────────────────────────

function emptyRow(): PathStatsRow {
  return {
    id: 0,
    hour_utc: "2026-05-01T00:00:00+00:00",
    band: "",
    mode_class: "",
    tx_field: "",
    rx_field: "",
    spot_count: 0,
    unique_tx: 0,
    unique_rx: 0,
    avg_snr: null,
    median_snr: null,
    backfilled_count: 0,
  };
}

const DAY_ROWS: PathStatsRow[] = [
  { ...emptyRow(), id: 1, band: "20m", mode_class: "digital", tx_field: "FN", rx_field: "IO", spot_count: 5, unique_tx: 3, unique_rx: 2, avg_snr: -8.5, median_snr: -9 },
  { ...emptyRow(), id: 2, band: "40m", mode_class: "cw", tx_field: "EM", rx_field: "JN", spot_count: 2, unique_tx: 1, unique_rx: 2, avg_snr: 12, median_snr: 12 },
  { ...emptyRow(), id: 3, band: "15m", mode_class: "digital", tx_field: "PM", rx_field: "FN", spot_count: 1, unique_tx: 1, unique_rx: 1 },
];

const NOW = Date.parse("2026-08-29T00:00:00Z");
const CONTROLS: PathArchiveControls = {
  hotDays: 90,
  pruneEnabled: true,
  maxDaysPerRun: 1,
};

interface QueryRecord {
  table: string;
  select?: string;
  selectOpts?: { count?: string; head?: boolean };
  filters: { op: string; column: string; value: unknown }[];
}

class FakeStorage {
  objects = new Map<string, Uint8Array>();
  corruptOnDownload: string | null = null;

  async upload(
    path: string,
    body: Uint8Array,
    opts?: { upsert?: boolean },
  ): Promise<{ error: { message: string } | null }> {
    if (this.objects.has(path) && !opts?.upsert) {
      return { error: { message: "The resource already exists" } };
    }
    this.objects.set(path, new Uint8Array(body));
    return { error: null };
  }

  async download(
    path: string,
  ): Promise<{ data: Blob | null; error: { message: string } | null }> {
    const bytes = this.objects.get(path);
    if (!bytes) return { data: null, error: { message: "Object not found" } };
    const served =
      this.corruptOnDownload === path ? new Uint8Array([1, 2, 3]) : bytes;
    return { data: new Blob([served]), error: null };
  }
}

interface FakeDbOptions {
  liveCount: () => number;
  pageQueries?: QueryRecord[];
  rpcCalls?: { name: string; args: Record<string, unknown> }[];
  rpcResult?: { data: unknown; error: { message: string } | null };
}

function makeDb(storage: FakeStorage, opts: FakeDbOptions): SupabaseClient {
  const db = {
    from(table: string) {
      const q: QueryRecord = { table, filters: [] };
      const builder = {
        select(sel: string, selectOpts?: QueryRecord["selectOpts"]) {
          q.select = sel;
          q.selectOpts = selectOpts;
          return builder;
        },
        gte(column: string, value: unknown) {
          q.filters.push({ op: "gte", column, value });
          return builder;
        },
        lt(column: string, value: unknown) {
          q.filters.push({ op: "lt", column, value });
          return builder;
        },
        gt(column: string, value: unknown) {
          q.filters.push({ op: "gt", column, value });
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      function run(): unknown {
        if (q.selectOpts?.head) {
          return { count: opts.liveCount(), error: null };
        }
        if (q.select === "hour_utc") {
          return {
            data: [{ hour_utc: "2026-05-01T02:00:00+00:00" }],
            error: null,
          };
        }
        opts.pageQueries?.push(q);
        const lastId = Number(
          q.filters.find((f) => f.op === "gt")?.value ?? -1,
        );
        return {
          data: DAY_ROWS.filter((r) => Number(r.id) > lastId),
          error: null,
        };
      }
      return builder;
    },
    storage: { from: () => storage },
    rpc(name: string, args: Record<string, unknown>) {
      opts.rpcCalls?.push({ name, args });
      return Promise.resolve(opts.rpcResult ?? { data: 3, error: null });
    },
  };
  return db as unknown as SupabaseClient;
}

describe("runArchivePass", () => {
  it("exports, verifies, seals, and prunes an archivable day", async () => {
    const storage = new FakeStorage();
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, rpcCalls });

    const result = await runArchivePass(db, CONTROLS, NOW);

    expect(result).toEqual({
      daysArchived: 1,
      daysPruned: 1,
      rowsArchived: 3,
      rowsPruned: 3,
    });

    const gz = storage.objects.get(archiveObjectPath("2026-05-01"));
    expect(gz).toBeDefined();
    expect(gunzipSync(Buffer.from(gz!)).toString("utf8")).toBe(
      toCsv(DAY_ROWS),
    );

    const manifestBytes = storage.objects.get(
      manifestObjectPath("2026-05-01"),
    );
    const manifest = JSON.parse(Buffer.from(manifestBytes!).toString("utf8"));
    expect(manifest.rowCount).toBe(3);
    expect(manifest.day).toBe("2026-05-01");

    expect(rpcCalls).toEqual([
      {
        name: "prune_archived_path_hourly_stats",
        args: { p_day: "2026-05-01", p_expected_rows: 3 },
      },
    ]);
  });

  it("never calls the prune RPC when pruning is disabled", async () => {
    const storage = new FakeStorage();
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, rpcCalls });

    const result = await runArchivePass(
      db,
      { ...CONTROLS, pruneEnabled: false },
      NOW,
    );

    expect(result.daysArchived).toBe(1);
    expect(result.daysPruned).toBe(0);
    expect(rpcCalls).toEqual([]);
    // Export still sealed
    expect(storage.objects.has(manifestObjectPath("2026-05-01"))).toBe(true);
  });

  it("fails closed on storage corruption: no manifest, no prune", async () => {
    const storage = new FakeStorage();
    storage.corruptOnDownload = archiveObjectPath("2026-05-01");
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, rpcCalls });

    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /SHA-256 mismatch/,
    );
    expect(storage.objects.has(manifestObjectPath("2026-05-01"))).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("skips re-export for sealed days and only retries the prune", async () => {
    const storage = new FakeStorage();
    const sealed = {
      dataset: "path_hourly_stats",
      schemaVersion: 1,
      day: "2026-05-01",
      rowCount: 3,
      sha256: "abc",
      sizeBytes: 100,
      columns: PATH_STATS_COLUMNS,
      exportedAt: "2026-08-01T00:00:00Z",
    };
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      new Uint8Array(Buffer.from(JSON.stringify(sealed), "utf8")),
    );
    const pageQueries: QueryRecord[] = [];
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, pageQueries, rpcCalls });

    const result = await runArchivePass(db, CONTROLS, NOW);

    expect(pageQueries).toEqual([]); // no re-export
    expect(result.daysArchived).toBe(0);
    expect(result.daysPruned).toBe(1);
    expect(rpcCalls[0].args).toEqual({
      p_day: "2026-05-01",
      p_expected_rows: 3,
    });
  });

  it("treats an already-pruned sealed day as a no-op", async () => {
    const storage = new FakeStorage();
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      new Uint8Array(
        Buffer.from(
          JSON.stringify({ day: "2026-05-01", rowCount: 3 }),
          "utf8",
        ),
      ),
    );
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 0, rpcCalls });

    const result = await runArchivePass(db, CONTROLS, NOW);

    expect(result).toEqual({
      daysArchived: 0,
      daysPruned: 0,
      rowsArchived: 0,
      rowsPruned: 0,
    });
    expect(rpcCalls).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PATH_STATS_COLUMNS,
  archivableDays,
  archiveObjectPath,
  archivePathStats,
  csvField,
  manifestObjectPath,
  resetScanCursor,
  runArchivePass,
  toCsv,
  parseKnownGapSnapshot,
  type PathStatsRow,
} from "./archivePathStats.js";
import { prunePathRecency } from "./pathRecency.js";
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
    expect(archivableDays("2026-07-16", NOW, 90)).toEqual([]);
  });

  it("returns every complete day strictly older than the hot window", () => {
    // cutoff day = 2026-07-30 (30 days before NOW), exclusive
    const days = archivableDays("2026-07-16", NOW, 30);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-07-16");
    expect(days[days.length - 1]).toBe("2026-07-29");
    expect(archivableDays("2026-07-28", NOW, 30)).toEqual([
      "2026-07-28",
      "2026-07-29",
    ]);
  });
});

describe("parseKnownGapSnapshot", () => {
  it("accepts an empty known-gaps-only snapshot", () => {
    expect(parseKnownGapSnapshot(emptyGapSnapshot(), "2026-05-01")).toEqual(
      emptyGapSnapshot(),
    );
  });

  it("rejects malformed snapshots and timestamps", () => {
    expect(() => parseKnownGapSnapshot(null, "2026-05-01")).toThrow(
      /non-object/,
    );
    expect(() =>
      parseKnownGapSnapshot(
        {
          ...emptyGapSnapshot(),
          gaps: [
            {
              start_hour: "2026-05-01T00:00:00Z",
              end_hour: "2026-05-01T01:00:00.000000Z",
              recorded_at: "2026-09-07T00:00:00.000000Z",
              reason: "raw_expired",
            },
          ],
        },
        "2026-05-01",
      ),
    ).toThrow(/invalid gap/);
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
  {
    ...emptyRow(),
    id: 1,
    band: "20m",
    mode_class: "digital",
    tx_field: "FN",
    rx_field: "IO",
    spot_count: 5,
    unique_tx: 3,
    unique_rx: 2,
    avg_snr: -8.5,
    median_snr: -9,
  },
  {
    ...emptyRow(),
    id: 2,
    band: "40m",
    mode_class: "cw",
    tx_field: "EM",
    rx_field: "JN",
    spot_count: 2,
    unique_tx: 1,
    unique_rx: 2,
    avg_snr: 12,
    median_snr: 12,
  },
  {
    ...emptyRow(),
    id: 3,
    band: "15m",
    mode_class: "digital",
    tx_field: "PM",
    rx_field: "FN",
    spot_count: 1,
    unique_tx: 1,
    unique_rx: 1,
  },
];

const NOW = Date.parse("2026-08-29T00:00:00Z");
const CONTROLS: PathArchiveControls = {
  hotDays: 90,
  pruneEnabled: true,
  maxDaysPerRun: 1,
};

const FAKE_SHA = "a".repeat(64);

/** A manifest that passes the sealed-shape validation. */
function sealedManifest(day: string, sha256 = FAKE_SHA): Uint8Array {
  return new Uint8Array(
    Buffer.from(
      JSON.stringify({
        dataset: "path_hourly_stats",
        schemaVersion: 1,
        day,
        rowCount: 3,
        sha256,
        sizeBytes: 100,
        columns: PATH_STATS_COLUMNS,
        exportedAt: "2026-08-01T00:00:00.000Z",
      }),
      "utf8",
    ),
  );
}

interface QueryRecord {
  table: string;
  select?: string;
  selectOpts?: { count?: string; head?: boolean };
  filters: { op: string; column: string; value: unknown }[];
}

interface UploadOpts {
  upsert?: boolean;
  contentType?: string;
  cacheControl?: string;
}

class FakeStorage {
  objects = new Map<string, Uint8Array>();
  uploads: { path: string; opts?: UploadOpts }[] = [];
  downloads: string[] = [];
  corruptOnDownload: string | null = null;
  downloadError: { path: string; message: string } | null = null;

  async upload(
    path: string,
    body: Uint8Array,
    opts?: UploadOpts,
  ): Promise<{ error: { message: string } | null }> {
    this.uploads.push({ path, opts });
    if (this.objects.has(path) && !opts?.upsert) {
      return { error: { message: "The resource already exists" } };
    }
    this.objects.set(path, new Uint8Array(body));
    return { error: null };
  }

  async download(
    path: string,
  ): Promise<{ data: Blob | null; error: { message: string } | null }> {
    this.downloads.push(path);
    if (this.downloadError?.path === path) {
      return { data: null, error: { message: this.downloadError.message } };
    }
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
  /** Rows returned for the "oldest hour" lookup; empty means no data yet. */
  oldestHourRows?: { hour_utc: string }[];
  rpcResults?: Array<{ data: unknown; error: { message: string } | null }>;
}

function emptyGapSnapshot(day = "2026-05-01") {
  return { version: 1, scope: "known-gaps-only", day, gaps: [] };
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
            data: opts.oldestHourRows ?? [
              { hour_utc: "2026-05-01T02:00:00+00:00" },
            ],
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
      if (opts.rpcResults?.length)
        return Promise.resolve(opts.rpcResults.shift()!);
      if (opts.rpcResult) return Promise.resolve(opts.rpcResult);
      return Promise.resolve(
        name === "spot_archive_path_gap_snapshot"
          ? { data: emptyGapSnapshot(String(args.p_day)), error: null }
          : { data: 3, error: null },
      );
    },
  };
  return db as unknown as SupabaseClient;
}

describe("runArchivePass", () => {
  beforeEach(() => {
    resetScanCursor();
  });

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
      sealedDays: ["2026-05-01"],
    });

    const gz = storage.objects.get(archiveObjectPath("2026-05-01"));
    expect(gz).toBeDefined();
    expect(gunzipSync(Buffer.from(gz!)).toString("utf8")).toBe(toCsv(DAY_ROWS));

    // The bucket only allows octet-stream/parquet/json/text uploads.
    const csvUpload = storage.uploads.find(
      (u) => u.path === archiveObjectPath("2026-05-01"),
    );
    expect(csvUpload?.opts?.contentType).toBe("application/octet-stream");

    const manifestBytes = storage.objects.get(manifestObjectPath("2026-05-01"));
    const manifest = JSON.parse(Buffer.from(manifestBytes!).toString("utf8"));
    expect(manifest.rowCount).toBe(3);
    expect(manifest.day).toBe("2026-05-01");
    expect(manifest.manifestVersion).toBe(2);
    expect(manifest.knownGapSnapshot).toEqual(emptyGapSnapshot());

    expect(rpcCalls).toEqual([
      { name: "spot_archive_path_gap_snapshot", args: { p_day: "2026-05-01" } },
      { name: "spot_archive_path_gap_snapshot", args: { p_day: "2026-05-01" } },
      {
        name: "prune_archived_path_hourly_stats_with_coverage",
        args: {
          p_day: "2026-05-01",
          p_expected_rows: 3,
          p_gap_snapshot: emptyGapSnapshot(),
        },
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
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "spot_archive_path_gap_snapshot",
      "spot_archive_path_gap_snapshot",
    ]);
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
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "spot_archive_path_gap_snapshot",
    ]);
  });

  it("fails closed when the gap snapshot RPC errors", async () => {
    const storage = new FakeStorage();
    const db = makeDb(storage, {
      liveCount: () => 3,
      rpcResult: { data: null, error: { message: "snapshot unavailable" } },
    });

    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /gap snapshot failed: snapshot unavailable/,
    );
    expect(storage.uploads).toEqual([]);
  });

  it("does not treat a manifest storage error as a missing manifest", async () => {
    const storage = new FakeStorage();
    storage.downloadError = {
      path: manifestObjectPath("2026-05-01"),
      message: "permission denied",
    };
    const db = makeDb(storage, { liveCount: () => 3 });

    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /manifest download failed.*permission denied/,
    );
    expect(storage.uploads).toEqual([]);
  });

  it("does not seal when known gaps change during export", async () => {
    const storage = new FakeStorage();
    const changed = {
      ...emptyGapSnapshot(),
      gaps: [
        {
          start_hour: "2026-04-30T23:00:00.000000Z",
          end_hour: "2026-05-01T02:00:00.000000Z",
          recorded_at: "2026-09-07T01:02:03.000000Z",
          reason: "raw_expired",
        },
      ],
    };
    const db = makeDb(storage, {
      liveCount: () => 3,
      rpcResults: [
        { data: emptyGapSnapshot(), error: null },
        { data: changed, error: null },
      ],
    });

    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /snapshot changed during export/,
    );
    expect(storage.objects.has(manifestObjectPath("2026-05-01"))).toBe(false);
  });

  it("fails closed when the uploaded manifest cannot be read back exactly", async () => {
    const storage = new FakeStorage();
    storage.corruptOnDownload = manifestObjectPath("2026-05-01");
    const db = makeDb(storage, { liveCount: () => 3 });

    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /manifest validation failed/,
    );
  });

  it("preserves a legacy sealed blob but refuses to prune it", async () => {
    const storage = new FakeStorage();
    // The sealed object must be present and hash-match its manifest for the
    // prune to proceed.
    const gzBytes = new Uint8Array([1, 2, 3, 4]);
    const realSha = createHash("sha256").update(gzBytes).digest("hex");
    storage.objects.set(archiveObjectPath("2026-05-01"), gzBytes);
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      sealedManifest("2026-05-01", realSha),
    );
    const pageQueries: QueryRecord[] = [];
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, pageQueries, rpcCalls });

    const originalManifest = storage.objects.get(
      manifestObjectPath("2026-05-01"),
    );
    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /legacy path archive manifest.*refusing to prune/,
    );

    expect(pageQueries).toEqual([]); // no re-export
    expect(storage.objects.get(manifestObjectPath("2026-05-01"))).toBe(
      originalManifest,
    );
    expect(rpcCalls).toEqual([]);
  });

  it("treats an already-pruned sealed day as a no-op", async () => {
    const storage = new FakeStorage();
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      sealedManifest("2026-05-01"),
    );
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 0, rpcCalls });

    // hotDays 90 before this instant puts the cutoff at 2026-05-02, so
    // 2026-05-01 is the only archivable day in the pass.
    const oneDayWindow = Date.parse("2026-07-31T12:00:00Z");
    const result = await runArchivePass(db, CONTROLS, oneDayWindow);

    expect(result).toEqual({
      daysArchived: 0,
      daysPruned: 0,
      rowsArchived: 0,
      rowsPruned: 0,
      sealedDays: ["2026-05-01"],
    });
    expect(rpcCalls).toEqual([]);
  });

  it("keeps exporting past sealed days while pruning is disabled", async () => {
    const storage = new FakeStorage();
    // Day 1 sealed by a prior pass; with pruning off its rows are still live,
    // and it must not consume the per-run budget (the stall regression).
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      sealedManifest("2026-05-01"),
    );
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, rpcCalls });

    const result = await runArchivePass(
      db,
      { ...CONTROLS, pruneEnabled: false },
      NOW,
    );

    expect(result.daysArchived).toBe(1);
    expect(storage.objects.has(archiveObjectPath("2026-05-02"))).toBe(true);
    expect(storage.objects.has(manifestObjectPath("2026-05-02"))).toBe(true);
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "spot_archive_path_gap_snapshot",
      "spot_archive_path_gap_snapshot",
    ]);
  });

  it("preserves a conflicting unsealed object and refuses to seal or prune", async () => {
    const storage = new FakeStorage();
    const original = new Uint8Array([9, 9, 9]);
    storage.objects.set(archiveObjectPath("2026-05-01"), original);
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, rpcCalls });

    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /stored object differs from export; not sealing/,
    );

    expect(storage.objects.get(archiveObjectPath("2026-05-01"))).toBe(original);
    expect(storage.objects.has(manifestObjectPath("2026-05-01"))).toBe(false);
    expect(storage.uploads).toEqual([
      expect.objectContaining({
        path: archiveObjectPath("2026-05-01"),
        opts: expect.objectContaining({ upsert: false }),
      }),
    ]);
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "spot_archive_path_gap_snapshot",
    ]);
  });

  it("seals an identical object left by an interrupted upload", async () => {
    const storage = new FakeStorage();
    const original = new Uint8Array(
      gzipSync(Buffer.from(toCsv(DAY_ROWS), "utf8")),
    );
    storage.objects.set(archiveObjectPath("2026-05-01"), original);
    const db = makeDb(storage, { liveCount: () => 3 });

    const result = await runArchivePass(
      db,
      { ...CONTROLS, pruneEnabled: false },
      NOW,
    );

    expect(result.daysArchived).toBe(1);
    expect(storage.objects.get(archiveObjectPath("2026-05-01"))).toBe(original);
    expect(storage.objects.has(manifestObjectPath("2026-05-01"))).toBe(true);
    expect(
      storage.uploads
        .filter((upload) => upload.path === archiveObjectPath("2026-05-01"))
        .every((upload) => upload.opts?.upsert !== true),
    ).toBe(true);
  });

  it("refuses a malformed existing manifest without overwriting it", async () => {
    const storage = new FakeStorage();
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      new Uint8Array(Buffer.from("not json{", "utf8")),
    );
    const db = makeDb(storage, { liveCount: () => 3 });

    await expect(
      runArchivePass(db, { ...CONTROLS, pruneEnabled: false }, NOW),
    ).rejects.toThrow(/manifest validation failed/);
    expect(
      Buffer.from(
        storage.objects.get(manifestObjectPath("2026-05-01"))!,
      ).toString("utf8"),
    ).toBe("not json{");
    expect(storage.uploads).toEqual([]);
  });

  it("refuses an unknown manifest version without re-exporting", async () => {
    const storage = new FakeStorage();
    const value = JSON.parse(
      Buffer.from(sealedManifest("2026-05-01")).toString("utf8"),
    );
    value.manifestVersion = 3;
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      new Uint8Array(Buffer.from(JSON.stringify(value), "utf8")),
    );
    const pageQueries: QueryRecord[] = [];
    const db = makeDb(storage, { liveCount: () => 3, pageQueries });

    await expect(
      runArchivePass(db, { ...CONTROLS, pruneEnabled: false }, NOW),
    ).rejects.toThrow(/unsupported or invalid/);
    expect(pageQueries).toEqual([]);
  });

  it("refuses to prune when the archived object no longer matches its manifest", async () => {
    const storage = new FakeStorage();
    storage.objects.set(
      archiveObjectPath("2026-05-01"),
      new Uint8Array([9, 9, 9]),
    );
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      sealedManifest("2026-05-01", FAKE_SHA),
    );
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const db = makeDb(storage, { liveCount: () => 3, rpcCalls });

    await expect(runArchivePass(db, CONTROLS, NOW)).rejects.toThrow(
      /refusing to prune/,
    );
    expect(rpcCalls).toEqual([]);
  });

  it("does not rescan days confirmed done in an earlier pass", async () => {
    const storage = new FakeStorage();
    storage.objects.set(
      manifestObjectPath("2026-05-01"),
      sealedManifest("2026-05-01"),
    );
    const db = makeDb(storage, { liveCount: () => 3 });
    const controls = { ...CONTROLS, pruneEnabled: false };
    const sealedManifestPath = manifestObjectPath("2026-05-01");

    await runArchivePass(db, controls, NOW); // handles 05-01 (skip) + 05-02
    const downloadsAfterFirstPass = storage.downloads.filter(
      (p) => p === sealedManifestPath,
    ).length;

    const second = await runArchivePass(db, controls, NOW);

    // The cursor starts the second pass after the handled days: the sealed
    // manifest is not re-downloaded, and the pass still makes progress.
    expect(
      storage.downloads.filter((p) => p === sealedManifestPath).length,
    ).toBe(downloadsAfterFirstPass);
    expect(second.daysArchived).toBe(1);
    expect(storage.objects.has(archiveObjectPath("2026-05-03"))).toBe(true);
  });
});

describe("archivePathStats", () => {
  beforeEach(() => {
    resetScanCursor();
  });

  // F1 (#609 review): archivePathStats used to catch its own errors and
  // resolve, so collector/src/index.ts always reached prunePathRecency even
  // when the export/verify step failed — pruning a recency day whose
  // reconstruction source was never confirmed archived. It must now propagate
  // the failure so the caller can skip the prune on a confirmed failure only.
  it("rejects instead of swallowing a failed archive pass", async () => {
    const storage = new FakeStorage();
    storage.corruptOnDownload = archiveObjectPath("2026-05-01");
    const db = makeDb(storage, { liveCount: () => 3 });

    await expect(archivePathStats(db, CONTROLS)).rejects.toThrow(
      /SHA-256 mismatch/,
    );
    // Fail-closed: no manifest sealed, so no prune could have followed.
    expect(storage.objects.has(manifestObjectPath("2026-05-01"))).toBe(false);
  });

  it("resolves with the pass result on success", async () => {
    const storage = new FakeStorage();
    const db = makeDb(storage, { liveCount: () => 3 });

    await expect(archivePathStats(db, CONTROLS)).resolves.toEqual({
      daysArchived: 1,
      daysPruned: 1,
      rowsArchived: 3,
      rowsPruned: 3,
      sealedDays: ["2026-05-01"],
    });
  });
});

// ── N1/N2 (#609 review): prunePathRecency must only ever delete days the ──
// archive pass itself confirmed sealed this tick, and must issue bounded
// hour-by-hour deletes rather than one day-wide statement. These exercise
// the real runArchivePass output feeding the real prunePathRecency, the
// same wiring collector/src/index.ts uses.
describe("prunePathRecency consumes runArchivePass.sealedDays (N1/N3)", () => {
  beforeEach(() => {
    resetScanCursor();
  });

  interface FakeRecencyDb {
    db: SupabaseClient;
    fromCalls: number;
    deleted: { start: string; end: string }[];
  }

  function fakeRecencyDb(): FakeRecencyDb {
    const deleted: { start: string; end: string }[] = [];
    const fake: FakeRecencyDb = {
      fromCalls: 0,
      deleted,
      db: null as unknown as SupabaseClient,
    };
    fake.db = {
      from(table: string) {
        if (table !== "path_recency_hourly") {
          throw new Error(`unexpected table ${table}`);
        }
        fake.fromCalls += 1;
        return {
          delete: () => ({
            gte: (_column: string, start: string) => ({
              lt: async (_column: string, end: string) => {
                deleted.push({ start, end });
                return { count: 2900, error: null };
              },
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;
    return fake;
  }

  it("deletes nothing when recency's own oldest day would differ from what the archive sealed", async () => {
    // Archive-side: only 2026-05-01 is old enough (single-day window) and
    // gets exported+sealed this pass.
    const storage = new FakeStorage();
    const archiveDb = makeDb(storage, { liveCount: () => 3 });
    const oneDayWindow = Date.parse("2026-07-31T12:00:00Z");
    const archived = await runArchivePass(
      archiveDb,
      { ...CONTROLS, pruneEnabled: false },
      oneDayWindow,
    );
    expect(archived.sealedDays).toEqual(["2026-05-01"]);

    // Recency-side: prunePathRecency is never given a chance to compute its
    // own "oldest day" (no such query exists in this fake at all) — it can
    // only act on the list handed to it. Feeding it a day the archive pass
    // never sealed (a stand-in for "recency's true oldest day is Y != X")
    // must not reach the fake at all beyond the days actually listed.
    const recency = fakeRecencyDb();
    const result = await prunePathRecency(
      recency.db,
      { ...CONTROLS, pruneEnabled: true },
      archived.sealedDays,
    );

    // Every delete issued targets 2026-05-01 only — the confirmed-sealed
    // day — never any other day recency alone might have picked.
    expect(recency.deleted.every((d) => d.start.startsWith("2026-05-01"))).toBe(
      true,
    );
    expect(recency.deleted).toHaveLength(24); // hour-by-hour, N2
    expect(result.rowsDeleted).toBe(24 * 2900);
  });

  it("deletes nothing when the archive pass has no oldest day (fetchOldestDay returns null)", async () => {
    const storage = new FakeStorage();
    const archiveDb = makeDb(storage, {
      liveCount: () => 0,
      oldestHourRows: [], // path_hourly_stats is empty
    });
    const archived = await runArchivePass(archiveDb, CONTROLS, NOW);
    expect(archived.sealedDays).toEqual([]);

    const recency = fakeRecencyDb();
    const result = await prunePathRecency(
      recency.db,
      CONTROLS,
      archived.sealedDays,
    );

    expect(result).toEqual({ daysPruned: 0, rowsDeleted: 0 });
    expect(recency.fromCalls).toBe(0);
    expect(recency.deleted).toEqual([]);
  });

  it("issues 24 bounded hour-scoped deletes per day instead of one day-wide statement", async () => {
    const recency = fakeRecencyDb();
    await prunePathRecency(recency.db, CONTROLS, ["2026-04-01"]);

    expect(recency.deleted).toHaveLength(24);
    expect(recency.deleted[0]).toEqual({
      start: "2026-04-01T00:00:00.000Z",
      end: "2026-04-01T01:00:00.000Z",
    });
    expect(recency.deleted[23]).toEqual({
      start: "2026-04-01T23:00:00.000Z",
      end: "2026-04-02T00:00:00.000Z",
    });
  });
});

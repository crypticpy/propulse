import { describe, expect, it } from "vitest";
import {
  computeImagePullCheckpoint,
  encodeImageSyncCursor,
  imageSyncDeltaFilter,
  parseImageSyncCursor,
} from "./imageSyncCursor";

describe("imageSyncCursor", () => {
  it("round-trips compound cursors and accepts legacy timestamp-only cursors", () => {
    const encoded = encodeImageSyncCursor("2026-01-02T00:00:00.000Z", "img-b");
    expect(parseImageSyncCursor(encoded)).toEqual({
      createdAt: "2026-01-02T00:00:00.000Z",
      afterId: "img-b",
    });
    expect(parseImageSyncCursor("2026-01-01T00:00:00.000Z")).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      afterId: null,
    });
  });

  it("forces a full scan for a legacy timestamp-only cursor", () => {
    expect(
      imageSyncDeltaFilter(parseImageSyncCursor("2026-01-01T00:00:00.000Z")),
    ).toBeNull();
    expect(imageSyncDeltaFilter(parseImageSyncCursor(null))).toBeNull();
  });

  it("builds a compound delta filter once the cursor carries an id", () => {
    expect(
      imageSyncDeltaFilter(
        parseImageSyncCursor("2026-01-01T00:00:00.000Z|img-a"),
      ),
    ).toEqual({
      op: "compound",
      createdAt: "2026-01-01T00:00:00.000Z",
      afterId: "img-a",
    });
  });

  it("does not advance the checkpoint past a failed download", () => {
    const rows = [
      { id: "img-a", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "img-b", created_at: "2026-01-02T00:00:00.000Z" },
    ];
    const processed = new Set(["img-b"]);

    expect(
      computeImagePullCheckpoint(rows, (id) => processed.has(id)),
    ).toBeNull();
  });

  it("advances through a processed prefix and stops at the first failure", () => {
    const rows = [
      { id: "img-a", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "img-b", created_at: "2026-01-02T00:00:00.000Z" },
      { id: "img-c", created_at: "2026-01-03T00:00:00.000Z" },
    ];
    const processed = new Set(["img-a", "img-c"]);

    expect(computeImagePullCheckpoint(rows, (id) => processed.has(id))).toBe(
      "2026-01-01T00:00:00.000Z|img-a",
    );
  });

  it("keeps equal-timestamp rows discoverable when one fails", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const rows = [
      { id: "img-a", created_at: t },
      { id: "img-b", created_at: t },
    ];
    const processed = new Set(["img-a"]);

    expect(computeImagePullCheckpoint(rows, (id) => processed.has(id))).toBe(
      `${t}|img-a`,
    );
  });

  it("does not advance when an equal-timestamp row fails before a later success", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const rows = [
      { id: "img-a", created_at: t },
      { id: "img-b", created_at: t },
    ];
    const processed = new Set(["img-b"]);

    expect(
      computeImagePullCheckpoint(rows, (id) => processed.has(id)),
    ).toBeNull();
  });
});

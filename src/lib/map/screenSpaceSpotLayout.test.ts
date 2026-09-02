import { describe, expect, it } from "vitest";
import {
  aggregateBeaconScale,
  layoutProjectedSpotCandidates,
  spotLayoutSignature,
  type ProjectedSpotLayoutCandidate,
  type SpotLayoutCandidateKind,
} from "./screenSpaceSpotLayout";

interface Payload {
  label: string;
}

function candidate(
  id: string,
  x: number,
  y: number,
  overrides: Partial<ProjectedSpotLayoutCandidate<Payload>> = {},
): ProjectedSpotLayoutCandidate<Payload> {
  return {
    id,
    reportId: overrides.reportId ?? id,
    kind: (overrides.kind ?? "dx-label") as SpotLayoutCandidateKind,
    lat: overrides.lat ?? 35,
    lon: overrides.lon ?? -80,
    width: overrides.width ?? 82,
    height: overrides.height ?? 22,
    payload: overrides.payload ?? { label: id },
    x,
    y,
    clipZ: overrides.clipZ ?? 0,
    visible: overrides.visible ?? true,
    selected: overrides.selected,
    watched: overrides.watched,
    activeBand: overrides.activeBand,
    observedAt: overrides.observedAt,
    sourcePriority: overrides.sourcePriority,
    contentRevision: overrides.contentRevision,
  };
}

const options = { viewport: { width: 1000, height: 700 } };

describe("layoutProjectedSpotCandidates", () => {
  it("is stable across input order and feed refresh", () => {
    const input = [
      candidate("c", 300, 300),
      candidate("a", 302, 301),
      candidate("b", 298, 299),
    ];
    const first = layoutProjectedSpotCandidates(input, options);
    const second = layoutProjectedSpotCandidates([...input].reverse(), options);

    expect(spotLayoutSignature(first)).toBe(spotLayoutSignature(second));
    expect(first.aggregates[0].members.map((member) => member.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("retains one owner when a malformed refresh repeats a surface ID", () => {
    const result = layoutProjectedSpotCandidates(
      [candidate("same", 300, 300), candidate("same", 600, 300)],
      options,
    );

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].candidate.id).toBe("same");
  });

  it("revises retained layout state when paint metadata changes", () => {
    const first = layoutProjectedSpotCandidates(
      [candidate("same", 300, 300, { contentRevision: "FT8" })],
      options,
    );
    const changed = layoutProjectedSpotCandidates(
      [candidate("same", 300, 300, { contentRevision: "CW" })],
      options,
    );

    expect(spotLayoutSignature(changed)).not.toBe(spotLayoutSignature(first));
  });

  it("stacks a small conflict but aggregates a dense conflict", () => {
    const small = layoutProjectedSpotCandidates(
      [candidate("a", 300, 300), candidate("b", 300, 300)],
      options,
    );
    expect(small.aggregates).toHaveLength(0);
    expect(small.placements.map((placement) => placement.offsetY)).toEqual([
      0,
      34,
    ]);

    const dense = layoutProjectedSpotCandidates(
      [
        candidate("a", 300, 300),
        candidate("b", 300, 300),
        candidate("c", 300, 300),
      ],
      options,
    );
    expect(dense.placements).toHaveLength(0);
    expect(dense.aggregates[0].count).toBe(3);
  });

  it("aggregates when a raised threshold cannot fit the bounded stack", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("a", 300, 300),
        candidate("b", 300, 300),
        candidate("c", 300, 300),
        candidate("d", 300, 300),
      ],
      { ...options, smallStackLimit: 10, maxStackOffsetPx: 40 },
    );

    expect(result.placements).toHaveLength(0);
    expect(result.aggregates[0].count).toBe(4);
  });

  it("collides DX, spotter, activation, and endpoint candidates together", () => {
    const kinds: SpotLayoutCandidateKind[] = [
      "dx-label",
      "spotter-label",
      "activation-label",
      "endpoint",
    ];
    const result = layoutProjectedSpotCandidates(
      kinds.map((kind, index) =>
        candidate(`${kind}-${index}`, 400 + index, 300, { kind }),
      ),
      options,
    );

    expect(result.aggregates).toHaveLength(1);
    expect(result.aggregates[0].members.map((member) => member.kind)).toEqual(
      expect.arrayContaining(kinds),
    );
  });

  it("separates an aggregate after projection creates enough screen space", () => {
    const crowded = [
      candidate("a", 300, 300),
      candidate("b", 302, 300),
      candidate("c", 304, 300),
    ];
    expect(
      layoutProjectedSpotCandidates(crowded, options).aggregates,
    ).toHaveLength(1);

    const zoomed = crowded.map((entry, index) => ({
      ...entry,
      x: 150 + index * 220,
    }));
    const result = layoutProjectedSpotCandidates(zoomed, options);
    expect(result.aggregates).toHaveLength(0);
    expect(result.placements).toHaveLength(3);
  });

  it("rejects hidden, far-side, invalid, and margin-external candidates", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("visible", 300, 300),
        candidate("hidden", 300, 300, { visible: false }),
        candidate("far", 300, 300, { clipZ: 2 }),
        candidate("invalid", Number.NaN, 300),
        candidate("outside", 1200, 300),
      ],
      options,
    );

    expect(result.placements.map(({ candidate: entry }) => entry.id)).toEqual([
      "visible",
    ]);
    expect(result.rejectedIds).toEqual([
      "far",
      "hidden",
      "invalid",
      "outside",
    ]);
  });

  it("keeps a selected, watched, on-band recent source as primary", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("ordinary", 300, 300, { observedAt: 500 }),
        candidate("priority", 301, 300, {
          selected: true,
          watched: true,
          activeBand: true,
          observedAt: 1_000,
          sourcePriority: 10,
        }),
        candidate("newer", 302, 300, { observedAt: 2_000 }),
      ],
      options,
    );

    expect(result.aggregates[0].primary.id).toBe("priority");
  });

  it("uses a circular longitude center for dateline conflicts", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("east", 300, 300, { lat: 88, lon: 179 }),
        candidate("west", 301, 300, { lat: 89, lon: -179 }),
        candidate("date", 302, 300, { lat: 87, lon: 180 }),
      ],
      options,
    );

    expect(result.aggregates[0].center.lat).toBeCloseTo(88);
    expect(Math.abs(result.aggregates[0].center.lon)).toBeGreaterThan(179);
  });

  it("deduplicates report counts while retaining every surface member", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("report-a-dx", 300, 300, { reportId: "report-a" }),
        candidate("report-a-rx", 301, 300, { reportId: "report-a" }),
        candidate("report-b", 302, 300, { reportId: "report-b" }),
      ],
      options,
    );

    expect(result.aggregates[0].members).toHaveLength(3);
    expect(result.aggregates[0].memberReportIds).toEqual([
      "report-a",
      "report-b",
    ]);
    expect(result.aggregates[0].count).toBe(2);
  });
});

describe("aggregateBeaconScale", () => {
  it("grows logarithmically and remains bounded", () => {
    expect(aggregateBeaconScale(2)).toBeGreaterThan(1);
    expect(aggregateBeaconScale(50)).toBeGreaterThan(
      aggregateBeaconScale(5),
    );
    expect(aggregateBeaconScale(1_000_000)).toBe(2.25);
  });
});

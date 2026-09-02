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
      35,
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

  it("suppresses overflow instead of violating a raised report threshold", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("a", 300, 300),
        candidate("b", 300, 300),
        candidate("c", 300, 300),
        candidate("d", 300, 300),
      ],
      {
        ...options,
        minAggregateReportCount: 10,
        maxStackOffsetPx: 40,
      },
    );

    expect(result.aggregates).toHaveLength(0);
    expect(result.placements).toHaveLength(3);
    expect(result.rejectedIds).toEqual(["d"]);
  });

  it("uses distinct report identities for the aggregation threshold", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("report-a-dx", 300, 300, { reportId: "report-a" }),
        candidate("report-a-rx", 301, 300, { reportId: "report-a" }),
      ],
      { ...options, minAggregateReportCount: 2 },
    );

    expect(result.aggregates).toHaveLength(0);
    expect(result.placements).toHaveLength(2);
  });

  it("never assigns an offset that a geographic endpoint cannot consume", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("endpoint-a", 300, 300, { kind: "endpoint" }),
        candidate("endpoint-b", 300, 300, { kind: "endpoint" }),
      ],
      options,
    );

    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].offsetY).toBe(0);
    expect(result.rejectedIds).toEqual(["endpoint-b"]);
  });

  it("computes offsets from each candidate's actual projected position", () => {
    const result = layoutProjectedSpotCandidates(
      [candidate("a", 300, 300), candidate("b", 300, 280)],
      options,
    );
    const [first, second] = result.placements;
    const firstCenter = first.candidate.y + first.offsetY;
    const secondCenter = second.candidate.y + second.offsetY;

    expect(second.offsetY).toBe(-15);
    expect(Math.abs(firstCenter - secondCenter)).toBe(35);
  });

  it("does not displace a stack into a neighboring component", () => {
    const result = layoutProjectedSpotCandidates(
      [
        candidate("a", 300, 100),
        candidate("b", 300, 100),
        candidate("c", 300, 135),
      ],
      options,
    );
    const centers = new Map(
      result.placements.map(({ candidate: entry, offsetY }) => [
        entry.id,
        entry.y + offsetY,
      ]),
    );

    expect(centers.get("b")).toBe(65);
    expect(centers.get("c")).toBe(135);
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
      { ...options, minAggregateReportCount: 2 },
    );

    expect(result.aggregates[0].members).toHaveLength(3);
    expect(result.aggregates[0].memberReportIds).toEqual([
      "report-a",
      "report-b",
    ]);
    expect(result.aggregates[0].count).toBe(2);
  });
});

describe("spotLayoutSignature", () => {
  it("includes kind and dimensions that change the retained renderer", () => {
    const label = layoutProjectedSpotCandidates(
      [candidate("same", 300, 300)],
      options,
    );
    const endpoint = layoutProjectedSpotCandidates(
      [
        candidate("same", 300, 300, {
          kind: "endpoint",
          width: 82,
          height: 22,
        }),
      ],
      options,
    );
    const resized = layoutProjectedSpotCandidates(
      [candidate("same", 300, 300, { width: 96, height: 28 })],
      options,
    );

    expect(spotLayoutSignature(endpoint)).not.toBe(spotLayoutSignature(label));
    expect(spotLayoutSignature(resized)).not.toBe(spotLayoutSignature(label));
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

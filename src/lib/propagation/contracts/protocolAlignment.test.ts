import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import capabilityCases from "@/lib/propagation/contracts/fixtures/capability.cases.json";
import resultCases from "@/lib/propagation/contracts/fixtures/result.cases.json";
import { parseResult } from "@/lib/propagation/contracts/result";
import {
  ALIGNED_PROTOCOL_ID,
  isProtocolCoverage,
  PROTOCOL_COVERAGE_TUPLES,
  protocolCoverageKey,
  ROUTABLE_CAPABILITY_STATES,
  PROTOCOL_BAND_GAPS,
  PROTOCOL_BAND_NAME_SPANS,
  PROTOCOL_BAND_RANGES,
  MECHANISM_FAMILIES,
  PREDICTION_DOMAINS,
  PREDICTION_HORIZONS,
  PREDICTION_QUANTITIES,
  QUANTITY_UNITS,
} from "@/lib/propagation/contracts/enums";

/**
 * The frozen validation protocol is the source of truth for event names, units,
 * domains, horizons and mechanism families. These contracts must follow it, so
 * a drift on either side fails here rather than silently renaming a quantity.
 */
const PROTOCOL_PATH = resolve(
  __dirname,
  "../../../../ml/propagation_validation/protocol-v0.1.json",
);

interface CoverageRow {
  band: string;
  mechanism: string;
  event: string;
  units: string;
  domain: string;
  horizon: string;
  status: string;
  preregistration: { status: string };
}

interface Protocol {
  protocol_id: string;
  replay: { revisions: string };
  events: Record<string, { units: string; definition: string }>;
  coverage_rows: CoverageRow[];
}

const protocol = JSON.parse(readFileSync(PROTOCOL_PATH, "utf8")) as Protocol;

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

describe("contracts agree with the frozen validation protocol", () => {
  it("targets the protocol revision these contracts were written against", () => {
    expect(protocol.protocol_id).toBe(ALIGNED_PROTOCOL_ID);
  });

  it("uses exactly the protocol's event names as its quantities", () => {
    expect(sorted(PREDICTION_QUANTITIES)).toEqual(
      sorted(Object.keys(protocol.events)),
    );
  });

  it("uses the protocol's units for every quantity", () => {
    const protocolUnits = Object.fromEntries(
      Object.entries(protocol.events).map(([event, value]) => [
        event,
        value.units,
      ]),
    );
    expect(QUANTITY_UNITS).toEqual(protocolUnits);
  });

  it("uses exactly the mechanism families named by the coverage matrix", () => {
    expect(sorted(MECHANISM_FAMILIES)).toEqual(
      sorted(protocol.coverage_rows.map((row) => row.mechanism)),
    );
  });

  it("uses exactly the domains and horizons named by the coverage matrix", () => {
    expect(sorted(PREDICTION_DOMAINS)).toEqual(
      sorted(protocol.coverage_rows.map((row) => row.domain)),
    );
    expect(sorted(PREDICTION_HORIZONS)).toEqual(
      sorted(protocol.coverage_rows.map((row) => row.horizon)),
    );
  });

  it("keeps every coverage row's event and units resolvable in the contracts", () => {
    for (const row of protocol.coverage_rows) {
      expect(PREDICTION_QUANTITIES).toContain(row.event);
      expect(
        QUANTITY_UNITS[row.event as (typeof PREDICTION_QUANTITIES)[number]],
      ).toBe(row.units);
    }
  });
});

describe("the embedded coverage tuples match the frozen protocol", () => {
  it("carries exactly the protocol's (band, event, domain, horizon, mechanism, status) rows", () => {
    const fromProtocol = sorted(
      protocol.coverage_rows.map((row) =>
        [
          row.band,
          row.event,
          row.domain,
          row.horizon,
          row.mechanism,
          row.status,
        ].join("|"),
      ),
    );
    expect(sorted(PROTOCOL_COVERAGE_TUPLES.map(protocolCoverageKey))).toEqual(
      fromProtocol,
    );
  });

  it("carries the protocol's status on every coverage row", () => {
    // The protocol froze 19 data-limited and 18 experimental rows and
    // preregistered none of them, so no row is validated. A contract that lost
    // the status would let a head claim a validation the protocol blocks.
    const counts = PROTOCOL_COVERAGE_TUPLES.reduce<Record<string, number>>(
      (tally, row) => ({
        ...tally,
        [row.status]: (tally[row.status] ?? 0) + 1,
      }),
      {},
    );
    expect(counts).toEqual({ data_limited: 19, experimental: 18 });
    expect(PROTOCOL_COVERAGE_TUPLES).toHaveLength(37);
    for (const row of protocol.coverage_rows) {
      expect(row.preregistration.status).toBe("BLOCKED");
    }
  });

  it("documents every gap between a band label's name and its constituents", () => {
    // A label like "13cm_to_47GHz" names a span far wider than the allocations
    // it carries. The gaps are deliberate, so they are written down and
    // recomputed here rather than left for a reader to discover.
    for (const [band, span] of Object.entries(PROTOCOL_BAND_NAME_SPANS)) {
      const parts = [...(PROTOCOL_BAND_RANGES[band] ?? [])].sort(
        (a, b) => a.minHz - b.minHz,
      );
      const gaps: { minHz: number; maxHz: number }[] = [];
      let cursor = span.minHz;
      for (const part of parts) {
        if (part.minHz > cursor)
          gaps.push({ minHz: cursor, maxHz: part.minHz });
        cursor = Math.max(cursor, part.maxHz);
      }
      if (cursor < span.maxHz) gaps.push({ minHz: cursor, maxHz: span.maxHz });
      expect({ band, gaps }).toEqual({
        band,
        gaps: PROTOCOL_BAND_GAPS[band].map((gap) => ({ ...gap })),
      });
    }
  });

  it("puts every value-bearing result-fixture head on a protocol row", () => {
    for (const [name, fixture] of Object.entries(
      resultCases as unknown as Record<string, unknown>,
    )) {
      const outcome = parseResult(structuredClone(fixture));
      if (!outcome.ok) throw new Error(`${name} must parse`);
      for (const head of outcome.value.heads) {
        if (
          head.state.availability !== "available" &&
          head.state.availability !== "experimental"
        ) {
          continue;
        }
        expect({
          name,
          quantity: head.quantity,
          known: isProtocolCoverage({
            event: head.quantity,
            domain: head.domain,
            horizon: head.horizon,
            mechanism: head.mechanismFamily,
          }),
        }).toMatchObject({ known: true });
      }
    }
  });

  it("puts every routable fixture head on a protocol row", () => {
    const fixtures = capabilityCases as unknown as Record<
      string,
      { heads: readonly Record<string, never>[] }
    >;
    for (const capability of Object.values(fixtures)) {
      for (const head of capability.heads as unknown as {
        state: string;
        quantity: string;
        domain: string;
        horizons: string[];
        mechanismFamilies: string[];
        frequencyRangeHz: { minHz: number; maxHz: number };
      }[]) {
        if (
          !(ROUTABLE_CAPABILITY_STATES as readonly string[]).includes(
            head.state,
          )
        ) {
          continue;
        }
        for (const horizon of head.horizons) {
          for (const mechanism of head.mechanismFamilies) {
            expect({
              event: head.quantity,
              domain: head.domain,
              horizon,
              mechanism,
              known: isProtocolCoverage(
                {
                  event: head.quantity,
                  domain: head.domain,
                  horizon,
                  mechanism,
                } as never,
                head.frequencyRangeHz,
              ),
            }).toMatchObject({ known: true });
          }
        }
      }
    }
  });
});

describe("the result contract carries what replay needs", () => {
  const SHA256 = /^sha256:[0-9a-f]{64}$/;

  it("pins every served head's artefacts, as the replay clause requires (M24)", () => {
    // The protocol replays against immutable SHA-256 versions, so a served
    // head that names only a model id and version cannot be replayed.
    expect(protocol.replay.revisions).toMatch(/SHA-256/);
    for (const [name, fixture] of Object.entries(
      resultCases as unknown as Record<string, unknown>,
    )) {
      const outcome = parseResult(structuredClone(fixture));
      if (!outcome.ok) {
        throw new Error(
          `${name} must parse: ${JSON.stringify(outcome.issues)}`,
        );
      }
      expect(outcome.value.provenance.capabilityDigest).toMatch(SHA256);
      for (const source of outcome.value.evidence.sources) {
        // An eligible source was used to produce this result, so replay needs
        // the immutable revision it was read at, not a product label.
        if (!source.eligible) continue;
        expect(source.sourceVersion).toMatch(SHA256);
      }
      for (const head of outcome.value.heads) {
        if (
          head.state.availability !== "available" &&
          head.state.availability !== "experimental"
        ) {
          continue;
        }
        expect(head.modelHash).toMatch(SHA256);
        expect(head.preprocessingHash).toMatch(SHA256);
        expect(head.featureHash).toMatch(SHA256);
      }
    }
  });
});

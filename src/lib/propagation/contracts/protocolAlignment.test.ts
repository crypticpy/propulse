import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import capabilityCases from "@/lib/propagation/contracts/fixtures/capability.cases.json";
import {
  ALIGNED_PROTOCOL_ID,
  isProtocolCoverage,
  PROTOCOL_COVERAGE_TUPLES,
  protocolCoverageKey,
  ROUTABLE_CAPABILITY_STATES,
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
}

interface Protocol {
  protocol_id: string;
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
  it("carries exactly the protocol's (band, event, domain, horizon, mechanism) rows", () => {
    const fromProtocol = sorted(
      protocol.coverage_rows.map((row) =>
        [row.band, row.event, row.domain, row.horizon, row.mechanism].join("|"),
      ),
    );
    expect(sorted(PROTOCOL_COVERAGE_TUPLES.map(protocolCoverageKey))).toEqual(
      fromProtocol,
    );
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

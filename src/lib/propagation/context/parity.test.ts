// @vitest-environment node

/**
 * PROP-05 parity with the deployed N5 oracle (#951).
 *
 * `ml/service/operational_weather.py` already applies the source latency rules
 * this leaf must not change. This suite holds the TypeScript selection against
 * that Python, three ways: the same rows produce the same picks, the age
 * bounds are literally the Python's numbers, and the ledger vocabulary covers
 * every source the rest of the app already names.
 *
 * Nothing here skips. If the Python moves or its constant block stops being
 * parseable, the regex finds nothing and the suite fails loudly, because a
 * silently skipped parity test is indistinguishable from a passing one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FAST_WEATHER_SOURCES,
  SLOW_WEATHER_SOURCES,
} from "@/lib/propagation/operationalWeather";

import { recordsFromSnapshotRow, type SolarSnapshotRow } from "./adapters";
import fixture from "./fixtures/operational-weather-parity.json";
import {
  getLedgerEntry,
  LEDGER_SOURCE_IDS,
  SOURCE_AGE_BOUNDS_SECONDS,
} from "./ledger";
import { inactiveBarrierAsOf, selectAsOf } from "./selection";
import { instantMs, type SourceRecord } from "./types";

const ORACLE_PATH = path.resolve(
  process.cwd(),
  "ml/service/operational_weather.py",
);

function oracleSource(): string {
  const text = readFileSync(ORACLE_PATH, "utf8");
  expect(
    text.length,
    `the N5 oracle at ${ORACLE_PATH} is empty`,
  ).toBeGreaterThan(0);
  return text;
}

/** The `SOURCE_MAX_AGE_SECONDS` block, read out of the Python itself. */
function oracleAgeBounds(): Record<string, number> {
  const text = oracleSource();
  const block = /SOURCE_MAX_AGE_SECONDS\s*=\s*\{([\s\S]*?)\n\}/.exec(text);
  expect(
    block,
    "SOURCE_MAX_AGE_SECONDS could not be located in the N5 oracle; the parity check cannot be skipped, so this is a failure",
  ).not.toBeNull();
  const entries = [
    ...(block?.[1] ?? "").matchAll(/"([a-z0-9_]+)"\s*:\s*([^,\n]+),/g),
  ];
  expect(
    entries.length,
    "the SOURCE_MAX_AGE_SECONDS block parsed to zero entries; the parity check cannot be skipped, so this is a failure",
  ).toBeGreaterThan(0);

  const bounds: Record<string, number> = {};
  for (const [, name, expression] of entries) {
    const factors = expression
      .trim()
      .split("*")
      .map((part) => Number(part.trim()));
    expect(
      factors.every((factor) => Number.isFinite(factor)),
      `the bound for "${name}" is not a product of literals: ${expression}`,
    ).toBe(true);
    bounds[name] = factors.reduce((product, factor) => product * factor, 1);
  }
  return bounds;
}

/** The `SOURCE_NAMES` vocabulary, derived from the oracle's field table. */
function oracleSourceNames(): string[] {
  const text = oracleSource();
  const block = /FIELD_DEFINITIONS\s*=\s*\(([\s\S]*?)\n\)/.exec(text);
  expect(
    block,
    "FIELD_DEFINITIONS could not be located in the N5 oracle; the parity check cannot be skipped, so this is a failure",
  ).not.toBeNull();
  const rows = [
    ...(block?.[1] ?? "").matchAll(
      /\(\s*"([a-z0-9_]+)"\s*,\s*"([a-z0-9_]+)"\s*,\s*"([a-z0-9_]+)"\s*\)/g,
    ),
  ];
  expect(
    rows.length,
    "FIELD_DEFINITIONS parsed to zero rows; the parity check cannot be skipped, so this is a failure",
  ).toBeGreaterThan(0);
  return [...new Set(rows.map((row) => row[3]))];
}

describe("the ledger mirrors the oracle's source latency rules", () => {
  it("carries exactly the Python's age bounds, unchanged", () => {
    expect(oracleAgeBounds()).toEqual({ ...SOURCE_AGE_BOUNDS_SECONDS });
  });

  it("was generated against those same bounds", () => {
    expect(fixture.ageBoundsSeconds).toEqual(oracleAgeBounds());
  });

  it("declares every source the oracle and the client already name", () => {
    for (const sourceId of oracleSourceNames()) {
      expect(
        LEDGER_SOURCE_IDS,
        `oracle source "${sourceId}" is undeclared`,
      ).toContain(sourceId);
    }
    for (const sourceId of [...FAST_WEATHER_SOURCES, ...SLOW_WEATHER_SOURCES]) {
      expect(
        LEDGER_SOURCE_IDS,
        `client source "${sourceId}" is undeclared`,
      ).toContain(sourceId);
    }
  });

  it("declares every variable the oracle reads, under the oracle's own source", () => {
    for (const field of fixture.fields) {
      expect(
        getLedgerEntry(field.sourceId).variables,
        `${field.sourceId} does not declare ${field.variable}`,
      ).toContain(field.variable);
    }
  });
});

describe("as-of selection reproduces the oracle, row for row", () => {
  it("has cases to check", () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  for (const testCase of fixture.cases) {
    it(`agrees on: ${testCase.name}`, () => {
      const records = testCase.rows.flatMap((row) =>
        recordsFromSnapshotRow(row as unknown as SolarSnapshotRow),
      );

      for (const field of fixture.fields) {
        const expected = (
          testCase.expected as Record<
            string,
            Record<
              string,
              {
                value: number;
                observedIntervalEndAt: string;
                capturedAt: string;
              } | null
            >
          >
        )[field.sourceId][field.variable];

        const history: SourceRecord[] = records.filter(
          (record) =>
            record.sourceId === field.sourceId &&
            record.variable === field.variable,
        );
        const selected = selectAsOf(history, {
          issuedAt: testCase.issuedAt,
          entry: getLedgerEntry(field.sourceId),
          mode: "cached_live",
          barrier: inactiveBarrierAsOf(
            records.filter((r) => r.sourceId === field.sourceId),
            {
              issuedAt: testCase.issuedAt,
            },
          ),
        });

        if (expected === null) {
          expect(
            selected.state,
            `${field.sourceId}.${field.variable} should not have been selected`,
          ).not.toBe("selected");
          continue;
        }
        expect(
          selected.state,
          `${field.sourceId}.${field.variable} should have been selected`,
        ).toBe("selected");
        if (selected.state !== "selected") continue;
        expect(selected.record.value).toBe(expected.value);
        // Instants, not spellings: Python prints whole seconds and JavaScript
        // prints milliseconds, and parity is a claim about the instant picked.
        expect(instantMs(selected.record.stamps.observedIntervalEndAt)).toBe(
          instantMs(expected.observedIntervalEndAt),
        );
        expect(instantMs(selected.record.stamps.capturedAt)).toBe(
          instantMs(expected.capturedAt),
        );
      }
    });
  }
});

import { describe, expect, it } from "vitest";
import {
  filterAndSortDxpeditions,
  parseAdxoDate,
  parseAdxoHtml,
} from "./dxpeditions";

// Trimmed fixture mirroring the real ng3k.com/adxo.html row structure
// (captured 2026-08-29): a highlighted "currently active" row, a plain
// upcoming row with a linked callsign, a row that already expired, and a
// malformed row missing its callsign to exercise the skip-on-failure path.
const FIXTURE_HTML = `
<table>
<tr class="thead"><th class="date">Start</th><th class="date">End</th><th>DXCC</th><th>Call</th><th>QSL</th><th>Rep</th><th>Info</th></tr>
<tr align="center"><td class="year"><strong>2026</strong></td><td colspan="7">&nbsp;</td></tr>
<tr class="adxoitem" bgcolor="#FFDAB9"><td class="date">2026 Aug18</td><td class="date">2026 Aug29</td><td class="cty">Canary Is</td><td><span class="call">EA8</span><br></td><td class="qsl">IZ1GDB (B/d)</td><td class="rep">OPDX<br>20260620</td><td class="info">By IZ1GDB as EA8/IZ1GDB fm Mogan, Gran Canaria; 40 20 15 10m</td></tr>
<tr class="adxoitem"><td class="date">2026 Sep03</td><td class="date">2026 Sep07</td><td class="cty">San Andres I</td><td class="call"><span class="call"><a href="https://www.qrz.com/db/HK0">HK0</a></span></td><td class="qsl">LoTW</td><td class="rep">DXW.Net<br>20260827</td><td class="info">By PY8WW fm IOTA NA-033; 20-6m; SSB CW + digital; holiday style operation; QSL via Club Log OQRS</td></tr>
<tr class="adxoitem"><td class="date">2025 Jan01</td><td class="date">2025 Jan10</td><td class="cty">Old Expired Place</td><td><span class="call">XX9OLD</span></td><td class="qsl">TBA</td><td class="rep">TDDX<br>20241201</td><td class="info">Expired test row; 160-6m; CW</td></tr>
<tr class="adxoitem"><td class="date">2026 Oct01</td><td class="date">2026 Oct10</td><td class="cty">Missing Call</td><td><span class="notcall">nope</span></td><td class="qsl">TBA</td><td class="rep">TDDX<br>20260101</td><td class="info">Row missing a callsign span; 20m; FT8</td></tr>
</table>
`;

describe("parseAdxoDate", () => {
  it("parses the no-space YYYY Mon<DD> format into ISO", () => {
    expect(parseAdxoDate("2026 Aug18")).toBe("2026-08-18");
    expect(parseAdxoDate("2026 Sep03")).toBe("2026-09-03");
  });

  it("returns null for unparseable input", () => {
    expect(parseAdxoDate("not a date")).toBeNull();
    expect(parseAdxoDate("2026 Xyz01")).toBeNull();
    expect(parseAdxoDate("")).toBeNull();
  });
});

describe("parseAdxoHtml", () => {
  const entries = parseAdxoHtml(FIXTURE_HTML);

  it("extracts well-formed rows, skipping the malformed one", () => {
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.callsign)).toEqual(["EA8", "HK0", "XX9OLD"]);
  });

  it("normalizes dates to ISO and captures entity/qsl/info", () => {
    const canary = entries.find((e) => e.callsign === "EA8");
    expect(canary).toMatchObject({
      entity: "Canary Is",
      startDate: "2026-08-18",
      endDate: "2026-08-29",
      qslInfo: "IZ1GDB (B/d)",
      source: "NG3K ADXO",
    });
    expect(canary?.info).toContain("Mogan, Gran Canaria");
  });

  it("strips a linked callsign down to plain text", () => {
    const sanAndres = entries.find((e) => e.entity === "San Andres I");
    expect(sanAndres?.callsign).toBe("HK0");
  });

  it("best-effort extracts bands and modes from the info text", () => {
    const canary = entries.find((e) => e.callsign === "EA8")!;
    expect(canary.bands).toBe("40 20 15 10m");

    const sanAndres = entries.find((e) => e.callsign === "HK0")!;
    expect(sanAndres.bands).toBe("20-6m");
    expect(sanAndres.modes).toBe("SSB CW");
  });

  it("returns an empty array for empty or non-string input", () => {
    expect(parseAdxoHtml("")).toEqual([]);
    // @ts-expect-error defensive runtime check
    expect(parseAdxoHtml(null)).toEqual([]);
  });
});

describe("filterAndSortDxpeditions", () => {
  it("drops entries whose end date has already passed and sorts ascending", () => {
    const entries = parseAdxoHtml(FIXTURE_HTML);
    const filtered = filterAndSortDxpeditions(entries, "2026-08-29");

    expect(filtered.map((e) => e.callsign)).toEqual(["EA8", "HK0"]);
    expect(filtered[0].startDate <= filtered[1].startDate).toBe(true);
  });

  it("keeps an entry whose end date is exactly today", () => {
    const entries = parseAdxoHtml(FIXTURE_HTML);
    const filtered = filterAndSortDxpeditions(entries, "2026-08-29");
    expect(filtered.some((e) => e.endDate === "2026-08-29")).toBe(true);
  });
});

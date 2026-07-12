import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  SHERWOOD_RANGES,
  parseNumbers,
  parseSherwoodCell,
} from "./sherwood-parser.mjs";

describe("Sherwood parser", () => {
  it("strips superscript footnotes before parsing numeric samples", () => {
    const $ = cheerio.load("<table><tr><td>-131<br>-140<sup>6</sup></td></tr></table>");
    const cell = $("td").get(0);
    const result = parseSherwoodCell($, cell, SHERWOOD_RANGES.noiseFloorDbm);

    expect(result.values).toEqual([-131, -140]);
    expect(result.rejectedValues).toEqual([]);
  });

  it("quarantines physically impossible values", () => {
    const $ = cheerio.load("<table><tr><td>-135 -14510 -42</td></tr></table>");
    const cell = $("td").get(0);
    const result = parseSherwoodCell($, cell, SHERWOOD_RANGES.noiseFloorDbm);

    expect(result.values).toEqual([-135]);
    expect(result.rejectedValues).toEqual([-14510, -42]);
  });

  it("parses signed decimal values without changing their scale", () => {
    expect(parseNumbers("-141.5 0.081 +20")).toEqual([-141.5, 0.081, 20]);
  });
});

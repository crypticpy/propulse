import { describe, expect, it } from "vitest";
import { pskStationMapSpots } from "./pskStationSpots";
import type { PskStationReport } from "@/lib/hamclock/pskStation";

const report: PskStationReport = {
  senderCallsign: "N0TEST", receiverCallsign: "W1AW", senderLocator: "EM38",
  receiverLocator: "FN31", frequencyHz: 14074123, mode: "FT8", snr: -12,
  observedAt: Date.UTC(2026, 8, 7),
};

describe("personal PSK map paths", () => {
  it("retains separate receivers and original RF/time while removing exact duplicates", () => {
    const rows = pskStationMapSpots([report, { ...report, receiverCallsign: "K1ABC" }, report]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    expect(rows[0]).toMatchObject({
      dx: "N0TEST", spotter: "W1AW", frequency: 14074.123,
      dxLat: 38.5, dxLon: -93, spotterLat: 41.5, spotterLon: -73,
      band: "20m", snr: -12, dxLocApprox: false, spotterLocApprox: false,
    });
    expect(rows[0].time.getTime()).toBe(report.observedAt);
  });

  it("uses transmitted and received endpoints regardless of personal OF/BY direction", () => {
    const [spot] = pskStationMapSpots([{ ...report, senderCallsign: "W1AW", receiverCallsign: "N0TEST", senderLocator: "FN31", receiverLocator: "EM38" }]);
    expect(spot).toMatchObject({ dx: "W1AW", spotter: "N0TEST", dxGrid: "FN31", spotterGrid: "EM38" });
  });

  it("requires both reported locators instead of inventing country-level paths", () => {
    const rows = pskStationMapSpots([
      { ...report, senderLocator: null }, { ...report, receiverLocator: "ZZ99" },
      { ...report, senderLocator: "EM38AAAA" }, { ...report, frequencyHz: NaN },
      { ...report, observedAt: Infinity }, { ...report, observedAt: 1e20 },
    ]);
    expect(rows).toEqual([]);
  });

  it("supports eight-character subcells and stable newest-first identities", () => {
    const rows = pskStationMapSpots([
      report, { ...report, senderLocator: "em38aa00", observedAt: report.observedAt + 1000 },
    ]);
    expect(rows[0].dxGrid).toBe("EM38AA00");
    expect(rows[0].dxLat).toBeCloseTo(38 + 1 / 480, 4);
    expect(rows[0].dxLon).toBeCloseTo(-94 + 1 / 240, 4);
    expect(rows[0].id).toBe(pskStationMapSpots([{
      ...report, senderLocator: "EM38AA00", observedAt: report.observedAt + 1000,
    }])[0].id);
  });
});

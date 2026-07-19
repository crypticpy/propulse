import { describe, expect, it } from "vitest";
import { normalizePskReporterPayload } from "./pskreporter.js";

describe("normalizePskReporterPayload", () => {
  it("normalizes an HF MQTT report", () => {
    const spot = normalizePskReporterPayload({
      f: 21_074_653,
      md: "FT8",
      rp: -5,
      t_tx: 1_662_407_697,
      sc: "sp2ewq",
      sl: "JO93fn42",
      rc: "cu3at",
      rl: "HM68jp36",
      sa: 269,
    });

    expect(spot).toMatchObject({
      source: "pskreporter",
      tx_callsign: "SP2EWQ",
      tx_grid: "JO93fn",
      rx_callsign: "CU3AT",
      rx_grid: "HM68jp",
      frequency_khz: 21074.7,
      band: "15m",
      mode: "FT8",
      snr: -5,
      dxcc: 269,
    });
    expect(spot?.spotted_at).toBe("2022-09-05T19:54:57.000Z");
  });

  it("rejects incomplete and non-HF reports", () => {
    expect(normalizePskReporterPayload({ f: 14_074_000 })).toBeNull();
    expect(
      normalizePskReporterPayload({
        f: 144_174_000,
        sc: "K1ABC",
        rc: "W1XYZ",
      }),
    ).toBeNull();
  });
});

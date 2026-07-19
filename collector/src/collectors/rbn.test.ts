import { describe, expect, it } from "vitest";
import {
  normalizeRbnCallsign,
  parseRbnLine,
  rbnSpottedAt,
  shouldSampleRbn,
} from "./rbn.js";

describe("normalizeRbnCallsign", () => {
  it("normalizes a configured receive-only callsign", () => {
    expect(normalizeRbnCallsign(" kb0el ")).toBe("KB0EL");
  });

  it("rejects missing or invalid identities", () => {
    expect(() => normalizeRbnCallsign(undefined)).toThrow(
      "RBN_LOGIN_CALLSIGN",
    );
    expect(() => normalizeRbnCallsign("not a call")).toThrow(
      "RBN_LOGIN_CALLSIGN",
    );
  });
});

describe("rbnSpottedAt", () => {
  it("floors receipt-derived timestamps to a stable causal bucket", () => {
    const now = Date.parse("2026-07-17T12:00:14.900Z");
    expect(rbnSpottedAt(now, 0)).toBe("2026-07-17T12:00:00.000Z");
  });

  it("never rounds a recent spot into the future", () => {
    const now = Date.parse("2026-07-17T12:00:14.900Z");
    expect(Date.parse(rbnSpottedAt(now, 0))).toBeLessThanOrEqual(now);
  });
});

describe("parseRbnLine", () => {
  it("parses a standard CW relay line", () => {
    const spot = parseRbnLine(
      "DX de W3LPL-#: 14025.3 K1ABC CW 21 dB 28 WPM CQ 1234Z",
      "CW",
      Date.parse("2026-07-19T12:35:00Z"),
    );

    expect(spot).toMatchObject({
      source: "rbn",
      spotted_at: "2026-07-19T12:34:00.000Z",
      tx_callsign: "K1ABC",
      rx_callsign: "W3LPL",
      frequency_khz: 14025.3,
      band: "20m",
      mode: "CW",
      snr: 21,
      wpm: 28,
    });
  });

  it("uses the FT8 relay mode when the comment omits a mode", () => {
    const spot = parseRbnLine(
      "DX de K3LR-#: 14074.0 W1AW -10 dB 0815Z",
      "FT8",
      Date.parse("2026-07-19T08:16:00Z"),
    );
    expect(spot?.mode).toBe("FT8");
    expect(spot?.snr).toBe(-10);
  });

  it("rejects malformed and non-HF lines", () => {
    expect(parseRbnLine("login:", "CW")).toBeNull();
    expect(
      parseRbnLine(
        "DX de K3LR-#: 144174.0 W1AW FT8 -10 dB 0815Z",
        "FT8",
      ),
    ).toBeNull();
  });
});

describe("shouldSampleRbn", () => {
  it("is deterministic and honors boundary rates", () => {
    const line = "DX de W3LPL-#: 14025.3 K1ABC CW 21 dB 1234Z";
    expect(shouldSampleRbn(line, 0)).toBe(false);
    expect(shouldSampleRbn(line, 100)).toBe(true);
    expect(shouldSampleRbn(line, 5)).toBe(shouldSampleRbn(line, 5));
  });
});

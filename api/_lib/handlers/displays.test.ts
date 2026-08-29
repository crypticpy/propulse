import { describe, expect, it } from "vitest";
import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  generatePairingCode,
  isValidPairingCode,
  normalizePairingCode,
  sha256Hex,
} from "./displays";

describe("generatePairingCode", () => {
  it("emits codes of the right length from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
      for (const ch of code) {
        expect(PAIRING_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("never contains ambiguous glyphs", () => {
    expect(PAIRING_CODE_ALPHABET).not.toMatch(/[01OI]/);
  });
});

describe("normalizePairingCode", () => {
  it("uppercases and strips spaces/dashes", () => {
    expect(normalizePairingCode(" ab-c 2de ")).toBe("ABC2DE");
  });

  it("maps typed 0/1 to O/I", () => {
    expect(normalizePairingCode("0a1bcd")).toBe("OAIBCD");
  });
});

describe("isValidPairingCode", () => {
  it("accepts a generated code round-tripped through normalize", () => {
    const code = generatePairingCode();
    expect(isValidPairingCode(normalizePairingCode(code))).toBe(true);
  });

  it("rejects wrong length and out-of-alphabet characters", () => {
    expect(isValidPairingCode("ABC2D")).toBe(false);
    expect(isValidPairingCode("ABC2DEF")).toBe(false);
    expect(isValidPairingCode("ABC2D!")).toBe(false);
    expect(isValidPairingCode("abc2de")).toBe(false); // lowercase not in alphabet
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and 64 hex chars", async () => {
    const a = await sha256Hex("propulse-device-token");
    const b = await sha256Hex("propulse-device-token");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

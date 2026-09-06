import { describe, expect, it } from "vitest";
import { extractMode } from "./dxcluster.js";

describe("extractMode", () => {
  it("matches USB", () => {
    expect(extractMode("CQ USB")).toBe("USB");
  });

  it("matches lsb case-insensitively", () => {
    expect(extractMode("op running lsb")).toBe("LSB");
  });

  it("matches SSB", () => {
    expect(extractMode("59 SSB QSO")).toBe("SSB");
  });

  it("matches FT8", () => {
    expect(extractMode("FT8 CQ")).toBe("FT8");
  });

  it("matches CW", () => {
    expect(extractMode("CW QRP 5W")).toBe("CW");
  });

  it("does not treat AMAZING as AM", () => {
    expect(extractMode("AMAZING signal tonight")).toBeNull();
  });

  it("matches FM as a whole token", () => {
    expect(extractMode("local FM net")).toBe("FM");
  });

  it("matches DMR", () => {
    expect(extractMode("DMR talkgroup 91")).toBe("DMR");
  });

  it("matches C4FM", () => {
    expect(extractMode("Yaesu C4FM Fusion")).toBe("C4FM");
  });

  it("returns null for an empty comment", () => {
    expect(extractMode("")).toBeNull();
  });
});

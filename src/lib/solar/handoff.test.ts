import { describe, expect, it } from "vitest";
import { parseSolarHandoff, solarAnalysisMode, solarWizardMode } from "./handoff";
describe("solar operating handoff", () => {
  it("preserves exact coordinates, mode and planning time while deriving the grid", () => {
    const result = parseSolarHandoff({ version: 1, mode: "CW", target: { lat: 35.68, lon: 139.76, grid: "bogus", name: "Tokyo" }, at: "2026-09-05T12:00:00Z" });
    expect(result?.target).toMatchObject({ lat: 35.68, lon: 139.76, grid: "PM95vq", name: "Tokyo" });
    expect(result?.mode).toBe("CW"); expect(result?.at).toBe("2026-09-05T12:00:00.000Z");
  });
  it("missing station or target does not prevent a live-context handoff", () => {
    expect(parseSolarHandoff({ version: 1, mode: "FT8" })).toEqual({ version: 1, mode: "FT8" });
  });
  it.each([{ version: 2, mode: "CW" }, { version: 1, mode: "invalid" }, { version: 1, mode: "CW", at: "invalid" }, { version: 1, mode: "CW", target: { lat: 91, lon: 0 } }])("rejects invalid intent", (value) => expect(parseSolarHandoff(value)).toBeNull());
  it.each(["FT4", "RTTY", "CW", "SSB", "FT8"] as const)("preserves supported %s wizard intent", (mode) => expect(solarWizardMode(mode)).toBe(mode));
  it("explicitly maps modes unsupported by the path engine", () => expect(solarAnalysisMode("FT4")).toBe("FT8"));
});

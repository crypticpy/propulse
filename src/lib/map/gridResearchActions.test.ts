import { describe, expect, it } from "vitest";
import { resolveGridResearchActionIntent } from "./gridResearchActions";

describe("resolveGridResearchActionIntent", () => {
  it("resolves every visible operator-panel action", () => {
    expect(
      resolveGridResearchActionIntent("watch", {
        kind: "callsign",
        callsign: "AC6J",
        grid: "EM10",
      }),
    ).toEqual({
      kind: "watch",
      criteria: { callsign: "AC6J", txOrRx: "either" },
    });
    expect(
      resolveGridResearchActionIntent("watch", {
        kind: "grid",
        grid: "em10",
      }),
    ).toEqual({
      kind: "watch",
      criteria: { gridPrefix: "EM10", txOrRx: "either" },
    });
    expect(
      resolveGridResearchActionIntent("pin", {
        kind: "callsign",
        callsign: "AC6J",
        grid: "EM10",
      }),
    ).toMatchObject({
      kind: "pin",
      location: { grid: "EM10" },
    });
    expect(
      resolveGridResearchActionIntent("setTarget", {
        kind: "grid",
        grid: "GG87",
      }),
    ).toMatchObject({ kind: "setTarget", target: { grid: "GG87" } });
    expect(
      resolveGridResearchActionIntent("close", { kind: "grid", grid: "" }),
    ).toEqual({ kind: "close" });
  });

  it("does not dispatch coordinate actions for an invalid grid", () => {
    expect(
      resolveGridResearchActionIntent("pin", {
        kind: "callsign",
        callsign: "AC6J",
      }),
    ).toEqual({ kind: "invalid" });
    expect(
      resolveGridResearchActionIntent("setTarget", {
        kind: "grid",
        grid: "",
      }),
    ).toEqual({ kind: "invalid" });
  });
});

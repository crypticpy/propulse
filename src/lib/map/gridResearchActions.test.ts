import { describe, expect, it } from "vitest";
import { resolveGridResearchActionIntent } from "./gridResearchActions";

describe("resolveGridResearchActionIntent", () => {
  it("resolves every visible operator-panel action", () => {
    expect(resolveGridResearchActionIntent("watch", "EM10", "AC6J")).toEqual({
      kind: "watch",
      criteria: { callsign: "AC6J", txOrRx: "either" },
    });
    expect(resolveGridResearchActionIntent("watch", "em10")).toEqual({
      kind: "watch",
      criteria: { gridPrefix: "EM10", txOrRx: "either" },
    });
    expect(resolveGridResearchActionIntent("pin", "EM10")).toMatchObject({
      kind: "pin",
      location: { grid: "EM10" },
    });
    expect(
      resolveGridResearchActionIntent("setTarget", "GG87"),
    ).toMatchObject({ kind: "setTarget", target: { grid: "GG87" } });
    expect(resolveGridResearchActionIntent("close", "")).toEqual({
      kind: "close",
    });
  });

  it("does not dispatch coordinate actions for an invalid grid", () => {
    expect(resolveGridResearchActionIntent("pin", "AC6J")).toEqual({
      kind: "invalid",
    });
    expect(resolveGridResearchActionIntent("setTarget", "")).toEqual({
      kind: "invalid",
    });
  });
});

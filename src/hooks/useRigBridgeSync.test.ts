import { describe, expect, it } from "vitest";
import { parseRigUpdatePayload } from "./useRigBridgeSync";

describe("parseRigUpdatePayload", () => {
  it("passes through connected and status fields when present", () => {
    expect(
      parseRigUpdatePayload({
        connected: true,
        frequency: 14_074_000,
        mode: "USB",
        band: "20m",
        ptt: true,
      }),
    ).toEqual({
      connected: true,
      status: { frequency: 14_074_000, mode: "USB", band: "20m", ptt: true },
    });
  });

  it("propagates the rig's observed ptt state independent of connected/frequency", () => {
    expect(parseRigUpdatePayload({ ptt: true })).toEqual({
      connected: undefined,
      status: { ptt: true },
    });
    expect(parseRigUpdatePayload({ ptt: false })).toEqual({
      connected: undefined,
      status: { ptt: false },
    });
  });

  it("leaves connected undefined and status empty when the payload carries neither", () => {
    expect(parseRigUpdatePayload({})).toEqual({
      connected: undefined,
      status: {},
    });
  });

  it("ignores fields with the wrong type", () => {
    expect(
      parseRigUpdatePayload({
        // @ts-expect-error - exercising runtime guard against malformed payloads
        frequency: "14074000",
        // @ts-expect-error - exercising runtime guard against malformed payloads
        ptt: "true",
      }),
    ).toEqual({ connected: undefined, status: {} });
  });
});

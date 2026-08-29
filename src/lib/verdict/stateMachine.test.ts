import { describe, expect, it } from "vitest";
import {
  advance,
  DOWNGRADE_HOLD_MS,
  UPGRADE_HOLD_MS,
  holdFor,
  initialMachineState,
} from "./stateMachine";

const T0 = 1_756_000_000_000;
const MIN = 60 * 1000;

describe("holdFor", () => {
  it("upgrades use the short hold, downgrades the long one", () => {
    expect(holdFor("closed", "confirmed")).toBe(UPGRADE_HOLD_MS);
    expect(holdFor("closed", "surprise")).toBe(UPGRADE_HOLD_MS);
    expect(holdFor("confirmed", "likely")).toBe(DOWNGRADE_HOLD_MS);
    expect(holdFor("surprise", "closed")).toBe(DOWNGRADE_HOLD_MS);
  });
});

describe("advance", () => {
  it("agreeing raw keeps state and clears a pending candidate", () => {
    let s = initialMachineState("likely", T0);
    s = advance(s, "confirmed", T0 + MIN).state; // candidate starts
    expect(s.candidate).toBe("confirmed");
    const r = advance(s, "likely", T0 + 2 * MIN);
    expect(r.state.candidate).toBeNull();
    expect(r.state.stable).toBe("likely");
    expect(r.flip).toBeNull();
  });

  it("upgrade promotes only after the short hold", () => {
    let s = initialMachineState("closed", T0);
    s = advance(s, "confirmed", T0).state;
    // Just before the hold: no flip
    let r = advance(s, "confirmed", T0 + UPGRADE_HOLD_MS - 1);
    expect(r.flip).toBeNull();
    expect(r.state.stable).toBe("closed");
    // At the hold: flip
    r = advance(r.state, "confirmed", T0 + UPGRADE_HOLD_MS);
    expect(r.flip).toEqual({
      from: "closed",
      to: "confirmed",
      at: T0 + UPGRADE_HOLD_MS,
    });
    expect(r.state.stable).toBe("confirmed");
    expect(r.state.candidate).toBeNull();
  });

  it("downgrade needs the full 20-minute hold", () => {
    let s = initialMachineState("confirmed", T0);
    s = advance(s, "closed", T0).state;
    let r = advance(s, "closed", T0 + UPGRADE_HOLD_MS);
    expect(r.flip).toBeNull(); // short hold is NOT enough for a downgrade
    r = advance(r.state, "closed", T0 + DOWNGRADE_HOLD_MS - 1);
    expect(r.flip).toBeNull();
    r = advance(r.state, "closed", T0 + DOWNGRADE_HOLD_MS);
    expect(r.flip?.to).toBe("closed");
  });

  it("a flap mid-hold restarts the streak (no flip)", () => {
    let s = initialMachineState("confirmed", T0);
    s = advance(s, "closed", T0).state;
    // Spots return briefly — raw agrees with stable again
    s = advance(s, "confirmed", T0 + 10 * MIN).state;
    expect(s.candidate).toBeNull();
    // Quiet again: the 20-minute clock starts over
    s = advance(s, "closed", T0 + 12 * MIN).state;
    const r = advance(s, "closed", T0 + 12 * MIN + DOWNGRADE_HOLD_MS - 1);
    expect(r.flip).toBeNull();
    expect(r.state.stable).toBe("confirmed");
  });

  it("switching candidates restarts the streak", () => {
    let s = initialMachineState("closed", T0);
    s = advance(s, "likely", T0).state;
    // Candidate switches to surprise: clock restarts
    s = advance(s, "surprise", T0 + 4 * MIN).state;
    expect(s.candidate).toBe("surprise");
    expect(s.candidateSince).toBe(T0 + 4 * MIN);
    const r = advance(s, "surprise", T0 + 4 * MIN + UPGRADE_HOLD_MS);
    expect(r.flip?.to).toBe("surprise");
  });

  it("stableSince tracks the last promotion", () => {
    let s = initialMachineState("closed", T0);
    s = advance(s, "likely", T0).state;
    const r = advance(s, "likely", T0 + UPGRADE_HOLD_MS);
    expect(r.state.stableSince).toBe(T0 + UPGRADE_HOLD_MS);
  });
});

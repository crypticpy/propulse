import { beforeEach, describe, expect, it } from "vitest";
import { useOpsPostureStore } from "./opsPostureStore";

describe("opsPostureStore", () => {
  beforeEach(() => {
    localStorage.removeItem("propulse-ops-posture");
    useOpsPostureStore.getState().reset();
  });

  it("enters Contact from Observe and remembers the origin", () => {
    useOpsPostureStore.getState().enterContact({
      callsign: "py2abc",
      band: "20m",
    });
    expect(useOpsPostureStore.getState()).toMatchObject({
      posture: "contact",
      contactCallsign: "PY2ABC",
      contactBand: "20m",
      enteredFrom: "observe",
      userPanned: false,
      cameraSnapshot: null,
    });
    expect(useOpsPostureStore.getState().frameGeneration).toBe(1);
  });

  it("restores Desk after a Desk-origin Contact and Observe otherwise", () => {
    useOpsPostureStore.getState().setDesk();
    useOpsPostureStore.getState().enterContact({ callsign: "K1ABC" });
    useOpsPostureStore.getState().exitContact();
    expect(useOpsPostureStore.getState().posture).toBe("desk");

    useOpsPostureStore.getState().reset();
    useOpsPostureStore.getState().enterContact({ callsign: "K1ABC" });
    useOpsPostureStore.getState().exitContact();
    expect(useOpsPostureStore.getState().posture).toBe("observe");
  });

  it("captures the camera once and ignores later snapshots", () => {
    useOpsPostureStore.getState().enterContact({ callsign: "K1ABC" });
    useOpsPostureStore.getState().captureCameraSnapshot({ x: 1, y: 2, z: 3 });
    useOpsPostureStore.getState().captureCameraSnapshot({ x: 9, y: 9, z: 9 });
    expect(useOpsPostureStore.getState().cameraSnapshot).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("only records a pan while in Contact", () => {
    useOpsPostureStore.getState().markUserPanned();
    expect(useOpsPostureStore.getState().userPanned).toBe(false);
    useOpsPostureStore.getState().enterContact({ callsign: "K1ABC" });
    useOpsPostureStore.getState().markUserPanned();
    expect(useOpsPostureStore.getState().userPanned).toBe(true);
  });

  it("persists Desk as the preferred non-contact posture", () => {
    useOpsPostureStore.getState().setDesk();
    expect(useOpsPostureStore.getState().deskPreferred).toBe(true);
    useOpsPostureStore.getState().enterContact({ callsign: "K1ABC" });
    useOpsPostureStore.getState().exitContact();
    expect(useOpsPostureStore.getState().posture).toBe("desk");
    useOpsPostureStore.getState().exitContact("observe");
    expect(useOpsPostureStore.getState().deskPreferred).toBe(false);
  });
});

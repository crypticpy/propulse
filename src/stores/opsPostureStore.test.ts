import { beforeEach, describe, expect, it } from "vitest";
import { useOperatingStateStore } from "./operatingStateStore";
import { useOpsPostureStore } from "./opsPostureStore";

describe("opsPostureStore", () => {
  beforeEach(() => {
    localStorage.removeItem("propulse-ops-posture");
    useOpsPostureStore.getState().reset();
    useOperatingStateStore.getState().reset();
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

  describe("as a writer into the shared operating state (#658)", () => {
    it("puts the station being worked, and its band, on the shared cursor", () => {
      useOpsPostureStore.getState().enterContact({ callsign: "py2abc", band: "20m" });

      expect(useOperatingStateStore.getState().cursor.contact).toEqual({
        callsign: "PY2ABC",
        band: "20m",
      });
      expect(useOperatingStateStore.getState().cursor.band).toBe("20m");
    });

    it("clears the shared contact when Contact is left", () => {
      useOpsPostureStore.getState().enterContact({ callsign: "K1ABC", band: "40m" });
      useOpsPostureStore.getState().exitContact();
      expect(useOperatingStateStore.getState().cursor.contact).toBeNull();

      useOpsPostureStore.getState().enterContact({ callsign: "K1ABC", band: "40m" });
      useOpsPostureStore.getState().setDesk();
      expect(useOperatingStateStore.getState().cursor.contact).toBeNull();
    });

    it("projects a contact chosen on another screen down into the local fields", () => {
      useOperatingStateStore.getState().setContact({ callsign: "VK3ABC", band: "15m" });

      expect(useOpsPostureStore.getState().contactCallsign).toBe("VK3ABC");
      expect(useOpsPostureStore.getState().contactBand).toBe("15m");
      // Posture stays local: another screen must not yank this one into
      // Contact framing.
      expect(useOpsPostureStore.getState().posture).toBe("observe");
    });
  });
});

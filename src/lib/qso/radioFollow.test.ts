import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QSO_FORM } from "@/types/qso";
import { DEFAULT_UI_INTERACTION } from "@/types/user";
import type { DXSpot } from "@/types/dxcluster";
import { useKioskStore } from "@/stores/kioskStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { maybeTuneOnMapClick } from "./mapClickTune";
import {
  applyCatFrequencyFollow,
  shouldWipeDraftOnQsy,
} from "./radioFollow";

function spot(): DXSpot {
  return {
    id: "spot-1",
    spotter: "W1AW",
    dx: "PY2ABC",
    frequency: 14074,
    mode: "FT8",
    comment: "CQ",
    time: new Date("2026-09-04T12:00:00Z"),
    band: "20m",
  };
}

describe("shouldWipeDraftOnQsy", () => {
  it("wipes only in Contact when the VFO leaves the working band", () => {
    expect(
      shouldWipeDraftOnQsy({
        posture: "contact",
        enabled: true,
        contactBand: "20m",
        nextBand: "40m",
      }),
    ).toBe(true);
    expect(
      shouldWipeDraftOnQsy({
        posture: "contact",
        enabled: true,
        contactBand: "20m",
        nextBand: "20m",
      }),
    ).toBe(false);
    expect(
      shouldWipeDraftOnQsy({
        posture: "desk",
        enabled: true,
        contactBand: "20m",
        nextBand: "40m",
      }),
    ).toBe(false);
    expect(
      shouldWipeDraftOnQsy({
        posture: "contact",
        enabled: false,
        contactBand: "20m",
        nextBand: "40m",
      }),
    ).toBe(false);
  });
});

describe("applyCatFrequencyFollow", () => {
  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "PY2ABC", frequency: 14074, band: "20m" },
    });
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, qsyWipeOnBandChange: true },
    });
  });

  it("follows VFO inside the same band without wiping the call", () => {
    useOpsPostureStore.getState().enterContact({ callsign: "PY2ABC", band: "20m" });
    applyCatFrequencyFollow(14_074_000);
    expect(useQSOStore.getState().form.callsign).toBe("PY2ABC");
    expect(useQSOStore.getState().form.frequency).toBe(14074);
    expect(useOpsPostureStore.getState().posture).toBe("contact");
  });

  it("wipes the draft and returns to Desk when CAT leaves the band", () => {
    useOpsPostureStore.getState().enterContact({ callsign: "PY2ABC", band: "20m" });
    applyCatFrequencyFollow(7_074_000);
    expect(useQSOStore.getState().form.callsign).toBe("");
    expect(useQSOStore.getState().form.frequency).toBe(7074);
    expect(useOpsPostureStore.getState().posture).toBe("desk");
  });
});

describe("maybeTuneOnMapClick", () => {
  beforeEach(() => {
    useKioskStore.setState({ active: false });
    useRigStore.setState({ pendingFrequency: null, pendingMode: null });
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, spotClickTunesRadio: false },
    });
  });

  it("does not QSY unless the operator enabled click-to-tune", () => {
    maybeTuneOnMapClick(spot());
    expect(useRigStore.getState().pendingFrequency).toBeNull();
  });

  it("stages CAT when click-to-tune is on", () => {
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, spotClickTunesRadio: true },
    });
    maybeTuneOnMapClick(spot());
    expect(useRigStore.getState().pendingFrequency).toBe(14_074_000);
  });
});

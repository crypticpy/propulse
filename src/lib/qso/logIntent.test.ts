import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QSO_FORM } from "@/types/qso";
import type { DXSpot } from "@/types/dxcluster";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useMapStore } from "@/stores/mapStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { getLogEntry } from "@/lib/db/logStore";
import { useProfileStore } from "@/stores/profileStore";
import { useShackStore } from "@/stores/shackStore";
import type { WSJTXQSOLoggedPayload } from "@/types/bridge";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type { UserAntenna } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import { applyLogIntent, commitLogIntent, commitWsjtxLogged } from "./logIntent";

function spot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "spot-1",
    spotter: "W1AW",
    dx: "PY2ABC",
    frequency: 14074,
    mode: "FT8",
    comment: "CQ",
    time: new Date("2026-09-04T12:00:00Z"),
    band: "20m",
    dxLat: -23.5,
    dxLon: -46.6,
    dxGrid: "GG66",
    ...overrides,
  };
}

describe("applyLogIntent", () => {
  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useKioskStore.setState({ active: false });
    useMapOperationalStore.setState({
      manualScope: null,
      workspaceOpen: false,
      selectedReport: null,
    });
    useMapStore.setState({ isDXConsoleExpanded: false, target: null });
    useQSOStore.setState({ form: { ...DEFAULT_QSO_FORM } });
    useRigStore.setState({ pendingFrequency: null, pendingMode: null });
  });

  it("inspects without prefilling the logger", () => {
    const result = applyLogIntent("inspect", spot());
    expect(result).toEqual({ status: "ok" });
    expect(useQSOStore.getState().form.callsign).toBe("");
    expect(useOpsPostureStore.getState().posture).toBe("observe");
    expect(useMapStore.getState().target).toMatchObject({
      lat: -23.5,
      lon: -46.6,
      name: "PY2ABC",
    });
  });

  it("Work prefills, opens the console, and enters Contact", () => {
    const result = applyLogIntent("work", spot());
    expect(result).toEqual({ status: "ok" });
    expect(useQSOStore.getState().form).toMatchObject({
      callsign: "PY2ABC",
      frequency: 14074,
      mode: "FT8",
    });
    expect(useOpsPostureStore.getState()).toMatchObject({
      posture: "contact",
      contactCallsign: "PY2ABC",
      contactBand: "20m",
    });
    expect(useMapStore.getState().isDXConsoleExpanded).toBe(true);
    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(useMapOperationalStore.getState().manualScope).toBeNull();
  });

  it("does not clobber a dirty draft", () => {
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "K1ABC", frequency: 14000 },
    });
    const result = applyLogIntent("work", spot());
    expect(result).toEqual({ status: "pending-replace" });
    expect(useQSOStore.getState().form.callsign).toBe("K1ABC");
    expect(useOpsPostureStore.getState().pendingReplace?.dx).toBe("PY2ABC");
    expect(useOpsPostureStore.getState().posture).toBe("observe");
  });

  it("replaces a dirty draft when asked", () => {
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "K1ABC" },
    });
    const result = applyLogIntent("work", spot(), { replace: true });
    expect(result).toEqual({ status: "ok" });
    expect(useQSOStore.getState().form.callsign).toBe("PY2ABC");
    expect(useOpsPostureStore.getState().pendingReplace).toBeNull();
    expect(useOpsPostureStore.getState().posture).toBe("contact");
  });

  it("Tune stages CAT and does not prefill", () => {
    const result = applyLogIntent("tune", spot());
    expect(result).toEqual({ status: "ok" });
    expect(useRigStore.getState().pendingFrequency).toBe(14_074_000);
    expect(useQSOStore.getState().form.callsign).toBe("");
    expect(useOpsPostureStore.getState().posture).toBe("observe");
  });

  it("ignores Work on a kiosk", () => {
    useKioskStore.setState({ active: true });
    const result = applyLogIntent("work", spot());
    expect(result).toEqual({ status: "ignored", reason: "kiosk" });
    expect(useQSOStore.getState().form.callsign).toBe("");
    expect(useOpsPostureStore.getState().posture).toBe("observe");
  });
});

const equipment: RadioEquipment = {
  id: "ic-7300",
  manufacturer: "Icom",
  model: "IC-7300",
  receiver: {
    rmdr: 90,
    imdr3: 85,
    blockingGain: 120,
    sensitivity: 0.2,
  },
  maxPower: 100,
  minPower: 5,
  modes: ["CW", "SSB", "FT8"],
  bands: ["20m"],
  tier: "midrange",
};

const userRadio: UserRadio = {
  id: "owned-radio",
  equipmentId: equipment.id,
  nickname: "Desk 7300",
  addedAt: "2026-01-01T00:00:00Z",
};

const antenna: UserAntenna = {
  id: "hex",
  name: "Hex Beam",
  antennaType: "hex_beam",
  gainPatternType: "hex_beam",
  bands: ["20m"],
  heightMeters: 12,
  polarization: "horizontal",
  mounting: "tower",
  addedAt: "2026-01-01T00:00:00Z",
};

const chain: StationChain = {
  id: "chain-1",
  name: "HF",
  nodes: [
    { type: "radio", radioId: "owned-radio" },
    { type: "antenna", antennaId: "hex" },
  ],
  feedlineRuns: [],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-01-01T00:00:00Z",
};

describe("commitLogIntent", () => {
  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useKioskStore.setState({ active: false });
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "K1ABC", frequency: 14074, mode: "FT8" },
    });
  });

  it("writes the book and parks the operator in Desk", async () => {
    useOpsPostureStore.getState().enterContact({ callsign: "K1ABC", band: "20m" });
    const result = await commitLogIntent();
    expect(result.status).toBe("logged");
    if (result.status !== "logged") return;
    const entry = await getLogEntry(result.id);
    expect(entry?.callsign).toBe("K1ABC");
    expect(useQSOStore.getState().form.callsign).toBe("");
    expect(useOpsPostureStore.getState().posture).toBe("desk");
  });
});

describe("commitWsjtxLogged", () => {
  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useKioskStore.setState({ active: false });
    useMapStore.setState({ target: null });
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "PY2ABC", frequency: 14074 },
    });
    useShackStore.setState({
      radios: [userRadio],
      customRadios: [equipment],
      antennas: [antenna],
      stationChains: [chain],
      activeChainId: "chain-1",
    });
    useProfileStore.setState({
      station: {
        callsign: "w1aw",
        homeLocationId: "home",
        activeLocationId: "home",
        savedLocations: [],
        grid: "FN31",
        lat: 41.7,
        lon: -72.7,
      },
    });
  });

  it("commits WSJT-X into the logbook without clobbering the draft", async () => {
    const payload: WSJTXQSOLoggedPayload = {
      callsign: "ja1xyz",
      grid: "PM95",
      frequency: 14_074_000,
      mode: "FT8",
      reportSent: "-12",
      reportReceived: "+05",
      txPower: "50",
      comments: "CQ",
      timestamp: "2026-09-04T16:20:00.000Z",
    };
    const result = await commitWsjtxLogged(payload);
    expect(result.status).toBe("logged");
    if (result.status !== "logged") return;
    const entry = await getLogEntry(result.id);
    expect(entry).toMatchObject({
      callsign: "JA1XYZ",
      frequency: 14074,
      band: "20m",
      mode: "FT8",
      rstSent: "-12",
      rstRcvd: "+05",
      grid: "PM95",
      txPower: 50,
      myRig: "Desk 7300",
      myAntenna: "Hex Beam",
      myGrid: "FN31",
      stationCallsign: "W1AW",
    });
    expect(useQSOStore.getState().form.callsign).toBe("PY2ABC");
    expect(useMapStore.getState().target).toMatchObject({
      name: "JA1XYZ",
      grid: "PM95",
    });
  });

  it("is the adapter contract Aether/SDR should call instead of the form", async () => {
    const fakeSdrAdapter = (logged: WSJTXQSOLoggedPayload) =>
      commitWsjtxLogged(logged);
    const result = await fakeSdrAdapter({
      callsign: "K2SDR",
      frequency: 7_074_000,
      mode: "FT4",
      reportSent: "-08",
      reportReceived: "-10",
      txPower: "",
      comments: "",
      timestamp: "2026-09-04T16:21:00.000Z",
    });
    expect(result.status).toBe("logged");
    expect(useQSOStore.getState().form.callsign).toBe("PY2ABC");
  });
});

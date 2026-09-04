/**
 * Fixtures documenting the LogIntent contract for adapters that do not exist
 * yet: Aether (digital-mode SDR console) and a Web SDR click-to-work flow.
 * Both are expected to integrate through the same `applyLogIntent` /
 * `commitWsjtxLogged` spine cluster, map, and WSJT-X already use -- see the
 * doc comments above those exports in logIntent.ts.
 *
 * Mirrors the store setup/mocking style of logIntent.test.ts rather than
 * refactoring it.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QSO_FORM } from "@/types/qso";
import { DEFAULT_UI_INTERACTION } from "@/types/user";
import type { DXSpot } from "@/types/dxcluster";
import { getLogEntry } from "@/lib/db/logStore";
import { useContestStore, type ContestSession } from "@/stores/contestStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useMapStore } from "@/stores/mapStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useProfileStore } from "@/stores/profileStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useShackStore } from "@/stores/shackStore";
import type { WSJTXQSOLoggedPayload } from "@/types/bridge";
import { applyLogIntent, commitWsjtxLogged } from "./logIntent";

function spot(overrides: Partial<DXSpot> = {}): DXSpot {
  return {
    id: "webrx-1",
    spotter: "WEBSDR",
    dx: "F4ABC",
    frequency: 14074,
    mode: "FT8",
    comment: "web click",
    time: new Date("2026-09-04T12:00:00Z"),
    band: "20m",
    dxLat: 48.85,
    dxLon: 2.35,
    dxGrid: "JN18",
    ...overrides,
  };
}

function contestSession(overrides: Partial<ContestSession> = {}): ContestSession {
  return {
    id: "session-1",
    contestId: "cq-ww-ssb",
    myExchange: "599",
    categories: {
      operator: "single-op",
      power: "high",
      mode: "ssb",
      band: "all",
    },
    startTime: "2026-09-04T00:00:00.000Z",
    isActive: true,
    qsos: [],
    currentSerial: 1,
    multipliers: [],
    totalPoints: 0,
    totalMultipliers: 0,
    totalScore: 0,
    runMode: "run",
    ...overrides,
  };
}

describe("aetherCompletedQso fixture (future Aether digital adapter)", () => {
  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useKioskStore.setState({ active: false });
    useMapStore.setState({ target: null, justLogged: null });
    // Prefill a dirty draft first -- the adapter must never touch it.
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "K1DIRTY", frequency: 7074 },
    });
    useShackStore.setState({
      radios: [],
      customRadios: [],
      antennas: [],
      stationChains: [],
      activeChainId: null,
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

  const aetherCompletedQso: WSJTXQSOLoggedPayload = {
    callsign: "sp5xyz",
    grid: "KO02",
    frequency: 14_074_000,
    mode: "FT8",
    reportSent: "-10",
    reportReceived: "-14",
    txPower: "20",
    comments: "via Aether",
    timestamp: "2026-09-04T18:00:00.000Z",
  };

  it("writes the book and leaves the in-progress draft untouched", async () => {
    const result = await commitWsjtxLogged(aetherCompletedQso);
    expect(result.status).toBe("logged");
    if (result.status !== "logged") return;

    const entry = await getLogEntry(result.id);
    expect(entry).toMatchObject({
      callsign: "SP5XYZ",
      band: "20m",
      mode: "FT8",
      grid: "KO02",
    });

    // The dirty draft prefilled in beforeEach must be exactly as it was.
    expect(useQSOStore.getState().form).toMatchObject({
      callsign: "K1DIRTY",
      frequency: 7074,
    });
  });

  it("is ignored while a kiosk is active", async () => {
    useKioskStore.setState({ active: true });
    const result = await commitWsjtxLogged(aetherCompletedQso);
    expect(result).toEqual({ status: "ignored", reason: "kiosk" });
    expect(useQSOStore.getState().form.callsign).toBe("K1DIRTY");
  });
});

describe("webSdrClick fixture (future Web SDR click-to-work adapter)", () => {
  const webSdrClick = spot();

  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useKioskStore.setState({ active: false });
    useContestStore.setState({ activeSession: null });
    useMapOperationalStore.setState({
      manualScope: null,
      workspaceOpen: false,
      selectedReport: null,
    });
    useMapStore.setState({ isDXConsoleExpanded: false, target: null });
    useQSOStore.setState({ form: { ...DEFAULT_QSO_FORM } });
    useRigStore.setState({ pendingFrequency: null, pendingMode: null });
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, spotClickTunesRadio: false },
    });
  });

  /** What a Web SDR click handler is expected to call. */
  function simulateWebSdrClick(clicked: DXSpot) {
    const workResult = applyLogIntent("work", clicked);
    const tuneEnabled =
      useSettingsStore.getState().uiInteraction?.spotClickTunesRadio === true;
    const tuneResult = tuneEnabled
      ? applyLogIntent("tune", clicked)
      : undefined;
    return { workResult, tuneResult };
  }

  it("work prefills the logger and enters Contact", () => {
    const { workResult } = simulateWebSdrClick(webSdrClick);
    expect(workResult).toEqual({ status: "ok" });
    expect(useQSOStore.getState().form).toMatchObject({
      callsign: "F4ABC",
      frequency: 14074,
      mode: "FT8",
    });
    expect(useOpsPostureStore.getState()).toMatchObject({
      posture: "contact",
      contactCallsign: "F4ABC",
    });
  });

  it("skips tune when click-to-tune is off", () => {
    const { tuneResult } = simulateWebSdrClick(webSdrClick);
    expect(tuneResult).toBeUndefined();
    expect(useRigStore.getState().pendingFrequency).toBeNull();
  });

  it("stages CAT via tune when click-to-tune is on", () => {
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, spotClickTunesRadio: true },
    });
    const { tuneResult } = simulateWebSdrClick(webSdrClick);
    expect(tuneResult).toEqual({ status: "ok" });
    expect(useRigStore.getState().pendingFrequency).toBe(14_074_000);
  });

  it("kiosk ignores both work and tune", () => {
    useKioskStore.setState({ active: true });
    useSettingsStore.setState({
      uiInteraction: { ...DEFAULT_UI_INTERACTION, spotClickTunesRadio: true },
    });
    const { workResult, tuneResult } = simulateWebSdrClick(webSdrClick);
    expect(workResult).toEqual({ status: "ignored", reason: "kiosk" });
    expect(tuneResult).toEqual({ status: "ignored", reason: "kiosk" });
    expect(useQSOStore.getState().form.callsign).toBe("");
    expect(useRigStore.getState().pendingFrequency).toBeNull();
  });

  it("contest dock still ignores work", () => {
    useContestStore.setState({ activeSession: contestSession() });
    const result = applyLogIntent("work", webSdrClick);
    expect(result).toEqual({ status: "ignored", reason: "contest-dock" });
    expect(useQSOStore.getState().form.callsign).toBe("");
  });
});

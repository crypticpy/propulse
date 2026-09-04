import { commitMapSpotSelection } from "@/hooks/useMapSpotSelection";
import { invalidateDxccCache } from "@/hooks/useDxccStatus";
import { addLogEntry } from "@/lib/db/logStore";
import { mapSpotModeToRigMode } from "@/lib/map/spotPresentation";
import { currentStationLogStamp } from "@/lib/station/stationLogStamp";
import { getDeviceId } from "@/lib/sync/deviceId";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useDXStore } from "@/stores/dxStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useMapStore } from "@/stores/mapStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import type { WSJTXQSOLoggedPayload } from "@/types/bridge";
import type { DXSpot } from "@/types/dxcluster";

export type LogIntentVerb = "inspect" | "work" | "tune" | "log";

export interface ApplyLogIntentOptions {
  /** Skip dirty-form protection and replace the draft. */
  replace?: boolean;
}

export type LogIntentResult =
  | { status: "ok" }
  | { status: "ignored"; reason: "kiosk" | "contest-dock" | "missing-spot" }
  | { status: "pending-replace" }
  | { status: "logged"; id: string }
  | { status: "duplicate" }
  | { status: "empty" };

function currentDockTab(): "dx" | "log" | "contest" {
  const sessionId = useContestStore.getState().activeSession?.id ?? null;
  const dockKey = sessionId ?? "no-session";
  const stored = useContestUIStore.getState().dockTabBySessionId[dockKey];
  if (stored) return stored;
  return sessionId ? "contest" : "dx";
}

function inspectSpot(spot: DXSpot): void {
  commitMapSpotSelection(spot, {
    setSelectedSpot: useDXStore.getState().setSelectedSpot,
    setTarget: useMapStore.getState().setTarget,
    setSelectedReport: useMapOperationalStore.getState().setSelectedReport,
  });
}

function prefillFromSpot(spot: DXSpot): void {
  useQSOStore.getState().setFromSpot({
    callsign: spot.dx,
    frequency: spot.frequency,
    mode: spot.mode || "SSB",
  });
}

function isDraftDirty(nextCallsign: string): boolean {
  const current = useQSOStore.getState().form.callsign.trim().toUpperCase();
  return current.length > 0 && current !== nextCallsign.trim().toUpperCase();
}

function enterContactFromSpot(spot: DXSpot): void {
  useOpsPostureStore.getState().enterContact({
    callsign: spot.dx,
    band: spot.band,
  });
  useMapStore.getState().setDXConsoleExpanded(true);
  useMapOperationalStore.getState().setWorkspaceOpen(true);
}

function frequencyToKHz(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return 0;
  return frequencyHz / 1000;
}

function parseWsjtxPower(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function utcDateParts(iso: string | undefined): { date: string; timeOn: string } {
  const parsed = iso ? new Date(iso) : new Date();
  const when = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    date: when.toISOString().slice(0, 10),
    timeOn: when.toISOString().slice(11, 16),
  };
}

/**
 * Single integration spine for cluster, map, CAT, WSJT-X, and future
 * Aether/SDR adapters. Inspect never prefills. Work prefills and frames.
 * Tune is CAT-only. Log commits qsoStore. Digital logs never clobber the
 * operator's in-progress draft.
 *
 * Aether/Web SDR authors: call this (or `commitWsjtxLogged` below) instead
 * of writing to qsoStore/logStore directly. See `logIntent.adapters.test.ts`
 * for the fixtures a new adapter is expected to satisfy.
 */
export function applyLogIntent(
  verb: Exclude<LogIntentVerb, "log">,
  spot: DXSpot | null | undefined,
  options: ApplyLogIntentOptions = {},
): LogIntentResult {
  if (useKioskStore.getState().active) {
    return { status: "ignored", reason: "kiosk" };
  }

  if (verb === "inspect") {
    if (!spot) return { status: "ignored", reason: "missing-spot" };
    inspectSpot(spot);
    return { status: "ok" };
  }

  if (verb === "tune") {
    if (!spot) return { status: "ignored", reason: "missing-spot" };
    const rig = useRigStore.getState();
    rig.setPendingFrequency(spot.frequency * 1000);
    rig.setPendingMode(mapSpotModeToRigMode(spot.mode, spot.frequency));
    return { status: "ok" };
  }

  // work
  if (!spot) return { status: "ignored", reason: "missing-spot" };
  if (currentDockTab() === "contest") {
    return { status: "ignored", reason: "contest-dock" };
  }

  inspectSpot(spot);

  if (!options.replace && isDraftDirty(spot.dx)) {
    useOpsPostureStore.getState().setPendingReplace(spot);
    return { status: "pending-replace" };
  }

  prefillFromSpot(spot);
  enterContactFromSpot(spot);
  return { status: "ok" };
}

export async function commitLogIntent(): Promise<LogIntentResult> {
  if (useKioskStore.getState().active) {
    return { status: "ignored", reason: "kiosk" };
  }
  const callsign = useQSOStore.getState().form.callsign.trim();
  if (!callsign) return { status: "empty" };

  const id = await useQSOStore.getState().logQSO();
  if (!id) return { status: "empty" };
  invalidateDxccCache();
  useOpsPostureStore.getState().exitContact("desk");

  // Cheap pulse: only fires when a target with coordinates is already on
  // the map (e.g. from an earlier Work/inspect), so this never triggers a
  // new lookup or touches the draft.
  const target = useMapStore.getState().target;
  if (target) {
    useMapStore.getState().setJustLogged({
      callsign,
      lat: target.lat,
      lon: target.lon,
      grid: target.grid,
      at: Date.now(),
    });
  }

  return { status: "logged", id };
}

const MAX_WSJTX_FINGERPRINTS = 256;
const seenWsjtxLogs = new Map<string, true>();

function wsjtxLogFingerprint(payload: WSJTXQSOLoggedPayload): string {
  return [
    payload.callsign?.trim().toUpperCase() ?? "",
    payload.timestamp ?? "",
    String(payload.frequency ?? ""),
    payload.mode?.trim().toUpperCase() ?? "",
    payload.reportSent ?? "",
    payload.reportReceived ?? "",
  ].join("\0");
}

function rememberWsjtxLog(fingerprint: string): boolean {
  if (seenWsjtxLogs.has(fingerprint)) return true;
  seenWsjtxLogs.set(fingerprint, true);
  if (seenWsjtxLogs.size > MAX_WSJTX_FINGERPRINTS) {
    const oldest = seenWsjtxLogs.keys().next().value;
    if (oldest) seenWsjtxLogs.delete(oldest);
  }
  return false;
}

/**
 * WSJT-X (and future digital adapters) write the book directly.
 * Does not touch the Contact/Desk draft.
 *
 * Aether/Web SDR authors: see `logIntent.adapters.test.ts` for the fixtures
 * this contract is expected to satisfy.
 */
export async function commitWsjtxLogged(
  payload: WSJTXQSOLoggedPayload,
): Promise<LogIntentResult> {
  if (useKioskStore.getState().active) {
    return { status: "ignored", reason: "kiosk" };
  }
  const callsign = payload.callsign?.trim().toUpperCase() ?? "";
  if (!callsign) return { status: "empty" };

  const fingerprint = wsjtxLogFingerprint(payload);
  if (rememberWsjtxLog(fingerprint)) {
    return { status: "duplicate" };
  }

  const frequency = frequencyToKHz(payload.frequency);
  const { date, timeOn } = utcDateParts(payload.timestamp);
  const stamp = currentStationLogStamp({
    powerOverride: parseWsjtxPower(payload.txPower),
  });
  const grid = payload.grid?.trim().toUpperCase() || undefined;

  try {
    const id = await addLogEntry({
      callsign,
      frequency,
      mode: payload.mode?.trim() || "FT8",
      band: (frequency > 0 ? bandFromFreq(frequency) : null) ?? "",
      date,
      timeOn,
      rstSent: payload.reportSent?.trim() || undefined,
      rstRcvd: payload.reportReceived?.trim() || undefined,
      grid,
      notes: payload.comments?.trim() || undefined,
      txPower: stamp.txPower,
      myRig: stamp.myRig,
      myAntenna: stamp.myAntenna,
      myGrid: stamp.myGrid,
      stationCallsign: stamp.stationCallsign,
      version: 1,
      lastDeviceId: getDeviceId(),
    });
    invalidateDxccCache();
    if (grid && isValidGrid(grid)) {
      try {
        const { lat, lon } = gridToLatLon(grid);
        useMapStore.getState().setTarget({ lat, lon, grid, name: callsign });
        useMapStore.getState().setJustLogged({
          callsign,
          lat,
          lon,
          grid,
          at: Date.now(),
        });
      } catch {
        // Invalid grids stay off the globe; the QSO is still in the book.
      }
    }
    return { status: "logged", id };
  } catch (error) {
    seenWsjtxLogs.delete(fingerprint);
    console.error("[logIntent] WSJT-X log failed:", error);
    return { status: "empty" };
  }
}

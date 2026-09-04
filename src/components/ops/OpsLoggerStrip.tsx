/**
 * Compact always-on QSO strip for Contact and Desk postures.
 * Call · Freq · Mode · RST · Enter. DXCC color and dupe live on the callsign.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DxccStatusBadge, DupeWarningBadge } from "@/components/qso";
import { useCallsignLookup } from "@/hooks/useCallsignLookup";
import { useDupeCheck } from "@/hooks/useDupeCheck";
import { useDxccStatus } from "@/hooks/useDxccStatus";
import { useQSOEntry } from "@/hooks/useQSOEntry";
import { formatBearing, formatDistance, getPathMetrics } from "@/lib/utils/path";
import { applyLogIntent, commitLogIntent } from "@/lib/qso/logIntent";
import { currentStationLogStamp } from "@/lib/station/stationLogStamp";
import { useMapStore } from "@/stores/mapStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useShackStore } from "@/stores/shackStore";
import { useUserStore } from "@/stores/userStore";

const FIELD =
  "h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 font-mono text-sm text-white placeholder-gray-500 focus:border-plasma-orange/50 focus:outline-none focus:ring-1 focus:ring-plasma-orange/30";

export function OpsLoggerStrip() {
  const {
    form,
    dupeInfo,
    lookupLoading,
    setField,
    resetForm,
  } = useQSOEntry();
  useCallsignLookup();
  useDupeCheck();

  const dxccStatus = useDxccStatus(form.callsign, form.band, form.mode);
  const posture = useOpsPostureStore((s) => s.posture);
  const pendingReplace = useOpsPostureStore((s) => s.pendingReplace);
  const setPendingReplace = useOpsPostureStore((s) => s.setPendingReplace);
  const exitContact = useOpsPostureStore((s) => s.exitContact);
  const target = useMapStore((s) => s.target);
  const station = useUserStore((s) => s.station);
  const shackKey = useShackStore(
    (s) =>
      `${s.activeChainId ?? ""}:${s.activePresetId ?? ""}:${s.activeRadioId ?? ""}`,
  );
  const callsignRef = useRef<HTMLInputElement>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [loggedFlash, setLoggedFlash] = useState<string | null>(null);

  useEffect(() => {
    if (posture === "contact") {
      const timer = window.setTimeout(() => callsignRef.current?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [posture, form.callsign]);

  const path = (() => {
    if (!station || !target) return null;
    try {
      return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
    } catch {
      return null;
    }
  })();

  const stationLine = useMemo(() => {
    void shackKey;
    return currentStationLogStamp({
      powerOverride: form.txPower,
    }).stationLine;
  }, [form.txPower, shackKey]);

  const handleLog = useCallback(
    async (forceDupe = false) => {
      if (!form.callsign.trim() || isLogging) return;
      if (dupeInfo?.isDupe && !forceDupe) return;

      setIsLogging(true);
      const call = form.callsign.trim().toUpperCase();
      try {
        const result = await commitLogIntent();
        if (result.status === "logged") {
          setLoggedFlash(call);
          window.setTimeout(() => setLoggedFlash(null), 1400);
          window.setTimeout(() => callsignRef.current?.focus(), 50);
        }
      } finally {
        setIsLogging(false);
      }
    },
    [dupeInfo?.isDupe, form.callsign, isLogging],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void handleLog(true);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void handleLog(false);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        resetForm();
        exitContact();
      }
    },
    [exitContact, handleLog, resetForm],
  );

  const canLog = form.callsign.trim().length > 0 && !isLogging;
  const dupeBlocks = Boolean(dupeInfo?.isDupe);

  return (
    <div
      className="shrink-0 border-b border-white/10 bg-black/40 px-3 py-2"
      data-ops-posture={posture}
    >
      {pendingReplace && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-plasma-orange/30 bg-plasma-orange/10 px-3 py-2">
          <div className="text-xs text-gray-200">
            Replace current draft{" "}
            <span className="font-mono text-white">
              {form.callsign || "(empty)"}
            </span>{" "}
            with{" "}
            <span className="font-mono text-plasma-orange">
              {pendingReplace.dx}
            </span>
            ?
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyLogIntent("work", pendingReplace, { replace: true })}
              className="rounded border border-plasma-orange/40 bg-plasma-orange/25 px-2 py-1 text-xs font-bold text-plasma-orange"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => setPendingReplace(null)}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300"
            >
              Keep
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-[9rem] flex-1">
          <span className="sr-only">Callsign</span>
          <input
            ref={callsignRef}
            id="ops-logger-callsign"
            aria-label="Callsign"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={form.callsign}
            placeholder="CALL"
            onChange={(event) =>
              setField("callsign", event.target.value.toUpperCase())
            }
            onKeyDown={handleKeyDown}
            className={`${FIELD} uppercase tracking-wide`}
          />
        </label>

        <DxccStatusBadge dxccStatus={dxccStatus} />

        <label className="w-24">
          <span className="sr-only">Frequency in kHz</span>
          <input
            aria-label="Frequency in kHz"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={form.frequency > 0 ? form.frequency : ""}
            placeholder="kHz"
            onChange={(event) => {
              const parsed = parseFloat(event.target.value);
              setField("frequency", Number.isFinite(parsed) ? parsed : 0);
            }}
            onKeyDown={handleKeyDown}
            className={FIELD}
          />
        </label>

        <label className="w-20">
          <span className="sr-only">Mode</span>
          <select
            aria-label="Mode"
            value={form.mode}
            onChange={(event) => setField("mode", event.target.value)}
            className={FIELD}
          >
            {["FT8", "FT4", "CW", "SSB", "RTTY", "FM", "AM"].map((mode) => (
              <option key={mode} value={mode} className="bg-deep-space">
                {mode}
              </option>
            ))}
            {form.mode &&
              !["FT8", "FT4", "CW", "SSB", "RTTY", "FM", "AM"].includes(
                form.mode,
              ) && (
                <option value={form.mode} className="bg-deep-space">
                  {form.mode}
                </option>
              )}
          </select>
        </label>

        <label className="w-16">
          <span className="sr-only">RST sent</span>
          <input
            aria-label="RST sent"
            type="text"
            value={form.rstSent}
            placeholder="RST"
            onChange={(event) => setField("rstSent", event.target.value)}
            onKeyDown={handleKeyDown}
            className={`${FIELD} text-center`}
          />
        </label>

        <button
          type="button"
          onClick={() => void handleLog(false)}
          disabled={!canLog || dupeBlocks}
          className={`h-9 rounded-md px-3 text-xs font-bold uppercase tracking-wide ${
            canLog && !dupeBlocks
              ? "bg-signal-green/20 text-signal-green hover:bg-signal-green/30"
              : "cursor-not-allowed bg-white/5 text-gray-600"
          }`}
          title={
            dupeBlocks
              ? "Duplicate — Ctrl+Enter to log anyway"
              : "Log QSO (Enter)"
          }
        >
          {isLogging ? "…" : "Log"}
        </button>

        {path && (
          <div
            className="hidden items-center gap-2 font-mono text-[10px] text-gray-400 sm:flex"
            data-contact-bearing
          >
            <span>
              {Math.round(path.shortPath.bearing)
                .toString()
                .padStart(3, "0")}
              ° {formatBearing(path.shortPath.bearing)}
            </span>
            <span>{formatDistance(path.shortPath.distance)}</span>
            <span className="text-gray-600">
              RX {Math.round(path.shortPath.reciprocal)}°
            </span>
          </div>
        )}

        {stationLine && (
          <span
            className="hidden max-w-[14rem] truncate font-mono text-[10px] text-gray-500 sm:inline"
            title={stationLine}
            data-station-gear
          >
            {stationLine}
          </span>
        )}

        {loggedFlash && (
          <span className="font-mono text-[10px] text-signal-green">
            Logged {loggedFlash}
          </span>
        )}

        {lookupLoading && (
          <span className="text-[10px] text-gray-500">Lookup…</span>
        )}

        <Link
          to="/log"
          className="ml-auto text-[10px] text-cosmic-cyan hover:text-white"
        >
          Open book →
        </Link>
      </div>

      <DupeWarningBadge
        dupeInfo={dupeInfo}
        callsign={form.callsign}
        band={form.band}
        mode={form.mode}
      />
    </div>
  );
}

export default OpsLoggerStrip;

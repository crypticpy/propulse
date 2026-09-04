/**
 * QSOEntryForm — Flat, mode-aware, speed-optimized QSO entry panel.
 *
 * Mission-control aesthetic: everything visible at once, no accordions.
 * Operating mode pills at top, primary entry row, slim lookup strip,
 * indicator strip, field grid, mode-specific context fields, notes.
 *
 * Enter-to-log from callsign input. Escape clears form.
 * Focus returns to callsign after successful log.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useQSOEntry } from "@/hooks/useQSOEntry";
import { useCallsignLookup } from "@/hooks/useCallsignLookup";
import { useDupeCheck } from "@/hooks/useDupeCheck";
import { useDxccStatus } from "@/hooks/useDxccStatus";
import { CallsignInput } from "./CallsignInput";
import { FrequencyInput } from "./FrequencyInput";
import { ModeSelector } from "./ModeSelector";
import { RSTInput } from "./RSTInput";
import { DupeWarningBadge } from "./DupeWarningBadge";
import { DxccStatusBadge } from "./DxccStatusBadge";
import { QSOSuccessToast } from "./QSOSuccessToast";
import type { OperatingMode, QSOLookupResult } from "@/types/qso";
import {
  useActiveChain,
  useShackStore,
  useStationChains,
} from "@/stores/shackStore";
import { useRigStore } from "@/stores/rigStore";
import {
  isFieldActivationSig,
  pickChainForActivation,
} from "@/lib/station/stationKit";

// ── Public Interface ─────────────────────────────────────────────────────────

export interface QSOEntryFormProps {
  /** Callback after a QSO is successfully logged */
  onQSOLogged?: (id: string) => void;
}

// ── Operating Mode Config ────────────────────────────────────────────────────

interface ModeConfig {
  key: OperatingMode;
  label: string;
}

const OPERATING_MODES: ModeConfig[] = [
  { key: "general", label: "General" },
  { key: "pota", label: "POTA" },
  { key: "sota", label: "SOTA" },
  { key: "contest", label: "Contest" },
  { key: "fieldday", label: "Field Day" },
];

// ── Compact Field Input ──────────────────────────────────────────────────────

function CompactField({
  label,
  id,
  value,
  onChange,
  placeholder,
  mono = false,
  autoFilled = false,
  maxLength,
  type = "text",
  inputMode,
}: {
  label: string;
  id: string;
  value: string | number | null;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFilled?: boolean;
  maxLength?: number;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal";
}) {
  const displayValue = value === null || value === 0 ? "" : String(value);

  return (
    <div className="flex flex-col gap-0.5">
      <label
        htmlFor={id}
        className="text-[10px] uppercase tracking-wider text-gray-500 leading-none select-none"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
        className={`
          h-8 px-2
          bg-white/5 border rounded-md
          text-white text-sm
          placeholder-gray-600
          focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
          focus:outline-none
          transition-colors
          ${mono ? "font-mono" : ""}
          ${autoFilled ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
          ${type === "number" ? "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" : ""}
        `}
      />
    </div>
  );
}

// ── Lookup Strip ─────────────────────────────────────────────────────────────

function LookupStrip({
  lookupResult,
  lookupLoading,
  lookupError,
  callsignLength,
}: {
  lookupResult: QSOLookupResult | null;
  lookupLoading: boolean;
  lookupError: string | null;
  callsignLength: number;
}) {
  // Only show loading when callsign is long enough to trigger lookup
  const showLoading = lookupLoading && callsignLength >= 3;

  if (lookupError) {
    return (
      <div className="h-8 flex items-center px-3 rounded-md bg-alert-red/5 border border-alert-red/20">
        <span className="text-xs font-mono text-alert-red truncate">
          {lookupError}
        </span>
      </div>
    );
  }

  if (showLoading) {
    return (
      <div className="h-8 flex items-center px-3 rounded-md bg-white/[0.02] border border-white/5">
        <div className="flex items-center gap-2">
          <svg
            className="animate-spin h-3 w-3 text-plasma-orange"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-xs text-gray-500 font-mono">Looking up...</span>
        </div>
      </div>
    );
  }

  if (!lookupResult) return null;

  const parts: string[] = [];
  if (lookupResult.name) parts.push(lookupResult.name);
  if (lookupResult.qth) parts.push(lookupResult.qth);
  if (lookupResult.country) parts.push(lookupResult.country);
  const locationStr = parts.join(", ");

  return (
    <div className="h-8 flex items-center px-3 rounded-md bg-white/[0.02] border border-white/5 overflow-hidden">
      <div className="flex items-center gap-3 text-xs font-mono text-gray-400 truncate min-w-0">
        <span className="text-white font-semibold shrink-0">
          {lookupResult.callsign}
        </span>
        {locationStr && (
          <>
            <span className="text-gray-600">&mdash;</span>
            <span className="truncate">{locationStr}</span>
          </>
        )}
        {lookupResult.grid && (
          <span className="text-gray-500 shrink-0">
            <span className="text-gray-600">Grid:</span>
            <span className="text-signal-green/70 ml-1">
              {lookupResult.grid}
            </span>
          </span>
        )}
        {lookupResult.cqZone != null && (
          <span className="text-gray-500 shrink-0">
            <span className="text-gray-600">CQ:</span>
            {lookupResult.cqZone}
          </span>
        )}
        {lookupResult.ituZone != null && (
          <span className="text-gray-500 shrink-0">
            <span className="text-gray-600">ITU:</span>
            {lookupResult.ituZone}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Indicator Strip ──────────────────────────────────────────────────────────

function IndicatorStrip({
  dupeInfo,
  callsign,
  band,
  mode,
}: {
  dupeInfo: Parameters<typeof DupeWarningBadge>[0]["dupeInfo"];
  callsign: string;
  band: string;
  mode: string;
}) {
  if (!dupeInfo?.isDupe) return null;

  return (
    <div className="flex items-center gap-2">
      <DupeWarningBadge
        dupeInfo={dupeInfo}
        callsign={callsign}
        band={band}
        mode={mode}
      />
    </div>
  );
}

// ── Context Fields (mode-specific) ───────────────────────────────────────────

function ContextFields({
  operatingMode,
  form,
  setField,
}: {
  operatingMode: OperatingMode;
  form: {
    mySig: string;
    mySigInfo: string;
    sig: string;
    sigInfo: string;
    contestId: string;
    stx: string;
    srx: string;
    fieldDayClass: string;
    fieldDaySection: string;
  };
  setField: (field: string, value: string) => void;
}) {
  if (operatingMode === "general") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <CompactField
          label="Their Program"
          id="qso-sig"
          value={form.sig}
          onChange={(v) => setField("sig", v)}
          placeholder="POTA"
        />
        <CompactField
          label="Their Ref"
          id="qso-sig-info"
          value={form.sigInfo}
          onChange={(v) => setField("sigInfo", v)}
          placeholder="K-1234"
          mono
        />
      </div>
    );
  }

  if (operatingMode === "pota") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <CompactField
          label="My Park Ref"
          id="qso-my-sig-info"
          value={form.mySigInfo}
          onChange={(v) => setField("mySigInfo", v)}
          placeholder="K-1234"
          mono
        />
        <CompactField
          label="Their Program"
          id="qso-sig"
          value={form.sig}
          onChange={(v) => setField("sig", v)}
          placeholder="POTA"
        />
        <CompactField
          label="Their Ref"
          id="qso-sig-info"
          value={form.sigInfo}
          onChange={(v) => setField("sigInfo", v)}
          placeholder="K-5678"
          mono
        />
      </div>
    );
  }

  if (operatingMode === "sota") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <CompactField
          label="My Summit Ref"
          id="qso-my-sig-info"
          value={form.mySigInfo}
          onChange={(v) => setField("mySigInfo", v)}
          placeholder="W1/GM-001"
          mono
        />
        <CompactField
          label="Their Program"
          id="qso-sig"
          value={form.sig}
          onChange={(v) => setField("sig", v)}
          placeholder="SOTA"
        />
        <CompactField
          label="Their Ref"
          id="qso-sig-info"
          value={form.sigInfo}
          onChange={(v) => setField("sigInfo", v)}
          placeholder="W2/NJ-001"
          mono
        />
      </div>
    );
  }

  if (operatingMode === "contest") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <CompactField
          label="Contest ID"
          id="qso-contest-id"
          value={form.contestId}
          onChange={(v) => setField("contestId", v)}
          placeholder="CQ-WPX"
          mono
        />
        <CompactField
          label="Serial Sent"
          id="qso-stx"
          value={form.stx}
          onChange={(v) => setField("stx", v)}
          placeholder="001"
          mono
          inputMode="numeric"
        />
        <CompactField
          label="Serial Rcvd"
          id="qso-srx"
          value={form.srx}
          onChange={(v) => setField("srx", v)}
          placeholder="001"
          mono
          inputMode="numeric"
        />
      </div>
    );
  }

  // fieldday
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        <CompactField
          label="Contest ID"
          id="qso-contest-id"
          value={form.contestId}
          onChange={(v) => setField("contestId", v)}
          placeholder="ARRL-FD"
          mono
        />
        <CompactField
          label="Class"
          id="qso-fd-class"
          value={form.fieldDayClass}
          onChange={(v) => setField("fieldDayClass", v.toUpperCase())}
          placeholder="2A"
          mono
          maxLength={4}
        />
        <CompactField
          label="Section"
          id="qso-fd-section"
          value={form.fieldDaySection}
          onChange={(v) => setField("fieldDaySection", v.toUpperCase())}
          placeholder="EPA"
          mono
          maxLength={4}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CompactField
          label="Serial Sent"
          id="qso-stx"
          value={form.stx}
          onChange={(v) => setField("stx", v)}
          placeholder="001"
          mono
          inputMode="numeric"
        />
        <CompactField
          label="Serial Rcvd"
          id="qso-srx"
          value={form.srx}
          onChange={(v) => setField("srx", v)}
          placeholder="001"
          mono
          inputMode="numeric"
        />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function QSOEntryForm({ onQSOLogged }: QSOEntryFormProps) {
  const formContainerRef = useRef<HTMLDivElement>(null);
  const callsignRowRef = useRef<HTMLDivElement>(null);

  const {
    form,
    lookupResult,
    lookupLoading,
    lookupError,
    dupeInfo,
    operatingMode,
    rigConnected,
    setField,
    resetForm,
    logQSO,
    setOperatingMode,
  } = useQSOEntry();

  const chains = useStationChains();
  const activeChain = useActiveChain();
  const setActiveChain = useShackStore((s) => s.setActiveChain);
  const rigPower = useRigStore((s) => s.power);
  const kitTouchedRef = useRef(false);

  useEffect(() => {
    if (form.txPower != null) return;
    const next =
      rigPower > 0 ? rigPower : (activeChain?.operatingPowerWatts ?? null);
    if (next != null) setField("txPower", next);
  }, [activeChain?.operatingPowerWatts, form.txPower, rigPower, setField]);

  useEffect(() => {
    if (!isFieldActivationSig(form.mySig) || kitTouchedRef.current) return;
    const next = pickChainForActivation(
      chains,
      activeChain?.id ?? null,
      form.mySig,
    );
    if (next && next !== form.chainId) {
      setField("chainId", next);
    }
    if (next && next !== activeChain?.id) {
      setActiveChain(next);
    }
  }, [activeChain?.id, chains, form.chainId, form.mySig, setActiveChain, setField]);

  // Activate auto-lookup and dupe check hooks
  useCallsignLookup();
  useDupeCheck();

  // DXCC working status
  const dxccStatus = useDxccStatus(form.callsign, form.band, form.mode);

  // Success toast
  const [toast, setToast] = useState<{ visible: boolean; callsign: string }>({
    visible: false,
    callsign: "",
  });

  // Logging state
  const [isLogging, setIsLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);

  // ── Handle Log ──────────────────────────────────────────────────────────

  const handleLog = useCallback(async () => {
    if (!form.callsign.trim()) return;
    if (isLogging) return;

    setIsLogging(true);
    const loggedCallsign = form.callsign.trim().toUpperCase();

    try {
      const id = await logQSO();
      if (id) {
        setLogSuccess(true);
        setToast({ visible: true, callsign: loggedCallsign });
        onQSOLogged?.(id);

        // Reset success flash after 600ms
        setTimeout(() => setLogSuccess(false), 600);

        // Focus callsign input after logging
        setTimeout(() => {
          callsignRowRef.current?.querySelector("input")?.focus();
        }, 50);
      }
    } finally {
      setIsLogging(false);
    }
  }, [form.callsign, isLogging, logQSO, onQSOLogged]);

  // ── Keyboard: Enter-to-log, Escape-to-clear ────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter (without Cmd/Ctrl) logs QSO if callsign input is focused
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        const activeEl = document.activeElement;
        const callsignInput = callsignRowRef.current?.querySelector("input");
        if (activeEl === callsignInput) {
          e.preventDefault();
          handleLog();
        }
      }

      // Escape clears form (only when within form container)
      if (e.key === "Escape") {
        if ((e.target as HTMLElement).closest?.('[role="dialog"]')) return;
        const container = formContainerRef.current;
        if (container && container.contains(document.activeElement)) {
          e.preventDefault();
          resetForm();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleLog, resetForm]);

  // ── Derived State ───────────────────────────────────────────────────────

  const canLog = form.callsign.trim().length > 0;

  // Detect which fields were auto-filled from lookup
  const nameAutoFilled = Boolean(
    lookupResult?.name && form.name === lookupResult.name,
  );
  const gridAutoFilled = Boolean(
    lookupResult?.grid && form.grid === lookupResult.grid,
  );
  const qthAutoFilled = Boolean(
    lookupResult?.qth && form.qth === lookupResult.qth,
  );

  return (
    <div
      ref={formContainerRef}
      className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2"
    >
      {/* ── STATUS BAR: Mode pills + CAT badge ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1"
          role="radiogroup"
          aria-label="Operating mode"
        >
          {OPERATING_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={operatingMode === m.key}
              onClick={() => setOperatingMode(m.key)}
              className={`
                px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150
                ${
                  operatingMode === m.key
                    ? "bg-plasma-orange text-white shadow-sm shadow-plasma-orange/20"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                }
              `}
            >
              {m.label}
            </button>
          ))}
        </div>

        {rigConnected && (
          <span className="inline-flex items-center gap-1 text-xs text-signal-green font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
            CAT
          </span>
        )}
      </div>

      {/* ── PRIMARY ROW: Callsign + DXCC Badge + Frequency + Mode + LOG ──── */}
      <div ref={callsignRowRef} className="flex items-center gap-2">
        {/* Callsign */}
        <div className="flex-[2] min-w-0">
          <CallsignInput
            value={form.callsign}
            onChange={(v) => setField("callsign", v)}
            lookupLoading={lookupLoading}
          />
        </div>

        {/* DXCC Status Badge (desktop: tooltip on hover) */}
        {dxccStatus.status && (
          <div className="shrink-0 hidden sm:block">
            <DxccStatusBadge dxccStatus={dxccStatus} />
          </div>
        )}

        {/* Frequency */}
        <div className="flex-1 min-w-0">
          <FrequencyInput
            value={form.frequency}
            onChange={(v) => setField("frequency", v)}
            band={form.band}
            autoFilled={form.rigSource !== "manual"}
          />
        </div>

        {/* Mode */}
        <div className="w-28 shrink-0">
          <ModeSelector
            value={form.mode}
            onChange={(v) => setField("mode", v)}
          />
        </div>

        {/* LOG button */}
        <button
          type="button"
          onClick={handleLog}
          disabled={!canLog || isLogging}
          aria-label="Log QSO (Enter)"
          className={`
            h-12 rounded-lg font-bold text-sm
            transition-all duration-200 whitespace-nowrap shrink-0
            min-w-[90px]
            ${
              logSuccess
                ? "bg-signal-green text-white scale-105"
                : canLog
                  ? "bg-plasma-orange hover:bg-plasma-orange/80 text-white active:scale-95"
                  : "bg-white/5 text-gray-500 cursor-not-allowed"
            }
          `}
        >
          {isLogging ? (
            <svg
              className="animate-spin h-5 w-5 mx-auto"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : logSuccess ? (
            "Logged!"
          ) : (
            "LOG"
          )}
        </button>
      </div>

      {/* ── DXCC STATUS (mobile: inline below callsign) ───────────────────── */}
      {dxccStatus.status && (
        <div className="sm:hidden">
          <DxccStatusBadge dxccStatus={dxccStatus} showInlineDetail />
        </div>
      )}

      {/* ── LOOKUP STRIP ────────────────────────────────────────────────────── */}
      <LookupStrip
        lookupResult={lookupResult}
        lookupLoading={lookupLoading}
        lookupError={lookupError}
        callsignLength={form.callsign.trim().length}
      />

      {/* ── INDICATOR STRIP ─────────────────────────────────────────────────── */}
      <IndicatorStrip
        dupeInfo={dupeInfo}
        callsign={form.callsign}
        band={form.band}
        mode={form.mode}
      />

      {/* ── FIELD GRID (always visible) ─────────────────────────────────────── */}
      <div className="space-y-1.5">
        {chains.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="qso-chain"
              className="text-[10px] uppercase tracking-wider text-gray-500 leading-none select-none"
            >
              Signal path
            </label>
            <select
              id="qso-chain"
              value={form.chainId || activeChain?.id || ""}
              onChange={(e) => {
                kitTouchedRef.current = true;
                setField("chainId", e.target.value);
              }}
              className="
                h-8 px-2
                bg-white/5 border border-white/10 rounded-md
                text-white text-sm font-mono
                focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                focus:outline-none
                transition-colors
              "
            >
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Row 1: RST Sent, RST Received, TX Power */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <RSTInput
              rstSent={form.rstSent}
              rstRcvd={form.rstRcvd}
              mode={form.mode}
              onRstSentChange={(v) => setField("rstSent", v)}
              onRstRcvdChange={(v) => setField("rstRcvd", v)}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="qso-tx-power"
              className="text-[10px] uppercase tracking-wider text-gray-500 leading-none select-none"
            >
              TX Power (W)
            </label>
            <input
              id="qso-tx-power"
              type="number"
              inputMode="numeric"
              min="0"
              value={form.txPower ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setField("txPower", val ? Number(val) : null);
              }}
              placeholder={
                rigPower > 0
                  ? String(Math.round(rigPower))
                  : activeChain
                    ? String(Math.round(activeChain.operatingPowerWatts))
                    : "100"
              }
              className="
                h-8 px-2
                bg-white/5 border border-white/10 rounded-md
                text-white text-sm font-mono
                placeholder-gray-600
                focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                focus:outline-none
                transition-colors
                [appearance:textfield]
                [&::-webkit-inner-spin-button]:appearance-none
                [&::-webkit-outer-spin-button]:appearance-none
              "
            />
          </div>
        </div>

        {/* Row 2: Grid, Name, QTH */}
        <div className="grid grid-cols-3 gap-2">
          <CompactField
            label="Grid"
            id="qso-grid"
            value={form.grid}
            onChange={(v) => setField("grid", v.toUpperCase())}
            placeholder="FN31pr"
            mono
            maxLength={6}
            autoFilled={gridAutoFilled}
          />
          <CompactField
            label="Name"
            id="qso-name"
            value={form.name}
            onChange={(v) => setField("name", v)}
            placeholder="Name"
            autoFilled={nameAutoFilled}
          />
          <CompactField
            label="QTH"
            id="qso-qth"
            value={form.qth}
            onChange={(v) => setField("qth", v)}
            placeholder="City, State"
            autoFilled={qthAutoFilled}
          />
        </div>
      </div>

      {/* ── CONTEXT FIELDS (mode-specific) ──────────────────────────────────── */}
      <ContextFields
        operatingMode={operatingMode}
        form={form}
        setField={(field, value) => setField(field as keyof typeof form, value)}
      />

      {/* ── NOTES ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-0.5">
        <label
          htmlFor="qso-notes"
          className="text-[10px] uppercase tracking-wider text-gray-500 leading-none select-none"
        >
          Notes
        </label>
        <input
          id="qso-notes"
          type="text"
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Free-form notes..."
          autoComplete="off"
          className="
            h-8 px-2
            bg-white/5 border border-white/10 rounded-md
            text-white text-sm
            placeholder-gray-600
            focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
            focus:outline-none
            transition-colors
          "
        />
      </div>

      {/* ── SUCCESS TOAST ───────────────────────────────────────────────────── */}
      <QSOSuccessToast
        visible={toast.visible}
        callsign={toast.callsign}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </div>
  );
}

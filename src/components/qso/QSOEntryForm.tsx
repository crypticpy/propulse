/**
 * QSOEntryForm — Main QSO entry form (desktop layout).
 *
 * Composes CallsignInput, FrequencyInput, ModeSelector, RSTInput,
 * CallsignInfoCard, DupeWarningBadge, ActivationFields, QSOSuccessToast.
 *
 * Hooks: useQSOEntry, useCallsignLookup, useDupeCheck, useOfflineStatus.
 * Keyboard: Cmd/Ctrl+Enter = Log, Escape = Clear form.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useQSOEntry } from "@/hooks/useQSOEntry";
import { useCallsignLookup } from "@/hooks/useCallsignLookup";
import { useDupeCheck } from "@/hooks/useDupeCheck";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { CallsignInput } from "./CallsignInput";
import { CallsignInfoCard } from "./CallsignInfoCard";
import { FrequencyInput } from "./FrequencyInput";
import { ModeSelector } from "./ModeSelector";
import { RSTInput } from "./RSTInput";
import { DupeWarningBadge } from "./DupeWarningBadge";
import { ActivationFields } from "./ActivationFields";
import { QSOSuccessToast } from "./QSOSuccessToast";

export interface QSOEntryFormProps {
  /** Callback after a QSO is successfully logged */
  onQSOLogged?: (id: string) => void;
}

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export function QSOEntryForm({ onQSOLogged }: QSOEntryFormProps) {
  const formRef = useRef<HTMLDivElement>(null);
  const {
    form,
    lookupResult,
    lookupLoading,
    lookupError,
    dupeInfo,
    setField,
    resetForm,
    logQSO,
  } = useQSOEntry();

  // Activate auto-lookup and dupe check hooks
  useCallsignLookup();
  useDupeCheck();

  const { isOffline } = useOfflineStatus();

  // Collapsible sections
  const [showRST, setShowRST] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Success toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    callsign: string;
  }>({ visible: false, callsign: "" });

  // Logging state for button flash
  const [isLogging, setIsLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);

  // Handle log QSO
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
      }
    } finally {
      setIsLogging(false);
    }
  }, [form.callsign, isLogging, logQSO, onQSOLogged]);

  // Keyboard shortcuts: Cmd/Ctrl+Enter = Log, Escape = Clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleLog();
      }
      if (e.key === "Escape") {
        // Don't clear form if focus is inside a modal/dialog
        if ((e.target as HTMLElement).closest?.('[role="dialog"]')) return;
        // Only reset if focus is within the form element
        const formEl = formRef.current;
        if (formEl && !formEl.contains(document.activeElement)) return;
        e.preventDefault();
        resetForm();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleLog, resetForm]);

  // Auto-open RST section if RST values differ from empty
  const hasRSTValues = form.rstSent || form.rstRcvd;
  const hasLocationValues = form.grid || form.name || form.qth;
  const hasNotes = form.notes;

  const canLog = form.callsign.trim().length > 0;

  return (
    <div
      ref={formRef}
      className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
          QSO Entry
        </h2>
        {isOffline && (
          <span className="text-xs text-caution-amber bg-caution-amber/10 px-2 py-0.5 rounded-full">
            Offline
          </span>
        )}
      </div>

      {/* Primary row: Callsign + Frequency + Mode + LOG */}
      <div className="flex items-center gap-3 mb-3">
        {/* Callsign */}
        <div className="flex-[2] min-w-0">
          <CallsignInput
            value={form.callsign}
            onChange={(v) => setField("callsign", v)}
            lookupLoading={lookupLoading}
          />
        </div>

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
          aria-label="Log QSO (Ctrl+Enter)"
          className={`
            h-12 px-6 rounded-lg font-bold text-sm
            transition-all duration-200 whitespace-nowrap shrink-0
            min-w-[100px]
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
            <>
              LOG IT
              <span className="hidden sm:inline text-[10px] ml-1.5 opacity-60">
                {isMac ? "\u2318" : "Ctrl"}+Enter
              </span>
            </>
          )}
        </button>
      </div>

      {/* Callsign info card */}
      <CallsignInfoCard
        lookupResult={lookupResult}
        lookupLoading={lookupLoading && form.callsign.trim().length >= 3}
        lookupError={lookupError}
        dupeInfo={dupeInfo}
      />

      {/* Dupe warning */}
      {dupeInfo?.isDupe && (
        <div className="mt-3">
          <DupeWarningBadge
            dupeInfo={dupeInfo}
            callsign={form.callsign}
            band={form.band}
            mode={form.mode}
          />
        </div>
      )}

      {/* Collapsible sections */}
      <div className="mt-3 space-y-1">
        {/* RST & Exchange */}
        <CollapsibleSection
          label="RST & Exchange"
          isOpen={showRST || Boolean(hasRSTValues)}
          onToggle={() => setShowRST((p) => !p)}
          hasValues={Boolean(hasRSTValues)}
        >
          <RSTInput
            rstSent={form.rstSent}
            rstRcvd={form.rstRcvd}
            mode={form.mode}
            onRstSentChange={(v) => setField("rstSent", v)}
            onRstRcvdChange={(v) => setField("rstRcvd", v)}
          />
          <div className="mt-3">
            <label
              htmlFor="qso-tx-power"
              className="block text-xs text-gray-500 mb-1"
            >
              TX Power (W)
            </label>
            <input
              id="qso-tx-power"
              aria-label="Transmit power in watts"
              type="number"
              inputMode="numeric"
              min="0"
              value={form.txPower ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setField("txPower", val ? Number(val) : null);
              }}
              placeholder="100"
              className="
                w-32 h-9 px-2
                bg-white/5 border border-white/10 rounded-lg
                text-white text-sm font-mono
                placeholder-gray-500
                focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                focus:outline-none
                [appearance:textfield]
                [&::-webkit-inner-spin-button]:appearance-none
                [&::-webkit-outer-spin-button]:appearance-none
              "
            />
          </div>
        </CollapsibleSection>

        {/* Location */}
        <CollapsibleSection
          label="Location"
          isOpen={showLocation || Boolean(hasLocationValues)}
          onToggle={() => setShowLocation((p) => !p)}
          hasValues={Boolean(hasLocationValues)}
        >
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="qso-name"
                className="block text-xs text-gray-500 mb-1"
              >
                Name
              </label>
              <input
                id="qso-name"
                aria-label="Operator name"
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Name"
                className={`
                  w-full h-9 px-2
                  bg-white/5 border rounded-lg
                  text-white text-sm
                  placeholder-gray-500
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none
                  ${lookupResult?.name && form.name === lookupResult.name ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
                `}
              />
            </div>
            <div>
              <label
                htmlFor="qso-qth"
                className="block text-xs text-gray-500 mb-1"
              >
                QTH
              </label>
              <input
                id="qso-qth"
                aria-label="Location QTH"
                type="text"
                value={form.qth}
                onChange={(e) => setField("qth", e.target.value)}
                placeholder="City, State"
                className={`
                  w-full h-9 px-2
                  bg-white/5 border rounded-lg
                  text-white text-sm
                  placeholder-gray-500
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none
                  ${lookupResult?.qth && form.qth === lookupResult.qth ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
                `}
              />
            </div>
            <div>
              <label
                htmlFor="qso-grid"
                className="block text-xs text-gray-500 mb-1"
              >
                Grid
              </label>
              <input
                id="qso-grid"
                aria-label="Maidenhead grid locator"
                type="text"
                value={form.grid}
                onChange={(e) => setField("grid", e.target.value.toUpperCase())}
                placeholder="FN31pr"
                maxLength={6}
                className={`
                  w-full h-9 px-2
                  bg-white/5 border rounded-lg
                  text-white text-sm font-mono
                  placeholder-gray-500
                  focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  focus:outline-none
                  ${lookupResult?.grid && form.grid === lookupResult.grid ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
                `}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Activation */}
        <ActivationFields
          mySig={form.mySig}
          mySigInfo={form.mySigInfo}
          sig={form.sig}
          sigInfo={form.sigInfo}
          contestId={form.contestId}
          stx={form.stx}
          srx={form.srx}
          onFieldChange={(field, value) => setField(field, value)}
        />

        {/* Notes */}
        <CollapsibleSection
          label="Notes"
          isOpen={showNotes || Boolean(hasNotes)}
          onToggle={() => setShowNotes((p) => !p)}
          hasValues={Boolean(hasNotes)}
        >
          <textarea
            id="qso-notes"
            aria-label="QSO notes"
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Free-form notes..."
            rows={2}
            className="
              w-full px-3 py-2
              bg-white/5 border border-white/10 rounded-lg
              text-white text-sm
              placeholder-gray-500
              focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
              focus:outline-none
              resize-none
            "
          />
        </CollapsibleSection>
      </div>

      {/* Success toast */}
      <QSOSuccessToast
        visible={toast.visible}
        callsign={toast.callsign}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </div>
  );
}

// ── Internal CollapsibleSection helper ─────────────────────────────────────

interface CollapsibleSectionProps {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  hasValues: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  label,
  isOpen,
  onToggle,
  hasValues,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="
          w-full flex items-center gap-2 px-3 py-2.5
          text-sm text-gray-400 hover:text-gray-200
          transition-colors
        "
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path
            d="M3 1L7 5L3 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {label}
        {hasValues && (
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-plasma-orange" />
        )}
      </button>

      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

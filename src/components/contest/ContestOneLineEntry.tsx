/**
 * ContestOneLineEntry - High-speed keyboard-first contest QSO entry
 *
 * Single input field for rapid contest logging with inline status indicators.
 * Parses one-line entries like "K3LR 59 05" into complete QSO records.
 *
 * Phase 3A.1 - Contest Mode Implementation
 * Phase 8.2 - Accessibility: color-blind safe indicators with icons and patterns
 */

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { Card } from "@/components/ui/Card";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";
// Reserved for future zone-based scoring enhancements
// import { useUserStore } from "@/stores/userStore";
import { getContestById } from "@/lib/data/contests";
import {
  parseOneLineEntry,
  extractMultipliers,
  isNewMultiplier,
  type ParsedEntry,
  type ContestQSODraft,
} from "@/lib/contest";

// ============================================================================
// Types
// ============================================================================

export interface ContestOneLineEntryProps {
  /** Current operating band (from CAT or manual selection) */
  band: string;
  /** Current operating mode (from CAT or manual selection) */
  mode: string;
  /** Operating frequency in kHz (optional, from CAT) */
  frequencyKHz?: number;
  /** Whether to block logging dupes (default: false - warn only) */
  blockDupes?: boolean;
  /** Callback when band/mode should auto-advance (future CAT integration) */
  onBandModeChange?: (band: string, mode: string) => void;
  /** Optional class name for styling */
  className?: string;
}

interface EntryStatus {
  /** Whether current input shows a dupe */
  isDupe: boolean;
  /** Whether current input will create new multipliers */
  isNewMult: boolean;
  /** List of new multiplier values */
  newMults: string[];
  /** Validation warnings to display */
  warnings: string[];
  /** Validation errors that prevent logging */
  errors: string[];
  /** Parsed callsign for display */
  callsign: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * ContestOneLineEntry - One-line contest QSO entry component
 *
 * Features:
 * - Single input for callsign + RST + exchange
 * - Real-time dupe checking and "NEW MULT" indicator
 * - Inline validation warnings
 * - Keyboard-only operation (Enter to log, Esc to clear)
 * - Displays sending exchange (RST, serial, myExchange)
 *
 * @example
 * ```tsx
 * <ContestOneLineEntry
 *   band="20m"
 *   mode="CW"
 *   frequencyKHz={14035}
 * />
 * ```
 */
export function ContestOneLineEntry({
  band,
  mode,
  frequencyKHz,
  blockDupes = false,
  onBandModeChange: _onBandModeChange,
  className = "",
}: ContestOneLineEntryProps) {
  // ---- Store selectors (narrow for minimal re-renders) ----
  const activeSession = useContestStore((s) => s.activeSession);
  const logQSO = useContestStore((s) => s.logQSO);
  const incrementSerial = useContestStore((s) => s.incrementSerial);
  const isDupeCheck = useContestStore((s) => s.isDupe);
  // Reserved for future use (CAT integration, zone-based scoring)
  // const isMultiplierWorked = useContestStore((s) => s.isMultiplierWorked);
  // const station = useUserStore((state) => state.station);

  // ---- Local state ----
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<EntryStatus>({
    isDupe: false,
    isNewMult: false,
    newMults: [],
    warnings: [],
    errors: [],
    callsign: "",
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Contest definition ----
  const contestDefinition = useMemo(() => {
    if (!activeSession) return null;
    return getContestById(activeSession.contestId);
  }, [activeSession]);

  // ---- Sending exchange display ----
  const sendingExchange = useMemo(() => {
    if (!activeSession || !contestDefinition) return "";

    const rstSent = mode === "SSB" ? "59" : "599";
    const serial = activeSession.currentSerial;
    const myExchange = activeSession.myExchange;

    // Build exchange based on contest format
    const exchangeFields = contestDefinition.exchange.fields;

    const parts: string[] = [];

    if (exchangeFields.includes("rst")) {
      parts.push(rstSent);
    }

    if (exchangeFields.includes("serial")) {
      parts.push(String(serial).padStart(3, "0"));
    }

    // Add myExchange (which may contain section, class, zone, etc.)
    if (myExchange) {
      parts.push(myExchange);
    }

    return parts.join(" ");
  }, [activeSession, contestDefinition, mode]);

  // ---- Build worked multipliers map for new mult checking ----
  const workedMultsMap = useMemo(() => {
    if (!activeSession) return new Map<string, Set<string>>();

    const map = new Map<string, Set<string>>();
    for (const mult of activeSession.multipliers) {
      let typeSet = map.get(mult.type);
      if (!typeSet) {
        typeSet = new Set();
        map.set(mult.type, typeSet);
      }
      const key = mult.band
        ? `${mult.value.toUpperCase()}|${mult.band.toLowerCase()}`
        : mult.value.toUpperCase();
      typeSet.add(key);
    }
    return map;
  }, [activeSession]);

  // ---- Parse and validate input on change ----
  const parseAndValidate = useCallback(
    (value: string): EntryStatus => {
      const emptyStatus: EntryStatus = {
        isDupe: false,
        isNewMult: false,
        newMults: [],
        warnings: [],
        errors: [],
        callsign: "",
      };

      if (!value.trim() || !contestDefinition || !activeSession) {
        return emptyStatus;
      }

      // Parse the input
      const parsed: ParsedEntry = parseOneLineEntry({
        input: value,
        contest: contestDefinition,
        defaults: {
          rst: mode === "SSB" ? "59" : "599",
          mode,
          band,
        },
      });

      // No callsign yet - return early
      if (!parsed.callsign || parsed.callsign.length < 2) {
        return {
          ...emptyStatus,
          callsign: parsed.callsign,
          warnings: parsed.warnings.map((w) => w.message),
          errors: parsed.errors.map((e) => e.message),
        };
      }

      // Check for dupe
      const isDupe = isDupeCheck(parsed.callsign, band, mode);

      // Check for new multipliers
      const draft: ContestQSODraft = {
        callsign: parsed.callsign,
        frequency: frequencyKHz ?? 0,
        band,
        mode,
        date: new Date().toISOString().split("T")[0],
        time: new Date().toISOString().slice(11, 16).replace(":", ""),
        rstSent: mode === "SSB" ? "59" : "599",
        rstRcvd: parsed.rstReceived,
        exchangeSent: activeSession.myExchange,
        exchangeRcvd: parsed.exchangeReceived,
        parsedExchange: parsed.parsedFields,
      };

      const extractedMults = extractMultipliers(draft, contestDefinition);
      const newMults: string[] = [];

      for (const mult of extractedMults) {
        if (isNewMultiplier(mult, workedMultsMap)) {
          newMults.push(mult.value);
        }
      }

      // Collect all warnings
      const warnings = parsed.warnings.map((w) => w.message);
      const errors = parsed.errors.map((e) => e.message);

      return {
        isDupe,
        isNewMult: newMults.length > 0,
        newMults,
        warnings,
        errors,
        callsign: parsed.callsign,
      };
    },
    [
      contestDefinition,
      activeSession,
      mode,
      band,
      frequencyKHz,
      isDupeCheck,
      workedMultsMap,
    ],
  );

  // ---- Update status on input change ----
  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.toUpperCase();
      setInput(value);
      setStatus(parseAndValidate(value));
    },
    [parseAndValidate],
  );

  // ---- Log the QSO ----
  const handleLog = useCallback(() => {
    if (!input.trim() || !contestDefinition || !activeSession) return;

    // Parse final input
    const parsed = parseOneLineEntry({
      input,
      contest: contestDefinition,
      defaults: {
        rst: mode === "SSB" ? "59" : "599",
        mode,
        band,
      },
    });

    // Require a valid callsign
    if (!parsed.callsign || parsed.callsign.length < 2) {
      return;
    }

    // Check for dupe
    const isDupe = isDupeCheck(parsed.callsign, band, mode);
    if (isDupe && blockDupes) {
      // Block logging if configured
      return;
    }

    // Get serial number (increments in store)
    const serialSent = incrementSerial();

    // Build the QSO
    const now = new Date();
    const timestamp = now.toISOString();
    const rstSent = mode === "SSB" ? "59" : "599";

    // Build exchange sent
    const exchangeFields = contestDefinition.exchange.fields;
    const exchangeParts: string[] = [];

    if (exchangeFields.includes("rst")) {
      exchangeParts.push(rstSent);
    }
    if (exchangeFields.includes("serial")) {
      exchangeParts.push(String(serialSent));
    }
    if (activeSession.myExchange) {
      exchangeParts.push(activeSession.myExchange);
    }

    const exchangeSent = exchangeParts.join(" ");

    // Calculate points
    let points = 1;
    if (contestDefinition.scoring.mode === "fixed") {
      points = contestDefinition.scoring.fixedPoints || 1;
    } else if (contestDefinition.scoring.mode === "mixed") {
      const normalizedMode = mode.toUpperCase();
      if (normalizedMode === "CW") {
        points = contestDefinition.scoring.cwPoints || 2;
      } else if (normalizedMode === "SSB") {
        points = contestDefinition.scoring.ssbPoints || 1;
      } else {
        points = contestDefinition.scoring.digitalPoints || 2;
      }
    }
    // Zone-based scoring is handled by the store's logQSO method

    // Create QSO object
    const qso: ContestQSO = {
      id: crypto.randomUUID(),
      timestamp,
      callsign: parsed.callsign,
      band,
      mode,
      rstSent,
      rstReceived: parsed.rstReceived,
      exchangeSent,
      exchangeReceived: parsed.exchangeReceived,
      serialSent,
      serialReceived: parsed.parsedFields.serial
        ? parseInt(parsed.parsedFields.serial, 10)
        : undefined,
      points,
      isMultiplier: false, // Will be computed by store
      rawInput: input,
      frequencyKHz,
    };

    // Log the QSO (store handles dupe marking, mult extraction, scoring)
    logQSO(qso);

    // Clear input and keep focus
    setInput("");
    setStatus({
      isDupe: false,
      isNewMult: false,
      newMults: [],
      warnings: [],
      errors: [],
      callsign: "",
    });

    // Maintain focus for rapid logging
    inputRef.current?.focus();
  }, [
    input,
    contestDefinition,
    activeSession,
    mode,
    band,
    frequencyKHz,
    isDupeCheck,
    blockDupes,
    incrementSerial,
    logQSO,
  ]);

  // ---- Handle keyboard events ----
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLog();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        setStatus({
          isDupe: false,
          isNewMult: false,
          newMults: [],
          warnings: [],
          errors: [],
          callsign: "",
        });
        inputRef.current?.focus();
      }
    },
    [handleLog],
  );

  // ---- Focus input on mount ----
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ---- Render ----
  if (!activeSession || !contestDefinition) {
    return (
      <Card className={`p-4 ${className}`}>
        <p className="text-white/50 text-sm">No active contest session</p>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      {/* Header with band/mode and sending exchange */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-plasma-orange font-bold text-lg">
            {band.toUpperCase()}
          </span>
          <span className="text-white/70 font-medium">{mode}</span>
          {frequencyKHz && (
            <span className="text-white/40 text-sm">
              {(frequencyKHz / 1000).toFixed(3)} MHz
            </span>
          )}
        </div>
        <div className="text-white/60 text-sm">
          <span className="text-white/40">TX:</span>{" "}
          <span className="font-mono">{sendingExchange}</span>
        </div>
      </div>

      {/* Main input field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Callsign RST Exchange (e.g., K3LR 59 05)"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`
            w-full px-4 py-3 rounded-lg
            bg-white/5 border text-white font-mono text-lg
            placeholder:text-white/30
            focus:outline-none focus:ring-2
            transition-colors
            ${
              status.isDupe
                ? "border-alert-red/50 focus:ring-alert-red/50"
                : status.isNewMult
                  ? "border-signal-green/50 focus:ring-signal-green/50"
                  : "border-white/20 focus:ring-plasma-orange/50"
            }
          `}
        />

        {/* Status badges positioned inside input - accessible with icons */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {status.isDupe && (
            <span
              className="
                inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold
                bg-alert-red/20 text-alert-red border-2 border-alert-red/50
                animate-pulse
              "
              role="alert"
              aria-live="assertive"
              aria-label="Duplicate contact detected"
            >
              {/* X icon for color-blind accessibility */}
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="line-through decoration-2">DUPE</span>
            </span>
          )}
          {status.isNewMult && !status.isDupe && (
            <span
              className="
                inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold
                bg-signal-green/20 text-signal-green border-2 border-signal-green/50
              "
              role="status"
              aria-live="polite"
              aria-label="New multiplier"
            >
              {/* Star icon for new multiplier - distinct shape */}
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              NEW MULT
            </span>
          )}
        </div>
      </div>

      {/* Status row: validation warnings/errors and mult info */}
      <div className="mt-2 min-h-[1.5rem] flex items-center gap-4 text-sm">
        {/* Callsign echo with accessible styling */}
        {status.callsign && (
          <span
            className={`font-mono font-bold ${
              status.isDupe ? "text-alert-red line-through" : "text-white"
            }`}
            aria-label={
              status.isDupe
                ? `${status.callsign} is a duplicate`
                : status.callsign
            }
          >
            {status.callsign}
          </span>
        )}

        {/* New multiplier values with icon */}
        {status.newMults.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-signal-green"
            role="status"
            aria-label={`New multipliers: ${status.newMults.join(", ")}`}
          >
            {/* Plus icon for new mults */}
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M12 4v16m8-8H4"
              />
            </svg>
            {status.newMults.join(", ")}
          </span>
        )}

        {/* Warnings with icon */}
        {status.warnings.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-caution-amber"
            role="status"
            aria-label={`Warning: ${status.warnings[0]}`}
          >
            {/* Warning triangle icon */}
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {status.warnings[0]}
          </span>
        )}

        {/* Errors with icon */}
        {status.errors.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-alert-red"
            role="alert"
            aria-label={`Error: ${status.errors[0]}`}
          >
            {/* Error X icon */}
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {status.errors[0]}
          </span>
        )}

        {/* Keyboard hints on the right */}
        <div className="ml-auto text-white/30 text-xs">
          <span className="hidden sm:inline">
            <kbd className="px-1 py-0.5 rounded bg-white/10">Enter</kbd> log
            <span className="mx-2">|</span>
            <kbd className="px-1 py-0.5 rounded bg-white/10">Esc</kbd> clear
          </span>
        </div>
      </div>
    </Card>
  );
}

export default ContestOneLineEntry;

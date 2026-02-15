/**
 * AlertRuleBuilder — Centered modal for creating/editing DX spot alert rules.
 *
 * Provides form fields for all rule conditions (callsign pattern, DXCC entity,
 * continent, bands, modes, min SNR) and notification preferences.
 *
 * Uses a centered modal (NOT a flyout panel) per UX rules.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import type {
  AlertRule,
  AlertNotification,
  AlertConditions,
} from "@/lib/db/types";
import { DXCC_ENTITIES } from "@/lib/data/dxccEntities";

// ─── Constants ──────────────────────────────────────────────────────────────

const CONTINENT_OPTIONS = [
  { code: "AF", label: "Africa" },
  { code: "AN", label: "Antarctica" },
  { code: "AS", label: "Asia" },
  { code: "EU", label: "Europe" },
  { code: "NA", label: "North America" },
  { code: "OC", label: "Oceania" },
  { code: "SA", label: "South America" },
] as const;

const BAND_OPTIONS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
] as const;

const MODE_OPTIONS = [
  "CW",
  "SSB",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "JS8",
  "AM",
  "FM",
] as const;

// ─── Props ──────────────────────────────────────────────────────────────────

export interface AlertRuleBuilderProps {
  /** Existing rule to edit (omit for new rule) */
  rule?: AlertRule;
  /** Called with the rule data on save */
  onSave: (rule: Omit<AlertRule, "id" | "createdAt">) => void;
  /** Called when the modal is cancelled */
  onCancel: () => void;
  /** Whether the modal is visible */
  isOpen: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const AlertRuleBuilder: React.FC<AlertRuleBuilderProps> = ({
  rule,
  onSave,
  onCancel,
  isOpen,
}) => {
  // ── Form state ──
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [callsignPattern, setCallsignPattern] = useState("");
  const [entityPattern, setEntityPattern] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);
  const [selectedBands, setSelectedBands] = useState<string[]>([]);
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [selectedContinents, setSelectedContinents] = useState<string[]>([]);
  const [minSnr, setMinSnr] = useState<string>("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserEnabled, setBrowserEnabled] = useState(true);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [contestBehavior, setContestBehavior] = useState<
    "always" | "contest_only" | "non_contest_only"
  >("always");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const entityDropdownRef = useRef<HTMLDivElement>(null);

  // ── Populate form on edit ──
  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setEnabled(rule.enabled);
      setCallsignPattern(rule.conditions.callsignPattern ?? "");
      setEntityPattern(rule.conditions.entityPattern ?? "");
      setEntitySearch(rule.conditions.entityPattern ?? "");
      setSelectedBands(rule.conditions.bands ?? []);
      setSelectedModes(rule.conditions.modes ?? []);
      setSelectedContinents(rule.conditions.continents ?? []);
      setMinSnr(
        rule.conditions.minSnr !== undefined
          ? String(rule.conditions.minSnr)
          : "",
      );
      setSoundEnabled(rule.notification.sound);
      setBrowserEnabled(rule.notification.browser);
      setHighlightEnabled(rule.notification.highlight);
      // contestBehavior is not on the AlertRule type — treat missing as 'always'
      const ruleAny = rule as unknown as Record<string, unknown>;
      setContestBehavior(
        (ruleAny.contestBehavior as
          | "always"
          | "contest_only"
          | "non_contest_only") ?? "always",
      );
    } else {
      // Reset to defaults for new rule
      setName("");
      setEnabled(true);
      setCallsignPattern("");
      setEntityPattern("");
      setEntitySearch("");
      setSelectedBands([]);
      setSelectedModes([]);
      setSelectedContinents([]);
      setMinSnr("");
      setSoundEnabled(true);
      setBrowserEnabled(true);
      setHighlightEnabled(true);
      setContestBehavior("always");
    }
  }, [rule, isOpen]);

  // ── Focus name input on open ──
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ── Close on Escape ──
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  // ── Lock body scroll ──
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ── Close entity dropdown on outside click ──
  useEffect(() => {
    if (!showEntityDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (
        entityDropdownRef.current &&
        !entityDropdownRef.current.contains(e.target as Node)
      ) {
        setShowEntityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEntityDropdown]);

  // ── Entity autocomplete ──
  const filteredEntities = useMemo(() => {
    if (!entitySearch.trim()) return [];
    const query = entitySearch.toLowerCase();
    return DXCC_ENTITIES.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.prefix.toLowerCase().includes(query),
    ).slice(0, 10);
  }, [entitySearch]);

  // ── Toggle helpers ──
  const toggleBand = useCallback((band: string) => {
    setSelectedBands((prev) =>
      prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band],
    );
  }, []);

  const toggleMode = useCallback((mode: string) => {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  }, []);

  const toggleContinent = useCallback((code: string) => {
    setSelectedContinents((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }, []);

  // ── Save handler ──
  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const conditions: AlertConditions = {};
    if (callsignPattern.trim())
      conditions.callsignPattern = callsignPattern.trim();
    if (entityPattern.trim()) conditions.entityPattern = entityPattern.trim();
    if (selectedBands.length > 0) conditions.bands = [...selectedBands];
    if (selectedModes.length > 0) conditions.modes = [...selectedModes];
    if (selectedContinents.length > 0)
      conditions.continents = [...selectedContinents];
    if (minSnr.trim()) {
      const parsed = Number(minSnr);
      if (!isNaN(parsed)) conditions.minSnr = parsed;
    }

    const notification: AlertNotification = {
      sound: soundEnabled,
      browser: browserEnabled,
      highlight: highlightEnabled,
    };

    onSave({
      name: trimmedName,
      enabled,
      conditions,
      notification,
      ...(contestBehavior !== "always" ? { contestBehavior } : {}),
    } as Omit<AlertRule, "id" | "createdAt">);
  }, [
    name,
    enabled,
    callsignPattern,
    entityPattern,
    selectedBands,
    selectedModes,
    selectedContinents,
    minSnr,
    soundEnabled,
    browserEnabled,
    highlightEnabled,
    contestBehavior,
    onSave,
  ]);

  if (!isOpen) return null;

  const isValid = name.trim().length > 0;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={rule ? "Edit alert rule" : "Create alert rule"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-void-black shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-void-black/95 backdrop-blur-sm px-6 py-4">
          <h2 className="text-lg font-semibold text-white font-mono">
            {rule ? "Edit Alert Rule" : "New Alert Rule"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Form body */}
        <div className="px-6 py-4 space-y-5">
          {/* Rule name */}
          <div>
            <label className="block text-sm font-mono text-gray-300 mb-1.5">
              Rule Name <span className="text-alert-red">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Indonesia on 20m"
              className="w-full px-3 py-2 rounded-lg bg-deep-space border border-white/10 text-white font-mono text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50 focus:border-plasma-orange/50"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-gray-300">Enabled</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                enabled ? "bg-signal-green" : "bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* ── Conditions Section ── */}
          <div className="pt-2 border-t border-white/5">
            <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-3">
              Match Conditions
            </h3>

            {/* Callsign pattern */}
            <div className="mb-4">
              <label className="block text-sm font-mono text-gray-300 mb-1.5">
                Callsign Pattern
              </label>
              <input
                type="text"
                value={callsignPattern}
                onChange={(e) => setCallsignPattern(e.target.value)}
                placeholder="e.g., YB*, VK?ABC, 3Y*"
                className="w-full px-3 py-2 rounded-lg bg-deep-space border border-white/10 text-white font-mono text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50"
              />
              <p className="text-xs text-gray-500 mt-1">
                * = any characters, ? = single character
              </p>
            </div>

            {/* DXCC Entity */}
            <div className="mb-4 relative" ref={entityDropdownRef}>
              <label className="block text-sm font-mono text-gray-300 mb-1.5">
                DXCC Entity
              </label>
              <input
                type="text"
                value={entitySearch}
                onChange={(e) => {
                  setEntitySearch(e.target.value);
                  setShowEntityDropdown(true);
                }}
                onFocus={() => {
                  if (entitySearch.trim()) setShowEntityDropdown(true);
                }}
                placeholder="Search by name or prefix..."
                className="w-full px-3 py-2 rounded-lg bg-deep-space border border-white/10 text-white font-mono text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50"
              />
              {showEntityDropdown && filteredEntities.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-space-900 shadow-xl">
                  {filteredEntities.map((entity) => (
                    <button
                      key={`${entity.id}-${entity.prefix}`}
                      type="button"
                      onClick={() => {
                        setEntityPattern(entity.name);
                        setEntitySearch(entity.name);
                        setShowEntityDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm font-mono text-gray-200 hover:bg-white/10 flex items-center gap-2"
                    >
                      <span className="text-plasma-orange">
                        {entity.prefix}
                      </span>
                      <span>{entity.name}</span>
                      <span className="text-gray-500 ml-auto text-xs">
                        {entity.continent}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {entityPattern && entityPattern !== entitySearch && (
                <p className="text-xs text-signal-green mt-1">
                  Selected: {entityPattern}
                </p>
              )}
            </div>

            {/* Continents */}
            <div className="mb-4">
              <label className="block text-sm font-mono text-gray-300 mb-1.5">
                Continents
              </label>
              <div className="flex flex-wrap gap-2">
                {CONTINENT_OPTIONS.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleContinent(c.code)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                      selectedContinents.includes(c.code)
                        ? "bg-nebula-blue/30 border-nebula-blue text-white"
                        : "bg-deep-space border-white/10 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Bands */}
            <div className="mb-4">
              <label className="block text-sm font-mono text-gray-300 mb-1.5">
                Bands
              </label>
              <div className="flex flex-wrap gap-2">
                {BAND_OPTIONS.map((band) => (
                  <button
                    key={band}
                    type="button"
                    onClick={() => toggleBand(band)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                      selectedBands.includes(band)
                        ? "bg-plasma-orange/30 border-plasma-orange text-white"
                        : "bg-deep-space border-white/10 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>

            {/* Modes */}
            <div className="mb-4">
              <label className="block text-sm font-mono text-gray-300 mb-1.5">
                Modes
              </label>
              <div className="flex flex-wrap gap-2">
                {MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => toggleMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                      selectedModes.includes(mode)
                        ? "bg-signal-green/30 border-signal-green text-white"
                        : "bg-deep-space border-white/10 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Min SNR */}
            <div className="mb-4">
              <label className="block text-sm font-mono text-gray-300 mb-1.5">
                Minimum SNR (dB)
              </label>
              <input
                type="number"
                value={minSnr}
                onChange={(e) => setMinSnr(e.target.value)}
                min={-30}
                max={40}
                placeholder="-10"
                className="w-32 px-3 py-2 rounded-lg bg-deep-space border border-white/10 text-white font-mono text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Only triggers if SNR is reported and at or above this value
              </p>
            </div>
          </div>

          {/* ── Notification Section ── */}
          <div className="pt-2 border-t border-white/5">
            <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-3">
              Notifications
            </h3>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/50"
                />
                <span className="text-sm font-mono text-gray-300">
                  Play sound
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={browserEnabled}
                  onChange={(e) => setBrowserEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/50"
                />
                <span className="text-sm font-mono text-gray-300">
                  Browser notification
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={highlightEnabled}
                  onChange={(e) => setHighlightEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/50"
                />
                <span className="text-sm font-mono text-gray-300">
                  Highlight in spot list
                </span>
              </label>
            </div>
          </div>

          {/* ── Contest Behavior Section ── */}
          <div className="pt-2 border-t border-white/5">
            <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-3">
              Contest Behavior
            </h3>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="contestBehavior"
                  checked={contestBehavior === "always"}
                  onChange={() => setContestBehavior("always")}
                  className="w-4 h-4 border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/50"
                />
                <div>
                  <span className="text-sm font-mono text-gray-300">
                    Always alert
                  </span>
                  <p className="text-xs text-gray-500">
                    Triggers during and outside of contests
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="contestBehavior"
                  checked={contestBehavior === "contest_only"}
                  onChange={() => setContestBehavior("contest_only")}
                  className="w-4 h-4 border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/50"
                />
                <div>
                  <span className="text-sm font-mono text-gray-300">
                    Only during contests
                  </span>
                  <p className="text-xs text-gray-500">
                    Only triggers when a contest is active
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="contestBehavior"
                  checked={contestBehavior === "non_contest_only"}
                  onChange={() => setContestBehavior("non_contest_only")}
                  className="w-4 h-4 border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/50"
                />
                <div>
                  <span className="text-sm font-mono text-gray-300">
                    Only outside contests
                  </span>
                  <p className="text-xs text-gray-500">
                    Paused automatically when a contest is detected
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-white/10 bg-void-black/95 backdrop-blur-sm px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-mono text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className={`px-5 py-2 rounded-lg text-sm font-mono font-semibold transition-colors ${
              isValid
                ? "bg-plasma-orange text-black hover:bg-plasma-orange/90"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {rule ? "Save Changes" : "Create Rule"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

AlertRuleBuilder.displayName = "AlertRuleBuilder";

export default AlertRuleBuilder;

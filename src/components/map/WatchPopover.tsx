/**
 * WatchPopover — Main toolbar popover for the Spot Watch system
 *
 * Provides quick-start presets, full filter controls, auto-pan toggle,
 * saved watch management, and a clear button. Replaces the old
 * WatchListPanel slide-in with a popover anchored to the toolbar.
 *
 * Follows the same popover pattern as ColorsPopover / LayersPopover:
 * relative container, absolute panel, click-outside + Escape dismissal.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useWatchStore,
  formatCriteriaSummary,
  MAX_SAVED_WATCHES,
  type WatchCriteria,
} from "@/stores/watchStore";
import { useProfileStore } from "@/stores/profileStore";
import { useContestStore } from "@/stores/contestStore";
import { useMapStore } from "@/stores/mapStore";
import { useFeatureFlags } from "@/lib/featureFlags";
import { getContestById } from "@/lib/data/contests";

// ─── Constants ───────────────────────────────────────────────────────────────

const BAND_OPTIONS = [
  "All",
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
  "2m",
  "70cm",
] as const;

const MODE_OPTIONS = [
  "All",
  "FT8",
  "FT4",
  "CW",
  "SSB",
  "RTTY",
  "PSK31",
  "JS8",
  "SSTV",
] as const;

const CONTINENT_OPTIONS = [
  "All",
  "AF",
  "AN",
  "AS",
  "EU",
  "NA",
  "OC",
  "SA",
] as const;

const DEBOUNCE_MS = 500;

// ─── Local form state interface ──────────────────────────────────────────────

interface FormState {
  callsign: string;
  gridPrefix: string;
  txOrRx: "tx" | "rx" | "either";
  band: string;
  mode: string;
  continent: string;
}

const EMPTY_FORM: FormState = {
  callsign: "",
  gridPrefix: "",
  txOrRx: "either",
  band: "All",
  mode: "All",
  continent: "All",
};

// ─── Pill toggle (matching ColorsPopover / LayersPopover) ────────────────────

function PillToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
        checked ? "bg-signal-green" : "bg-white/10"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
          checked ? "translate-x-3.5 ml-0" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build WatchCriteria from form state, or null if nothing is set */
function formToCriteria(form: FormState): WatchCriteria | null {
  const callsign = form.callsign.trim() || undefined;
  const gridPrefix = form.gridPrefix.trim() || undefined;
  const band = form.band !== "All" ? form.band : undefined;
  const mode = form.mode !== "All" ? form.mode : undefined;
  const continent = form.continent !== "All" ? form.continent : undefined;

  // At least one filter must be set
  if (!callsign && !gridPrefix && !band && !mode && !continent) return null;

  return {
    callsign,
    gridPrefix,
    txOrRx: form.txOrRx,
    band,
    mode,
    continent,
  };
}

/** Map store criteria back to form state */
function criteriaToForm(criteria: WatchCriteria | null): FormState {
  if (!criteria) return EMPTY_FORM;
  return {
    callsign: criteria.callsign ?? "",
    gridPrefix: criteria.gridPrefix ?? "",
    txOrRx: criteria.txOrRx ?? "either",
    band: criteria.band ?? "All",
    mode: criteria.mode ?? "All",
    continent: criteria.continent ?? "All",
  };
}

// ─── Main component ─────────────────────────────────────────────────────────

export function WatchPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const callsignInputRef = useRef<HTMLInputElement>(null);
  const bandSelectRef = useRef<HTMLSelectElement>(null);

  // ── Watch store selectors ──
  const criteria = useWatchStore((s) => s.criteria);
  const enabled = useWatchStore((s) => s.enabled);
  const autoPan = useWatchStore((s) => s.autoPan);
  const neededOnly = useWatchStore((s) => s.neededOnly);
  const matchCount = useWatchStore((s) => s.matchCount);
  const savedWatches = useWatchStore((s) => s.savedWatches);
  const setWatch = useWatchStore((s) => s.setWatch);
  const clearWatch = useWatchStore((s) => s.clearWatch);
  const toggleAutoPan = useWatchStore((s) => s.toggleAutoPan);
  const setMyGridWatch = useWatchStore((s) => s.setMyGridWatch);
  const setContestWatch = useWatchStore((s) => s.setContestWatch);
  const setNeededOnly = useWatchStore((s) => s.setNeededOnly);
  const saveWatch = useWatchStore((s) => s.saveWatch);
  const loadWatch = useWatchStore((s) => s.loadWatch);
  const deleteWatch = useWatchStore((s) => s.deleteWatch);

  // ── Profile store for grid ──
  const stationGrid = useProfileStore((s) => s.station?.grid);

  // ── Contest integration ──
  const activeSession = useContestStore((s) => s.activeSession);
  const activeProfile = useMapStore((s) => s.activeProfile);
  const featureFlags = useFeatureFlags();

  // Show contest section when contest profile is active or a contest session is running
  const isContestMode =
    activeProfile?.id === "contest" || activeSession !== null;
  const activeContestDef = activeSession
    ? getContestById(activeSession.contestId)
    : null;

  // ── Local form state ──
  const [form, setForm] = useState<FormState>(() => criteriaToForm(criteria));
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Track whether the form change is from external sync (store → form)
  const syncingFromStoreRef = useRef(false);

  // ── Sync store criteria → form when criteria changes externally ──
  useEffect(() => {
    syncingFromStoreRef.current = true;
    setForm(criteriaToForm(criteria));
    // Reset flag after React processes the state update
    const id = requestAnimationFrame(() => {
      syncingFromStoreRef.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [criteria]);

  // ── Debounced form → store sync ──
  useEffect(() => {
    // Skip if this change came from store sync
    if (syncingFromStoreRef.current) return;

    const timer = setTimeout(() => {
      const newCriteria = formToCriteria(form);
      if (newCriteria) {
        setWatch(newCriteria);
      }
      // If all filters are empty, do NOT auto-clear (let user explicitly clear)
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.callsign,
    form.gridPrefix,
    form.txOrRx,
    form.band,
    form.mode,
    form.continent,
    setWatch,
  ]);

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── Close on Escape ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Focus save input when shown ──
  useEffect(() => {
    if (showSaveInput && saveInputRef.current) {
      saveInputRef.current.focus();
    }
  }, [showSaveInput]);

  // ── Trigger button label ──
  const isActive = criteria !== null && enabled;
  const triggerSummary = useMemo(() => {
    if (!criteria) return null;
    // Show a short summary: first meaningful filter value
    if (criteria.gridPrefix) return criteria.gridPrefix.toUpperCase();
    if (criteria.callsign) return criteria.callsign.toUpperCase();
    if (criteria.band) return criteria.band;
    if (criteria.mode) return criteria.mode;
    if (criteria.continent) return criteria.continent;
    return "Active";
  }, [criteria]);

  // ── Form updaters ──
  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── Quick start handlers ──
  const handleMyGrid = useCallback(() => {
    if (stationGrid) {
      setMyGridWatch(stationGrid);
    }
  }, [stationGrid, setMyGridWatch]);

  const handleQuickCallsign = useCallback(() => {
    if (callsignInputRef.current) {
      callsignInputRef.current.focus();
      callsignInputRef.current.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const handleQuickBand = useCallback(() => {
    if (bandSelectRef.current) {
      bandSelectRef.current.focus();
      bandSelectRef.current.scrollIntoView({ block: "nearest" });
    }
  }, []);

  // ── Save handler ──
  const handleSave = useCallback(() => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    const result = saveWatch(trimmed);
    if (result) {
      setSaveName("");
      setShowSaveInput(false);
    }
  }, [saveName, saveWatch]);

  // ── Clear handler ──
  const handleClear = useCallback(() => {
    clearWatch();
    setForm(EMPTY_FORM);
  }, [clearWatch]);

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
          open
            ? "bg-white/15 text-white"
            : isActive
              ? "text-white hover:bg-white/10"
              : "text-gray-300 hover:text-white hover:bg-white/10"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {/* Eye/watch icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
          <circle cx="7" cy="7" r="2" />
        </svg>

        {isActive ? (
          <>
            {/* Active indicator dot */}
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
            <span>
              Watch
              {triggerSummary && (
                <span className="text-white/60"> · {triggerSummary}</span>
              )}
            </span>
            {matchCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-signal-green/20 text-signal-green text-[10px] leading-none font-medium">
                {matchCount}
              </span>
            )}
          </>
        ) : (
          <span className="text-white/50">Watch</span>
        )}
      </button>

      {/* ── Popover panel ── */}
      <div
        className={`absolute top-full left-0 mt-1.5 w-[min(320px,calc(100vw-2rem))] z-50 bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3 max-h-[70vh] overflow-y-auto transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        role="group"
        aria-label="Spot Watch filters"
      >
        {/* ── Quick Start ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2 px-0.5">
          Quick Start
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={handleMyGrid}
            disabled={!stationGrid}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={
              stationGrid
                ? `Watch my grid: ${stationGrid}`
                : "Set your grid in Profile first"
            }
          >
            My Grid
            {stationGrid && (
              <span className="ml-1 text-white/40 text-xs">
                {stationGrid.substring(0, 4).toUpperCase()}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleQuickCallsign}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/70 hover:text-white transition-colors"
          >
            Callsign
          </button>
          <button
            type="button"
            onClick={handleQuickBand}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/70 hover:text-white transition-colors"
          >
            Band
          </button>
        </div>

        {/* ── Contest Section (visible when contest profile active or session running) ── */}
        {isContestMode && (
          <>
            <div className="border-t border-white/5 my-2" />
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2 px-0.5 flex items-center gap-1.5">
              <span>Contest</span>
              {!featureFlags.contestWatch && (
                <span className="px-1 py-0.5 rounded bg-caution-amber/20 text-caution-amber text-[8px] font-bold leading-none">
                  PRO
                </span>
              )}
            </div>

            {/* Active contest quick-start */}
            {activeContestDef && (
              <button
                type="button"
                onClick={() => setContestWatch(activeContestDef.id)}
                disabled={!featureFlags.contestWatch}
                className="w-full px-3 py-1.5 rounded-lg bg-caution-amber/10 hover:bg-caution-amber/20 text-sm text-caution-amber/90 hover:text-caution-amber transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed mb-1.5"
                title={
                  featureFlags.contestWatch
                    ? `Watch for ${activeContestDef.name} spots`
                    : "Upgrade to Pro for contest watch"
                }
              >
                <div className="font-medium text-xs truncate">
                  {activeContestDef.name}
                </div>
                <div className="text-[10px] text-white/40 mt-0.5">
                  Auto-configure watch for active contest
                </div>
              </button>
            )}

            {/* Common contest presets */}
            {!activeContestDef && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {(
                  [
                    { id: "cqww-cw", label: "CQWW CW" },
                    { id: "cqww-ssb", label: "CQWW SSB" },
                    { id: "arrl-dx-cw", label: "ARRL DX" },
                    { id: "arrl-fd", label: "Field Day" },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setContestWatch(preset.id)}
                    disabled={!featureFlags.contestWatch}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-caution-amber/10 text-xs text-white/60 hover:text-caution-amber transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={
                      featureFlags.contestWatch
                        ? `Watch for ${preset.label} spots`
                        : "Upgrade to Pro"
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* Needed Only toggle */}
            <div
              className={`flex items-center h-8 px-0.5 rounded transition-colors ${
                featureFlags.contestWatch
                  ? "hover:bg-white/5 cursor-pointer"
                  : "opacity-40 cursor-not-allowed"
              }`}
              onClick={() => {
                if (featureFlags.contestWatch) setNeededOnly(!neededOnly);
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-2.5 shrink-0 transition-colors ${
                  neededOnly && featureFlags.contestWatch
                    ? "bg-caution-amber"
                    : "bg-white/20"
                }`}
              />
              <span
                className={`flex-1 text-xs transition-colors ${
                  neededOnly && featureFlags.contestWatch
                    ? "text-white"
                    : "text-white/60"
                }`}
              >
                Needed multipliers only
              </span>
              <PillToggle
                checked={neededOnly && featureFlags.contestWatch}
                onChange={() => {
                  if (featureFlags.contestWatch) setNeededOnly(!neededOnly);
                }}
                label="Show only needed multiplier spots"
              />
            </div>
          </>
        )}

        {/* ── Divider ── */}
        <div className="border-t border-white/5 my-2" />

        {/* ── Filter Section ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2 px-0.5">
          Filter
        </div>

        <div className="space-y-2.5">
          {/* Callsign */}
          <div>
            <label className="block text-xs text-white/50 mb-1">Callsign</label>
            <input
              ref={callsignInputRef}
              type="text"
              value={form.callsign}
              onChange={(e) => updateField("callsign", e.target.value)}
              placeholder="e.g., 3Y0J or W7*"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-signal-green/50 focus:outline-none"
            />
          </div>

          {/* Grid + TX/RX */}
          <div>
            <label className="block text-xs text-white/50 mb-1">Grid</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.gridPrefix}
                onChange={(e) =>
                  updateField(
                    "gridPrefix",
                    e.target.value.toUpperCase().slice(0, 6),
                  )
                }
                placeholder="e.g., EM73"
                maxLength={6}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-signal-green/50 focus:outline-none font-mono"
              />
              <div className="flex items-center gap-2 shrink-0">
                {(["tx", "rx", "either"] as const).map((dir) => (
                  <label
                    key={dir}
                    className="flex items-center gap-1 cursor-pointer"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.txOrRx === dir}
                      onClick={() => updateField("txOrRx", dir)}
                      className={`w-3 h-3 rounded-full border transition-colors ${
                        form.txOrRx === dir
                          ? "bg-signal-green border-signal-green"
                          : "border-white/30 bg-transparent"
                      }`}
                    />
                    <span className="text-[10px] text-white/50 uppercase">
                      {dir === "either" ? "Any" : dir}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Band */}
          <div>
            <label className="block text-xs text-white/50 mb-1">Band</label>
            <select
              ref={bandSelectRef}
              value={form.band}
              onChange={(e) => updateField("band", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-signal-green/50 focus:outline-none appearance-none cursor-pointer"
            >
              {BAND_OPTIONS.map((b) => (
                <option key={b} value={b} className="bg-void-black text-white">
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs text-white/50 mb-1">Mode</label>
            <select
              value={form.mode}
              onChange={(e) => updateField("mode", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-signal-green/50 focus:outline-none appearance-none cursor-pointer"
            >
              {MODE_OPTIONS.map((m) => (
                <option key={m} value={m} className="bg-void-black text-white">
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Continent */}
          <div>
            <label className="block text-xs text-white/50 mb-1">
              Continent
            </label>
            <select
              value={form.continent}
              onChange={(e) => updateField("continent", e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-signal-green/50 focus:outline-none appearance-none cursor-pointer"
            >
              {CONTINENT_OPTIONS.map((c) => (
                <option key={c} value={c} className="bg-void-black text-white">
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-white/5 my-3" />

        {/* ── Options ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Options
        </div>
        <div
          className="flex items-center h-8 px-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
          onClick={toggleAutoPan}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full mr-2.5 shrink-0 transition-colors ${
              autoPan ? "bg-signal-green" : "bg-white/20"
            }`}
          />
          <span
            className={`flex-1 text-xs transition-colors ${
              autoPan ? "text-white" : "text-white/60"
            }`}
          >
            Auto-pan to matches
          </span>
          <PillToggle
            checked={autoPan}
            onChange={toggleAutoPan}
            label="Auto-pan to matched spots"
          />
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-white/5 my-3" />

        {/* ── Saved Watches ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Saved Watches
          {savedWatches.length > 0 && (
            <span className="ml-1 text-white/30">
              ({savedWatches.length}/{MAX_SAVED_WATCHES})
            </span>
          )}
        </div>

        {savedWatches.length === 0 ? (
          <div className="text-xs text-white/30 px-0.5 py-1">
            No saved watches yet
          </div>
        ) : (
          <div className="space-y-0.5 mb-2">
            {savedWatches.map((sw) => {
              const summary = formatCriteriaSummary(sw.criteria);
              const isLoaded =
                criteria !== null &&
                JSON.stringify(criteria) === JSON.stringify(sw.criteria);
              return (
                <div
                  key={sw.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    isLoaded
                      ? "bg-signal-green/10 text-white"
                      : "hover:bg-white/5 text-white/70"
                  }`}
                  onClick={() => loadWatch(sw.id)}
                  title={`Load: ${summary}`}
                >
                  {/* Watch icon */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-white/40"
                  >
                    <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                    <circle cx="7" cy="7" r="2" />
                  </svg>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {sw.name}
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      {summary}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWatch(sw.id);
                    }}
                    className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-alert-red hover:bg-white/5 transition-colors"
                    title="Delete saved watch"
                    aria-label={`Delete saved watch: ${sw.name}`}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Save current watch */}
        {isActive && savedWatches.length < MAX_SAVED_WATCHES && (
          <>
            {showSaveInput ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  ref={saveInputRef}
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") {
                      setShowSaveInput(false);
                      setSaveName("");
                    }
                  }}
                  placeholder="Watch name..."
                  maxLength={40}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-white/30 focus:border-signal-green/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="px-2 py-1 rounded-lg bg-signal-green/20 text-signal-green text-xs font-medium hover:bg-signal-green/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveInput(false);
                    setSaveName("");
                  }}
                  className="px-1.5 py-1 rounded-lg text-white/40 hover:text-white/70 text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaveInput(true)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors w-full"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M5 1v8M1 5h8" />
                </svg>
                Save Current Watch
              </button>
            )}
          </>
        )}

        {/* ── Clear Watch ── */}
        {isActive && (
          <>
            <div className="border-t border-white/5 my-3" />
            <button
              type="button"
              onClick={handleClear}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-alert-red/10 text-alert-red text-xs font-medium hover:bg-alert-red/20 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-alert-red" />
              Clear Watch
            </button>
          </>
        )}
      </div>
    </div>
  );
}

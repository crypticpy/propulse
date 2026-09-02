/**
 * OpsConsole
 *
 * Generalized bottom "Ops Console" for PropSphere. Observation, canonical QSO
 * entry, and contest tools share one map-first operating surface.
 */

import { useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore, type OpsDockTab } from "@/stores/contestUIStore";
import { DXConsole } from "@/components/dx";
import { ContestDock } from "@/components/contest/ContestDock";
import { QSOEntryForm } from "@/components/qso";
import { WSJTXStatusPanel } from "@/components/dx/WSJTXStatusPanel";
import { useMapStore } from "@/stores/mapStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import type { MapDataScope } from "@/lib/map/operationalScope";

export interface OpsConsoleProps {
  displayTime: Date;
  onCollapse: () => void;
  className?: string;
}

const SCOPE_LABELS: Record<MapDataScope, string> = {
  observe: "Observe",
  log: "Log",
  contest: "Contest",
};

function openOperationalWorkspaceWindow(): Window | null {
  useMapOperationalStore.getState().setWorkspaceOpen(true);
  return window.open(
    "/map/ops",
    "propulse-operating-workspace",
    "popup=yes,width=1100,height=760,resizable=yes,scrollbars=yes",
  );
}

export interface OperationalScopeControlProps {
  compact?: boolean;
  onWorkspaceRequested?: () => void;
  showPopout?: boolean;
}

/** Visible manual override plus persistent contest-assistance disclosure. */
export function OperationalScopeControl({
  compact = false,
  onWorkspaceRequested,
  showPopout = true,
}: OperationalScopeControlProps) {
  const {
    scope,
    automaticScope,
    manualScope,
    policy,
    contestSessionId,
  } = useMapOperationalContext();
  const setManualScope = useMapOperationalStore(
    (state) => state.setManualScope,
  );
  const setWorkspaceOpen = useMapOperationalStore(
    (state) => state.setWorkspaceOpen,
  );
  const setPublicAssistance = useContestUIStore(
    (state) => state.setPublicAssistance,
  );

  const handleScopeChange = useCallback(
    (value: string) => {
      const next = value === "auto" ? null : (value as MapDataScope);
      setManualScope(next);
      const resolved = next ?? automaticScope;
      if (resolved !== "observe") {
        setWorkspaceOpen(true);
        onWorkspaceRequested?.();
      }
    }, [
      automaticScope,
      onWorkspaceRequested,
      setManualScope,
      setWorkspaceOpen,
    ],
  );

  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-black/50 p-1"
      data-map-scope={scope}
      data-public-assistance={String(policy.publicAssistance)}
    >
      <span
        className={`rounded px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider ${
          scope === "observe"
            ? "bg-cosmic-cyan/15 text-cosmic-cyan"
            : scope === "log"
              ? "bg-signal-green/15 text-signal-green"
              : "bg-plasma-orange/15 text-plasma-orange"
        }`}
      >
        {compact ? SCOPE_LABELS[scope].slice(0, 3) : SCOPE_LABELS[scope]}
      </span>
      <select
        aria-label="PropSphere operating scope"
        value={manualScope ?? "auto"}
        onChange={(event) => handleScopeChange(event.target.value)}
        className="max-w-24 rounded border border-white/10 bg-gray-950 px-1.5 py-1 text-[10px] text-gray-200 focus:border-cosmic-cyan/50 focus:outline-none"
        title={`Automatic scope: ${SCOPE_LABELS[automaticScope]}`}
      >
        <option value="auto">Auto</option>
        <option value="observe">Observe</option>
        <option value="log">Log</option>
        <option value="contest">Contest</option>
      </select>
      {scope === "contest" && contestSessionId && (
        <button
          type="button"
          onClick={() =>
            setPublicAssistance(contestSessionId, !policy.publicAssistance)
          }
          className={`rounded border px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors ${
            policy.publicAssistance
              ? "border-caution-amber/40 bg-caution-amber/15 text-caution-amber"
              : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
          }`}
          aria-pressed={policy.publicAssistance}
          title="Permit public spots and multiplier assistance for this contest session"
        >
          {policy.publicAssistance ? "Assisted" : "Unassisted"}
        </button>
      )}
      {showPopout && (
        <button
          type="button"
          onClick={openOperationalWorkspaceWindow}
          className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[9px] text-gray-300 transition-colors hover:border-white/20 hover:text-white"
          title="Open synchronized operating workspace in a secondary window"
          aria-label="Open operating workspace in secondary window"
        >
          ↗
        </button>
      )}
    </div>
  );
}

function LoggingDock() {
  const target = useMapStore((state) => state.target);
  const selectedReport = useMapOperationalStore(
    (state) => state.selectedReport,
  );
  const entries = useQSOStore((state) => state.entries);
  const loadEntries = useQSOStore((state) => state.loadEntries);
  const rigConnected = useRigStore((state) => state.connected);
  const rigFrequency = useRigStore((state) => state.frequency);
  const rigMode = useRigStore((state) => state.mode);
  const wsjtxConnected = useWSJTXStore((state) => state.connected);

  useEffect(() => {
    void loadEntries(0, 8);
  }, [loadEntries]);

  const handleLogged = useCallback(() => {
    void loadEntries(0, 8);
  }, [loadEntries]);

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-y-auto p-3 lg:grid-cols-3">
      <div className="min-w-0 space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h3 className="font-orbitron text-sm font-bold text-white">
              Contact workspace
            </h3>
            <p className="text-[10px] text-gray-500">
              Shared with the full Logbook, CAT, and WSJT-X
            </p>
          </div>
          <Link
            to="/log"
            className="text-[10px] text-cosmic-cyan hover:text-white"
          >
            Open full log →
          </Link>
        </div>
        <QSOEntryForm onQSOLogged={handleLogged} />
        <WSJTXStatusPanel defaultCollapsed={!wsjtxConnected} />
      </div>

      <aside className="min-w-0 space-y-3">
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Current operation
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-black/20 p-2">
              <div className="text-[9px] uppercase text-gray-500">Target</div>
              <div className="truncate font-mono text-white">
                {selectedReport?.callsign ?? target?.name ?? target?.grid ?? "None"}
              </div>
            </div>
            <div className="rounded-md bg-black/20 p-2">
              <div className="text-[9px] uppercase text-gray-500">Radio</div>
              <div className="truncate font-mono text-white">
                {rigConnected
                  ? `${(rigFrequency / 1_000_000).toFixed(5)} ${rigMode}`
                  : "CAT offline"}
              </div>
            </div>
          </div>
          {selectedReport && (
            <div className="mt-2 rounded-md border border-cosmic-cyan/20 bg-cosmic-cyan/5 px-2 py-1.5 text-[10px] text-gray-400">
              Seeded from {selectedReport.source} · {selectedReport.provenance}
              {" "}report
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Recent own QSOs
            </span>
            <span className="font-mono text-[10px] text-gray-600">
              {entries.length}
            </span>
          </div>
          <div className="space-y-1">
            {entries.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="flex gap-2 rounded-md bg-black/20 px-2 py-1.5 text-[10px]"
              >
                <span className="flex-1 truncate font-mono text-white">
                  {entry.callsign}
                </span>
                <span className="text-gray-400">{entry.band}</span>
                <span className="text-gray-500">{entry.mode}</span>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="py-3 text-center text-[10px] text-gray-600">
                No logged contacts yet
              </p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

export function OpsConsole({
  displayTime,
  onCollapse,
  className = "",
}: OpsConsoleProps) {
  const sessionId = useContestStore((s) => s.activeSession?.id ?? null);
  const hasActiveSession = useContestStore((s) => Boolean(s.activeSession));
  const dockKey = sessionId ?? "no-session";

  const dockTab = useContestUIStore((s) => {
    const fallback: OpsDockTab = sessionId ? "contest" : "dx";
    return s.dockTabBySessionId[dockKey] ?? fallback;
  });
  const setDockTab = useContestUIStore((s) => s.setDockTab);
  const { scope } = useMapOperationalContext();
  const setManualScope = useMapOperationalStore(
    (state) => state.setManualScope,
  );
  const setWorkspaceOpen = useMapOperationalStore(
    (state) => state.setWorkspaceOpen,
  );

  // Auto-enter contest pane when a session exists and user arrives in PropSphere.
  useEffect(() => {
    if (scope === "observe") {
      setDockTab(dockKey, "dx");
    } else if (scope === "log") {
      setDockTab(dockKey, "log");
    } else if (scope === "contest" && sessionId) {
      setDockTab(sessionId, "contest");
    }
  }, [dockKey, scope, sessionId, setDockTab]);

  const handleCollapse = useCallback(() => {
    setWorkspaceOpen(false);
    onCollapse();
  }, [onCollapse, setWorkspaceOpen]);

  const tabs = useMemo((): Array<{ id: OpsDockTab; label: string; disabled?: boolean }> => {
    return [
      { id: "dx", label: "Observe" },
      { id: "log", label: "Log" },
      { id: "contest", label: "Contest", disabled: false },
    ];
  }, []);

  return (
    <div
      className={`flex flex-col h-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden ${className}`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            Ops Console
          </span>
          {hasActiveSession && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30">
              Contest Active
            </span>
          )}
          <OperationalScopeControl compact showPopout={false} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-black/20 border border-white/10 rounded-lg p-1">
          {tabs.map((tab) => {
            const isActive = dockTab === tab.id;
            const disabled = Boolean(tab.disabled);
            return (
              <button
                key={tab.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setDockTab(dockKey, tab.id);
                  const nextScope: MapDataScope =
                    tab.id === "dx" ? "observe" : tab.id;
                  setManualScope(nextScope);
                  if (nextScope !== "observe") setWorkspaceOpen(true);
                }}
                className={`
                  px-3 py-1 rounded-md text-xs font-bold transition-colors
                  ${
                    disabled
                      ? "text-gray-600 cursor-not-allowed"
                      : isActive
                        ? "bg-white/10 text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Collapse button */}
        <button
          onClick={handleCollapse}
          className="p-1.5 text-gray-500 hover:text-white transition-colors rounded hover:bg-white/5"
          title="Collapse console"
          aria-label="Collapse ops console"
          type="button"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {dockTab === "dx" && (
          <DXConsole
            displayTime={displayTime}
            onCollapse={handleCollapse}
            showHeader={false}
            className="h-full border-0 rounded-none"
          />
        )}

        {dockTab === "log" && <LoggingDock />}

        {dockTab === "contest" && (
          <ContestDock className="h-full" />
        )}
      </div>
    </div>
  );
}

export default OpsConsole;

/**
 * OpsConsole
 *
 * Generalized bottom "Ops Console" for PropSphere. Observation, canonical QSO
 * entry, and contest tools share one map-first operating surface.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore, type OpsDockTab } from "@/stores/contestUIStore";
import { DXConsole, DXSpotList } from "@/components/dx";
import { ContestDock } from "@/components/contest/ContestDock";
import { WSJTXStatusPanel } from "@/components/dx/WSJTXStatusPanel";
import { OpsLoggerStrip } from "@/components/ops/OpsLoggerStrip";
import { HeatMapStrip } from "@/components/workspace/widgets/HeatMapStrip";
import { useMapStore } from "@/stores/mapStore";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { useKioskStore } from "@/stores/kioskStore";
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
  const workspaceWindow = window.open(
    "/map/ops",
    "propulse-operating-workspace",
    "popup=yes,width=1100,height=760,resizable=yes,scrollbars=yes",
  );
  // A blocked popup must not change automatic scope or hide public activity.
  // The child repeats this flag after mounting so a successful window remains
  // authoritative even if its initial BroadcastChannel handshake is delayed.
  if (workspaceWindow) {
    useMapOperationalStore.getState().setWorkspaceOpen(true);
  }
  return workspaceWindow;
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
  const setDesk = useOpsPostureStore((state) => state.setDesk);
  const exitContact = useOpsPostureStore((state) => state.exitContact);

  const handleScopeChange = useCallback(
    (value: string) => {
      const next = value === "auto" ? null : (value as MapDataScope);
      setManualScope(next);
      const resolved = next ?? automaticScope;
      if (resolved === "observe") {
        exitContact("observe");
      } else if (resolved === "log") {
        setDesk();
      }
      if (resolved !== "observe") {
        setWorkspaceOpen(true);
        onWorkspaceRequested?.();
      }
    }, [
      automaticScope,
      exitContact,
      onWorkspaceRequested,
      setDesk,
      setManualScope,
      setWorkspaceOpen,
    ],
  );

  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-lg border border-su-line/40 bg-su-panel/90 p-1"
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
        className="max-w-24 rounded border border-su-line/40 bg-su-canvas px-1.5 py-1 text-[10px] text-su-text focus:border-cosmic-cyan/50 focus:outline-none"
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
              : "border-su-line/40 bg-su-line/10 text-su-muted hover:text-su-text"
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
          className="rounded border border-su-line/40 bg-su-line/10 px-1.5 py-1 text-[9px] text-su-muted transition-colors hover:border-su-line/50 hover:text-su-text"
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

  return (
    <div className="grid h-full min-h-0 gap-3 p-3 lg:grid-cols-3">
      <div className="min-h-0 min-w-0 lg:col-span-2">
        <DXSpotList
          showHeader={false}
          showFilters={true}
          maxHeight="100%"
          className="h-full"
        />
      </div>

      <aside className="min-h-0 min-w-0 space-y-3 overflow-y-auto">
        <section className="rounded-xl border border-su-line/40 bg-su-line/10 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-su-muted">
            Current operation
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-su-input p-2">
              <div className="text-[9px] uppercase text-su-muted">Target</div>
              <div className="truncate font-mono text-su-text">
                {selectedReport?.callsign ?? target?.name ?? target?.grid ?? "None"}
              </div>
            </div>
            <div className="rounded-md bg-su-input p-2">
              <div className="text-[9px] uppercase text-su-muted">Radio</div>
              <div className="truncate font-mono text-su-text">
                {rigConnected
                  ? `${(rigFrequency / 1_000_000).toFixed(5)} ${rigMode}`
                  : "CAT offline"}
              </div>
            </div>
          </div>
          {selectedReport && (
            <div className="mt-2 rounded-md border border-cosmic-cyan/20 bg-cosmic-cyan/5 px-2 py-1.5 text-[10px] text-su-muted">
              Seeded from {selectedReport.source} · {selectedReport.provenance}{" "}
              report
            </div>
          )}
        </section>

        <section className="rounded-xl border border-su-line/40 bg-su-line/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-su-muted">
              Recent own QSOs
            </span>
            <span className="font-mono text-[10px] text-su-muted">
              {entries.length}
            </span>
          </div>
          <div className="space-y-1">
            {entries.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="flex gap-2 rounded-md bg-su-input px-2 py-1.5 text-[10px]"
              >
                <span className="flex-1 truncate font-mono text-su-text">
                  {entry.callsign}
                </span>
                <span className="text-su-muted">{entry.band}</span>
                <span className="text-su-muted">{entry.mode}</span>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="py-3 text-center text-[10px] text-su-muted">
                No logged contacts yet
              </p>
            )}
          </div>
        </section>

        <WSJTXStatusPanel defaultCollapsed={!wsjtxConnected} />
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
  const posture = useOpsPostureStore((state) => state.posture);
  const setDesk = useOpsPostureStore((state) => state.setDesk);
  const exitContact = useOpsPostureStore((state) => state.exitContact);
  const isKiosk = useKioskStore((state) => state.active);

  // Auto-enter contest pane when a session exists and user arrives in PropSphere.
  // Contact/Desk own the dock tab so Work does not hide the band map.
  useEffect(() => {
    if (posture === "contact" || posture === "desk") return;
    if (scope === "observe") {
      setDockTab(dockKey, "dx");
    } else if (scope === "log") {
      setDockTab(dockKey, "log");
    } else if (scope === "contest" && sessionId) {
      setDockTab(sessionId, "contest");
    }
  }, [dockKey, posture, scope, sessionId, setDockTab]);

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

  const showLoggerStrip =
    !isKiosk &&
    dockTab !== "contest" &&
    (posture === "contact" || posture === "desk" || dockTab === "log");

  return (
    <div
      className={`flex flex-col h-full bg-su-panel/90 backdrop-blur-md border border-su-line/40 rounded-2xl overflow-hidden ${className}`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-su-line/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-su-muted uppercase tracking-wide">
            Ops Console
          </span>
          {hasActiveSession && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30">
              Contest Active
            </span>
          )}
          <OperationalScopeControl compact showPopout={false} />
          {/* Glance density, #661: reads the shared `useDXStore` feed
              directly (no own fetch) so it stays visible across every tab,
              not just Observe — mount only, whichever tab last drove the DX
              cluster feed keeps this current. */}
          <HeatMapStrip />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-su-input border border-su-line/40 rounded-lg p-1">
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
                  if (tab.id === "dx") {
                    setManualScope("observe");
                    exitContact("observe");
                  } else if (tab.id === "log") {
                    setManualScope("log");
                    setWorkspaceOpen(true);
                    if (posture !== "contact") setDesk();
                  } else {
                    setManualScope("contest");
                    setWorkspaceOpen(true);
                    exitContact("observe");
                  }
                }}
                className={`
                  px-3 py-1 rounded-md text-xs font-bold transition-colors
                  ${
                    disabled
                      ? "text-su-muted cursor-not-allowed"
                      : isActive
                        ? "bg-su-line/20 text-su-text"
                        : "text-su-muted hover:text-su-text hover:bg-su-line/10"
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
          className="p-1.5 text-su-muted hover:text-su-text transition-colors rounded hover:bg-su-line/10"
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

      {showLoggerStrip && <OpsLoggerStrip />}

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

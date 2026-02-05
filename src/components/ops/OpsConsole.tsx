/**
 * OpsConsole
 *
 * Generalized bottom "Ops Console" for PropSphere with DX + Contest tabs.
 * Replaces the prior DX-only console when expanded.
 */

import { useEffect, useMemo } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore, type OpsDockTab } from "@/stores/contestUIStore";
import { DXConsole } from "@/components/dx";
import { ContestDock } from "@/components/contest/ContestDock";

export interface OpsConsoleProps {
  displayTime: Date;
  onCollapse: () => void;
  className?: string;
}

export function OpsConsole({ displayTime, onCollapse, className = "" }: OpsConsoleProps) {
  const sessionId = useContestStore((s) => s.activeSession?.id ?? null);
  const hasActiveSession = useContestStore((s) => Boolean(s.activeSession));
  const dockKey = sessionId ?? "no-session";

  const dockTab = useContestUIStore((s) => {
    const fallback: OpsDockTab = sessionId ? "contest" : "dx";
    return s.dockTabBySessionId[dockKey] ?? fallback;
  });
  const setDockTab = useContestUIStore((s) => s.setDockTab);

  // Auto-enter contest pane when a session exists and user arrives in PropSphere.
  useEffect(() => {
    if (!sessionId) {
      return;
    }
    const existing = useContestUIStore.getState().dockTabBySessionId[sessionId];
    if (!existing) {
      setDockTab(sessionId, "contest");
    }
  }, [sessionId, setDockTab]);

  const tabs = useMemo((): Array<{ id: OpsDockTab; label: string; disabled?: boolean }> => {
    return [
      { id: "dx", label: "DX" },
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
          onClick={onCollapse}
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
            onCollapse={onCollapse}
            showHeader={false}
            className="h-full border-0 rounded-none"
          />
        )}

        {dockTab === "contest" && (
          <ContestDock className="h-full" />
        )}
      </div>
    </div>
  );
}

export default OpsConsole;

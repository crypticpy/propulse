import { useState } from "react";
import { ViewSwitcher } from "@/components/atmos/ViewSwitcher";
import { useAtmosStore } from "@/stores/atmosStore";
import { useEmcommStore } from "@/stores/emcommStore";
import { useRIM } from "@/hooks/useRIM";
import { ActivationModal } from "./emcomm/ActivationModal";
import type { ActivationLevel } from "@/types/emcomm";

const LEVEL_BADGE_COLORS: Record<ActivationLevel, string> = {
  monitoring: "bg-nebula-blue/20 text-nebula-blue",
  standby: "bg-caution-amber/20 text-caution-amber",
  partial: "bg-plasma-orange/20 text-plasma-orange",
  full: "bg-alert-red/20 text-alert-red",
};

export function AtmosHeader() {
  const sidebarOpen = useAtmosStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAtmosStore((s) => s.setSidebarOpen);
  const { rimResult } = useRIM();
  const activeIncident = useEmcommStore((s) => s.activeIncident);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <header className="flex items-center justify-between h-10 px-3 bg-deep-space/80 border-b border-white/5 backdrop-blur-sm shrink-0">
      {/* Left: title + sidebar toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
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
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <h1 className="text-sm font-orbitron font-semibold tracking-wider text-white">
          ATMOS<span className="text-plasma-orange">PULSE</span>
        </h1>
      </div>

      {/* Center: view switcher */}
      <ViewSwitcher />

      {/* Right: EmComm shield + RIM summary badge */}
      <div className="flex items-center gap-2">
        {/* EmComm shield toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setModalOpen(true)}
            className={`relative p-1 rounded transition-colors ${
              activeIncident
                ? "text-alert-red hover:text-alert-red/80"
                : "text-gray-500 hover:text-white"
            }`}
            title={
              activeIncident
                ? `EmComm Active: ${activeIncident.name}`
                : "Start EmComm Activation"
            }
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {activeIncident && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-alert-red animate-pulse" />
            )}
          </button>
          {activeIncident && (
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${LEVEL_BADGE_COLORS[activeIncident.level]}`}
            >
              EMRG
            </span>
          )}
        </div>

        {/* RIM summary badge */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-void-black/40 border border-white/5">
          <div
            className={`w-2 h-2 rounded-full ${
              rimResult
                ? rimResult.composite >= 90
                  ? "bg-signal-green"
                  : rimResult.composite >= 60
                    ? "bg-caution-amber"
                    : rimResult.composite >= 30
                      ? "bg-plasma-orange"
                      : "bg-alert-red"
                : "bg-gray-600"
            } ${rimResult ? "animate-pulse" : ""}`}
          />
          <span className="text-xs font-mono text-gray-400">RIM</span>
          <span
            className={`text-xs font-mono font-semibold ${
              rimResult
                ? rimResult.composite >= 90
                  ? "text-signal-green"
                  : rimResult.composite >= 60
                    ? "text-caution-amber"
                    : rimResult.composite >= 30
                      ? "text-plasma-orange"
                      : "text-alert-red"
                : "text-gray-500"
            }`}
          >
            {rimResult ? Math.round(rimResult.composite) : "--"}
          </span>
        </div>
      </div>

      <ActivationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </header>
  );
}

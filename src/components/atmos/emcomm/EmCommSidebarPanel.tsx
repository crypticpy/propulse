/**
 * EmCommSidebarPanel -- Replaces normal AtmosSidebar content when EmComm
 * activation is in progress. Shows activation status, frequency plan,
 * NVIS coverage briefing, repeater analysis, quick-action buttons, SitRep
 * logging, ICS-213 messaging, and layer toggles.
 */

import { useState } from "react";
import { useEmcommStore } from "@/stores/emcommStore";
import { useAtmosStore } from "@/stores/atmosStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SitRepForm } from "./SitRepForm";
import { SitRepLog } from "./SitRepLog";
import { ICS213Modal } from "./ICS213Modal";
import { FrequencyQuickTune } from "./FrequencyQuickTune";
import { FrequencyPlanEditor } from "./FrequencyPlanEditor";
import { NVISBriefing } from "./NVISBriefing";
import { RepeaterAnalysis } from "./RepeaterAnalysis";
import { NetLinkForecast } from "./NetLinkForecast";
import { exportActivationLog } from "@/lib/atmos/emcommExport";
import type { ActivationLevel } from "@/types/emcomm";
import type { AtmosLayerId } from "@/types/atmos";

// ── Activation-level badge colors ──────────────────────────────────────────
const LEVEL_STYLES: Record<ActivationLevel, { bg: string; text: string }> = {
  monitoring: {
    bg: "bg-blue-500/20 border-blue-500/30",
    text: "text-blue-400",
  },
  standby: {
    bg: "bg-caution-amber/20 border-caution-amber/30",
    text: "text-caution-amber",
  },
  partial: {
    bg: "bg-plasma-orange/20 border-plasma-orange/30",
    text: "text-plasma-orange",
  },
  full: {
    bg: "bg-alert-red/20 border-alert-red/30",
    text: "text-alert-red",
  },
};

// ── Layer metadata (duplicated from AtmosSidebar to keep toggles) ──────────
const LAYER_META: { id: AtmosLayerId; label: string; icon: string }[] = [
  { id: "radar", label: "Weather Radar", icon: "\u{1F327}\u{FE0F}" },
  { id: "lightning", label: "Lightning", icon: "\u26A1" },
  { id: "alerts", label: "NWS Alerts", icon: "\u26A0\u{FE0F}" },
  { id: "fires", label: "Fire Hotspots", icon: "\u{1F525}" },
  { id: "goesCloud", label: "GOES Cloud", icon: "\u2601\u{FE0F}" },
  { id: "tec", label: "Ionospheric TEC", icon: "\u{1F310}" },
  { id: "repeaters", label: "Repeaters", icon: "\u{1F4E1}" },
  { id: "riverGauges", label: "River Gauges", icon: "\u{1F30A}" },
  { id: "aprs", label: "APRS Stations", icon: "\u{1F4CD}" },
  { id: "shadowZones", label: "Coverage Gaps", icon: "\u{1F6AB}" },
];

export function EmCommSidebarPanel() {
  const activeIncident = useEmcommStore((s) => s.activeIncident);
  const stopActivation = useEmcommStore((s) => s.stopActivation);

  const layerVisibility = useAtmosStore((s) => s.layerVisibility);
  const toggleLayer = useAtmosStore((s) => s.toggleLayer);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sitRepExpanded, setSitRepExpanded] = useState(false);
  const [ics213Open, setIcs213Open] = useState(false);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);

  if (!activeIncident) return null;

  const levelStyle = LEVEL_STYLES[activeIncident.level];

  return (
    <aside className="w-56 shrink-0 bg-deep-space/60 border-r border-white/5 overflow-y-auto">
      {/* ── Activation Status ─────────────────────────────────────────── */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Activation Status
        </h2>
        <p className="text-sm font-bold text-white truncate">
          {activeIncident.name}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${levelStyle.bg} ${levelStyle.text}`}
          >
            {activeIncident.level}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="mt-2 text-[10px] text-gray-500 hover:text-alert-red transition-colors"
        >
          Deactivate
        </button>
      </div>

      {/* ── Frequency Plan ────────────────────────────────────────────── */}
      <div className="p-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
            Frequency Plan
          </h2>
          <button
            type="button"
            onClick={() => setPlanEditorOpen(true)}
            className="text-[10px] text-gray-500 hover:text-plasma-orange transition-colors"
          >
            Manage Plans
          </button>
        </div>
        <FrequencyQuickTune />
      </div>

      {/* ── Net Link Forecast ───────────────────────────────────────── */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          12h Link Forecast
        </h2>
        <NetLinkForecast />
      </div>

      {/* ── NVIS Briefing ──────────────────────────────────────────────── */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          NVIS Coverage
        </h2>
        <NVISBriefing />
      </div>

      {/* ── Repeater Analysis ────────────────────────────────────────── */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Repeaters in Zone
        </h2>
        <RepeaterAnalysis />
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────── */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Quick Actions
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSitRepExpanded((v) => !v)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-mono rounded-md border transition-colors ${
              sitRepExpanded
                ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30"
                : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
            }`}
          >
            {sitRepExpanded ? "Cancel SitRep" : "Add SitRep"}
          </button>
          <button
            type="button"
            onClick={() => setIcs213Open(true)}
            className="flex-1 px-2 py-1.5 text-[10px] font-mono rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
          >
            New ICS-213
          </button>
        </div>
      </div>

      {/* ── SitRep section (form + log) ────────────────────────────────── */}
      <div data-section="sitrep">
        {sitRepExpanded && (
          <SitRepForm onClose={() => setSitRepExpanded(false)} />
        )}
        <SitRepLog />
      </div>

      {/* ── Export Log ──────────────────────────────────────────────────── */}
      <div className="p-3 border-b border-white/5">
        <button
          type="button"
          onClick={() => {
            if (!activeIncident) return;
            const sitReps = useEmcommStore.getState().sitRepEntries;
            const messages = useEmcommStore.getState().ics213Messages;
            exportActivationLog(activeIncident, sitReps, messages);
          }}
          className="w-full px-2 py-1.5 text-[10px] font-mono rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
        >
          Export Log
        </button>
      </div>

      {/* ── Layer Toggles ─────────────────────────────────────────────── */}
      <div className="p-3">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Layers
        </h2>
        <div className="space-y-0.5">
          {LAYER_META.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => toggleLayer(id)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                layerVisibility[id]
                  ? "bg-white/5 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]"
              }`}
            >
              <span className="text-sm">{icon}</span>
              <span className="font-medium">{label}</span>
              {layerVisibility[id] && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-signal-green" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Deactivation confirm dialog ──────────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        onConfirm={() => {
          stopActivation();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
        title="Deactivate EmComm"
        message="End the current EmComm activation? This will archive the incident. Any unexported SitRep entries and ICS-213 messages will be lost. Use 'Export Log' first to save them."
        confirmLabel="Deactivate"
        variant="destructive"
      />

      {/* ── ICS-213 Modal ─────────────────────────────────────────────── */}
      <ICS213Modal open={ics213Open} onClose={() => setIcs213Open(false)} />

      {/* ── Frequency Plan Editor Modal ─────────────────────────────── */}
      <FrequencyPlanEditor
        isOpen={planEditorOpen}
        onClose={() => setPlanEditorOpen(false)}
      />
    </aside>
  );
}

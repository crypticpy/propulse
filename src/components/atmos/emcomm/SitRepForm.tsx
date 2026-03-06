/**
 * SitRepForm -- Compact form for adding situation reports during an EmComm
 * activation. Auto-fills propagation conditions from the RIM engine and the
 * operator callsign from the user store.
 */

import { useState, useMemo } from "react";
import { useEmcommStore } from "@/stores/emcommStore";
import { useUserStore } from "@/stores/userStore";
import { useRIM } from "@/hooks/useRIM";

interface SitRepFormProps {
  onClose: () => void;
}

export function SitRepForm({ onClose }: SitRepFormProps) {
  const activeIncident = useEmcommStore((s) => s.activeIncident);
  const addSitRep = useEmcommStore((s) => s.addSitRep);
  const station = useUserStore((s) => s.station);
  const { rimResult } = useRIM();

  const autoConditions = useMemo(() => {
    if (!rimResult) return "RIM data unavailable";
    return [
      `HF: ${rimResult.hfBand.value}/100`,
      `VHF: ${rimResult.vhfUhf.value}/100`,
      `Infra: ${rimResult.infraRisk.value}/100`,
      `EmComm: ${rimResult.emcommReadiness.value}/100`,
    ].join(", ");
  }, [rimResult]);

  const [summary, setSummary] = useState("");
  const [conditions, setConditions] = useState(autoConditions);
  const [netActivity, setNetActivity] = useState("");
  const [nextActions, setNextActions] = useState("");

  if (!activeIncident) return null;

  const author = station?.callsign ?? "UNKNOWN";
  const canSave = summary.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    addSitRep({
      incidentId: activeIncident!.id,
      author,
      summary: summary.trim(),
      conditions,
      netActivity: netActivity.trim(),
      nextActions: nextActions.trim(),
    });
    onClose();
  }

  return (
    <div className="p-3 border-b border-white/5 space-y-2">
      <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
        New Situation Report
      </h2>

      {/* Author (read-only) */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">Author</label>
        <div className="text-xs text-white font-mono bg-white/5 rounded px-2 py-1 border border-white/10">
          {author}
        </div>
      </div>

      {/* Summary */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">
          Summary <span className="text-alert-red">*</span>
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          placeholder="Current situation overview..."
          className="w-full text-xs text-white bg-void-black/60 rounded px-2 py-1.5 border border-white/10 placeholder-gray-600 focus:border-plasma-orange/50 focus:outline-none resize-none"
        />
      </div>

      {/* Conditions (auto-filled from RIM) */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">
          Conditions (auto-filled)
        </label>
        <input
          type="text"
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          className="w-full text-xs text-white bg-void-black/60 rounded px-2 py-1.5 border border-white/10 placeholder-gray-600 focus:border-plasma-orange/50 focus:outline-none"
        />
      </div>

      {/* Net Activity */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">
          Net Activity
        </label>
        <input
          type="text"
          value={netActivity}
          onChange={(e) => setNetActivity(e.target.value)}
          placeholder="Active nets, check-ins, traffic..."
          className="w-full text-xs text-white bg-void-black/60 rounded px-2 py-1.5 border border-white/10 placeholder-gray-600 focus:border-plasma-orange/50 focus:outline-none"
        />
      </div>

      {/* Next Actions */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">
          Next Actions
        </label>
        <textarea
          value={nextActions}
          onChange={(e) => setNextActions(e.target.value)}
          rows={2}
          placeholder="Planned follow-up actions..."
          className="w-full text-xs text-white bg-void-black/60 rounded px-2 py-1.5 border border-white/10 placeholder-gray-600 focus:border-plasma-orange/50 focus:outline-none resize-none"
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 px-2 py-1.5 text-[10px] font-mono rounded-md bg-signal-green/20 hover:bg-signal-green/30 text-signal-green border border-signal-green/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save SitRep
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-2 py-1.5 text-[10px] font-mono rounded-md bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

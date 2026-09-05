import type { SolarHandoff } from "@/lib/solar/handoff";
import { solarAnalysisMode, solarWizardMode } from "@/lib/solar/handoff";
import { ALL_UI_MODES, type UIMode } from "@/lib/utils/modeNormalize";

export function SolarHandoffNotice({ handoff, destination = "planner" }: { handoff: SolarHandoff | null; destination?: "planner" | "wizard" }) {
  if (!handoff) return null;
  const analysisMode = destination === "wizard" ? solarWizardMode(handoff.mode) : solarAnalysisMode(handoff.mode);
  return <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-slate-300">
    From Solar Pulse · {handoff.target?.name ?? handoff.target?.grid ?? "Choose a target"} · {handoff.mode}{analysisMode !== handoff.mode ? ` (modeled with ${analysisMode} sensitivity)` : ""} · {handoff.at ? `Planning ${new Date(handoff.at).toUTCString()} with current solar inputs` : "Live conditions"}
  </p>;
}

export function SolarPlanningModeControl({ mode, onChange }: { mode: UIMode; onChange: (mode: UIMode) => void }) {
  const analysisMode = solarAnalysisMode(mode);
  return <div className="flex flex-wrap items-center gap-3 p-3 text-sm text-slate-300">
    <label className="flex items-center gap-3">Planning mode
      <select aria-label="Planning mode" value={mode} onChange={(event) => onChange(event.target.value as UIMode)} className="min-h-11 rounded-lg border border-white/20 bg-deep-space px-3 text-white">
        {ALL_UI_MODES.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <span className="text-xs">Applies to this analysis{analysisMode !== mode ? ` · modeled with ${analysisMode} sensitivity` : ""}.</span>
  </div>;
}

import type { SolarHandoff } from "@/lib/solar/handoff";
import { solarAnalysisMode } from "@/lib/solar/handoff";

export function SolarHandoffNotice({ handoff }: { handoff: SolarHandoff | null }) {
  if (!handoff) return null;
  const analysisMode = solarAnalysisMode(handoff.mode);
  return <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-slate-300">
    From Solar Pulse · {handoff.target?.name ?? handoff.target?.grid ?? "Choose a target"} · {handoff.mode}{analysisMode !== handoff.mode ? ` (modeled with ${analysisMode} sensitivity)` : ""} · {handoff.at ? `Planning ${new Date(handoff.at).toUTCString()} with current solar inputs` : "Live conditions"}
  </p>;
}

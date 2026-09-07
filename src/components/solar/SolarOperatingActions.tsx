import { Link } from "react-router-dom";
import { useActiveMode } from "@/hooks/useActiveBandMode";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useMapStore } from "@/stores/mapStore";
import { parseSolarHandoff } from "@/lib/solar/handoff";

export function SolarOperatingActions({ at, compact = false }: { at?: string; compact?: boolean }) {
  const station = useStationCastContext();
  const target = useMapStore((s) => s.target);
  const mode = useActiveMode();
  const handoff = parseSolarHandoff({ version: 1, target: target ?? undefined, mode, at });
  const state = { solarHandoff: handoff };
  if (compact) return <Link to="/planner" state={state} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-su-line/40 px-3 text-xs text-su-info hover:bg-su-line/10">Plan this day</Link>;
  return <div className="mt-4 border-t border-su-line/40 pt-4">
    <p className="text-xs text-su-muted">{station.chain?.name ?? station.location?.name ?? "Station not configured"}{station.location ? ` · ${station.location.grid}` : " · add your station in Settings for path advice"} · {mode}{target && ` · target ${target.name ?? target.grid ?? "selected on map"}`}</p>
    <nav aria-label="Continue operating" className="mt-3 flex flex-wrap gap-2">
      <Link to="/map" state={state} className="inline-flex min-h-11 items-center rounded-lg bg-su-accent px-4 text-sm font-semibold text-su-on-accent hover:opacity-90">Inspect a path</Link>
      <Link to="/dx" state={state} className="inline-flex min-h-11 items-center rounded-lg border border-su-line/40 px-4 text-sm text-su-muted hover:bg-su-line/10">Find a band for a target</Link>
      <Link to="/planner" state={state} className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm text-su-info hover:bg-su-line/10">Plan a session</Link>
    </nav>
  </div>;
}

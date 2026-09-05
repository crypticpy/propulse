import type { SolarWidgetState } from "@/lib/solar/contracts";

export function HomeStatus({ state }: { state: SolarWidgetState | "local" }) {
  const label = { fresh: "Current", refreshing: "Refreshing", stale: "Stale", error: "Error", loading: "Checking", unavailable: "Unavailable", partial: "Partial", empty: "Current", local: "On this device" }[state];
  return <span role="status" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-400"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${state === "fresh" || state === "empty" ? "bg-signal-green" : state === "stale" || state === "partial" ? "bg-caution-amber" : state === "error" ? "bg-alert-red" : "bg-slate-500"}`} />{label}</span>;
}

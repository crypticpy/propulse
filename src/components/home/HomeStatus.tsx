import type { SolarWidgetState } from "@/lib/solar/contracts";

export function HomeStatus({ state, detail }: { state: SolarWidgetState | "local"; detail?: string }) {
  const label = { fresh: "Current", refreshing: "Refreshing", stale: "Stale", error: "Error", loading: "Checking", unavailable: "Unavailable", partial: "Partial", empty: "No data", local: "On this device" }[state];
  return <span role="status" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-su-muted"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${state === "fresh" ? "bg-su-success" : state === "stale" || state === "partial" ? "bg-su-warning" : state === "error" ? "bg-su-danger" : "bg-su-muted"}`} />{label}{detail && ` · ${detail}`}</span>;
}

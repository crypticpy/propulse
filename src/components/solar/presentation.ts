import { parseUtcInstant } from "@/lib/solar/normalization";
import type { SolarResourceView } from "@/hooks/useSolarModel";
import { getSolarSourcePolicy } from "@/lib/solar/sourcePolicies";

export function formatUtc(value: string): string {
  return new Date(parseUtcInstant(value) ?? NaN).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function hasData<T>(view: SolarResourceView<T>): boolean {
  if (Array.isArray(view.data)) return view.data.length > 0;
  return view.data !== undefined && view.data !== null;
}

export function sourceProps<T>(view: SolarResourceView<T>) {
  const policy = getSolarSourcePolicy(view.sourceId);
  return {
    state: view.state,
    observedAt: view.resource?.envelope.observedAt,
    provider: view.resource?.envelope.provider ?? policy.provider,
    sourceUrl: view.resource?.envelope.sourceUrl ?? policy.sourceUrl,
    hasData: hasData(view),
    staleMessage: view.resource?.lastError
      ? "The latest update did not arrive. Showing the most recent usable reading while Propulse checks again."
      : "This reading is older than expected. Propulse will update it when fresh data arrives.",
    onRetry: () => void view.query.refetch(),
  };
}

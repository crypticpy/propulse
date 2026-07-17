import type {
  SolarCacheOutcome,
  SolarSourceId,
  SolarWidgetState,
} from "./contracts";

export type SolarTelemetryEvent =
  | {
      event: "solar_client_cache";
      sourceId: SolarSourceId;
      outcome: SolarCacheOutcome;
      durationMs: number;
      observationAgeMs?: number;
    }
  | {
      event: "solar_source_failure";
      sourceId: SolarSourceId;
      outcome: string;
      consecutiveFailures: number;
    }
  | {
      event: "solar_source_recovery";
      sourceId: SolarSourceId;
      recoveryDurationMs: number;
    }
  | {
      event: "solar_widget_state";
      widgetId: string;
      state: SolarWidgetState;
    };

export type TimestampedSolarTelemetryEvent = SolarTelemetryEvent & {
  recordedAt: string;
};

const MAX_EVENTS = 200;
const events: TimestampedSolarTelemetryEvent[] = [];

/**
 * Small, PII-free observability seam. Production telemetry can subscribe to
 * the browser event without coupling data fetching or widgets to a vendor.
 */
export function recordSolarTelemetry(event: SolarTelemetryEvent): void {
  const recorded = { ...event, recordedAt: new Date().toISOString() };
  events.push(recorded);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("propulse:solar-telemetry", { detail: recorded }),
    );
  }
}

export function inspectSolarTelemetry(): TimestampedSolarTelemetryEvent[] {
  return events.map((event) => ({ ...event }));
}

export function clearSolarTelemetry(): void {
  events.length = 0;
}

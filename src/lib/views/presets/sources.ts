import type { z } from "zod";
import { spotSourceSchema } from "../spotContracts";

export type SpotSource = z.infer<typeof spotSourceSchema>;

export type FeedAvailability = {
  source: SpotSource;
  enabled: boolean;
  authorized: boolean;
  connected: boolean;
  reason?: string;
};

export type SourceAvailabilityNote = {
  source: SpotSource | "all-enabled-authorized";
  available: boolean;
  substituted: false;
  connectionStarted: false;
  message: string;
};

function isEnabledAuthorized(feed: FeedAvailability): boolean {
  return feed.enabled && feed.authorized;
}

function feedMessage(feed: FeedAvailability, requested: boolean): string {
  const detail = feed.reason ? ` (${feed.reason})` : "";
  if (!isEnabledAuthorized(feed)) {
    return requested
      ? `${feed.source} is requested but is not an enabled authorized feed${detail}. The recipe keeps this selection and does not start a connection or substitute another source.`
      : `${feed.source} is not enabled and authorized${detail}. All-enabled intent is unchanged; no substitute feed is selected and no connection is started.`;
  }
  if (!feed.connected) {
    return `${feed.source} is enabled and authorized but not connected${detail}. Availability is explained only; this helper does not start a connection.`;
  }
  return `${feed.source} is enabled, authorized, and connected. The recipe does not start or replace a connection.`;
}

/**
 * Explain feed availability without mutating recipe sources or opening sockets.
 * Empty `requested` means all enabled authorized feeds (FILTER-03).
 */
export function explainSourceAvailability(
  requested: readonly SpotSource[],
  availability: readonly FeedAvailability[] | undefined,
): SourceAvailabilityNote[] {
  if (!availability) {
    return [{
      source: requested.length === 0 ? "all-enabled-authorized" : requested[0],
      available: true,
      substituted: false,
      connectionStarted: false,
      message: "Feed availability was not supplied. Recipe sources are unchanged and no connection is started.",
    }];
  }

  const bySource = new Map(availability.map((feed) => [feed.source, feed]));
  const notes: SourceAvailabilityNote[] = [];

  if (requested.length === 0) {
    notes.push({
      source: "all-enabled-authorized",
      available: availability.some(isEnabledAuthorized),
      substituted: false,
      connectionStarted: false,
      message: "All enabled authorized feeds remain the recipe intent. Missing or disconnected feeds are explained rather than replaced.",
    });
    for (const source of spotSourceSchema.options) {
      const feed = bySource.get(source);
      if (!feed) {
        notes.push({
          source,
          available: false,
          substituted: false,
          connectionStarted: false,
          message: `${source} has no availability record. It is not substituted and no connection is started.`,
        });
        continue;
      }
      notes.push({
        source,
        available: isEnabledAuthorized(feed),
        substituted: false,
        connectionStarted: false,
        message: feedMessage(feed, false),
      });
    }
    return notes;
  }

  for (const source of requested) {
    const feed = bySource.get(source);
    if (!feed) {
      notes.push({
        source,
        available: false,
        substituted: false,
        connectionStarted: false,
        message: `${source} is requested but has no availability record. The recipe keeps ${source} and does not start a connection or substitute another source.`,
      });
      continue;
    }
    notes.push({
      source,
      available: isEnabledAuthorized(feed),
      substituted: false,
      connectionStarted: false,
      message: feedMessage(feed, true),
    });
  }
  return notes;
}

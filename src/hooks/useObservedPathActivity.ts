/**
 * useObservedPathActivity — read the durable aggregates for one path and turn
 * them into an observed-activity record (#1047).
 *
 * The hook owns the two things the pure derivation deliberately does not:
 *
 * 1. **One issuance instant.** All three reads and the derivation share a
 *    single `issuedAt`, bucketed to five minutes. Three clock samples would
 *    let the coverage query and the pair query disagree about which hours they
 *    covered, and a per-render sample would churn the query key forever.
 * 2. **What a failed read means.** It means `unknown`, with a reason. It does
 *    not mean zero: a request that never returned is the absence of evidence,
 *    and rendering it as a silent band would be the closure claim this whole
 *    family refuses to make.
 *
 * No derivation logic lives here; that is `radioEvidence/`.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  queryPathCoverageHours,
  queryPathHourlyStats,
  queryReadableBandHours,
} from "@/lib/propagation/hourlyStats";
import {
  derivePathActivity,
  unknownActivity,
} from "@/lib/propagation/radioEvidence/activityRecord";
import { DEFAULT_OBSERVED_WINDOW_SECONDS } from "@/lib/propagation/radioEvidence/coverage";
import type {
  ModeClass,
  ObservedActivityDescriptor,
  PathActivityRecord,
} from "@/lib/propagation/radioEvidence/types";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** The canonical issuance instant for an observed-activity read. */
export function observedActivityIssueBucket(now = Date.now()): number {
  return Math.floor(now / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
}

/**
 * Advance the issuance bucket on five-minute boundaries and when the tab comes
 * back, so a long-lived panel does not keep answering as of the instant it
 * first rendered.
 */
function useIssueBucket(): number {
  const [bucket, setBucket] = useState(() => observedActivityIssueBucket());

  useEffect(() => {
    let timeout = 0;
    const advance = () => {
      // One clock sample for both values: two reads can straddle the boundary
      // and schedule the bucket that was just entered for five minutes later.
      const current = observedActivityIssueBucket();
      setBucket(current);
      timeout = window.setTimeout(
        advance,
        Math.max(1_000, current + FIVE_MINUTES_MS - Date.now() + 250),
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setBucket(observedActivityIssueBucket());
      }
    };

    advance();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return bucket;
}

/** The 2-character Maidenhead field of a grid square, or null. */
function fieldOf(grid: string | null | undefined): string | null {
  const trimmed = (grid ?? "").trim();
  return trimmed.length >= 2 ? trimmed.slice(0, 2).toUpperCase() : null;
}

export interface ObservedPathActivityInput {
  /** Amateur band designation, e.g. "20m". */
  band: string;
  /** Operator's grid square (the transmitting end). */
  txGrid: string | null | undefined;
  /** Target's grid square (the receiving end). */
  rxGrid: string | null | undefined;
  /** Lookback length; defaults to six hours. */
  windowSeconds?: number;
  /** Mode classes that qualify; defaults to all three. */
  modeClasses?: readonly ModeClass[];
  /** Set false to hold the reads (an unmounted panel, a hidden tile). */
  enabled?: boolean;
}

export interface ObservedPathActivity {
  /** The verdict, or null before either endpoint or the first read exists. */
  record: PathActivityRecord | null;
  isLoading: boolean;
  isError: boolean;
  /** The instant every read and the record answer as of. */
  issuedAt: string;
}

/**
 * Observed activity for one band and one field pair over a trailing window.
 */
export function useObservedPathActivity(
  input: ObservedPathActivityInput,
): ObservedPathActivity {
  const bucket = useIssueBucket();
  const issuedAt = new Date(bucket).toISOString();
  const txField = fieldOf(input.txGrid);
  const rxField = fieldOf(input.rxGrid);
  const windowSeconds = input.windowSeconds ?? DEFAULT_OBSERVED_WINDOW_SECONDS;
  const modeClasses = input.modeClasses;
  const enabled =
    (input.enabled ?? true) && txField !== null && rxField !== null;

  const descriptor: ObservedActivityDescriptor | null = useMemo(
    () =>
      txField === null || rxField === null
        ? null
        : {
            band: input.band,
            txField,
            rxField,
            issuedAt,
            windowSeconds,
            ...(modeClasses ? { modeClasses } : {}),
          },
    [input.band, txField, rxField, issuedAt, windowSeconds, modeClasses],
  );

  const since = new Date(bucket - windowSeconds * 1000).toISOString();

  const query = useQuery({
    queryKey: [
      "observed-path-activity",
      input.band,
      txField,
      rxField,
      windowSeconds,
      bucket,
    ],
    enabled,
    // The aggregates advance once an hour; refetching faster than the issuance
    // bucket would spend requests to learn nothing.
    staleTime: FIVE_MINUTES_MS,
    queryFn: async (): Promise<PathActivityRecord> => {
      if (descriptor === null) {
        throw new Error("observed activity needs both endpoints");
      }
      const [pairRows, coverageRows, readableHours] = await Promise.all([
        queryPathHourlyStats({
          band: descriptor.band,
          txField: descriptor.txField,
          rxField: descriptor.rxField,
          since,
        }),
        queryPathCoverageHours({
          band: descriptor.band,
          rxField: descriptor.rxField,
          since,
        }),
        queryReadableBandHours({ band: descriptor.band, since }),
      ]);
      return derivePathActivity({
        ...descriptor,
        pairRows,
        coverageRows,
        readableHours,
      });
    },
  });

  const record = useMemo(() => {
    if (query.data) return query.data;
    if (query.isError && descriptor !== null) {
      // Unknown with a reason. Never `no_reports`, which would assert that a
      // receiver was listening — something a failed read cannot know.
      return unknownActivity(descriptor, "aggregate_read_failed");
    }
    return null;
  }, [query.data, query.isError, descriptor]);

  return {
    record,
    isLoading: query.isLoading && enabled,
    isError: query.isError,
    issuedAt,
  };
}

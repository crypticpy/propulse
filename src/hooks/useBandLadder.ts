/**
 * useBandLadder — canonical Band Health ladder feed (BH2).
 *
 * Backed by `/api/spots/band-ladder`, which serves verdict_states: the
 * collector-evaluated five-state ladder per scope (global per band,
 * regional per band × continent) with provenance — opened_at, the
 * surprise flag, and the last tick's inputs. This is the scored record
 * (§6); the client's own ladders are UI-only.
 */

import { useQuery } from "@tanstack/react-query";
import type { LadderState } from "@/lib/verdict/ladder";

const MINUTE = 60 * 1000;

const LADDER_STATES = new Set<string>([
  "closed",
  "forecast",
  "stirring",
  "verified",
  "hot",
]);

export interface CanonicalLadderRow {
  band: string;
  scopeType: "global" | "regional";
  scopeKey: string;
  state: LadderState;
  stableSince: string;
  surprise: boolean;
  openedAt: string | null;
  inputs: Record<string, unknown>;
  updatedAt: string;
}

function parseRow(value: unknown): CanonicalLadderRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.band !== "string" ||
    row.band.length === 0 ||
    (row.scope_type !== "global" && row.scope_type !== "regional") ||
    typeof row.scope_key !== "string" ||
    typeof row.state !== "string" ||
    !LADDER_STATES.has(row.state) ||
    typeof row.stable_since !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }
  return {
    band: row.band,
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    state: row.state as LadderState,
    stableSince: row.stable_since,
    surprise: row.surprise === true,
    openedAt: typeof row.opened_at === "string" ? row.opened_at : null,
    inputs:
      row.inputs && typeof row.inputs === "object" && !Array.isArray(row.inputs)
        ? (row.inputs as Record<string, unknown>)
        : {},
    updatedAt: row.updated_at,
  };
}

/** Key: `${scopeType}|${scopeKey}|${band}` (scopeKey '' for global). */
export function canonicalKey(
  scopeType: "global" | "regional",
  scopeKey: string,
  band: string,
): string {
  return `${scopeType}|${scopeKey}|${band}`;
}

async function fetchBandLadder(): Promise<Map<string, CanonicalLadderRow>> {
  const response = await fetch("/api/spots/band-ladder");
  if (!response.ok) {
    throw new Error(`band-ladder request failed (${response.status})`);
  }
  const payload = (await response.json()) as { scopes?: unknown[] };
  const rows = Array.isArray(payload.scopes) ? payload.scopes : [];
  const byKey = new Map<string, CanonicalLadderRow>();
  for (const raw of rows) {
    const row = parseRow(raw);
    if (!row) continue;
    byKey.set(canonicalKey(row.scopeType, row.scopeKey, row.band), row);
  }
  return byKey;
}

export function useBandLadder(enabled = true) {
  return useQuery({
    queryKey: ["band-ladder"],
    queryFn: fetchBandLadder,
    refetchInterval: MINUTE,
    staleTime: 55 * 1000,
    retry: 1,
    enabled,
  });
}

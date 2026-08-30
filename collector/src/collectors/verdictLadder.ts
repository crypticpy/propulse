/**
 * Canonical Band Health ladder tick (BH2, DEV-PLAN-BAND-HEALTH §6).
 *
 * Every ~5 min: evaluate the five-state ladder for the deterministic scopes
 * — global per band, regional per band × continent — from the same live
 * count RPCs the client endpoints use, advance each scope's hold machine,
 * append every transition and surprise onset to verdict_events BEFORE any
 * outcome is known (log-don't-reconstruct), and upsert the stable states
 * into verdict_states, the public serving surface.
 *
 * The physics arm (P1, verdict/physicsArm.ts) blends each band's day and
 * night condition scores by the scope's real lit fraction — continent
 * anchors for regional scopes, the ham-weighted planet for global — using
 * the same solar inputs and staleness guard as the forecast snapshot.
 *
 * Events are written before states so a crash between the two can only
 * produce a duplicate event on the next tick, never a missing one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";
import {
  advanceRanked,
  evaluateLadder,
  initialRankedState,
  LADDER_RANK,
  type LadderEdgeState,
  type LadderState,
} from "../verdict/ladder.js";
import {
  buildLitFracPhysics,
  type PhysicsArm,
} from "../verdict/physicsArm.js";
import { computeOpeningTimeline } from "../verdict/openingTimeline.js";

/** Solar data older than this is not an honest forecast-arm input */
const MAX_SOLAR_AGE_MS = 3 * 3600_000;

/** verdict_events retention (§6: 13 months), pruned once per UTC day */
const EVENT_RETENTION_MONTHS = 13;

export type ScopeType = "global" | "regional";

export interface ScopeCounts {
  scopeType: ScopeType;
  scopeKey: string; // '' for global, continent code for regional
  band: string;
  obs20m: number;
  reporters20m: number;
  count10mRecent: number;
  count10mPrior: number;
  sourceCounts60m: Record<string, number>;
  modeObs20m: Record<string, number>;
}

export interface VerdictStateRow {
  band: string;
  scope_type: ScopeType;
  scope_key: string;
  state: LadderState;
  stable_since: string;
  candidate: LadderState | null;
  candidate_since: string | null;
  surprise: boolean;
  opened_at: string | null;
  inputs: Record<string, unknown>;
  updated_at: string;
}

export interface VerdictEventRow {
  ts: string;
  band: string;
  scope_type: ScopeType;
  scope_key: string;
  event_type: "transition" | "surprise";
  from_state: LadderState | null;
  to_state: LadderState | null;
  inputs: Record<string, unknown>;
}

export interface VerdictTickPlan {
  states: VerdictStateRow[];
  events: VerdictEventRow[];
}

function scopeId(scopeType: ScopeType, scopeKey: string, band: string): string {
  return `${scopeType}|${scopeKey}|${band}`;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function countMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

export function parseScopeCounts(
  row: unknown,
  scopeType: ScopeType,
): ScopeCounts | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.band !== "string" || r.band.length === 0) return null;
  const scopeKey =
    scopeType === "regional"
      ? typeof r.continent === "string" && r.continent.length > 0
        ? r.continent
        : null
      : "";
  if (scopeKey === null) return null;
  return {
    scopeType,
    scopeKey,
    band: r.band,
    obs20m: num(r.obs_20m),
    reporters20m: num(r.reporters_20m),
    count10mRecent: num(r.count_10m_recent),
    count10mPrior: num(r.count_10m_prior),
    sourceCounts60m: countMap(r.source_counts_60m),
    modeObs20m: countMap(r.mode_obs_20m),
  };
}

/**
 * Pure tick: previous states + physics scores + live counts → next states
 * and the events the transition produced. Scopes with a stored state but no
 * counts row this tick evaluate against zeros so a quiet scope can walk
 * back down the ladder.
 */
export function planVerdictTick(
  prevRows: VerdictStateRow[],
  physics: PhysicsArm,
  counts: ScopeCounts[],
  nowMs: number,
): VerdictTickPlan {
  const nowIso = new Date(nowMs).toISOString();
  const prevById = new Map<string, VerdictStateRow>();
  for (const row of prevRows) {
    prevById.set(scopeId(row.scope_type, row.scope_key, row.band), row);
  }

  const byId = new Map<string, ScopeCounts>();
  for (const c of counts) {
    byId.set(scopeId(c.scopeType, c.scopeKey, c.band), c);
  }
  // Zero-fill scopes that have a state but produced no counts row.
  for (const row of prevRows) {
    const id = scopeId(row.scope_type, row.scope_key, row.band);
    if (!byId.has(id)) {
      byId.set(id, {
        scopeType: row.scope_type,
        scopeKey: row.scope_key,
        band: row.band,
        obs20m: 0,
        reporters20m: 0,
        count10mRecent: 0,
        count10mPrior: 0,
        sourceCounts60m: {},
        modeObs20m: {},
      });
    }
  }

  const states: VerdictStateRow[] = [];
  const events: VerdictEventRow[] = [];

  for (const scope of byId.values()) {
    const id = scopeId(scope.scopeType, scope.scopeKey, scope.band);
    const prev = prevById.get(id);

    const prevEdges: LadderEdgeState | undefined = prev
      ? {
          physicsOpen: prev.inputs.physics_open === true,
          verified: prev.inputs.verified === true,
        }
      : undefined;

    const physicsScore = physics.scoreFor(
      scope.scopeType,
      scope.scopeKey,
      scope.band,
    );
    const raw = evaluateLadder(
      {
        physicsScore,
        obs20m: scope.obs20m,
        reporters20m: scope.reporters20m,
        count10mRecent: scope.count10mRecent,
        count10mPrior: scope.count10mPrior,
      },
      prevEdges,
    );

    // A first-seen scope starts closed and must earn its state through the
    // holds like any other — a cold start never instantly reads "hot".
    const machine = prev
      ? {
          stable: prev.state,
          stableSince: Date.parse(prev.stable_since),
          candidate: prev.candidate,
          candidateSince: prev.candidate_since
            ? Date.parse(prev.candidate_since)
            : 0,
        }
      : initialRankedState<LadderState>("closed", nowMs);

    const { state: next, flip } = advanceRanked(
      LADDER_RANK,
      machine,
      raw.state,
      nowMs,
    );

    // BH3: physics time-sweep — when does this scope next cross the
    // ladder's open threshold under solar persistence?
    const timeline = computeOpeningTimeline(
      physics,
      scope.scopeType,
      scope.scopeKey,
      scope.band,
      raw.physicsOpen,
      nowMs,
    );

    const inputs: Record<string, unknown> = {
      physics_score: Math.round(physicsScore * 1000) / 1000,
      // The basis keeps the scored record self-describing so BH4 scoring
      // can segment accuracy across physics-arm generations.
      physics_basis: physics.basis,
      physics_f_lit:
        Math.round(physics.fLitFor(scope.scopeType, scope.scopeKey) * 1000) /
        1000,
      physics_open: raw.physicsOpen,
      verified: raw.verified,
      obs_20m: scope.obs20m,
      reporters_20m: scope.reporters20m,
      count_10m_recent: scope.count10mRecent,
      count_10m_prior: scope.count10mPrior,
      trend: raw.trend,
      raw_state: raw.state,
      opens_in_min: timeline.opensInMin,
      fades_in_min: timeline.fadesInMin,
      source_counts_60m: scope.sourceCounts60m,
      mode_obs_20m: scope.modeObs20m,
    };

    const stableRank = LADDER_RANK[next.stable];
    const surprise = stableRank >= LADDER_RANK.stirring && !raw.physicsOpen;
    const openedAt =
      stableRank >= LADDER_RANK.stirring
        ? prev && LADDER_RANK[prev.state] >= LADDER_RANK.stirring
          ? prev.opened_at
          : nowIso
        : null;

    if (flip) {
      events.push({
        ts: nowIso,
        band: scope.band,
        scope_type: scope.scopeType,
        scope_key: scope.scopeKey,
        event_type: "transition",
        from_state: flip.from,
        to_state: flip.to,
        inputs,
      });
    }
    if (surprise && !(prev?.surprise ?? false)) {
      events.push({
        ts: nowIso,
        band: scope.band,
        scope_type: scope.scopeType,
        scope_key: scope.scopeKey,
        event_type: "surprise",
        from_state: null,
        to_state: next.stable,
        inputs,
      });
    }

    states.push({
      band: scope.band,
      scope_type: scope.scopeType,
      scope_key: scope.scopeKey,
      state: next.stable,
      stable_since: new Date(next.stableSince).toISOString(),
      candidate: next.candidate,
      candidate_since: next.candidate
        ? new Date(next.candidateSince).toISOString()
        : null,
      surprise,
      opened_at: openedAt,
      inputs,
      updated_at: nowIso,
    });
  }

  return { states, events };
}

// ─── Collector job ──────────────────────────────────────────────────────────

let lastEventPruneDate: string | null = null;

export async function runVerdictLadder(db: SupabaseClient): Promise<void> {
  const start = Date.now();

  try {
    const { data: solar, error: solarError } = await db
      .from("solar_snapshots")
      .select("captured_at,kp_index,sfi")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (solarError) {
      throw new Error(`Solar snapshot read failed: ${solarError.message}`);
    }
    if (!solar || solar.kp_index == null || solar.sfi == null) {
      throw new Error("No usable solar snapshot (missing kp_index/sfi)");
    }
    const solarAgeMs = start - Date.parse(solar.captured_at);
    if (
      !Number.isFinite(solarAgeMs) ||
      solarAgeMs < -5 * 60_000 ||
      solarAgeMs > MAX_SOLAR_AGE_MS
    ) {
      throw new Error(
        `Latest solar snapshot is stale or in the future (${solar.captured_at}) — skipping ladder tick`,
      );
    }

    const physics = buildLitFracPhysics(solar.kp_index, solar.sfi, start);

    const [globalRes, regionalRes, statesRes] = await Promise.all([
      db.rpc("band_activity_counts"),
      db.rpc("region_activity_counts"),
      db.from("verdict_states").select("*"),
    ]);
    if (globalRes.error) {
      throw new Error(`band_activity_counts failed: ${globalRes.error.message}`);
    }
    if (regionalRes.error) {
      throw new Error(
        `region_activity_counts failed: ${regionalRes.error.message}`,
      );
    }
    if (statesRes.error) {
      throw new Error(`verdict_states read failed: ${statesRes.error.message}`);
    }

    const counts: ScopeCounts[] = [
      ...(Array.isArray(globalRes.data) ? globalRes.data : [])
        .map((row) => parseScopeCounts(row, "global"))
        .filter((c): c is ScopeCounts => c !== null),
      ...(Array.isArray(regionalRes.data) ? regionalRes.data : [])
        .map((row) => parseScopeCounts(row, "regional"))
        .filter((c): c is ScopeCounts => c !== null),
    ];

    const prevRows = (statesRes.data ?? []) as VerdictStateRow[];
    const { states, events } = planVerdictTick(prevRows, physics, counts, start);

    // Events first: a crash between the writes may duplicate an event next
    // tick but can never advance a state without its event.
    if (events.length > 0) {
      const { error: eventError } = await db
        .from("verdict_events")
        .insert(events);
      if (eventError) {
        throw new Error(`verdict_events insert failed: ${eventError.message}`);
      }
    }

    if (states.length > 0) {
      const { error: stateError } = await db
        .from("verdict_states")
        .upsert(states, { onConflict: "band,scope_type,scope_key" });
      if (stateError) {
        throw new Error(`verdict_states upsert failed: ${stateError.message}`);
      }
    }

    // Daily retention pass on the event log.
    const today = new Date(start).toISOString().slice(0, 10);
    if (lastEventPruneDate !== today) {
      const cutoff = new Date(start);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - EVENT_RETENTION_MONTHS);
      const { error: pruneError } = await db
        .from("verdict_events")
        .delete()
        .lt("ts", cutoff.toISOString());
      if (pruneError) {
        log("warn", "verdict_events retention delete failed", {
          error: pruneError.message,
        });
      } else {
        lastEventPruneDate = today;
      }
    }

    const durationMs = Date.now() - start;
    reportHealth("verdict-ladder", "ok", states.length);
    await reportToDb(db, "verdict-ladder", "ok", states.length, durationMs);

    if (events.length > 0) {
      log("info", "Verdict ladder transitions", {
        events: events.map(
          (e) =>
            `${e.band} ${e.scope_type}${e.scope_key ? `:${e.scope_key}` : ""} ${
              e.event_type
            } ${e.from_state ?? ""}→${e.to_state ?? ""}`,
        ),
      });
    }
    log("info", "Verdict ladder tick complete", {
      scopes: states.length,
      events: events.length,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("verdict-ladder", "error", 0);
    await reportToDb(db, "verdict-ladder", "error", 0, durationMs, msg);
    log("error", "Verdict ladder tick failed", { error: msg });
  }
}

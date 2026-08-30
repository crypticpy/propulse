# Roadmap — September 2026

Consolidated view of everything open or on deck as of 2026-08-30, after the
BH1/BH2 ladder (PRs #61/#62), the P1 physics arm (#64), and the
monitoring-to-collector move (#65) all merged. Single source to work from;
items link back to their owning plan where one exists.

Owner key: **[me]** = agent executes; **[you]** = owner click (billing,
tokens, merges); **[cal]** = calendar-gated, do not start early.

## Phase R — Runway (this weekend)

### R1. Collector redeploy + live verification [me] — DONE 2026-08-30 07:18Z
Deployed merged main; verified live: healthy `inference-monitor` tick on
`/health` (status ok, 10-min interval), ladder ticking (68 rows), snapshot
writer ok. The 07:00Z snapshot bucket was written by the old build seconds
before cutover (first-write-per-hour wins), so the first
`bands-v2-global-litfrac` rows land at the 08:00Z bucket — watched and
confirmed separately. Deployment gate box checked in
`ml/PROPAGATION-PRODUCT-CLOUD-INTEGRATION-PLAN.md`.

### R2. Optional incident-issue token [you]
Mint a fine-grained PAT (issues:write on `crypticpy/propulse` only) and set
`GITHUB_ALERT_TOKEN` on the Railway collector service. Without it the
monitor still works — failures surface in `/health` + `collector_health`,
just no durable GitHub issue. Skip if that visibility is enough.

### R3. Satellites collector fix [me]
The only red on `/health`: CelesTrak "All TLE groups failed", pre-existing.
Investigate (URL/format/rate-limit drift), fix or switch mirror.
Verify: `satellites` reports ok on two consecutive polls (2-h interval).

### R4. Actions budget watch [you, passive]
Quota reset 2026-09-01. Projected scheduled burn is ~124 runs/mo (4/day
solar synthetic + deadman) — September should fit the free 2,000 min with
PR CI on top. If it does, drop the $20 spending limit back down at
month-end. No code work.

## Phase B — Build (unblocked now)

### B1. BH3 — Opening timeline (DEV-PLAN-BAND-HEALTH §10)
"Likely opens ~40 min" per scope: physics time-sweep + FutureCast horizons
where capability allows. Every lead-time call logged as a forecast snapshot
with `horizon_hours > 0` so the F2 harness can score it — BH3 shipped early
*enriches* the Phase G evidence rather than waiting on it.
Sequence: design note (endpoint shape, sweep cadence, UI placement in the
BandVerdictPanel) → collector sweep + snapshot rows → endpoint → client.
Verify: horizon rows visible in the eval report; timeline matches a
hand-computed sweep for a fixed solar fixture.

### B2. BH4 groundwork — feedback plumbing only (DEV-PLAN-BAND-HEALTH §10)
The `verdict_feedback` table + RLS + rate caps can land before the gate;
feedback is never a live scoring input (§8 constraint), so it only
accumulates evidence. The public accuracy panel itself waits for Phase G —
its numbers would be noise before ~14 snapshot days exist.
Verify: RLS denies cross-user writes; rate caps hold under a burst test.

## Phase G — Gated on eval evidence [cal: ~2026-09-13]

Snapshot series started 2026-08-30 under `bands-v2-global-litfrac` (the
algo bump landed on day 0, so the series is clean — no mixed-algo window).
Gate: ≥14 consecutive snapshot days, then `npm run eval:forecast`.

### G1. First eval report [me]
Brier/reliability by band × horizon, physics arm vs outcomes, surprise-rate
before/after P1. This report is the evidence everything below cites.

### G2. M4 F4 — improvement loop (DEV-PLAN-FORECAST-ENGINE §3)
Only what G1 justifies: recalibration, blend-weight tuning, or a targeted
retrain. Scope stays limited to what the eval shows is broken.

### G3. BH5 — assimilation loop (DEV-PLAN-BAND-HEALTH §10)
Blend weights (physics / NowCast / climatology) by Brier minimization on
logged outcomes; beacon probes as calibrated corrections; surprise ledger
feeds retraining decisions. Starts only after G1, per the F4 scope limit.

### G4. BH4 accuracy panel [me, after G1]
Public rolling scores from the F2 harness, reproducible from the eval
output; disagreement diagnostics.

## Phase H — Housekeeping (dated or decision-needed)

- **H1. `feat/split-parity` branch [you, decision]** — committed locally,
  never PR'd. Open a PR or explicitly park it; currently it's silt.
- **H2. `ml/service` dirty WSPR orphans [you, decision]** — modified
  tracked files sitting in the working tree since the salvage. Options:
  revert to HEAD (they stay in git history from #44) or leave. They must
  never be committed forward; live WSPR stays decommissioned.
- **H3. Archival dry-run [me, ~2026-10-14]** — first `path_hourly_stats`
  day leaves the 90-day hot window. Verify the sealed CSV.gz export
  restores cleanly *before* any discussion of enabling the prune flag
  (which stays OFF until then).

## Standing constraints (unchanged, apply to every phase)

- No live WSPR ingestion — permanent. WSPR is offline base training only.
- Infra budget ≤ $25/mo; durable spot data is aggregates only.
- PostgREST 8-s statement timeout; write pages ≤ 1000 rows.
- Client feedback never mutates live verdicts.
- Deliverables are local Markdown in `docs/`; PR merges are the owner's
  click; migrations apply via psql only, never assumed.

## Suggested order

R1 (today) → R3 (today/tomorrow) → B1 design + build (this week) →
B2 (next week) → G1 on ~09-13 → G4 → G2/G3 as the evidence directs →
H3 in October. R2/R4/H1/H2 slot in whenever you have a minute — none of
them block the line above.

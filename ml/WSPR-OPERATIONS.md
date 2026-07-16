# WSPR Operational Source Decision

> Decision date: 2026-07-12. Production status: blocked pending written
> permission or an independently permitted upstream feed.

WSPR.live explicitly welcomes free research/projects but prohibits
profit-oriented use and provides no availability guarantee. Propulse is planned
as a nonprofit with donation-supported operation, but hosted registration and
other paid features make unilateral interpretation of those terms inappropriate.

Accordingly:

- the historical research pipeline downloads the WSPRnet monthly archive and
  publishes only source requests, hashes, schemas, and aggregate results;
- `/api/wspr/spots` returns `503` by default and can query WSPR.live only when
  `WSPR_LIVE_RESEARCH_PROXY_ENABLED=true` is deliberately set for research;
- the private `wspr_live_connector.py` is separately double-gated for internal
  research, uses one exact-hour streaming query, and remains unscheduled until
  that research mode is deliberately enabled;
- no production prediction depends solely on WSPR.live;
- stale or unavailable WSPR evidence selects a physics/weather model with lower
  confidence and an explicit fallback flag;
- synthetic spot-like data is prohibited from product and validation paths;
- PSK Reporter, RBN, and DX collector health remain separate and cannot be
  mislabeled as WSPR.

Before enabling hosted WSPR, retain written permission describing nonprofit,
donation-supported, cached, and derivative-model use, or implement a permitted
first-party upstream ingestion route with event time, ingest time, dedupe keys,
and outage intervals.

The technical connector gate passed on 2026-07-16. A single exact-hour research
query streamed 287,694 valid HF observations across all ten bands in 23.1142
seconds at 57.625 MiB peak RSS, performed no target write, and removed its
transient Projects-volume spool. This does not change the production decision.
Use [`WSPR-LIVE-PERMISSION-REQUEST.md`](WSPR-LIVE-PERMISSION-REQUEST.md) for the
written request and authorization record.

The first private target finalization detected a 1,000-row PostgREST response
cap. Its ten truncated watermarks were marked `failed`; no history was erased.
The repaired manifest v2 signs per-band counts and the finalizer refuses to
publish if a fully paginated band differs. The corrected target version matched
all 287,694 observations and 75,055 aggregate feature cells, while an incomplete
four-lag lookup remained empty. This is one research hour, not continuous or
subscriber-facing approval.

The active signed schedule is currently healthy at `13/13` expected hours and
`13/720` required hours with zero gaps. A separate read-only coverage/drift
receipt is checksum-bound to that schedule, excludes the earlier manual test
hour, and confirms 130 complete band-hours across all ten HF bands. Its broad
regional output is k-suppressed and capped; it publishes no callsigns, grid4
values, or equipment. Seven-day drift and 30-day coverage gates remain
immature, so the decision is `collecting`, not source or product approval.

# Propulse NowCast V4.2: model and Phase 6 readiness report

## Technical summary

Frozen A6 improved weighted Brier by **2.134%**
versus frozen V3/B2 across **260,474,292 untouched rows** and
won all four locked 2025 months. The current release decision is
**withheld**: 10 of
20 mode-specific gates pass, no product mode is
releaseable, and prospective outcomes remain unread.

## Current clocks

- First-party capture: 4.50/24 continuous hours.
- Permitted WSPR shadow: 12/720 completed hours.
- FutureCast issuance history: 1/90 consecutive legal days.

## StationCast scorer dry run

The frozen scorer exercised 16 of
16 preregistered gates on a reproducible
2,000-row synthetic cohort using all visible M5
cores. Its receipt explicitly sets `release_approved` to `false`; this validates
the scorer and privacy boundary, not real operator performance.

## Decision

Core NowCast and deterministic StationCast remain shadow-only. Learned
StationCast, FutureCast, and 6m remain withheld. The interactive HTML report is
the primary artifact; this Markdown file is its compact semantic companion.

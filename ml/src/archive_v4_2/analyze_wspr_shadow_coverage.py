#!/usr/bin/env python3
"""Measure privacy-safe coverage and source drift in the live WSPR shadow."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import psycopg
from psycopg.rows import dict_row

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import (
    ROOT,
    atomic_write,
    current_project_pooler_url,
    read_env,
)


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_ENV = ROOT / ".env.local"
DEFAULT_POOLER_URL = ROOT / "supabase/.temp/pooler-url"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/wspr_shadow_coverage_drift.json"
)
DEFAULT_PROGRESS = DEFAULT_OUTPUT.parent / "wspr_research_shadow_progress.json"
HF_BANDS = (
    "160m",
    "80m",
    "60m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
)
DEFAULT_PROVIDER = "wspr.live-research-v1"
DEFAULT_TRANSFORM_VERSION = "wspr-opportunity-duckdb-v1"
REQUIRED_WINDOW_HOURS = 720
MINIMUM_COMPLETION_RATE = 0.99
DRIFT_PERIOD_HOURS = 7 * 24
MAXIMUM_DISTRIBUTION_JSD = 0.20
MINIMUM_VOLUME_RATIO = 0.50
MAXIMUM_VOLUME_RATIO = 2.00
REGION_MINIMUM_HOURS = 6
REGION_MINIMUM_CELLS = 100
MAXIMUM_REGION_ROWS_PER_BAND = 12
EXPECTED_PROGRESS_GATES = {
    "secret_file_owner_only",
    "all_receipts_and_manifests_valid",
    "all_ten_bands_present_each_hour",
    "receipt_timestamps_causal",
    "m5_multicore_profile_exact",
    "one_source_request_per_hour",
    "no_future_target_receipts",
    "completed_hours_within_7200_seconds",
    "scheduled_completion_rate_at_least_99_percent",
    "minimum_30_day_window_complete",
    "locked_outcomes_unread",
}
REGION_RE = re.compile(r"^[A-R]{2}$")
DISTANCE_BUCKETS = (
    "<1,000 km",
    "1,000-3,000 km",
    "3,000-6,000 km",
    "6,000-10,000 km",
    "10,000+ km",
)


LATEST_WATERMARK_CTE = """
WITH latest_watermarks AS (
  SELECT DISTINCT ON (target_hour, band)
    target_hour,
    band,
    available_at,
    status,
    quality_flags
  FROM public.wspr_feature_watermarks
  WHERE provider = %s
    AND transform_version = %s
    AND target_hour >= %s
    AND target_hour <= %s
  ORDER BY target_hour, band, available_at DESC
), valid_watermarks AS (
  SELECT target_hour, band, available_at
  FROM latest_watermarks
  WHERE status = 'complete'
    AND cardinality(quality_flags) = 0
)
"""

HOURLY_QUERY = LATEST_WATERMARK_CTE + """
SELECT
  watermark.target_hour,
  watermark.band,
  count(feature.id)::bigint AS feature_cells,
  coalesce(sum(feature.sampled_rows), 0)::bigint AS sampled_rows,
  count(DISTINCT feature.tx_grid4)::bigint AS origin_grid4_cells,
  count(DISTINCT feature.rx_grid4)::bigint AS target_grid4_cells
FROM valid_watermarks AS watermark
LEFT JOIN public.wspr_path_hourly_features AS feature
  ON feature.target_hour = watermark.target_hour
 AND feature.band = watermark.band
 AND feature.provider = %s
 AND feature.transform_version = %s
 AND feature.available_at = watermark.available_at
GROUP BY watermark.target_hour, watermark.band
ORDER BY watermark.target_hour, watermark.band
"""

REGION_QUERY = LATEST_WATERMARK_CTE + """
, feature_rows AS (
  SELECT
    feature.target_hour,
    feature.band,
    left(feature.tx_grid4, 2) AS origin_field,
    left(feature.rx_grid4, 2) AS target_field,
    feature.sampled_rows
  FROM valid_watermarks AS watermark
  JOIN public.wspr_path_hourly_features AS feature
    ON feature.target_hour = watermark.target_hour
   AND feature.band = watermark.band
   AND feature.provider = %s
   AND feature.transform_version = %s
   AND feature.available_at = watermark.available_at
), region_rows AS (
  SELECT 'origin'::text AS dimension, origin_field AS region, band,
         count(*)::bigint AS feature_cells,
         count(DISTINCT target_hour)::bigint AS completed_hours,
         sum(sampled_rows)::bigint AS sampled_rows
  FROM feature_rows
  GROUP BY origin_field, band
  UNION ALL
  SELECT 'target'::text AS dimension, target_field AS region, band,
         count(*)::bigint AS feature_cells,
         count(DISTINCT target_hour)::bigint AS completed_hours,
         sum(sampled_rows)::bigint AS sampled_rows
  FROM feature_rows
  GROUP BY target_field, band
)
, ranked_regions AS (
  SELECT
    dimension,
    region,
    band,
    feature_cells,
    completed_hours,
    sampled_rows,
    count(*) OVER (PARTITION BY dimension, band)::integer
      AS eligible_region_count,
    row_number() OVER (
      PARTITION BY dimension, band
      ORDER BY feature_cells DESC, region
    )::integer AS coverage_rank
  FROM region_rows
  WHERE feature_cells >= %s AND completed_hours >= %s
)
SELECT dimension, region, band, feature_cells, completed_hours, sampled_rows,
       eligible_region_count, coverage_rank
FROM ranked_regions
WHERE coverage_rank <= %s
ORDER BY dimension, band, coverage_rank
"""

DISTANCE_QUERY = LATEST_WATERMARK_CTE + """
, feature_rows AS (
  SELECT
    feature.target_hour,
    feature.band,
    feature.tx_grid4,
    feature.rx_grid4,
    feature.sampled_rows
  FROM valid_watermarks AS watermark
  JOIN public.wspr_path_hourly_features AS feature
    ON feature.target_hour = watermark.target_hour
   AND feature.band = watermark.band
   AND feature.provider = %s
   AND feature.transform_version = %s
   AND feature.available_at = watermark.available_at
), unique_pairs AS (
  SELECT DISTINCT tx_grid4, rx_grid4
  FROM feature_rows
), pair_centers AS (
  SELECT
    tx_grid4,
    rx_grid4,
    (ascii(substr(tx_grid4, 1, 1)) - ascii('A')) * 20.0 - 179.0
      + substr(tx_grid4, 3, 1)::integer * 2.0 AS tx_lon,
    (ascii(substr(tx_grid4, 2, 1)) - ascii('A')) * 10.0 - 89.5
      + substr(tx_grid4, 4, 1)::integer AS tx_lat,
    (ascii(substr(rx_grid4, 1, 1)) - ascii('A')) * 20.0 - 179.0
      + substr(rx_grid4, 3, 1)::integer * 2.0 AS rx_lon,
    (ascii(substr(rx_grid4, 2, 1)) - ascii('A')) * 10.0 - 89.5
      + substr(rx_grid4, 4, 1)::integer AS rx_lat
  FROM unique_pairs
), pair_distance AS (
  SELECT
    tx_grid4,
    rx_grid4,
    6371.0088 * 2.0 * asin(least(1.0, sqrt(
      power(sin(radians((rx_lat - tx_lat) / 2.0)), 2)
      + cos(radians(tx_lat)) * cos(radians(rx_lat))
      * power(sin(radians((rx_lon - tx_lon) / 2.0)), 2)
    ))) AS distance_km
  FROM pair_centers
), bucketed AS (
  SELECT
    feature.target_hour,
    feature.band,
    CASE
      WHEN distance.distance_km < 1000 THEN '<1,000 km'
      WHEN distance.distance_km < 3000 THEN '1,000-3,000 km'
      WHEN distance.distance_km < 6000 THEN '3,000-6,000 km'
      WHEN distance.distance_km < 10000 THEN '6,000-10,000 km'
      ELSE '10,000+ km'
    END AS distance_bucket,
    feature.sampled_rows
  FROM feature_rows AS feature
  JOIN pair_distance AS distance USING (tx_grid4, rx_grid4)
)
SELECT target_hour, band, distance_bucket,
       count(*)::bigint AS feature_cells,
       sum(sampled_rows)::bigint AS sampled_rows
FROM bucketed
GROUP BY target_hour, band, distance_bucket
ORDER BY target_hour, band, distance_bucket
"""


def _utc(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("coverage timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def _integer(value: Any) -> int:
    return int(value or 0)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scheduled_audit_window(
    progress: Mapping[str, Any],
    progress_sha256: str,
) -> tuple[datetime, datetime, dict[str, Any]]:
    gates = progress.get("gates")
    window = progress.get("window")
    if (
        progress.get("schema_version") != 1
        or progress.get("scope") != "wspr_research_shadow_progress"
        or progress.get("decision") not in {"collecting", "pass"}
        or progress.get("operational_status") != "healthy"
        or progress.get("research_only") is not True
        or progress.get("subscriber_facing_authorized") is not False
        or progress.get("locked_outcomes_read") is not False
        or not isinstance(gates, dict)
        or set(gates) != EXPECTED_PROGRESS_GATES
        or not isinstance(window, dict)
        or not re.fullmatch(r"[0-9a-f]{64}", progress_sha256)
    ):
        raise ValueError("scheduled WSPR progress receipt is invalid")
    operational_gates = {
        name: value
        for name, value in gates.items()
        if name != "minimum_30_day_window_complete"
    }
    if not operational_gates or not all(
        value is True for value in operational_gates.values()
    ):
        raise ValueError("scheduled WSPR progress is not operationally healthy")

    start = _utc(window.get("start_target_hour"))
    end = _utc(window.get("latest_settled_target_hour"))
    scheduled_expected = _integer(window.get("expected_hours"))
    scheduled_completed = _integer(window.get("completed_hours"))
    scheduled_missing = _integer(window.get("missing_hours"))
    computed_expected = int((end - start).total_seconds() // 3600) + 1
    if (
        end < start
        or start.minute != 0
        or start.second != 0
        or start.microsecond != 0
        or end.minute != 0
        or end.second != 0
        or end.microsecond != 0
        or scheduled_expected != computed_expected
        or scheduled_completed < 0
        or scheduled_completed > scheduled_expected
        or scheduled_missing != scheduled_expected - scheduled_completed
        or gates["minimum_30_day_window_complete"]
        is not (scheduled_expected >= REQUIRED_WINDOW_HOURS)
        or progress.get("decision")
        != ("pass" if scheduled_expected >= REQUIRED_WINDOW_HOURS else "collecting")
    ):
        raise ValueError("scheduled WSPR progress window is inconsistent")

    audit_start = max(start, end - timedelta(hours=REQUIRED_WINDOW_HOURS - 1))
    audit_expected = int((end - audit_start).total_seconds() // 3600) + 1
    return audit_start, end, {
        "source_scope": "wspr_research_shadow_progress",
        "progress_sha256": progress_sha256,
        "scheduled_start": start.isoformat(),
        "scheduled_end": end.isoformat(),
        "scheduled_expected_hours": scheduled_expected,
        "scheduled_completed_hours": scheduled_completed,
        "scheduled_missing_hours": scheduled_missing,
        "audited_start": audit_start.isoformat(),
        "audited_end": end.isoformat(),
        "audited_expected_hours": audit_expected,
    }


def _distribution(
    rows: Iterable[Mapping[str, Any]],
    key: str,
    value: str = "feature_cells",
) -> dict[str, float]:
    totals: defaultdict[str, float] = defaultdict(float)
    for row in rows:
        totals[str(row[key])] += float(row.get(value, 0) or 0)
    return dict(totals)


def jensen_shannon_divergence(
    left: Mapping[str, float],
    right: Mapping[str, float],
) -> float:
    """Return base-2 JSD in [0, 1] for non-negative categorical mass."""
    keys = sorted(set(left) | set(right))
    left_total = sum(max(float(left.get(key, 0.0)), 0.0) for key in keys)
    right_total = sum(max(float(right.get(key, 0.0)), 0.0) for key in keys)
    if left_total <= 0 or right_total <= 0:
        return 1.0
    result = 0.0
    for key in keys:
        p = max(float(left.get(key, 0.0)), 0.0) / left_total
        q = max(float(right.get(key, 0.0)), 0.0) / right_total
        midpoint = (p + q) / 2.0
        if p > 0:
            result += 0.5 * p * math.log2(p / midpoint)
        if q > 0:
            result += 0.5 * q * math.log2(q / midpoint)
    return max(0.0, min(result, 1.0))


def _summarize(
    rows: Sequence[Mapping[str, Any]],
    key: str,
) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, int]] = {}
    for row in rows:
        label = str(row[key])
        group = groups.setdefault(
            label,
            {"feature_cells": 0, "sampled_rows": 0, "band_hours": 0},
        )
        group["feature_cells"] += _integer(row.get("feature_cells"))
        group["sampled_rows"] += _integer(row.get("sampled_rows"))
        group["band_hours"] += 1
    return [{key: label, **groups[label]} for label in sorted(groups)]


def build_coverage_receipt(
    *,
    generated_at: datetime,
    window_start: datetime,
    window_end: datetime,
    hourly_rows: Sequence[Mapping[str, Any]],
    region_rows: Sequence[Mapping[str, Any]],
    distance_rows: Sequence[Mapping[str, Any]],
    runtime: Mapping[str, Any],
    provider: str,
    transform_version: str,
    query_seconds: Mapping[str, float],
    window_provenance: Mapping[str, Any],
) -> dict[str, Any]:
    start = _utc(window_start)
    end = _utc(window_end)
    if end < start:
        raise ValueError("coverage window end precedes its start")
    expected_hours = int((end - start).total_seconds() // 3600) + 1
    band_counts: Counter[datetime] = Counter()
    normalized_hourly: list[dict[str, Any]] = []
    for row in hourly_rows:
        target_hour = _utc(row["target_hour"])
        if not start <= target_hour <= end:
            raise ValueError("hourly coverage row lies outside the audited window")
        band = str(row["band"])
        if band not in HF_BANDS:
            raise ValueError(f"unsupported coverage band: {band}")
        band_counts[target_hour] += 1
        normalized_hourly.append(
            {
                **row,
                "target_hour": target_hour,
                "utc_hour": target_hour.hour,
                "feature_cells": _integer(row.get("feature_cells")),
                "sampled_rows": _integer(row.get("sampled_rows")),
            }
        )
    if any(count > len(HF_BANDS) for count in band_counts.values()):
        raise ValueError("duplicate band-hour coverage rows detected")
    completed_hours = sum(count == len(HF_BANDS) for count in band_counts.values())
    completion_rate = completed_hours / expected_hours if expected_hours else 0.0
    observed_bands = sorted({str(row["band"]) for row in normalized_hourly})
    observed_utc_hours = sorted({int(row["utc_hour"]) for row in normalized_hourly})

    first_period_end = start + timedelta(hours=DRIFT_PERIOD_HOURS)
    last_period_start = end - timedelta(hours=DRIFT_PERIOD_HOURS - 1)
    drift_sample_sufficient = last_period_start >= first_period_end
    early = [
        row for row in normalized_hourly if row["target_hour"] < first_period_end
    ] if drift_sample_sufficient else []
    late = [
        row for row in normalized_hourly if row["target_hour"] >= last_period_start
    ] if drift_sample_sufficient else []
    distance_normalized: list[dict[str, Any]] = []
    for row in distance_rows:
        target_hour = _utc(row["target_hour"])
        if (
            not start <= target_hour <= end
            or str(row.get("band")) not in HF_BANDS
            or str(row.get("distance_bucket")) not in DISTANCE_BUCKETS
        ):
            raise ValueError("distance coverage row is outside the audit contract")
        distance_normalized.append({**row, "target_hour": target_hour})
    for row in region_rows:
        if (
            str(row.get("dimension")) not in {"origin", "target"}
            or str(row.get("band")) not in HF_BANDS
            or not REGION_RE.fullmatch(str(row.get("region")))
        ):
            raise ValueError("regional coverage row is outside the audit contract")
    early_distance = [
        row for row in distance_normalized if row["target_hour"] < first_period_end
    ]
    late_distance = [
        row for row in distance_normalized if row["target_hour"] >= last_period_start
    ]
    early_cells = sum(_integer(row.get("feature_cells")) for row in early)
    late_cells = sum(_integer(row.get("feature_cells")) for row in late)
    volume_ratio = late_cells / early_cells if early_cells > 0 else None
    drift = {
        "sample_sufficient": drift_sample_sufficient,
        "period_hours": DRIFT_PERIOD_HOURS,
        "early_start": start.isoformat() if drift_sample_sufficient else None,
        "early_end_exclusive": (
            first_period_end.isoformat() if drift_sample_sufficient else None
        ),
        "late_start": (
            last_period_start.isoformat() if drift_sample_sufficient else None
        ),
        "late_end_inclusive": end.isoformat() if drift_sample_sufficient else None,
        "early_feature_cells": early_cells if drift_sample_sufficient else None,
        "late_feature_cells": late_cells if drift_sample_sufficient else None,
        "late_to_early_volume_ratio": volume_ratio,
        "band_jsd": jensen_shannon_divergence(
            _distribution(early, "band"), _distribution(late, "band")
        ) if drift_sample_sufficient else None,
        "utc_hour_jsd": jensen_shannon_divergence(
            _distribution(early, "utc_hour"), _distribution(late, "utc_hour")
        ) if drift_sample_sufficient else None,
        "distance_jsd": jensen_shannon_divergence(
            _distribution(early_distance, "distance_bucket"),
            _distribution(late_distance, "distance_bucket"),
        ) if drift_sample_sufficient else None,
        "thresholds": {
            "maximum_distribution_jsd": MAXIMUM_DISTRIBUTION_JSD,
            "minimum_volume_ratio": MINIMUM_VOLUME_RATIO,
            "maximum_volume_ratio": MAXIMUM_VOLUME_RATIO,
        },
    }
    jsd_values = [
        float(value)
        for name, value in drift.items()
        if name.endswith("_jsd") and value is not None
    ]
    drift_stable = bool(
        drift_sample_sufficient
        and jsd_values
        and max(jsd_values) <= MAXIMUM_DISTRIBUTION_JSD
        and volume_ratio is not None
        and MINIMUM_VOLUME_RATIO <= volume_ratio <= MAXIMUM_VOLUME_RATIO
    )
    gates = {
        "native_m5_validation": bool(
            runtime.get("machine") == "arm64"
            and int(runtime.get("physical_cores_visible", 0)) >= 18
        ),
        "window_spans_720_hours": expected_hours >= REQUIRED_WINDOW_HOURS,
        "all_band_completion_at_least_99_percent": (
            completion_rate >= MINIMUM_COMPLETION_RATE
        ),
        "all_ten_hf_bands_observed": set(observed_bands) == set(HF_BANDS),
        "all_24_utc_hours_observed": observed_utc_hours == list(range(24)),
        "window_bound_to_signed_scheduled_receipts": bool(
            window_provenance.get("source_scope")
            == "wspr_research_shadow_progress"
            and re.fullmatch(
                r"[0-9a-f]{64}",
                str(window_provenance.get("progress_sha256", "")),
            )
            and window_provenance.get("audited_start") == start.isoformat()
            and window_provenance.get("audited_end") == end.isoformat()
            and _integer(window_provenance.get("audited_expected_hours"))
            == expected_hours
            and _integer(window_provenance.get("scheduled_expected_hours"))
            >= expected_hours
        ),
        "early_late_drift_sample_sufficient": drift_sample_sufficient,
        "aggregate_source_distribution_stable": drift_stable,
        "region_output_k_suppressed": all(
            _integer(row.get("feature_cells")) >= REGION_MINIMUM_CELLS
            and _integer(row.get("completed_hours")) >= REGION_MINIMUM_HOURS
            and 1 <= _integer(row.get("coverage_rank", 1))
            <= MAXIMUM_REGION_ROWS_PER_BAND
            for row in region_rows
        ),
        "only_private_aggregate_feature_tables_read": True,
        "station_identity_absent": True,
        "grid4_output_absent": True,
        "equipment_output_absent": True,
        "locked_outcomes_unread": True,
    }
    evidence_gates = (
        "window_spans_720_hours",
        "all_band_completion_at_least_99_percent",
        "all_ten_hf_bands_observed",
        "all_24_utc_hours_observed",
        "early_late_drift_sample_sufficient",
        "aggregate_source_distribution_stable",
    )
    invalid = not all(
        gates[name]
        for name in gates
        if name not in evidence_gates
    )
    complete = all(gates.values())
    decision = "invalid" if invalid else "pass" if complete else "collecting"

    by_utc_hour = _summarize(normalized_hourly, "utc_hour")
    for row in by_utc_hour:
        row["utc_hour"] = int(row["utc_hour"])
    by_utc_hour.sort(key=lambda row: row["utc_hour"])
    by_band = _summarize(normalized_hourly, "band")
    band_order = {band: index for index, band in enumerate(HF_BANDS)}
    by_band.sort(key=lambda row: band_order.get(row["band"], len(HF_BANDS)))
    distance_summary = _summarize(distance_normalized, "distance_bucket")
    distance_order = {
        "<1,000 km": 0,
        "1,000-3,000 km": 1,
        "3,000-6,000 km": 2,
        "6,000-10,000 km": 3,
        "10,000+ km": 4,
    }
    distance_summary.sort(
        key=lambda row: distance_order.get(row["distance_bucket"], 99)
    )

    safe_regions = [
        {
            "dimension": str(row["dimension"]),
            "region": str(row["region"]),
            "band": str(row["band"]),
            "feature_cells": _integer(row.get("feature_cells")),
            "completed_hours": _integer(row.get("completed_hours")),
            "sampled_rows": _integer(row.get("sampled_rows")),
            "eligible_region_count": _integer(
                row.get("eligible_region_count", 1)
            ),
            "coverage_rank": _integer(row.get("coverage_rank", 1)),
        }
        for row in region_rows
    ]
    regional_summary: list[dict[str, Any]] = []
    for dimension in ("origin", "target"):
        for band in HF_BANDS:
            matching = [
                row
                for row in safe_regions
                if row["dimension"] == dimension and row["band"] == band
            ]
            if matching:
                regional_summary.append(
                    {
                        "dimension": dimension,
                        "band": band,
                        "eligible_region_count": max(
                            row["eligible_region_count"] for row in matching
                        ),
                        "reported_region_count": len(matching),
                    }
                )
    return {
        "schema_version": 1,
        "generated_at": _utc(generated_at).isoformat(),
        "scope": "wspr_shadow_aggregate_coverage_and_source_drift",
        "decision": decision,
        "operational_status": "healthy" if not invalid else "invalid",
        "provider": provider,
        "transform_version": transform_version,
        "research_only": True,
        "window": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "expected_hours": expected_hours,
            "completed_hours": completed_hours,
            "missing_hours": expected_hours - completed_hours,
            "completion_rate": completion_rate,
            "completed_band_hours": len(normalized_hourly),
            "required_hours": REQUIRED_WINDOW_HOURS,
            "provenance": dict(window_provenance),
        },
        "coverage": {
            "observed_bands": observed_bands,
            "observed_utc_hours": observed_utc_hours,
            "by_band": by_band,
            "by_utc_hour": by_utc_hour,
            "by_distance": distance_summary,
            "regional_fields": safe_regions,
            "regional_summary": regional_summary,
            "regional_suppression": {
                "minimum_completed_hours": REGION_MINIMUM_HOURS,
                "minimum_feature_cells": REGION_MINIMUM_CELLS,
                "maximum_reported_per_band_and_direction": (
                    MAXIMUM_REGION_ROWS_PER_BAND
                ),
                "grid": "Maidenhead field (2 characters)",
            },
        },
        "drift": drift,
        "execution": {
            "query_seconds": {
                name: float(seconds) for name, seconds in query_seconds.items()
            },
            "database_engine": "PostgreSQL",
            "server_identifier_recorded": False,
        },
        "privacy": {
            "source_tables": [
                "public.wspr_feature_watermarks",
                "public.wspr_path_hourly_features",
            ],
            "raw_observation_table_read": False,
            "station_identity_written": False,
            "grid4_written": False,
            "equipment_written": False,
            "locked_outcomes_read": False,
        },
        "gates": gates,
        "limitations": [
            "The audit window is checksum-bound to signed scheduled receipts; manual feature-store hours are excluded.",
            "Coverage measures what the reporting receiver network observed; it is not uniform geographic sampling.",
            "Source-volume drift is an operational data gate, not a propagation or model-accuracy comparison.",
            "Regional rows are broad field-level aggregates and are suppressed below the preregistered cell and duration thresholds.",
        ],
    }


def _timed_fetch(
    connection: psycopg.Connection[Any],
    query: str,
    params: tuple[Any, ...],
) -> tuple[list[dict[str, Any]], float]:
    started = time.perf_counter()
    rows = connection.execute(query, params).fetchall()
    return [dict(row) for row in rows], time.perf_counter() - started


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--provider", default=DEFAULT_PROVIDER)
    parser.add_argument("--transform-version", default=DEFAULT_TRANSFORM_VERSION)
    parser.add_argument("--progress", type=Path, default=DEFAULT_PROGRESS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    if not args.env_file.is_file() or not args.pooler_url_file.is_file():
        raise RuntimeError("untracked target database credentials are unavailable")
    values = read_env(args.env_file)
    password = values.get("SUPABASE_DB_PASSWORD", "")
    pooler_url = current_project_pooler_url(
        values,
        args.pooler_url_file.read_text(encoding="utf-8").strip(),
    )
    if not password or not pooler_url.startswith("postgresql://"):
        raise RuntimeError("target database connection settings are incomplete")

    query_seconds: dict[str, float] = {}
    progress = json.loads(args.progress.read_text(encoding="utf-8"))
    start, end, window_provenance = scheduled_audit_window(
        progress,
        _sha256(args.progress),
    )
    with psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-wspr-shadow-coverage-audit",
        row_factory=dict_row,
    ) as connection:
        connection.execute("SET TRANSACTION READ ONLY")
        connection.execute("SET LOCAL statement_timeout = '10min'")
        common = (args.provider, args.transform_version, start, end)
        hourly_rows, query_seconds["hourly"] = _timed_fetch(
            connection,
            HOURLY_QUERY,
            (*common, args.provider, args.transform_version),
        )
        region_rows, query_seconds["regions"] = _timed_fetch(
            connection,
            REGION_QUERY,
            (
                *common,
                args.provider,
                args.transform_version,
                REGION_MINIMUM_CELLS,
                REGION_MINIMUM_HOURS,
                MAXIMUM_REGION_ROWS_PER_BAND,
            ),
        )
        distance_rows, query_seconds["distance"] = _timed_fetch(
            connection,
            DISTANCE_QUERY,
            (*common, args.provider, args.transform_version),
        )
        connection.rollback()

    receipt = build_coverage_receipt(
        generated_at=datetime.now(timezone.utc),
        window_start=start,
        window_end=end,
        hourly_rows=hourly_rows,
        region_rows=region_rows,
        distance_rows=distance_rows,
        runtime=runtime,
        provider=args.provider,
        transform_version=args.transform_version,
        query_seconds=query_seconds,
        window_provenance=window_provenance,
    )
    atomic_write(args.output, receipt)
    print(json.dumps(receipt, indent=2))
    if receipt["decision"] == "invalid":
        raise SystemExit(2)


if __name__ == "__main__":
    main()

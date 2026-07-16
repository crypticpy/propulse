#!/usr/bin/env python3
"""Score the preregistered StationCast beta without publishing operator rows."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import polars as pl
from sklearn.metrics import average_precision_score, roc_auc_score

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write


CONFIG = ROOT / "ml/config/propagation_v4_2_beta_protocol.json"
M5_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/stationcast_beta_release_decision.json"
)
REQUIRED_COLUMNS = {
    "participant_key",
    "observed_at",
    "band",
    "mode",
    "task",
    "evidence_tier",
    "origin_field",
    "station_tx_class",
    "station_loss_class",
    "station_antenna_class",
    "station_rx_class",
    "profile",
    "station_supported",
    "ood_count",
    "observed",
    "core_probability",
    "stationcast_probability",
}
CAPABILITY_COLUMNS = (
    "station_tx_class",
    "station_loss_class",
    "station_antenna_class",
    "station_rx_class",
)
REQUIRED_DATABASE_AUDIT = {
    "predictions",
    "attempts",
    "binary_outcomes",
    "not_attempted",
    "unknown",
    "open_attempts",
    "fallback_predictions",
    "unsupported_predictions",
    "ood_predictions",
    "withdrawals",
    "withdrawn_rows_remaining",
    "expired_rows_remaining",
}
REQUIRED_API_AUDIT = {
    "requests",
    "errors",
    "integrity_errors",
    "privacy_events",
    "consent_errors",
    "subject_binding_errors",
    "stale_profile_events",
    "equipment_math_events",
    "unsupported_support_events",
    "high_confidence_overprediction_events",
    "geographic_regression_events",
}
OPERATIONS_RECEIPT_FIELDS = {
    "schema_version",
    "generated_at",
    "scope",
    "protocol_version",
    "policy_version",
    "decision",
    "synthetic",
    "window",
    "audit",
    "active_stop_conditions",
    "inputs",
    "runtime",
    "privacy",
}
EXPORT_RECEIPT_FIELDS = {
    "schema_version",
    "generated_at",
    "scope",
    "protocol_version",
    "window",
    "policy_version",
    "rows",
    "parquet_sha256",
    "config_sha256",
    "private_path_recorded",
    "runtime",
    "privacy",
}


def nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def parse_utc(value: Any) -> datetime:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def validate_beta_config(config: dict[str, Any]) -> None:
    required_sections = {"protocol_version", "policy_version", "primary", "privacy", "beta"}
    missing_sections = sorted(required_sections - set(config))
    if missing_sections:
        raise ValueError(f"beta config is missing sections: {', '.join(missing_sections)}")
    primary = config["primary"]
    if primary != {
        "profile": "nowcast",
        "mode": "WSPR",
        "task": "receive",
        "require_station_supported": True,
        "require_no_ood_flags": True,
    }:
        raise ValueError("beta primary estimand does not match the frozen protocol")
    privacy = config["privacy"]
    beta = config["beta"]
    if int(privacy["minimum_public_participants"]) < 5:
        raise ValueError("beta public participant threshold cannot be below five")
    if int(privacy["minimum_public_outcomes"]) < 20:
        raise ValueError("beta public outcome threshold cannot be below twenty")
    maximum_share = float(privacy["maximum_participant_weight_share"])
    if not 0 < maximum_share <= 0.1:
        raise ValueError("beta participant weight share cannot exceed ten percent")
    if int(beta["minimum_participants"]) * maximum_share < 1:
        raise ValueError("beta participant cap is infeasible for the minimum cohort")
    if int(beta["minimum_band_outcomes"]) < int(privacy["minimum_public_outcomes"]):
        raise ValueError("beta band threshold cannot be below the public threshold")
    if int(beta["minimum_cell_outcomes"]) < int(privacy["minimum_public_outcomes"]):
        raise ValueError("beta cell threshold cannot be below the public threshold")
    if int(beta["bootstrap_repetitions"]) < 2_000:
        raise ValueError("beta cluster bootstrap must use at least 2,000 repetitions")
    maximum_overprediction = float(beta["maximum_high_confidence_overprediction"])
    if not 0 < maximum_overprediction <= 0.1:
        raise ValueError("beta high-confidence overprediction stop must be at most 0.10")


def validate_operations_receipt(
    receipt: dict[str, Any],
    config: dict[str, Any],
    *,
    allow_synthetic: bool,
    config_sha256: str | None = None,
) -> tuple[bool, list[str]]:
    errors: list[str] = []
    expected_scope = (
        "synthetic_stationcast_beta_operations"
        if allow_synthetic
        else "stationcast_beta_operations"
    )
    if set(receipt) != OPERATIONS_RECEIPT_FIELDS:
        errors.append("fields")
    try:
        parse_utc(receipt["generated_at"])
    except (KeyError, TypeError, ValueError):
        errors.append("generated_at")
    if receipt.get("schema_version") != 1:
        errors.append("schema_version")
    if receipt.get("scope") != expected_scope:
        errors.append("scope")
    if receipt.get("protocol_version") != config.get("protocol_version"):
        errors.append("protocol_version")
    if receipt.get("policy_version") != config.get("policy_version"):
        errors.append("policy_version")
    if receipt.get("decision") != "pass":
        errors.append("decision")
    if receipt.get("synthetic") is not allow_synthetic:
        errors.append("synthetic_boundary")
    active = receipt.get("active_stop_conditions")
    if not isinstance(active, list) or any(
        not isinstance(value, str) or not value for value in active
    ):
        errors.append("active_stop_conditions")
    elif active:
        errors.append("active_stop_conditions")
    window = receipt.get("window")
    try:
        window_start = parse_utc(window["start"])
        window_end = parse_utc(window["end"])
        valid_window = (
            isinstance(window, dict)
            and set(window) == {"start", "end"}
            and window_end > window_start
            and window_end - window_start <= timedelta(days=180)
        )
    except (KeyError, TypeError, ValueError):
        valid_window = False
    if not valid_window:
        errors.append("window")
    audit = receipt.get("audit")
    database = audit.get("database") if isinstance(audit, dict) else None
    api = audit.get("api") if isinstance(audit, dict) else None
    if (
        not isinstance(database, dict)
        or set(database) != REQUIRED_DATABASE_AUDIT
        or any(not nonnegative_int(database.get(name)) for name in REQUIRED_DATABASE_AUDIT)
    ):
        errors.append("database_audit")
    if (
        not isinstance(api, dict)
        or set(api) != REQUIRED_API_AUDIT
        or any(not nonnegative_int(api.get(name)) for name in REQUIRED_API_AUDIT)
    ):
        errors.append("api_audit")
    if isinstance(database, dict) and all(
        nonnegative_int(database.get(name)) for name in REQUIRED_DATABASE_AUDIT
    ):
        resolved = (
            database["binary_outcomes"]
            + database["not_attempted"]
            + database["unknown"]
        )
        if (
            resolved > database["attempts"]
            or database["open_attempts"] > database["attempts"]
            or any(
                database[name] > database["predictions"]
                for name in (
                    "fallback_predictions",
                    "unsupported_predictions",
                    "ood_predictions",
                )
            )
            or database["withdrawn_rows_remaining"]
            or database["expired_rows_remaining"]
        ):
            errors.append("database_audit_consistency")
    if isinstance(api, dict) and all(
        nonnegative_int(api.get(name)) for name in REQUIRED_API_AUDIT
    ):
        if api["errors"] > api["requests"] or any(
            api[name]
            for name in REQUIRED_API_AUDIT - {"requests", "errors"}
        ):
            errors.append("api_audit_consistency")
    inputs = receipt.get("inputs")
    if (
        not isinstance(inputs, dict)
        or inputs.get("api_telemetry_path_recorded") is not False
        or not is_sha256(inputs.get("api_telemetry_sha256"))
        or not is_sha256(inputs.get("config_sha256"))
        or (
            config_sha256 is not None
            and inputs.get("config_sha256") != config_sha256
        )
    ):
        errors.append("inputs")
    runtime = receipt.get("runtime")
    if (
        not isinstance(runtime, dict)
        or runtime.get("machine") != "arm64"
        or not nonnegative_int(runtime.get("physical_cores_visible"))
        or runtime["physical_cores_visible"] < 1
    ):
        errors.append("runtime")
    privacy = receipt.get("privacy")
    if not isinstance(privacy, dict) or any(
        privacy.get(name) is not False
        for name in (
            "participant_identifiers_written",
            "exact_grid4_written",
            "raw_station_inventory_written",
        )
    ):
        errors.append("privacy_boundary")
    return not errors, errors


def validate_export_receipt(
    receipt: dict[str, Any],
    config: dict[str, Any],
    *,
    parquet_sha256: str,
    config_sha256: str,
) -> tuple[bool, list[str]]:
    errors: list[str] = []
    if set(receipt) != EXPORT_RECEIPT_FIELDS:
        errors.append("fields")
    try:
        parse_utc(receipt["generated_at"])
    except (KeyError, TypeError, ValueError):
        errors.append("generated_at")
    if receipt.get("schema_version") != 1:
        errors.append("schema_version")
    if receipt.get("scope") != "private_stationcast_beta_export":
        errors.append("scope")
    if receipt.get("protocol_version") != config.get("protocol_version"):
        errors.append("protocol_version")
    if receipt.get("policy_version") != config.get("policy_version"):
        errors.append("policy_version")
    try:
        window = receipt["window"]
        window_start = parse_utc(window["start"])
        window_end = parse_utc(window["end"])
        if (
            set(window) != {"start", "end"}
            or window_end <= window_start
            or window_end - window_start > timedelta(days=180)
        ):
            raise ValueError("invalid window")
    except (KeyError, TypeError, ValueError):
        errors.append("window")
    if not nonnegative_int(receipt.get("rows")):
        errors.append("rows")
    if not is_sha256(receipt.get("parquet_sha256")) or receipt.get(
        "parquet_sha256"
    ) != parquet_sha256:
        errors.append("parquet_sha256")
    if not is_sha256(receipt.get("config_sha256")) or receipt.get(
        "config_sha256"
    ) != config_sha256:
        errors.append("config_sha256")
    if receipt.get("private_path_recorded") is not False:
        errors.append("private_path_recorded")
    runtime = receipt.get("runtime")
    if (
        not isinstance(runtime, dict)
        or runtime.get("machine") != "arm64"
        or not nonnegative_int(runtime.get("physical_cores_visible"))
        or runtime["physical_cores_visible"] < 1
    ):
        errors.append("runtime")
    privacy = receipt.get("privacy")
    if not isinstance(privacy, dict) or privacy != {
        "user_ids_written": False,
        "pseudonymous_participant_key_private_only": True,
        "exact_grid4_written": False,
        "raw_station_inventory_written": False,
        "secret_value_written": False,
    }:
        errors.append("privacy_boundary")
    return not errors, errors


def validate_private_input_binding(
    frame: pl.DataFrame,
    export_receipt: dict[str, Any],
    operations_receipt: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    try:
        export_start = parse_utc(export_receipt["window"]["start"])
        export_end = parse_utc(export_receipt["window"]["end"])
        operations_start = parse_utc(operations_receipt["window"]["start"])
        operations_end = parse_utc(operations_receipt["window"]["end"])
        if (export_start, export_end) != (operations_start, operations_end):
            errors.append("receipt_window_mismatch")
        observed_at = frame.get_column("observed_at").cast(
            pl.Datetime("us", "UTC"),
            strict=True,
        )
        if frame.height:
            minimum = observed_at.min()
            maximum = observed_at.max()
            if minimum < export_start or maximum >= export_end:
                errors.append("observed_at_outside_export_window")
    except (KeyError, TypeError, ValueError, pl.exceptions.PolarsError):
        errors.append("window_binding")
    if export_receipt.get("rows") != frame.height:
        errors.append("export_row_count")
    database = operations_receipt.get("audit", {}).get("database", {})
    if (
        nonnegative_int(database.get("binary_outcomes"))
        and database["binary_outcomes"] < frame.height
    ):
        errors.append("operations_binary_outcomes")
    return sorted(set(errors))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def participant_cap_weights(
    participant_keys: np.ndarray,
    maximum_share: float,
) -> tuple[np.ndarray, dict[str, float]]:
    if not 0 < maximum_share <= 1:
        raise ValueError("maximum participant share must be in (0, 1]")
    _, inverse, counts = np.unique(
        participant_keys.astype(str),
        return_inverse=True,
        return_counts=True,
    )
    if counts.size == 0:
        return np.array([], dtype=np.float64), {
            "cap_per_participant": 0.0,
            "largest_weight_share": 0.0,
            "effective_outcomes": 0.0,
        }

    def share(cap: float) -> float:
        totals = np.minimum(counts.astype(np.float64), cap)
        return float(totals.max() / totals.sum())

    high = float(counts.max())
    if counts.size * maximum_share < 1:
        cap = 1.0
    elif share(high) <= maximum_share:
        cap = high
    else:
        low = 0.0
        for _ in range(80):
            midpoint = (low + high) / 2
            if share(midpoint) <= maximum_share:
                low = midpoint
            else:
                high = midpoint
        cap = low
    participant_totals = np.minimum(counts.astype(np.float64), cap)
    row_weights = participant_totals[inverse] / counts[inverse]
    total = float(row_weights.sum())
    largest = float(participant_totals.max() / total) if total else 0.0
    return row_weights, {
        "cap_per_participant": float(cap),
        "largest_weight_share": largest,
        "effective_outcomes": total,
    }


def weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    denominator = float(weights.sum())
    if denominator <= 0:
        return math.nan
    return float(np.dot(values, weights) / denominator)


def probability_metrics(
    observed: np.ndarray,
    probability: np.ndarray,
    weights: np.ndarray,
    *,
    bins: int,
    high_confidence_probability: float,
) -> dict[str, float | None]:
    probability = np.clip(probability.astype(np.float64), 1e-12, 1 - 1e-12)
    observed = observed.astype(np.float64)
    brier = weighted_mean((probability - observed) ** 2, weights)
    log_loss = weighted_mean(
        -(observed * np.log(probability) + (1 - observed) * np.log(1 - probability)),
        weights,
    )
    bin_index = np.minimum(bins - 1, np.floor(probability * bins).astype(int))
    ece = 0.0
    high_gap = 0.0
    high_overprediction = 0.0
    total_weight = float(weights.sum())
    for index in range(bins):
        mask = bin_index == index
        if not mask.any():
            continue
        bin_weight = float(weights[mask].sum())
        mean_probability = weighted_mean(probability[mask], weights[mask])
        observed_rate = weighted_mean(observed[mask], weights[mask])
        gap = abs(mean_probability - observed_rate)
        ece += gap * bin_weight / total_weight
        if mean_probability >= high_confidence_probability:
            high_gap = max(high_gap, gap)
            high_overprediction = max(
                high_overprediction,
                mean_probability - observed_rate,
            )
    roc_auc: float | None = None
    pr_auc: float | None = None
    if np.unique(observed).size == 2:
        roc_auc = float(roc_auc_score(observed, probability, sample_weight=weights))
        pr_auc = float(
            average_precision_score(observed, probability, sample_weight=weights)
        )
    return {
        "brier": brier,
        "log_loss": log_loss,
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "ece": float(ece),
        "high_confidence_max_gap": float(high_gap),
        "high_confidence_max_overprediction": float(high_overprediction),
    }


def cluster_bootstrap(
    participant_keys: np.ndarray,
    loss_delta: np.ndarray,
    weights: np.ndarray,
    *,
    repetitions: int,
    seed: int,
    upper_quantile: float,
) -> dict[str, float | int | None]:
    keys, inverse = np.unique(participant_keys.astype(str), return_inverse=True)
    if keys.size < 2:
        return {
            "clusters": int(keys.size),
            "repetitions": repetitions,
            "lower_95": None,
            "median": None,
            "upper_95": None,
        }
    numerators = np.bincount(inverse, weights=loss_delta * weights)
    denominators = np.bincount(inverse, weights=weights)
    rng = np.random.default_rng(seed)
    values = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sample = rng.integers(0, keys.size, size=keys.size)
        values[index] = numerators[sample].sum() / denominators[sample].sum()
    return {
        "clusters": int(keys.size),
        "repetitions": repetitions,
        "lower_95": float(np.quantile(values, 1 - upper_quantile)),
        "median": float(np.quantile(values, 0.5)),
        "upper_95": float(np.quantile(values, upper_quantile)),
    }


def reportable_strata(
    frame: pl.DataFrame,
    weights: np.ndarray,
    *,
    dimensions: Iterable[str],
    minimum_participants: int,
    minimum_outcomes: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for dimension in dimensions:
        for value in frame.get_column(dimension).drop_nulls().unique().sort().to_list():
            mask = frame.get_column(dimension).to_numpy() == value
            participant_count = int(
                frame.filter(pl.Series(mask)).get_column("participant_key").n_unique()
            )
            outcome_count = int(mask.sum())
            if (
                participant_count < minimum_participants
                or outcome_count < minimum_outcomes
            ):
                continue
            observed = frame.get_column("observed").to_numpy()[mask]
            core = frame.get_column("core_probability").to_numpy()[mask]
            station = frame.get_column("stationcast_probability").to_numpy()[mask]
            cell_weights = weights[mask]
            core_brier = weighted_mean((core - observed) ** 2, cell_weights)
            station_brier = weighted_mean((station - observed) ** 2, cell_weights)
            rows.append({
                "dimension": dimension,
                "value": str(value),
                "participants": participant_count,
                "outcomes": outcome_count,
                "weighted_outcomes": float(cell_weights.sum()),
                "core_brier": core_brier,
                "stationcast_brier": station_brier,
                "relative_brier_change": (
                    (station_brier - core_brier) / core_brier
                    if core_brier > 0
                    else None
                ),
            })
    return rows


def score_beta(
    frame: pl.DataFrame,
    config: dict[str, Any],
    *,
    active_stop_conditions: list[str] | None = None,
) -> dict[str, Any]:
    validate_beta_config(config)
    missing = sorted(REQUIRED_COLUMNS - set(frame.columns))
    if missing:
        raise ValueError(f"beta input is missing columns: {', '.join(missing)}")
    primary = config["primary"]
    beta = config["beta"]
    privacy = config["privacy"]
    input_rows = frame.height
    filtered = frame.filter(
        (pl.col("profile") == primary["profile"])
        & (pl.col("mode") == primary["mode"])
        & (pl.col("task") == primary["task"])
        & (pl.col("station_supported") == primary["require_station_supported"])
        & (pl.col("ood_count") == 0)
        & pl.col("observed").is_in([0, 1])
        & pl.col("core_probability").is_between(0, 1)
        & pl.col("stationcast_probability").is_between(0, 1)
    ).with_columns(
        pl.concat_str(
            [pl.col(name) for name in CAPABILITY_COLUMNS],
            separator="|",
            ignore_nulls=False,
        ).alias("capability_cell")
    ).sort(["observed_at", "participant_key"])
    if filtered.is_empty():
        return {
            "decision": "withheld",
            "release_approved": False,
            "primary_cohort_reportable": False,
            "gates": {"minimum_public_cohort": False},
            "blockers": ["minimum_public_cohort"],
            "privacy": {"participant_identifiers_written": False},
        }

    participant_count = filtered.get_column("participant_key").n_unique()
    if (
        participant_count < int(privacy["minimum_public_participants"])
        or filtered.height < int(privacy["minimum_public_outcomes"])
    ):
        return {
            "decision": "withheld",
            "release_approved": False,
            "primary_cohort_reportable": False,
            "gates": {"minimum_public_cohort": False},
            "blockers": ["minimum_public_cohort"],
            "privacy": {
                "participant_identifiers_written": False,
                "subthreshold_counts_written": False,
            },
        }

    participant_keys = filtered.get_column("participant_key").to_numpy()
    weights, cap = participant_cap_weights(
        participant_keys,
        float(privacy["maximum_participant_weight_share"]),
    )
    observed = filtered.get_column("observed").to_numpy().astype(np.float64)
    core = filtered.get_column("core_probability").to_numpy().astype(np.float64)
    station = filtered.get_column("stationcast_probability").to_numpy().astype(
        np.float64
    )
    core_metrics = probability_metrics(
        observed,
        core,
        weights,
        bins=int(beta["calibration_bins"]),
        high_confidence_probability=float(beta["high_confidence_probability"]),
    )
    station_metrics = probability_metrics(
        observed,
        station,
        weights,
        bins=int(beta["calibration_bins"]),
        high_confidence_probability=float(beta["high_confidence_probability"]),
    )
    core_brier = float(core_metrics["brier"])
    station_brier = float(station_metrics["brier"])
    relative_improvement = (
        (core_brier - station_brier) / core_brier if core_brier > 0 else math.nan
    )
    bootstrap = cluster_bootstrap(
        participant_keys,
        (station - observed) ** 2 - (core - observed) ** 2,
        weights,
        repetitions=int(beta["bootstrap_repetitions"]),
        seed=int(beta["bootstrap_seed"]),
        upper_quantile=float(beta["bootstrap_upper_quantile"]),
    )
    public_strata = reportable_strata(
        filtered,
        weights,
        dimensions=(
            "band",
            "origin_field",
            "capability_cell",
            *CAPABILITY_COLUMNS,
            "evidence_tier",
        ),
        minimum_participants=int(privacy["minimum_public_participants"]),
        minimum_outcomes=int(privacy["minimum_public_outcomes"]),
    )
    coverage_strata = [
        row for row in public_strata
        if row["participants"] >= int(beta["minimum_cell_participants"])
        and row["outcomes"] >= int(beta["minimum_cell_outcomes"])
    ]

    tier_deltas: dict[str, float | None] = {}
    for name, tiers in (("tier_a", ["A"]), ("tiers_a_b", ["A", "B"]), ("all", ["A", "B", "C"])):
        mask = np.isin(filtered.get_column("evidence_tier").to_numpy(), tiers)
        if not mask.any():
            tier_deltas[name] = None
            continue
        tier_deltas[name] = weighted_mean(
            (station[mask] - observed[mask]) ** 2
            - (core[mask] - observed[mask]) ** 2,
            weights[mask],
        )

    observed_dates = filtered.get_column("observed_at").cast(pl.Datetime("us", "UTC"))
    calendar_days = observed_dates.dt.date().n_unique()
    tier_a_weighted = float(
        weights[filtered.get_column("evidence_tier").to_numpy() == "A"].sum()
    )
    band_cells = [
        row
        for row in public_strata
        if row["dimension"] == "band"
        and row["participants"] >= int(beta["minimum_cell_participants"])
        and row["outcomes"] >= int(beta["minimum_band_outcomes"])
    ]
    geography_cells = [
        row for row in coverage_strata if row["dimension"] == "origin_field"
    ]
    capability_cells = [
        row
        for row in coverage_strata
        if row["dimension"] == "capability_cell"
        and "unknown" not in row["value"].split("|")
    ]
    worst_regression = max(
        (
            float(row["relative_brier_change"])
            for row in public_strata
            if row["relative_brier_change"] is not None
        ),
        default=-math.inf,
    )
    stop_conditions = sorted(set(active_stop_conditions or []))
    gates = {
        "minimum_participants": filtered.get_column("participant_key").n_unique()
        >= int(beta["minimum_participants"]),
        "minimum_weighted_primary_outcomes": cap["effective_outcomes"]
        >= float(beta["minimum_weighted_primary_outcomes"]),
        "minimum_tier_a_outcomes": tier_a_weighted
        >= float(beta["minimum_tier_a_outcomes"]),
        "minimum_calendar_days": calendar_days >= int(beta["minimum_calendar_days"]),
        "minimum_supported_bands": len(band_cells)
        >= int(beta["minimum_supported_bands"]),
        "minimum_geography_cells": len(geography_cells)
        >= int(beta["minimum_geography_cells"]),
        "minimum_capability_cells": len(capability_cells)
        >= int(beta["minimum_capability_cells"]),
        "participant_weight_share_bounded": cap["largest_weight_share"]
        <= float(privacy["maximum_participant_weight_share"]) + 1e-12,
        "relative_brier_improvement": relative_improvement
        >= float(beta["minimum_relative_brier_improvement"]),
        "cluster_bootstrap_upper_below_zero": bootstrap["upper_95"] is not None
        and float(bootstrap["upper_95"]) < 0,
        "ece_degradation_bounded": float(station_metrics["ece"])
        - float(core_metrics["ece"])
        <= float(beta["maximum_ece_degradation"]),
        "high_confidence_gap_degradation_bounded": float(
            station_metrics["high_confidence_max_gap"]
        )
        - float(core_metrics["high_confidence_max_gap"])
        <= float(beta["maximum_high_confidence_gap_degradation"]),
        "high_confidence_overprediction_below_stop": float(
            station_metrics["high_confidence_max_overprediction"]
        )
        <= float(beta["maximum_high_confidence_overprediction"]),
        "no_reportable_stratum_regression": worst_regression
        <= float(beta["maximum_stratum_relative_brier_regression"]),
        "tier_a_and_all_grade_direction_agree": tier_deltas["tier_a"] is not None
        and tier_deltas["all"] is not None
        and float(tier_deltas["tier_a"]) < 0
        and float(tier_deltas["all"]) < 0,
        "no_active_stop_condition": not stop_conditions,
    }
    blockers = [name for name, value in gates.items() if not value]
    return {
        "decision": "pass" if not blockers else "withheld",
        "release_approved": not blockers,
        "primary_cohort_reportable": True,
        "input_rows": input_rows,
        "primary_rows": filtered.height,
        "participants": participant_count,
        "calendar_days": calendar_days,
        "participant_cap": cap,
        "tier_a_weighted_outcomes": tier_a_weighted,
        "metrics": {
            "core": core_metrics,
            "stationcast": station_metrics,
            "relative_brier_improvement": relative_improvement,
            "paired_brier_delta": station_brier - core_brier,
            "tier_sensitivity_delta": tier_deltas,
            "cluster_bootstrap": bootstrap,
        },
        "coverage": {
            "supported_band_cells": len(band_cells),
            "geography_cells": len(geography_cells),
            "capability_cells": len(capability_cells),
        },
        "reportable_strata": public_strata,
        "active_stop_conditions": stop_conditions,
        "gates": gates,
        "blockers": blockers,
        "privacy": {
            "participant_identifiers_written": False,
            "exact_grid4_written": False,
            "raw_station_inventory_written": False,
            "subthreshold_cells_written": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=CONFIG)
    parser.add_argument("--export-receipt", type=Path)
    parser.add_argument("--operations-receipt", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--require-release", action="store_true")
    parser.add_argument("--synthetic-dry-run", action="store_true")
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(M5_CONFIG.read_text(encoding="utf-8")))
    config = json.loads(args.config.read_text(encoding="utf-8"))
    validate_beta_config(config)
    config_digest = sha256(args.config)
    private_export_digest = sha256(args.input)
    operations = (
        json.loads(args.operations_receipt.read_text(encoding="utf-8"))
        if args.operations_receipt
        else {}
    )
    operations_valid, operations_errors = validate_operations_receipt(
        operations,
        config,
        allow_synthetic=args.synthetic_dry_run,
        config_sha256=config_digest,
    )
    export_receipt = (
        json.loads(args.export_receipt.read_text(encoding="utf-8"))
        if args.export_receipt
        else {}
    )
    if args.synthetic_dry_run:
        export_valid, export_errors = True, []
    elif args.export_receipt:
        export_valid, export_errors = validate_export_receipt(
            export_receipt,
            config,
            parquet_sha256=private_export_digest,
            config_sha256=config_digest,
        )
    else:
        export_valid, export_errors = False, ["missing"]
    active_stop_conditions = list(operations.get("active_stop_conditions", []))
    if not operations_valid:
        active_stop_conditions.extend([
            "operations_receipt_missing_or_invalid",
            *(f"operations_receipt_{error}" for error in operations_errors),
        ])
    if not export_valid:
        active_stop_conditions.extend([
            "private_export_receipt_missing_or_invalid",
            *(f"private_export_receipt_{error}" for error in export_errors),
        ])
    started = time.perf_counter()
    frame = pl.scan_parquet(args.input).select(sorted(REQUIRED_COLUMNS)).collect(
        engine="streaming"
    )
    binding_errors = (
        validate_private_input_binding(frame, export_receipt, operations)
        if not args.synthetic_dry_run and export_valid and operations_valid
        else []
    )
    active_stop_conditions.extend(
        f"private_input_{error}" for error in binding_errors
    )
    score = score_beta(
        frame,
        config,
        active_stop_conditions=active_stop_conditions,
    )
    if args.synthetic_dry_run:
        synthetic_gate_passed = score["decision"] == "pass"
        score = {
            **score,
            "decision": "synthetic_pass" if synthetic_gate_passed else "synthetic_fail",
            "release_approved": False,
            "synthetic_gate_passed": synthetic_gate_passed,
        }
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": (
            "synthetic_stationcast_beta_dry_run"
            if args.synthetic_dry_run
            else "stationcast_preregistered_beta_release_decision"
        ),
        "protocol_version": config["protocol_version"],
        "runtime": {
            "machine": runtime["machine"],
            "physical_cores_visible": runtime["physical_cores_visible"],
            "polars_threads": pl.thread_pool_size(),
            "wall_seconds": time.perf_counter() - started,
        },
        "inputs": {
            "private_export_sha256": private_export_digest,
            "private_export_path_recorded": False,
            "config_path": args.config.relative_to(ROOT).as_posix(),
            "config_sha256": config_digest,
            "private_export_receipt_valid": (
                None if args.synthetic_dry_run else export_valid
            ),
            "private_export_receipt_validation_errors": export_errors,
            "private_export_receipt_sha256": (
                sha256(args.export_receipt) if args.export_receipt else None
            ),
            "private_input_binding_errors": binding_errors,
            "operations_receipt_valid": operations_valid,
            "operations_receipt_validation_errors": operations_errors,
            "operations_receipt_sha256": (
                sha256(args.operations_receipt) if args.operations_receipt else None
            ),
        },
        **score,
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if args.require_release and not result["release_approved"]:
        raise SystemExit("StationCast beta release gate failed")


if __name__ == "__main__":
    main()

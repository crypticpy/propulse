#!/usr/bin/env python3
"""Write an identity-free receipt for the M5 FutureCast synthetic proof."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402


RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
EXPECTED_HORIZONS = (3, 6, 12, 24)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reject_nonfinite_json(value: str) -> None:
    raise ValueError(f"non-finite JSON constant is forbidden: {value}")


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(
        path.read_text(encoding="utf-8"),
        parse_constant=reject_nonfinite_json,
    )
    if not isinstance(value, dict):
        raise ValueError(f"top-level JSON value is not an object: {path}")
    return value


def atomic_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def compact_metric(value: Mapping[str, Any]) -> dict[str, float]:
    result = {
        name: float(value[name])
        for name in (
            "weighted_opportunities",
            "weighted_prevalence",
            "weighted_brier",
            "weighted_log_loss",
            "expected_calibration_error",
        )
    }
    if not all(math.isfinite(metric) for metric in result.values()):
        raise RuntimeError("FutureCast proof metric contains a non-finite value")
    return result


def optional_finite_float(value: object) -> float | None:
    if value is None:
        return None
    result = float(value)
    if not math.isfinite(result):
        raise RuntimeError("FutureCast proof metric contains a non-finite value")
    return result


def strict_boolean_gates(value: object) -> dict[str, bool]:
    if (
        not isinstance(value, dict)
        or not value
        or any(
            not isinstance(name, str) or type(passed) is not bool
            for name, passed in value.items()
        )
    ):
        raise RuntimeError("FutureCast proof gate values must be strict booleans")
    return dict(value)


def build_summary(
    *,
    config: Mapping[str, Any],
    source: Mapping[str, Any],
    examples: Mapping[str, Any],
    training: Mapping[str, Any],
    p533: Mapping[str, Any],
    decision: Mapping[str, Any],
    hashes: Mapping[str, str],
) -> dict[str, Any]:
    values = (source, examples, training, p533, decision)
    if tuple(config.get("horizons_hours", ())) != EXPECTED_HORIZONS:
        raise RuntimeError("FutureCast proof config has an unexpected horizon set")
    if any(value.get("data_scope") != "synthetic_fixture" for value in values):
        raise RuntimeError("FutureCast proof inputs are not all synthetic fixtures")
    if any(value.get("release_approved") is not False for value in values):
        raise RuntimeError("synthetic FutureCast evidence attempted to authorize release")
    if (
        examples.get("source_manifest_sha256") != hashes["source"]
        or training.get("example_manifest_sha256") != hashes["examples"]
        or p533.get("example_manifest_sha256") != hashes["examples"]
        or p533.get("training_manifest_sha256") != hashes["training"]
        or decision.get("example_manifest_sha256") != hashes["examples"]
        or decision.get("training_manifest_sha256") != hashes["training"]
        or decision.get("p533_manifest_sha256") != hashes["p533"]
        or any(value.get("config_sha256") != hashes["config"] for value in values)
    ):
        raise RuntimeError("FutureCast synthetic checksum chain is broken")
    if (
        training.get("gate", {}).get("rows_read") is not False
        or p533.get("gate_labels_read") is not False
        or p533.get("observed_weather_substituted") is not False
        or p533.get("equivalent_forecast_inputs") is not True
        or decision.get("gate_scored_once") is not True
        or decision.get("post_gate_tuning_permitted") is not False
        or decision.get("released_horizons_hours") != []
        or decision.get("withheld_horizons_hours") != list(EXPECTED_HORIZONS)
        or any(value.get("readiness_sha256") is not None for value in values)
    ):
        raise RuntimeError("FutureCast synthetic leakage or release boundary failed")
    partitions = list(examples.get("partitions", []))
    if not partitions:
        raise RuntimeError("FutureCast synthetic example partitions are missing")
    for row in partitions:
        if not all(strict_boolean_gates(row.get("gates")).values()):
            raise RuntimeError("FutureCast synthetic example leakage gate failed")
    if not isinstance(decision.get("horizons"), dict) or set(
        decision["horizons"]
    ) != {str(value) for value in EXPECTED_HORIZONS}:
        raise RuntimeError("FutureCast synthetic decision has an unexpected horizon set")
    if any(
        value.get("release_approved") is not False
        or value.get("status") != "withheld"
        or int(horizon) != value.get("horizon_hours")
        for horizon, value in decision["horizons"].items()
    ):
        raise RuntimeError("FutureCast synthetic decision release boundary failed")
    if examples.get("model_identifier_columns") != []:
        raise RuntimeError("FutureCast synthetic model matrix contains identifiers")

    split_rows: Counter[str] = Counter()
    horizon_rows: Counter[int] = Counter()
    for row in partitions:
        split_rows[str(row["split"])] += int(row["rows"])
        horizon_rows[int(row["horizon_hours"])] += int(row["rows"])
    horizon_summary: list[dict[str, Any]] = []
    for horizon, value in sorted(
        decision["horizons"].items(), key=lambda item: int(item[0])
    ):
        best_baseline = str(value["best_baseline"])
        gates = strict_boolean_gates(value.get("gates"))
        horizon_summary.append(
            {
                "horizon_hours": int(horizon),
                "status": value["status"],
                "release_approved": bool(value["release_approved"]),
                "issue_days": int(value["issue_days"]),
                "best_baseline": best_baseline,
                "relative_brier_improvement": float(
                    value["relative_brier_improvement"]
                ),
                "paired_issue_day_brier_delta_upper_95": float(
                    value["paired_issue_day_brier_delta_upper_95"]
                ),
                "maximum_supported_band_relative_brier_regression": optional_finite_float(
                    value["maximum_supported_band_relative_brier_regression"]
                ),
                "direct": compact_metric(value["metrics"]["direct"]),
                "best_baseline_metrics": compact_metric(
                    value["metrics"][best_baseline]
                ),
                "p533_sample_rows": int(
                    value["p533_paired_diagnostic"]["sample_rows"]
                ),
                "p533_weighted_brier": float(
                    value["p533_paired_diagnostic"]["metrics"]["p533"][
                        "weighted_brier"
                    ]
                ),
                "peak_rss_gib": float(value["peak_rss_gib"]),
                "gates_passed": sum(gates.values()),
                "gates_total": len(gates),
                "gates": gates,
            }
        )

    return {
        "schema_version": 1,
        "generated_at": decision["generated_at"],
        "scope": "futurecast_v1_synthetic_engineering_proof",
        "data_scope": "synthetic_fixture",
        "decision": "engineering_pipeline_validated_model_skill_unproven",
        "release_approved": False,
        "production_performance_claim_permitted": False,
        "config": {
            "run_id": config["run_id"],
            "horizons_hours": config["horizons_hours"],
            "split_days": config["split_days"],
            "calibration_subsplit_days": config["calibration_subsplit_days"],
            "minimum_calibration_rows": config["calibration"]["minimum_rows"],
        },
        "checksums": dict(hashes),
        "examples": {
            "window": examples["window"],
            "partitions": len(partitions),
            "rows": sum(split_rows.values()),
            "rows_by_split": dict(sorted(split_rows.items())),
            "rows_by_horizon": {
                str(key): value for key, value in sorted(horizon_rows.items())
            },
            "all_leakage_gates_passed": True,
            "grid4_in_model_matrix": False,
        },
        "training": {
            "models": len(training["models"]),
            "parallelism": training["parallelism"],
            "gate_rows_read": False,
            "models_summary": [
                {
                    "horizon_hours": int(row["horizon_hours"]),
                    "profile": row["profile"],
                    "train_rows": int(row["train_rows"]),
                    "early_stopping_rows": int(row["early_stopping_rows"]),
                    "calibration_fit_rows": int(row["calibration_fit_rows"]),
                    "calibration_guard_rows": int(row["calibration_guard_rows"]),
                    "best_iteration": int(row["best_iteration"]),
                    "calibration_method": row["calibration_method"],
                    "wall_seconds": float(row["wall_seconds"]),
                    "peak_rss_gib": float(row["peak_rss_gib"]),
                }
                for row in training["models"]
            ],
        },
        "p533": {
            "equivalent_forecast_inputs": True,
            "observed_weather_substituted": False,
            "gate_labels_read": False,
            "execution": p533["execution"],
            "self_reported_version": p533["p533_self_reported_version"],
        },
        "gate": {
            "scored_once": True,
            "post_gate_tuning_permitted": False,
            "released_horizons_hours": [],
            "withheld_horizons_hours": decision["withheld_horizons_hours"],
            "horizons": horizon_summary,
        },
        "privacy": {
            "raw_wspr_observations_read": False,
            "station_identity_read": False,
            "equipment_read": False,
            "private_grid4_copied_to_repository": False,
            "locked_core_outcomes_read": False,
        },
        "interpretation": (
            "This proves the frozen M5 streaming, training, physics, scoring, "
            "privacy, and withholding machinery. Synthetic horizon skill is a "
            "negative control and is not evidence of production performance."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--example-manifest", type=Path, required=True)
    parser.add_argument("--training-manifest", type=Path, required=True)
    parser.add_argument("--p533-manifest", type=Path, required=True)
    parser.add_argument("--decision", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    paths = {
        name: path.expanduser().resolve()
        for name, path in {
            "config": args.config,
            "source": args.source_manifest,
            "examples": args.example_manifest,
            "training": args.training_manifest,
            "p533": args.p533_manifest,
            "decision": args.decision,
        }.items()
    }
    output = args.output.expanduser().resolve()
    if not output.is_relative_to(ROOT):
        raise RuntimeError("FutureCast proof receipt must remain inside the repository")
    validate_m5_runtime(json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8")))
    values = {name: read_json(path) for name, path in paths.items()}
    summary = build_summary(
        config=values["config"],
        source=values["source"],
        examples=values["examples"],
        training=values["training"],
        p533=values["p533"],
        decision=values["decision"],
        hashes={name: sha256(path) for name, path in paths.items()},
    )
    atomic_json(output, summary)
    print(output)


if __name__ == "__main__":
    main()

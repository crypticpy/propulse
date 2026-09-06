"""Config-driven artifact paths for the archive V4.2 phase 2-6 chain.

Every phase-2 script used to hard-code the ``propagation_v4_2_phase2_scale``
run id and its result/manifest paths. A second, independent training run needs
the same chain pointed at a different run id without disturbing the frozen V1
artifacts, so all of those paths are resolved here from ``config["run_id"]``.

The V1 config must keep producing byte-identical paths. The only name that is
not derivable from the run id is the cohort manifest -- V1 writes
``propagation_v4_2_phase2_20m_cohorts.json`` from run id
``propagation_v4_2_phase2_scale``. The optional ``cohort_manifest_prefix``
config key names it explicitly; the default strips a trailing ``_scale`` from
the run id, which reproduces the V1 name exactly.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[3]
RESULTS_ROOT = ROOT / "ml/results/propagation_v4_2"
MANIFEST_ROOT = ROOT / "ml/data/manifests"
MODELS_ROOT = ROOT / "ml/models/archive_v4_2"
V1_RUN_ID = "propagation_v4_2_phase2_scale"
DEFAULT_EVALUATION_INPUTS_CONFIG = "ml/config/propagation_v4_2.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def run_id(config: Mapping[str, Any]) -> str:
    return str(config["run_id"])


def results_dir(config: Mapping[str, Any]) -> Path:
    return RESULTS_ROOT / run_id(config)


def cohort_manifest_prefix(config: Mapping[str, Any]) -> str:
    value = config.get("cohort_manifest_prefix")
    if value:
        return str(value)
    return run_id(config).removesuffix("_scale")


def cohort_manifest_path(config: Mapping[str, Any], scale: int) -> Path:
    prefix = cohort_manifest_prefix(config)
    return MANIFEST_ROOT / f"{prefix}_{int(scale) // 1_000_000}m_cohorts.json"


def training_results_path(config: Mapping[str, Any], scale: int) -> Path:
    return results_dir(config) / f"training_{int(scale) // 1_000_000}m_results.json"


def evaluation_results_path(config: Mapping[str, Any], scale: int) -> Path:
    return results_dir(config) / f"evaluation_{int(scale) // 1_000_000}m_results.json"


def validation_results_path(config: Mapping[str, Any], scale: int) -> Path:
    return results_dir(config) / f"validation_{int(scale) // 1_000_000}m.json"


def evaluation_20m_path(config: Mapping[str, Any]) -> Path:
    return evaluation_results_path(config, 20_000_000)


def prediction_thread_benchmark_path(config: Mapping[str, Any]) -> Path:
    return results_dir(config) / "prediction_thread_benchmark.json"


def transform_parity_path(config: Mapping[str, Any]) -> Path:
    return results_dir(config) / "live_feature_pipeline/transform_parity.json"


def outcome_manifest_path(config: Mapping[str, Any]) -> Path:
    return results_dir(config) / "outcome_protocol_manifest.json"


def source_freeze_path(config: Mapping[str, Any]) -> Path:
    return results_dir(config) / "source_pipeline_freeze.json"


def synthetic_gate_dir(config: Mapping[str, Any]) -> Path:
    return results_dir(config) / "synthetic_gate_dry_run"


def phase3_validation_path(config: Mapping[str, Any]) -> Path:
    return results_dir(config) / "phase3_candidate_validation.json"


def serving_bundle_dir(config: Mapping[str, Any]) -> Path:
    """Repository-visible serving bundle directory (symlinked to external)."""
    return MODELS_ROOT / run_id(config) / "serving"


def serving_manifest_path(config: Mapping[str, Any]) -> Path:
    return serving_bundle_dir(config) / "serving_manifest.json"


def external_serving_bundle_dir(config: Mapping[str, Any]) -> Path:
    return (
        Path(config["compute"]["external_root"])
        / "models/archive_v4_2"
        / run_id(config)
        / "serving"
    )


def evaluation_inputs_config_path(config: Mapping[str, Any]) -> Path:
    """Path to the phase-0 config whose ``diagnosis.inputs`` name the months."""
    relative = str(
        config.get("evaluation_inputs_config", DEFAULT_EVALUATION_INPUTS_CONFIG)
    )
    path = Path(relative)
    return path if path.is_absolute() else ROOT / path


def evaluation_inputs(config: Mapping[str, Any]) -> dict[str, Any]:
    return load_json(evaluation_inputs_config_path(config))["diagnosis"]["inputs"]


def resolved_paths(config: Mapping[str, Any]) -> dict[str, str]:
    """Every run-scoped path, for dry-run reporting."""
    values: dict[str, Path] = {
        "results_dir": results_dir(config),
        "cohort_manifest_20m": cohort_manifest_path(config, 20_000_000),
        "cohort_manifest_50m": cohort_manifest_path(config, 50_000_000),
        "training_20m": training_results_path(config, 20_000_000),
        "training_50m": training_results_path(config, 50_000_000),
        "evaluation_20m": evaluation_results_path(config, 20_000_000),
        "evaluation_50m": evaluation_results_path(config, 50_000_000),
        "validation_50m": validation_results_path(config, 50_000_000),
        "prediction_thread_benchmark": prediction_thread_benchmark_path(config),
        "transform_parity": transform_parity_path(config),
        "outcome_manifest": outcome_manifest_path(config),
        "source_pipeline_freeze": source_freeze_path(config),
        "synthetic_gate_dry_run": synthetic_gate_dir(config),
        "phase3_validation": phase3_validation_path(config),
        "serving_manifest": serving_manifest_path(config),
        "evaluation_inputs_config": evaluation_inputs_config_path(config),
    }
    return {name: str(path) for name, path in values.items()}

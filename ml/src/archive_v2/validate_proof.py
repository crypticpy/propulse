"""Validate Archive Proof V2 data, metrics, models, and report artifacts."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "ml/data/processed/archive_v2"
MODEL_DIR = ROOT / "ml/models/archive_v2"
RESULTS_DIR = ROOT / "ml/results/archive_v2"
OUTPUT = RESULTS_DIR / "validation.json"


def load(name: str) -> dict[str, Any]:
    return json.loads((RESULTS_DIR / name).read_text(encoding="utf-8"))


def check(condition: bool, name: str, detail: Any, checks: list[dict[str, Any]]) -> None:
    checks.append({"name": name, "passed": bool(condition), "detail": detail})


def main() -> None:
    manifest = load("dataset_manifest.json")
    hf_results = load("hf_results.json")
    six_results = load("6m_results.json")
    checks: list[dict[str, Any]] = []
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")

    expected_bounds = {
        "train": ("2026-03-01 00:00:00+00", "2026-03-20 00:00:00+00"),
        "val": ("2026-03-20 00:00:00+00", "2026-03-24 00:00:00+00"),
        "test": ("2026-03-24 00:00:00+00", "2026-04-01 00:00:00+00"),
    }
    for task, filename in (("hf", "proof_hf.parquet"), ("6m", "proof_6m.parquet")):
        path = DATA_DIR / filename
        check(path.exists(), f"{task}_dataset_exists", str(path.relative_to(ROOT)), checks)
        rows, keys, bad_labels = con.execute(
            f"""
            SELECT count(*), count(DISTINCT (hour_utc, band, tx_field, rx_field)),
                   count(*) FILTER (WHERE reference_open NOT IN (0, 1)
                                      OR sparse_open NOT IN (0, 1))
            FROM read_parquet('{path}')
            """
        ).fetchone()
        check(rows == keys, f"{task}_unique_grain", {"rows": rows, "keys": keys}, checks)
        check(bad_labels == 0, f"{task}_binary_labels", bad_labels, checks)
        expected_rows = sum(int(row["rows"]) for row in manifest["stats"][task])
        check(rows == expected_rows, f"{task}_manifest_row_count", {"actual": rows, "expected": expected_rows}, checks)

        bands = [row[0] for row in con.execute(
            f"SELECT DISTINCT band FROM read_parquet('{path}') ORDER BY band"
        ).fetchall()]
        valid_bands = bands == ["6m"] if task == "6m" else "6m" not in bands and len(bands) == 10
        check(valid_bands, f"{task}_band_contract", bands, checks)
        for split, (lower, upper) in expected_bounds.items():
            bad = con.execute(
                f"""
                SELECT count(*) FROM read_parquet('{path}')
                WHERE split = ? AND NOT (
                    hour_utc >= TIMESTAMPTZ '{lower}'
                    AND hour_utc < TIMESTAMPTZ '{upper}'
                )
                """,
                [split],
            ).fetchone()[0]
            check(bad == 0, f"{task}_{split}_time_boundary", bad, checks)

    expected_hf_models = {
        "reference_physics",
        "reference_nowcast",
        "sparse_physics",
        "sparse_nowcast",
    }
    check(
        set(hf_results["models"]) == expected_hf_models,
        "hf_model_set",
        sorted(hf_results["models"]),
        checks,
    )
    check(
        set(six_results["models"]) == {"reference_physics", "reference_nowcast"},
        "6m_sparse_models_skipped",
        sorted(six_results["models"]),
        checks,
    )
    check(
        manifest["stats"]["6m"][0]["sparse_positives"] == 0
        and all(row["sparse_positives"] == 0 for row in manifest["stats"]["6m"]),
        "6m_sparse_label_single_class",
        [row["sparse_positives"] for row in manifest["stats"]["6m"]],
        checks,
    )
    for task_results in (hf_results, six_results):
        for result in task_results["models"].values():
            suffix = "txt" if result["engine"] == "lightgbm" else "json"
            model_path = MODEL_DIR / f"{result['name']}.{suffix}"
            metadata_path = MODEL_DIR / f"{result['name']}.metadata.json"
            check(model_path.exists(), f"model_{result['name']}", str(model_path.relative_to(ROOT)), checks)
            check(metadata_path.exists(), f"metadata_{result['name']}", str(metadata_path.relative_to(ROOT)), checks)

    report = RESULTS_DIR / "REPORT.html"
    artifact = RESULTS_DIR / "artifact.json"
    check(report.exists() and report.stat().st_size > 100_000, "portable_report_exists", report.stat().st_size if report.exists() else 0, checks)
    check(artifact.exists(), "canonical_artifact_exists", str(artifact.relative_to(ROOT)), checks)
    check(hf_results["selected_engine"] in {"lightgbm", "xgboost"}, "hf_engine_selected", hf_results["selected_engine"], checks)
    check(six_results["selected_engine"] in {"lightgbm", "xgboost"}, "6m_engine_selected", six_results["selected_engine"], checks)

    failures = [item for item in checks if not item["passed"]]
    output = {
        "schema_version": 1,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "passed": not failures,
        "checks": checks,
        "failure_count": len(failures),
    }
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"{len(checks)} checks, {len(failures)} failures", flush=True)
    if failures:
        for failure in failures:
            print(f"FAIL {failure['name']}: {failure['detail']}", flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

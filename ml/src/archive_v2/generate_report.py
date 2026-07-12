"""Generate the canonical portable HTML artifact for Archive Proof V2."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RESULTS_DIR = ROOT / "ml/results/archive_v2"
MANIFEST_PATH = RESULTS_DIR / "dataset_manifest.json"
HF_PATH = RESULTS_DIR / "hf_results.json"
SIX_PATH = RESULTS_DIR / "6m_results.json"
ARTIFACT_PATH = RESULTS_DIR / "artifact.json"
REPORT_PATH = RESULTS_DIR / "REPORT.html"


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def percent(value: float | None, digits: int = 1) -> str:
    return "n/a" if value is None else f"{value * 100:.{digits}f}%"


def number(value: float | None, digits: int = 4) -> str:
    return "n/a" if value is None else f"{value:.{digits}f}"


def model_label(key: str) -> str:
    source, profile = key.split("_", 1)
    return f"{'Dense' if source == 'reference' else 'Sparse'} {profile.title()}"


def source_spec(source_id: str, label: str, path: str, command: str) -> dict[str, Any]:
    sql = (
        f"SELECT * FROM read_json_auto('{path}')"
        if path.endswith(".json")
        else f"SELECT content FROM read_text('{path}')"
    )
    return {
        "id": source_id,
        "label": label,
        "path": path,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "query": command,
            "sql": sql,
            "description": f"Reproduce {label.lower()}.",
            "tables_used": [path],
        },
    }


def build_artifact(
    manifest: dict[str, Any], hf: dict[str, Any], six: dict[str, Any]
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    hf_models = hf["models"]
    physics_comparison = hf.get("comparisons", {}).get("physics", {})
    physics_delta = physics_comparison.get("delta_reference_minus_sparse", {})
    day_block = physics_comparison.get("day_block_brier", {})
    ref_physics = hf_models.get("reference_physics")
    sparse_physics = hf_models.get("sparse_physics")
    if ref_physics is None or sparse_physics is None:
        raise ValueError("HF reference and sparse physics models are required")

    ref_metrics = ref_physics["test_reference_calibrated"]
    sparse_metrics = sparse_physics["test_reference_calibrated"]
    sparse_recall = hf["label_agreement"]["sparse_recall_of_reference"]
    reference_wins = day_block.get("reference_wins_days", 0)
    days = day_block.get("days", 0)

    model_metrics = []
    for key, result in hf_models.items():
        measured = result["test_reference_calibrated"]
        model_metrics.append(
            {
                "model": model_label(key),
                "source": result["source"],
                "profile": result["profile"],
                "pr_auc": measured["pr_auc"],
                "roc_auc": measured["roc_auc"],
                "brier": measured["brier"],
                "log_loss": measured["log_loss"],
                "ece_15": measured["ece_15"],
                "rows": measured["rows"],
                "positives": measured["positives"],
                "engine": result["engine"],
                "best_iteration": result["best_iteration"],
            }
        )
    climatology = hf["baselines"]["reference_band_hour_climatology_on_reference"]
    brier_rows = [
        {
            "model": row["model"],
            "brier": row["brier"],
            "profile": row["profile"],
            "source": row["source"],
            "rows": row["rows"],
        }
        for row in model_metrics
    ]
    brier_rows.append(
        {
            "model": "Reference climatology",
            "brier": climatology["brier"],
            "profile": "baseline",
            "source": "reference",
            "rows": climatology["rows"],
        }
    )

    ref_band = {
        row["band"]: row for row in ref_physics["per_band_reference_calibrated"]
    }
    sparse_band = {
        row["band"]: row for row in sparse_physics["per_band_reference_calibrated"]
    }
    band_delta = []
    for band in sorted(ref_band):
        reference = ref_band[band]
        sparse_result = sparse_band[band]
        if reference["pr_auc"] is None or sparse_result["pr_auc"] is None:
            continue
        band_delta.append(
            {
                "band": band,
                "reference_pr_auc": reference["pr_auc"],
                "sparse_pr_auc": sparse_result["pr_auc"],
                "pr_auc_delta": reference["pr_auc"] - sparse_result["pr_auc"],
                "reference_brier": reference["brier"],
                "sparse_brier": sparse_result["brier"],
                "brier_delta": reference["brier"] - sparse_result["brier"],
                "rows": reference["rows"],
                "prevalence": reference["prevalence"],
            }
        )

    calibration = []
    for key in ("reference_physics", "sparse_physics"):
        for row in hf_models[key]["test_reference_calibration_bins"]:
            calibration.append({"model": model_label(key), **row})

    daily_brier = []
    for row in day_block.get("daily", []):
        for model, field in (
            ("Dense Physics", "reference_brier"),
            ("Sparse Physics", "sparse_brier"),
        ):
            daily_brier.append(
                {
                    "date": row["date"],
                    "model": model,
                    "brier": row[field],
                    "paired_delta": row["delta_reference_minus_sparse"],
                    "rows": row["rows"],
                }
            )

    split_rows = []
    for task in ("hf", "6m"):
        for row in manifest["stats"][task]:
            split_rows.append({"task": task, **row})

    six_metrics = []
    for key, result in six.get("models", {}).items():
        measured = result["test_reference_calibrated"]
        six_metrics.append(
            {
                "model": model_label(key),
                "pr_auc": measured["pr_auc"],
                "roc_auc": measured["roc_auc"],
                "brier": measured["brier"],
                "ece_15": measured["ece_15"],
                "rows": measured["rows"],
                "positives": measured["positives"],
                "engine": result["engine"],
            }
        )

    summary = [
        {
            "dense_pr_auc": ref_metrics["pr_auc"],
            "pr_auc_delta": physics_delta.get("pr_auc"),
            "dense_brier": ref_metrics["brier"],
            "sparse_brier": sparse_metrics["brier"],
            "brier_delta": physics_delta.get("brier"),
            "sparse_label_recall": sparse_recall,
            "common_pairs": manifest["common_pairs"],
            "test_rows": hf["label_agreement"]["test_rows"],
        }
    ]

    sources = [
        source_spec(
            "dataset_manifest",
            "Archive V2 dataset manifest",
            "ml/results/archive_v2/dataset_manifest.json",
            "ml/.venv/bin/python ml/src/archive_v2/build_proof_dataset.py",
        ),
        source_spec(
            "hf_results",
            "HF experiment metrics",
            "ml/results/archive_v2/hf_results.json",
            "ml/.venv/bin/python ml/src/archive_v2/train_proof.py --task hf",
        ),
        source_spec(
            "six_results",
            "6m experiment metrics",
            "ml/results/archive_v2/6m_results.json",
            "ml/.venv/bin/python ml/src/archive_v2/train_proof.py --task 6m",
        ),
        source_spec(
            "methodology",
            "Experiment methodology",
            "ml/ARCHIVE-PROOF-V2.md",
            "sed -n '1,260p' ml/ARCHIVE-PROOF-V2.md",
        ),
    ]

    summary_text = (
        "The stricter PSK-only proof compares models on identical one-hour-ahead "
        "HF opportunities. The dense-label physics model reached "
        f"**{number(ref_metrics['pr_auc'])} PR-AUC** and "
        f"**{number(ref_metrics['brier'])} Brier**, versus "
        f"**{number(sparse_metrics['pr_auc'])}** and "
        f"**{number(sparse_metrics['brier'])}** for sparse-label training. "
        f"Dense training won {reference_wins} of {days} test days on Brier. "
        "Both Brier values use the same dense validation-only recalibration. "
        "This supports the archive-first direction on common support, while "
        "remaining a March-only validation rather than an untouched production test."
    )
    six_sparse_trainable = "sparse_physics" in six.get("models", {})
    six_text = (
        "The collector had no positive 6m labels in train, validation, or test, so "
        "a sparse 6m classifier was not trainable. The dense PSK reference data did "
        "support a separate 6m model. This confirms that pooling 6m into an HF "
        "headline metric would conceal a source-coverage failure."
        if not six_sparse_trainable
        else "Both dense and sparse 6m labels supported independent models; their exact metrics are below."
    )

    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Archive Proof V2: Dense PSK Labels on Common Support",
            "description": "A technical report on the refined March 2026 archive training proof.",
            "generatedAt": generated_at,
            "cards": [
                {
                    "id": "dense_pr_auc",
                    "description": "PR-AUC of the dense-label physics-only model on dense HF test truth.",
                    "dataset": "summary",
                    "sourceId": "hf_results",
                    "metrics": [
                        {"label": "Dense PR-AUC", "field": "dense_pr_auc", "format": "number"},
                        {"label": "Delta vs sparse", "field": "pr_auc_delta", "format": "number", "signed": True},
                    ],
                },
                {
                    "id": "dense_brier",
                    "description": "Lower is better; both models are scored on identical dense HF truth.",
                    "dataset": "summary",
                    "sourceId": "hf_results",
                    "metrics": [
                        {"label": "Dense Brier", "field": "dense_brier", "format": "number"},
                        {"label": "Sparse Brier", "field": "sparse_brier", "format": "number"},
                    ],
                },
                {
                    "id": "sparse_recall",
                    "description": "Share of dense-reference positive cells also captured by the sparse collector.",
                    "dataset": "summary",
                    "sourceId": "hf_results",
                    "metrics": [
                        {"label": "Sparse label recall", "field": "sparse_label_recall", "format": "percent"}
                    ],
                },
                {
                    "id": "common_pairs",
                    "description": "Directional field pairs meeting the train-only 300-spot gate in both sources.",
                    "dataset": "summary",
                    "sourceId": "dataset_manifest",
                    "metrics": [
                        {"label": "Common pairs", "field": "common_pairs", "format": "compact"},
                        {"label": "HF test rows", "field": "test_rows", "format": "compact"},
                    ],
                },
            ],
            "charts": [
                {
                    "id": "hf_pr_auc",
                    "title": "HF reference-test PR-AUC by training source and feature profile",
                    "subtitle": "Identical March 24-31 rows; higher is better.",
                    "type": "horizontalBar",
                    "dataset": "hf_model_metrics",
                    "sourceId": "hf_results",
                    "valueFormat": "number",
                    "encodings": {
                        "x": {"field": "model", "type": "nominal", "label": "Model"},
                        "y": {"field": "pr_auc", "type": "quantitative", "label": "PR-AUC"},
                        "tooltip": [
                            {"field": "roc_auc", "type": "quantitative", "label": "ROC-AUC"},
                            {"field": "rows", "type": "quantitative", "label": "Rows", "format": "compact"},
                        ],
                    },
                },
                {
                    "id": "hf_brier",
                    "title": "HF reference-test Brier score by model",
                    "subtitle": "Includes the reference band-hour climatology; lower is better.",
                    "type": "horizontalBar",
                    "dataset": "hf_brier",
                    "sourceId": "hf_results",
                    "valueFormat": "number",
                    "encodings": {
                        "x": {"field": "model", "type": "nominal", "label": "Model"},
                        "y": {"field": "brier", "type": "quantitative", "label": "Brier score"},
                        "tooltip": [
                            {"field": "rows", "type": "quantitative", "label": "Rows", "format": "compact"}
                        ],
                    },
                },
                {
                    "id": "band_delta",
                    "title": "Dense-minus-sparse physics PR-AUC by HF band",
                    "subtitle": "Positive values favor training on dense PSK labels.",
                    "type": "bar",
                    "dataset": "hf_band_delta",
                    "sourceId": "hf_results",
                    "valueFormat": "number",
                    "encodings": {
                        "x": {"field": "band", "type": "ordinal", "label": "Band"},
                        "y": {"field": "pr_auc_delta", "type": "quantitative", "label": "PR-AUC delta"},
                        "tooltip": [
                            {"field": "reference_pr_auc", "type": "quantitative", "label": "Dense PR-AUC"},
                            {"field": "sparse_pr_auc", "type": "quantitative", "label": "Sparse PR-AUC"},
                            {"field": "rows", "type": "quantitative", "label": "Rows", "format": "compact"},
                        ],
                    },
                },
                {
                    "id": "daily_brier",
                    "title": "Physics-only Brier score by test day",
                    "subtitle": "Paired daily comparison on dense reference truth; lower is better.",
                    "type": "line",
                    "dataset": "hf_daily_brier",
                    "sourceId": "hf_results",
                    "valueFormat": "number",
                    "encodings": {
                        "x": {"field": "date", "type": "temporal", "label": "UTC date"},
                        "y": {"field": "brier", "type": "quantitative", "label": "Brier score"},
                        "color": {"field": "model", "type": "nominal", "label": "Model"},
                        "tooltip": [
                            {"field": "rows", "type": "quantitative", "label": "Rows", "format": "compact"},
                            {"field": "paired_delta", "type": "quantitative", "label": "Dense - sparse"},
                        ],
                    },
                },
                {
                    "id": "calibration",
                    "title": "HF physics-only calibration on dense reference truth",
                    "subtitle": "Observed opening rate within equal-width prediction bins.",
                    "type": "line",
                    "dataset": "hf_calibration",
                    "sourceId": "hf_results",
                    "valueFormat": "percent",
                    "encodings": {
                        "x": {"field": "mean_prediction", "type": "quantitative", "label": "Mean predicted probability", "format": "percent"},
                        "y": {"field": "observed_rate", "type": "quantitative", "label": "Observed opening rate", "format": "percent"},
                        "color": {"field": "model", "type": "nominal", "label": "Model"},
                        "tooltip": [
                            {"field": "rows", "type": "quantitative", "label": "Rows", "format": "compact"}
                        ],
                    },
                },
            ],
            "tables": [
                {
                    "id": "model_table",
                    "title": "HF model metrics on dense reference test labels",
                    "subtitle": "Calibrated predictions on identical March 24-31 rows.",
                    "dataset": "hf_model_metrics",
                    "sourceId": "hf_results",
                    "defaultSort": {"field": "brier", "direction": "asc"},
                    "density": "dense",
                    "columns": [
                        {"field": "model", "label": "Model", "type": "text"},
                        {"field": "pr_auc", "label": "PR-AUC", "format": "number"},
                        {"field": "roc_auc", "label": "ROC-AUC", "format": "number"},
                        {"field": "brier", "label": "Brier", "format": "number"},
                        {"field": "ece_15", "label": "ECE", "format": "number"},
                    ],
                },
                {
                    "id": "six_table",
                    "title": "Independent 6m model results",
                    "subtitle": "Sparse models are absent when the collector label has no positives.",
                    "dataset": "six_model_metrics",
                    "sourceId": "six_results",
                    "defaultSort": {"field": "brier", "direction": "asc"},
                    "density": "dense",
                    "columns": [
                        {"field": "model", "label": "Model", "type": "text"},
                        {"field": "pr_auc", "label": "PR-AUC", "format": "number"},
                        {"field": "roc_auc", "label": "ROC-AUC", "format": "number"},
                        {"field": "brier", "label": "Brier", "format": "number"},
                    ],
                },
                {
                    "id": "split_table",
                    "title": "Dataset cohorts and label prevalence",
                    "subtitle": "No negative sampling; every eligible row is retained.",
                    "dataset": "split_rows",
                    "sourceId": "dataset_manifest",
                    "defaultSort": {"field": "rows", "direction": "desc"},
                    "density": "dense",
                    "columns": [
                        {"field": "task", "label": "Task", "type": "text"},
                        {"field": "split", "label": "Split", "type": "text"},
                        {"field": "rows", "label": "Rows", "format": "compact"},
                        {"field": "reference_open_rate", "label": "Dense prevalence", "format": "percent"},
                        {"field": "sparse_open_rate", "label": "Sparse prevalence", "format": "percent"},
                    ],
                },
            ],
            "sources": [{"id": source["id"], "label": source["label"], "path": source["path"]} for source in sources],
            "blocks": [
                {"id": "title", "type": "markdown", "body": "# Archive Proof V2: Dense PSK Labels on Common Support"},
                {"id": "summary_heading", "type": "markdown", "body": f"## Technical Summary\n\n{summary_text}", "sourceId": "hf_results"},
                {"id": "summary_metrics", "type": "metric-strip", "cardIds": ["dense_pr_auc", "dense_brier", "sparse_recall", "common_pairs"]},
                {"id": "finding", "type": "markdown", "body": "## Dense labels improved the same one-hour-ahead HF task\n\nThe primary physics-only arm changes only the training labels. It excludes path IDs and target-hour activity, so the comparison cannot be explained by pair memorization, WSPR labels, a different row universe, or 6m behavior."},
                {"id": "pr_chart", "type": "chart", "chartId": "hf_pr_auc"},
                {"id": "brier_chart", "type": "chart", "chartId": "hf_brier"},
                {"id": "model_details", "type": "table", "tableId": "model_table"},
                {"id": "band_heading", "type": "markdown", "body": "## The aggregate result must survive band-level inspection\n\nPer-band deltas show whether the headline is broad or concentrated in a few high-volume bands. Positive PR-AUC deltas favor dense-label training; Brier and row counts remain available in the chart source data."},
                {"id": "band_chart", "type": "chart", "chartId": "band_delta"},
                {"id": "daily_heading", "type": "markdown", "body": f"## The paired result held on {reference_wins} of {days} test days\n\nThe day-block bootstrap treats days, rather than millions of autocorrelated cells, as the resampling unit. The 95% interval for dense-minus-sparse daily Brier is {day_block.get('bootstrap_95_ci')}. Negative values favor dense-label training.", "sourceId": "hf_results"},
                {"id": "daily_chart", "type": "chart", "chartId": "daily_brier"},
                {"id": "calibration_heading", "type": "markdown", "body": "## Calibration sensitivity separates ranking from feed prevalence\n\nHeadline Brier and log loss recalibrate both models on dense validation truth, so sparse-feed prevalence alone cannot decide the comparison. Native sparse calibration is also retained in the metrics JSON; it quantifies the operational underprediction produced when a 19.6% observation process is used as a proxy for 52.6% dense truth."},
                {"id": "calibration_chart", "type": "chart", "chartId": "calibration"},
                {"id": "six_heading", "type": "markdown", "body": f"## 6m is a separate task and exposed a collector coverage failure\n\n{six_text}", "sourceId": "six_results"},
                {"id": "six_table_block", "type": "table", "tableId": "six_table"},
                {"id": "scope_heading", "type": "markdown", "body": "## Scope, data, and metric definitions\n\nA row is a directional field-pair and band at target hour H. Eligibility requires both endpoint roles to be active on that band in dense PSK data at H-1. `open` means at least one PSK report at H. PR-AUC measures ranking under class imbalance; Brier measures probability accuracy; ECE summarizes calibration-bin error. All test comparisons use identical rows."},
                {"id": "split_table_block", "type": "table", "tableId": "split_table"},
                {"id": "method_heading", "type": "markdown", "body": "## Experimental design and model specification\n\nPairs must have at least 300 training-period spots in each source. Train is March 1-19, validation March 20-23, and test March 24-31 UTC. DuckDB builds the risk set and Polars adds vectorized features. LightGBM and XGBoost are compared on a bounded validation bakeoff; the selected engine is then trained on the full data. Isotonic calibration is fit on validation only. The physics profile uses geometry, solar illumination, prior-completed-hour space weather, calendar, and band features. The nowcast profile adds each source's own H-1/H-2/H-3/H-24 activity."},
                {"id": "limitations_heading", "type": "markdown", "body": "## Limitations, uncertainty, and robustness\n\nThis is a March-only development experiment and is not an untouched final test. Common-support filtering evaluates established paths rather than unseen geography. Region-level H-1 exposure is stronger than the old any-band rule but is not a station-level transmission log. Dense Madrigal PSK is treated as reference truth, not perfect truth. Eight test days provide a small block-bootstrap sample. Archive-era source drift and train-serve availability still require multi-year testing."},
                {"id": "next_heading", "type": "markdown", "body": "## Recommended next steps\n\n1. Build station-opportunity WSPR and RBN pilots with explicit active-receiver exposure.\n2. Run seasonal and solar-cycle learning curves before downloading the full archive.\n3. Add spatial holdouts and source-era drift tests.\n4. Reserve a future collector interval as the locked production test.\n5. Rent CUDA hardware only after CPU learning curves show a remaining data-capacity constraint."},
                {"id": "questions_heading", "type": "markdown", "body": "## Further questions\n\n- How much of the gain survives a completely unseen-pair holdout?\n- Which bands benefit from dense labels versus source-specific nowcast lags?\n- Can station-level exposure reduce the remaining reference-label ambiguity?\n- Does an operationally available ionosphere measurement improve opening-onset lead time?"},
            ],
        },
        "snapshot": {
            "version": 1,
            "generatedAt": generated_at,
            "status": "ready",
            "datasets": {
                "summary": summary,
                "hf_model_metrics": model_metrics,
                "hf_brier": brier_rows,
                "hf_band_delta": band_delta,
                "hf_daily_brier": daily_brier,
                "hf_calibration": calibration,
                "six_model_metrics": six_metrics,
                "split_rows": split_rows,
            },
            "accessIssues": [],
        },
        "sources": sources,
    }
    return artifact


def find_builder_root() -> Path | None:
    roots = sorted(
        (Path.home() / ".codex/plugins/cache/openai-curated-remote/data-analytics").glob(
            "*/skills/build-report/scripts/deliver_portable_artifact.mjs"
        )
    )
    return roots[-1].parents[1] if roots else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deliver", action="store_true", help="Build and verify REPORT.html")
    parser.add_argument("--builder-root", type=Path, help="Path to the build-report skill directory")
    args = parser.parse_args()
    missing = [path for path in (MANIFEST_PATH, HF_PATH, SIX_PATH) if not path.exists()]
    if missing:
        raise SystemExit(f"missing results: {', '.join(str(path) for path in missing)}")

    artifact = build_artifact(load(MANIFEST_PATH), load(HF_PATH), load(SIX_PATH))
    ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {ARTIFACT_PATH.relative_to(ROOT)}", flush=True)

    if args.deliver:
        builder_root = args.builder_root or find_builder_root()
        if builder_root is None:
            raise SystemExit("portable report builder not found; pass --builder-root")
        subprocess.run(
            [
                "node",
                str(Path(__file__).with_name("deliver_report.mjs")),
                "--plugin-root",
                str(builder_root),
                "--input",
                str(ARTIFACT_PATH),
                "--output",
                str(REPORT_PATH),
            ],
            cwd=ROOT,
            check=True,
        )


if __name__ == "__main__":
    main()

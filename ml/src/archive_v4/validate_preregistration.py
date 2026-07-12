#!/usr/bin/env python3
"""Validate V4 preregistration without optional third-party dependencies."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = ROOT / "ml/config/propagation_v4.json"
SOURCES_PATH = ROOT / "ml/config/propagation_v4_sources.json"
RUN_MANIFEST_PATH = (
    ROOT / "ml/results/propagation_v4/preregistration/run_manifest.json"
)
MONTH_RE = re.compile(r"^20\d{2}-(01|04|07|10)$")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load(path: Path) -> dict:
    return json.loads(path.read_text())


def main() -> None:
    config = load(CONFIG_PATH)
    sources = load(SOURCES_PATH)
    run = load(RUN_MANIFEST_PATH)

    require(config["run_id"] == run["run_id"], "run_id mismatch")
    require(config["baseline_commit"] == run["baseline_commit"], "baseline mismatch")
    require(config["seed"] == 20260712, "seed changed")
    require(config["archive_namespace"] == "archive_v4", "namespace changed")

    split_months: dict[str, list[str]] = {
        key: config["splits"][key]
        for key in ("train", "validation", "locked_archive_test")
    }
    require(len(split_months["train"]) == 24, "train must contain 24 months")
    require(len(split_months["validation"]) == 4, "validation must contain 4 months")
    require(
        len(split_months["locked_archive_test"]) == 4,
        "archive test must contain 4 months",
    )
    for name, months in split_months.items():
        require(len(months) == len(set(months)), f"duplicate month in {name}")
        require(all(MONTH_RE.fullmatch(month) for month in months), f"invalid month in {name}")

    train = set(split_months["train"])
    validation = set(split_months["validation"])
    test = set(split_months["locked_archive_test"])
    require(not train & validation, "train/validation overlap")
    require(not train & test, "train/test overlap")
    require(not validation & test, "validation/test overlap")
    require(max(train) < min(validation), "training is not temporally before validation")
    require(max(validation) < min(test), "validation is not temporally before test")
    require(
        config["months"]
        == split_months["train"]
        + split_months["validation"]
        + split_months["locked_archive_test"],
        "compatibility month list differs from frozen splits",
    )
    require(config["train"]["months"] == split_months["train"], "train alias differs")
    require(
        config["validation"]["months"] == split_months["validation"],
        "validation alias differs",
    )
    require(
        config["test"]["months"] == split_months["locked_archive_test"],
        "test alias differs",
    )

    prospective = config["splits"]["locked_prospective_test"]
    require(
        date.fromisoformat(prospective["start"]) <= date.fromisoformat(prospective["end"]),
        "prospective date range is reversed",
    )
    require(config["sampling"]["primary_train_rows"] == 50_000_000, "row cap changed")
    require(
        config["sampling"]["learning_curve_rows"] == [5_000_000, 20_000_000, 50_000_000],
        "learning curve changed",
    )
    require(config["future_horizons_hours"] == [3, 6, 12, 24], "horizons changed")
    require(len(config["models"]) == 8, "candidate matrix changed")
    require(len(config["sampling"]["strata"]) == 8, "sampling strata changed")
    require(run["locked_archive_test_opened"] is False, "archive test marked open")
    require(run["locked_prospective_test_opened"] is False, "prospective test marked open")

    required_source_fields = set(sources["policy"]["required_fields"])
    require(len(sources["sources"]) >= 9, "source registry is incomplete")
    ids = [source["id"] for source in sources["sources"]]
    require(len(ids) == len(set(ids)), "duplicate source IDs")
    for source in sources["sources"]:
        missing = required_source_fields - set(source)
        require(not missing, f"source {source['id']} missing {sorted(missing)}")

    print(
        "V4 preregistration: OK "
        f"({len(train)} train, {len(validation)} validation, {len(test)} locked test months; "
        f"{len(sources['sources'])} sources)"
    )


if __name__ == "__main__":
    main()

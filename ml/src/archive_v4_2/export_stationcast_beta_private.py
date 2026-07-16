#!/usr/bin/env python3
"""Stream consented beta rows to an owner-only pseudonymous M5 Parquet file."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import platform
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg
import pyarrow as pa
import pyarrow.parquet as pq

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import (
    DEFAULT_ENV,
    DEFAULT_POOLER_URL,
    ROOT,
    atomic_write,
    current_project_pooler_url,
    read_env,
)


M5_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
BETA_CONFIG = ROOT / "ml/config/propagation_v4_2_beta_protocol.json"
DEFAULT_PRIVATE_ROOT = Path("/Volumes/Projects/PropulseML/private/stationcast_beta")
SCHEMA = pa.schema([
    pa.field("participant_key", pa.string(), nullable=False),
    pa.field("observed_at", pa.timestamp("us", tz="UTC"), nullable=False),
    pa.field("band", pa.string(), nullable=False),
    pa.field("mode", pa.string(), nullable=False),
    pa.field("task", pa.string(), nullable=False),
    pa.field("evidence_tier", pa.string(), nullable=False),
    pa.field("origin_field", pa.string(), nullable=False),
    pa.field("station_tx_class", pa.string()),
    pa.field("station_loss_class", pa.string()),
    pa.field("station_antenna_class", pa.string()),
    pa.field("station_rx_class", pa.string()),
    pa.field("profile", pa.string(), nullable=False),
    pa.field("station_supported", pa.bool_(), nullable=False),
    pa.field("ood_count", pa.int16(), nullable=False),
    pa.field("observed", pa.int8(), nullable=False),
    pa.field("core_probability", pa.float64(), nullable=False),
    pa.field("stationcast_probability", pa.float64(), nullable=False),
])


QUERY = """
SELECT
  prediction.user_id::text,
  outcome.observed_at,
  prediction.band,
  prediction.mode,
  CASE WHEN outcome.outcome_type LIKE 'receive_%' THEN 'receive' ELSE 'contact' END,
  CASE
    WHEN outcome.evidence_grade IN ('bridge', 'wsjtx') THEN 'A'
    WHEN outcome.evidence_grade IN ('rig', 'logbook') THEN 'B'
    ELSE 'C'
  END,
  left(prediction.origin_grid4, 2),
  CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
    THEN prediction.station_tx_class END,
  CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
    THEN prediction.station_loss_class END,
  CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
    THEN prediction.station_antenna_class END,
  CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
    THEN prediction.station_rx_class END,
  prediction.profile,
  coalesce(prediction.station_supported, false),
  cardinality(prediction.ood_flags),
  CASE
    WHEN outcome.outcome_type IN ('receive_success', 'contact_success') THEN 1
    ELSE 0
  END,
  prediction.core_probability::double precision,
  prediction.personalized_probability::double precision
FROM public.propagation_outcomes AS outcome
JOIN public.propagation_attempts AS attempt
  ON attempt.id = outcome.attempt_id AND attempt.user_id = outcome.user_id
JOIN public.propagation_predictions AS prediction
  ON prediction.id = attempt.prediction_id AND prediction.user_id = attempt.user_id
JOIN public.ml_research_consents AS consent
  ON consent.user_id = prediction.user_id
WHERE outcome.observed_at >= %s
  AND outcome.observed_at < %s
  AND outcome.outcome_type IN (
    'receive_success', 'receive_failure', 'contact_success', 'contact_failure'
  )
  AND prediction.sampled_for_research
  AND prediction.personalized_probability IS NOT NULL
  AND consent.policy_version = %s
  AND consent.status = 'opted_in'
  AND consent.retention_until > %s
  AND 'attempt_outcome_training' = ANY(consent.allowed_uses)
ORDER BY outcome.observed_at, outcome.id
"""


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def participant_key(user_id: str, secret: bytes) -> str:
    return hmac.new(secret, user_id.encode(), hashlib.sha256).hexdigest()


def secret_bytes(path: Path) -> bytes:
    if not path.is_file():
        raise RuntimeError("private participant-key secret is unavailable")
    if path.stat().st_mode & 0o077:
        raise RuntimeError("private participant-key secret must be owner-only")
    secret = path.read_bytes()
    if len(secret) < 32:
        raise RuntimeError("private participant-key secret must contain 32 bytes")
    return secret


def rows_to_batch(rows: list[tuple[Any, ...]], secret: bytes) -> pa.RecordBatch:
    columns: list[list[Any]] = [[] for _ in SCHEMA]
    for row in rows:
        values = (participant_key(str(row[0]), secret), *row[1:])
        for index, value in enumerate(values):
            columns[index].append(value)
    arrays = [pa.array(values, type=field.type) for values, field in zip(columns, SCHEMA)]
    return pa.RecordBatch.from_arrays(arrays, schema=SCHEMA)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--window-start", required=True)
    parser.add_argument("--window-end", required=True)
    parser.add_argument("--policy-version", required=True)
    parser.add_argument("--participant-key-secret", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--private-root", type=Path, default=DEFAULT_PRIVATE_ROOT)
    parser.add_argument("--receipt-output", type=Path)
    parser.add_argument("--batch-rows", type=int, default=10_000)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    if not 1_000 <= args.batch_rows <= 100_000:
        raise RuntimeError("batch rows must be between 1,000 and 100,000")

    runtime = validate_m5_runtime(json.loads(M5_CONFIG.read_text(encoding="utf-8")))
    beta_config = json.loads(BETA_CONFIG.read_text(encoding="utf-8"))
    if args.policy_version != beta_config.get("policy_version"):
        raise RuntimeError("private beta export policy does not match the frozen config")
    window_start = datetime.fromisoformat(args.window_start.replace("Z", "+00:00"))
    window_end = datetime.fromisoformat(args.window_end.replace("Z", "+00:00"))
    if (
        window_start.tzinfo is None
        or window_end.tzinfo is None
        or window_end <= window_start
        or window_end - window_start > timedelta(days=180)
    ):
        raise RuntimeError("private beta export window is invalid")
    window_start = window_start.astimezone(timezone.utc)
    window_end = window_end.astimezone(timezone.utc)
    secret = secret_bytes(args.participant_key_secret)
    args.private_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(args.private_root, 0o700)
    output = args.private_root / (
        f"stationcast_beta_{window_start:%Y%m%d}_{window_end:%Y%m%d}.parquet"
    )
    temporary = output.with_suffix(".parquet.partial")
    receipt_output = args.receipt_output or output.with_suffix(".receipt.json")
    if output.exists() and not args.replace:
        raise RuntimeError("private export already exists; pass --replace explicitly")
    if temporary.exists():
        raise RuntimeError("private partial export already exists")
    descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)

    values = read_env(args.env_file)
    password = values.get("SUPABASE_DB_PASSWORD", "")
    if not password:
        raise RuntimeError("target database password is unavailable")
    pooler_url = current_project_pooler_url(
        values,
        args.pooler_url_file.read_text(encoding="utf-8").strip(),
    )
    started = time.perf_counter()
    row_count = 0
    writer: pq.ParquetWriter | None = None
    connection = psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-private-stationcast-beta-export",
    )
    try:
        connection.execute("SET TRANSACTION READ ONLY")
        with connection.cursor(name="stationcast_beta_export") as cursor:
            cursor.itersize = args.batch_rows
            cursor.execute(
                QUERY,
                (
                    window_start,
                    window_end,
                    args.policy_version,
                    window_end,
                ),
            )
            writer = pq.ParquetWriter(
                temporary,
                SCHEMA,
                compression="zstd",
                use_dictionary=True,
            )
            while rows := cursor.fetchmany(args.batch_rows):
                writer.write_batch(rows_to_batch(rows, secret))
                row_count += len(rows)
        connection.rollback()
    finally:
        if writer is not None:
            writer.close()
        connection.close()
    os.chmod(temporary, 0o600)
    os.replace(temporary, output)
    os.chmod(output, 0o600)

    receipt = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "private_stationcast_beta_export",
        "protocol_version": beta_config["protocol_version"],
        "window": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
        },
        "policy_version": args.policy_version,
        "rows": row_count,
        "parquet_sha256": file_sha256(output),
        "config_sha256": file_sha256(BETA_CONFIG),
        "private_path_recorded": False,
        "runtime": {
            "machine": platform.machine(),
            "physical_cores_visible": runtime["physical_cores_visible"],
            "batch_rows": args.batch_rows,
            "wall_seconds": time.perf_counter() - started,
            "psycopg_version": psycopg.__version__,
            "pyarrow_version": pa.__version__,
        },
        "privacy": {
            "user_ids_written": False,
            "pseudonymous_participant_key_private_only": True,
            "exact_grid4_written": False,
            "raw_station_inventory_written": False,
            "secret_value_written": False,
        },
    }
    atomic_write(receipt_output, receipt)
    os.chmod(receipt_output, 0o600)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()

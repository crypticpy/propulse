#!/usr/bin/env python3
"""Validate the UTC-safe StationCast beta telemetry amendment on the M5."""

from __future__ import annotations

import argparse
import json
import platform
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import (
    DEFAULT_ENV,
    DEFAULT_POOLER_URL,
    ROOT,
    atomic_write,
    current_project_pooler_url,
    read_env,
    sha256,
)


MIGRATION = ROOT / "supabase/migrations/20260716015000_stationcast_beta_telemetry_utc.sql"
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_OUTPUT = RESULT / "stationcast_beta_telemetry_utc_migration_validation.json"
DEFAULT_DEPLOYMENT_OUTPUT = (
    RESULT / "stationcast_beta_telemetry_utc_deployment_validation.json"
)
FUNCTIONS = (
    "record_propagation_beta_telemetry",
    "get_propagation_beta_api_telemetry",
)


def utc_state(cursor: psycopg.Cursor[Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conname = 'propagation_beta_telemetry_bucket_hour_check'"
    )
    constraint = cursor.fetchone()
    cursor.execute(
        "SELECT p.proname, pg_get_functiondef(p.oid), p.proacl::text "
        "FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'public' AND p.proname = ANY(%s) ORDER BY p.proname",
        (list(FUNCTIONS),),
    )
    functions = [tuple(str(value or "") for value in row) for row in cursor.fetchall()]
    return {
        "constraint": tuple(str(value) for value in constraint) if constraint else (),
        "functions": functions,
    }


def validate_utc_boundary(cursor: psycopg.Cursor[Any]) -> dict[str, bool]:
    state = utc_state(cursor)
    constraint = " ".join(state["constraint"]).lower()
    functions = {name: (body.lower(), acl) for name, body, acl in state["functions"]}
    bodies = re.sub(
        r"\s+",
        " ",
        " ".join(body for body, _ in functions.values()).replace("::text", ""),
    )
    gates = {
        "utc_hour_constraint_present": (
            "date_trunc('hour'::text, bucket_start, 'utc'::text)" in constraint
        ),
        "record_bucket_is_utc_safe": (
            "date_trunc('hour', p_observed_at, 'utc')" in bodies
        ),
        "export_window_is_utc_safe": all(
            phrase in bodies
            for phrase in (
                "date_trunc('hour', p_window_start, 'utc')",
                "date_trunc('hour', p_window_end, 'utc')",
            )
        ),
        "function_acl_preserved": (
            set(functions) == set(FUNCTIONS)
            and all("service_role" in acl for _, acl in functions.values())
        ),
    }

    protocol = "propagation-v4.2-stationcast-beta-2099-02-01"
    observed = datetime(2099, 2, 1, 0, 30, tzinfo=timezone.utc)
    start = datetime(2099, 2, 1, 0, 0, tzinfo=timezone.utc)
    end = datetime(2099, 2, 1, 1, 0, tzinfo=timezone.utc)
    cursor.execute("SET LOCAL TIME ZONE 'America/Chicago'")
    cursor.execute(
        "SELECT public.record_propagation_beta_telemetry(%s, %s, %s::jsonb)",
        (protocol, observed, json.dumps({"requests": 1})),
    )
    bucket = cursor.execute(
        "SELECT bucket_start FROM public.propagation_beta_telemetry_hourly "
        "WHERE protocol_version = %s",
        (protocol,),
    ).fetchone()[0]
    receipt = cursor.execute(
        "SELECT public.get_propagation_beta_api_telemetry(%s, %s, %s)",
        (protocol, start, end),
    ).fetchone()[0]
    gates["non_utc_session_records_same_utc_bucket"] = bool(
        bucket.astimezone(timezone.utc) == start
        and receipt["counts"]["requests"] == 1
        and receipt["participant_data_present"] is False
    )
    cursor.execute("SAVEPOINT invalid_utc_window")
    rejected = False
    try:
        cursor.execute(
            "SELECT public.get_propagation_beta_api_telemetry(%s, %s, %s)",
            (protocol, observed, end),
        )
    except psycopg.Error:
        rejected = True
        cursor.execute("ROLLBACK TO SAVEPOINT invalid_utc_window")
    cursor.execute("RELEASE SAVEPOINT invalid_utc_window")
    gates["non_hour_utc_window_rejected"] = rejected
    return gates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--migration", type=Path, default=MIGRATION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--verify-deployed", action="store_true")
    args = parser.parse_args()
    if args.verify_deployed and args.output == DEFAULT_OUTPUT:
        args.output = DEFAULT_DEPLOYMENT_OUTPUT

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    values = read_env(args.env_file)
    password = values.get("SUPABASE_DB_PASSWORD", "")
    if not password:
        raise RuntimeError("target database password is unavailable")
    pooler_url = current_project_pooler_url(
        values,
        args.pooler_url_file.read_text(encoding="utf-8").strip(),
    )
    started = time.perf_counter()
    connection = psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-beta-telemetry-utc-validation",
    )
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    gates: dict[str, bool] = {}
    server_version = ""
    deployed_before_validation = False
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version")
            server_version = str(cursor.fetchone()[0])
            cursor.execute(
                "SELECT count(*) FROM supabase_migrations.schema_migrations "
                "WHERE version = '20260716014000'"
            )
            if int(cursor.fetchone()[0]) != 1:
                raise RuntimeError("base telemetry boundary is not deployed")
            cursor.execute(
                "SELECT count(*) FROM supabase_migrations.schema_migrations "
                "WHERE version = '20260716015000'"
            )
            deployed_before_validation = int(cursor.fetchone()[0]) == 1
            before = utc_state(cursor)
            connection.commit()
            cursor.execute("SET LOCAL statement_timeout = '120s'")
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            if not args.verify_deployed:
                cursor.execute(args.migration.read_text(encoding="utf-8"))
            gates = validate_utc_boundary(cursor)
            if args.verify_deployed:
                gates["deployment_ledger_exact"] = deployed_before_validation
            connection.rollback()
            after = utc_state(cursor)
            connection.rollback()
    finally:
        connection.close()

    restored = before == after
    gates.update({
        "rollback_restored_original_boundary": restored,
        "persistent_test_changes_absent": restored,
        "target_is_postgresql": bool(server_version),
        "native_m5_runtime": runtime["machine"] == "arm64",
        "locked_outcomes_unread": True,
    })
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": (
            "stationcast_beta_telemetry_utc_target_postgres_deployment_validation"
            if args.verify_deployed
            else "stationcast_beta_telemetry_utc_target_postgres_rollback_validation"
        ),
        "decision": "pass" if all(gates.values()) else "fail",
        "migration_deployed": args.verify_deployed,
        "target_migration_present_before_validation": deployed_before_validation,
        "locked_outcomes_read": False,
        "persistent_changes": False,
        "migration": {
            "path": args.migration.relative_to(ROOT).as_posix(),
            "sha256": sha256(args.migration),
            "base_version": "20260716014000",
        },
        "database": {
            "engine": "PostgreSQL",
            "server_version": server_version,
            "connection_identifier_recorded": False,
        },
        "runtime": {
            "machine": platform.machine(),
            "physical_cores_visible": runtime["physical_cores_visible"],
            "wall_seconds": time.perf_counter() - started,
            "psycopg_version": psycopg.__version__,
        },
        "gates": gates,
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if result["decision"] != "pass":
        raise SystemExit("StationCast beta telemetry UTC validation failed")


if __name__ == "__main__":
    main()

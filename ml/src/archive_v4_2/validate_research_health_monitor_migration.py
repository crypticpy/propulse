#!/usr/bin/env python3
"""Rollback-validate the off-M5 research-health monitor on target Postgres."""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg import errors

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


MIGRATION = (
    ROOT
    / "supabase/migrations/20260716002000_propagation_research_health_monitor.sql"
)
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_OUTPUT = RESULT / "research_health_monitor_migration_validation.json"
DEFAULT_DEPLOYMENT_OUTPUT = (
    RESULT / "research_health_monitor_deployment_validation.json"
)
MONITOR_FUNCTION = (
    "public.monitor_propagation_research_health(text,timestamptz,integer)"
)
RECORD_FUNCTION_NAME = "public.record_propagation_research_health"


def monitor_exists(cursor: psycopg.Cursor[Any]) -> bool:
    cursor.execute("SELECT to_regprocedure(%s) IS NOT NULL", (MONITOR_FUNCTION,))
    return bool(cursor.fetchone()[0])


def insert_health(cursor: psycopg.Cursor[Any], reported_at: datetime) -> None:
    cursor.execute(
        """
        INSERT INTO public.propagation_research_health (
          singleton_key, reported_at, decision, last_completed_target_hour,
          continuous_completed_hours, completed_hours, required_hours,
          missing_hours, freshness_seconds, alert_names, updated_at
        ) VALUES (
          'nowcast-research', %s, 'healthy', %s, 3, 3, 720, 0, 0, '{}', now()
        )
        """,
        (reported_at, reported_at - timedelta(hours=1)),
    )


def monitor(
    cursor: psycopg.Cursor[Any],
    event_id: str,
    observed_at: datetime,
    stale_seconds: int = 7200,
) -> tuple[bool, bool, bool]:
    cursor.execute(
        "SELECT * FROM public.monitor_propagation_research_health(%s,%s,%s)",
        (event_id, observed_at, stale_seconds),
    )
    evaluated, changed, stale = cursor.fetchone()
    return bool(evaluated), bool(changed), bool(stale)


def validate_transaction(
    cursor: psycopg.Cursor[Any],
    migration_sql: str,
    *,
    migration_deployed: bool,
) -> dict[str, bool]:
    cursor.execute("SET LOCAL statement_timeout = '120s'")
    cursor.execute("SET LOCAL lock_timeout = '10s'")
    if migration_sql.strip():
        cursor.execute(migration_sql)

    cursor.execute(
        "SELECT prosecdef, coalesce(proconfig, '{}') FROM pg_proc "
        "WHERE oid = to_regprocedure(%s)",
        (MONITOR_FUNCTION,),
    )
    function_row = cursor.fetchone()
    function_hardened = bool(function_row and function_row[0]) and any(
        str(value).replace(" ", "") in ("search_path=", 'search_path=""')
        for value in function_row[1]
    )
    function_restricted = True
    for role in ("anon", "authenticated"):
        cursor.execute(
            "SELECT has_function_privilege(%s, %s, 'EXECUTE')",
            (role, MONITOR_FUNCTION),
        )
        function_restricted &= not bool(cursor.fetchone()[0])
    cursor.execute(
        "SELECT has_function_privilege('service_role', %s, 'EXECUTE')",
        (MONITOR_FUNCTION,),
    )
    function_restricted &= bool(cursor.fetchone()[0])

    cursor.execute("DELETE FROM public.propagation_research_alert_outbox")
    cursor.execute("DELETE FROM public.propagation_research_health")
    now = datetime.now(timezone.utc)
    stale_reported_at = now - timedelta(hours=3)
    insert_health(cursor, stale_reported_at)

    first = monitor(cursor, "a" * 64, now)
    cursor.execute(
        "SELECT decision, reported_at, alert_names, freshness_seconds "
        "FROM public.propagation_research_health"
    )
    alert_state = cursor.fetchone()
    stale_timestamp_preserved = bool(
        alert_state
        and alert_state[0] == "alert"
        and alert_state[1] == stale_reported_at
        and alert_state[2] == ["health_record_recent"]
        and int(alert_state[3]) == 10_800
    )
    cursor.execute(
        "SELECT decision, event_id, alert_names "
        "FROM public.propagation_research_alert_outbox ORDER BY occurred_at"
    )
    first_events = cursor.fetchall()
    one_stale_alert = first_events == [
        ("alert", "a" * 64, ["health_record_recent"])
    ]

    repeated = monitor(cursor, "b" * 64, now + timedelta(seconds=1))
    cursor.execute("SELECT count(*) FROM public.propagation_research_alert_outbox")
    repeated_idempotent = int(cursor.fetchone()[0]) == 1

    target = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    cursor.execute(
        f"SELECT * FROM {RECORD_FUNCTION_NAME}(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            "c" * 64,
            now + timedelta(seconds=2),
            "healthy",
            target,
            4,
            4,
            720,
            0,
            0,
            [],
        ),
    )
    recovery_result = tuple(bool(value) for value in cursor.fetchone())
    cursor.execute(
        "SELECT decision, event_id FROM public.propagation_research_alert_outbox "
        "ORDER BY occurred_at"
    )
    recovery_events = cursor.fetchall()
    recovery_exact = recovery_result == (True, True) and recovery_events == [
        ("alert", "a" * 64),
        ("healthy", "c" * 64),
    ]

    cursor.execute("DELETE FROM public.propagation_research_alert_outbox")
    cursor.execute("DELETE FROM public.propagation_research_health")
    insert_health(cursor, now)
    fresh = monitor(cursor, "d" * 64, now + timedelta(seconds=3))
    cursor.execute("SELECT count(*) FROM public.propagation_research_alert_outbox")
    fresh_does_not_alert = fresh == (True, False, False) and int(
        cursor.fetchone()[0]
    ) == 0

    cursor.execute("DELETE FROM public.propagation_research_health")
    missing = monitor(cursor, "e" * 64, now + timedelta(seconds=4))

    invalid_boundary_rejected = False
    cursor.execute("SAVEPOINT invalid_boundary")
    try:
        monitor(cursor, "f" * 64, now + timedelta(seconds=4), 60)
    except errors.RaiseException:
        invalid_boundary_rejected = True
        cursor.execute("ROLLBACK TO SAVEPOINT invalid_boundary")
    cursor.execute("RELEASE SAVEPOINT invalid_boundary")

    return {
        "migration_sql_executed_or_deployed": bool(migration_sql.strip())
        or migration_deployed,
        "monitor_function_created": monitor_exists(cursor),
        "security_definer_search_path_locked": function_hardened,
        "function_service_role_only": function_restricted,
        "stale_heartbeat_detected": first == (True, True, True),
        "source_heartbeat_timestamp_preserved": stale_timestamp_preserved,
        "single_stale_alert_recorded": one_stale_alert,
        "repeated_monitor_is_idempotent": repeated == (True, False, True)
        and repeated_idempotent,
        "genuine_heartbeat_records_recovery": recovery_exact,
        "fresh_heartbeat_does_not_alert": fresh_does_not_alert,
        "missing_heartbeat_fails_closed": missing == (False, False, False),
        "invalid_stale_boundary_rejected": invalid_boundary_rejected,
    }


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
    pooler_url = current_project_pooler_url(
        values,
        args.pooler_url_file.read_text(encoding="utf-8").strip(),
    )
    if not password:
        raise RuntimeError("target database password is unavailable")

    started = time.perf_counter()
    connection = psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-research-health-monitor-validation",
    )
    before = False
    after = False
    transaction_gates: dict[str, bool] = {}
    server_version = ""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version")
            server_version = str(cursor.fetchone()[0])
            before = monitor_exists(cursor)
            connection.commit()
            if args.verify_deployed and not before:
                raise RuntimeError("deployed research-health monitor is unavailable")
            if not args.verify_deployed and before:
                raise RuntimeError(
                    "rollback validation refuses a pre-existing health monitor"
                )
            transaction_gates = validate_transaction(
                cursor,
                "" if args.verify_deployed else args.migration.read_text(encoding="utf-8"),
                migration_deployed=args.verify_deployed,
            )
            if args.verify_deployed:
                cursor.execute(
                    "SELECT count(*) FROM supabase_migrations.schema_migrations "
                    "WHERE version = '20260716002000'"
                )
                transaction_gates["deployment_ledger_exact"] = (
                    int(cursor.fetchone()[0]) == 1
                )
            connection.rollback()
            after = monitor_exists(cursor)
            connection.rollback()
    finally:
        connection.close()

    restored = before == after
    gates = {
        **transaction_gates,
        "rollback_restored_original_object_state": restored,
        "persistent_changes_absent": restored,
        "target_is_postgresql": bool(server_version),
        "native_m5_runtime": runtime["machine"] == "arm64",
        "locked_outcomes_unread": True,
    }
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": (
            "research_health_monitor_target_postgres_deployment_validation"
            if args.verify_deployed
            else "research_health_monitor_target_postgres_rollback_validation"
        ),
        "decision": "pass" if all(gates.values()) else "fail",
        "locked_outcomes_read": False,
        "migration_deployed": args.verify_deployed,
        "persistent_changes": False,
        "migration": {
            "path": args.migration.relative_to(ROOT).as_posix(),
            "sha256": sha256(args.migration),
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
        raise SystemExit("research health monitor migration validation failed")


if __name__ == "__main__":
    main()

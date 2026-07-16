#!/usr/bin/env python3
"""Rollback-validate the private research-health migration on target Postgres."""

from __future__ import annotations

import argparse
import json
import os
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
    ROOT / "supabase/migrations/20260716001000_propagation_research_health.sql"
)
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/research_health_migration_validation.json"
)
DEFAULT_DEPLOYMENT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/research_health_deployment_validation.json"
)
TABLES = (
    "public.propagation_research_health",
    "public.propagation_research_alert_outbox",
)
FUNCTION = (
    "public.record_propagation_research_health(text,timestamptz,text,"
    "timestamptz,integer,integer,integer,integer,integer,text[])"
)


def object_state(cursor: psycopg.Cursor[Any]) -> dict[str, bool]:
    result: dict[str, bool] = {}
    for table in TABLES:
        cursor.execute("SELECT to_regclass(%s) IS NOT NULL", (table,))
        result[table] = bool(cursor.fetchone()[0])
    cursor.execute("SELECT to_regprocedure(%s) IS NOT NULL", (FUNCTION,))
    result[FUNCTION] = bool(cursor.fetchone()[0])
    return result


def validate_transaction(
    cursor: psycopg.Cursor[Any],
    migration_sql: str,
    *,
    migration_deployed: bool = False,
) -> dict[str, bool]:
    cursor.execute("SET LOCAL statement_timeout = '120s'")
    cursor.execute("SET LOCAL lock_timeout = '10s'")
    if migration_sql.strip():
        cursor.execute(migration_sql)

    cursor.execute("DELETE FROM public.propagation_research_alert_outbox")
    cursor.execute("DELETE FROM public.propagation_research_health")

    relations_created = True
    rls_enabled = True
    public_privileges_revoked = True
    service_privileges_present = True
    for table in TABLES:
        cursor.execute("SELECT to_regclass(%s) IS NOT NULL", (table,))
        relations_created &= bool(cursor.fetchone()[0])
        cursor.execute(
            "SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(%s)",
            (table,),
        )
        rls_enabled &= bool(cursor.fetchone()[0])
        for role in ("anon", "authenticated"):
            cursor.execute(
                "SELECT has_table_privilege(%s, %s, 'SELECT,INSERT,UPDATE,DELETE')",
                (role, table),
            )
            public_privileges_revoked &= not bool(cursor.fetchone()[0])
        cursor.execute(
            "SELECT has_table_privilege('service_role', %s, 'SELECT,INSERT,UPDATE')",
            (table,),
        )
        service_privileges_present &= bool(cursor.fetchone()[0])

    cursor.execute(
        "SELECT prosecdef, coalesce(proconfig, '{}') FROM pg_proc "
        "WHERE oid = to_regprocedure(%s)",
        (FUNCTION,),
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
            (role, FUNCTION),
        )
        function_restricted &= not bool(cursor.fetchone()[0])
    cursor.execute(
        "SELECT has_function_privilege('service_role', %s, 'EXECUTE')",
        (FUNCTION,),
    )
    function_restricted &= bool(cursor.fetchone()[0])

    cursor.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(%s)
        """,
        (["propagation_research_health", "propagation_research_alert_outbox"],),
    )
    columns = {str(row[0]).lower() for row in cursor.fetchall()}
    identity_free_schema = not any(
        marker in column
        for column in columns
        for marker in ("call", "grid", "station", "path", "equipment")
    )

    now = datetime.now(timezone.utc)
    target = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)

    def record(
        *,
        event_id: str,
        reported_at: datetime,
        decision: str,
        alerts: list[str],
    ) -> tuple[bool, bool]:
        cursor.execute(
            f"SELECT * FROM {FUNCTION.split('(')[0]}(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                event_id,
                reported_at,
                decision,
                target,
                2,
                2,
                720,
                0,
                0,
                alerts,
            ),
        )
        accepted, changed = cursor.fetchone()
        return bool(accepted), bool(changed)

    initial = record(
        event_id="a" * 64,
        reported_at=now,
        decision="healthy",
        alerts=[],
    )
    replay = record(
        event_id="b" * 64,
        reported_at=now,
        decision="healthy",
        alerts=[],
    )
    alert = record(
        event_id="c" * 64,
        reported_at=now + timedelta(seconds=1),
        decision="alert",
        alerts=["health_record_recent"],
    )
    recovery = record(
        event_id="d" * 64,
        reported_at=now + timedelta(seconds=2),
        decision="healthy",
        alerts=[],
    )
    cursor.execute(
        "SELECT decision, event_id FROM public.propagation_research_alert_outbox "
        "ORDER BY occurred_at"
    )
    events = cursor.fetchall()
    transition_outbox_exact = events == [
        ("alert", "c" * 64),
        ("healthy", "d" * 64),
    ]
    cursor.execute(
        "SELECT decision, completed_hours, required_hours, alert_names "
        "FROM public.propagation_research_health"
    )
    stored = cursor.fetchone()
    latest_aggregate_exact = stored == ("healthy", 2, 720, [])

    invalid_counter_rejected = False
    cursor.execute("SAVEPOINT invalid_counter")
    try:
        cursor.execute(
            f"SELECT * FROM {FUNCTION.split('(')[0]}(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                "e" * 64,
                now + timedelta(seconds=3),
                "healthy",
                target,
                3,
                2,
                720,
                0,
                0,
                [],
            ),
        )
    except errors.RaiseException:
        invalid_counter_rejected = True
        cursor.execute("ROLLBACK TO SAVEPOINT invalid_counter")
    cursor.execute("RELEASE SAVEPOINT invalid_counter")

    return {
        "migration_sql_executed_or_deployed": bool(migration_sql.strip())
        or migration_deployed,
        "private_relations_created": relations_created,
        "row_level_security_enabled": rls_enabled,
        "browser_privileges_revoked": public_privileges_revoked,
        "service_role_privileges_present": service_privileges_present,
        "security_definer_search_path_locked": function_hardened,
        "function_service_role_only": function_restricted,
        "identity_free_schema": identity_free_schema,
        "initial_healthy_does_not_alert": initial == (True, True),
        "equal_timestamp_replay_rejected": replay == (False, False),
        "alert_transition_recorded": alert == (True, True),
        "recovery_transition_recorded": recovery == (True, True),
        "transition_outbox_exact": transition_outbox_exact,
        "latest_aggregate_exact": latest_aggregate_exact,
        "invalid_counter_rejected": invalid_counter_rejected,
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
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    runtime = validate_m5_runtime(config)
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
        application_name="propulse-research-health-rollback-validation",
    )
    before: dict[str, bool] = {}
    after: dict[str, bool] = {}
    transaction_gates: dict[str, bool] = {}
    server_version = ""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version")
            server_version = str(cursor.fetchone()[0])
            before = object_state(cursor)
            connection.commit()
            if args.verify_deployed and not all(before.values()):
                raise RuntimeError("deployed research-health objects are incomplete")
            if not args.verify_deployed and any(before.values()):
                raise RuntimeError(
                    "rollback validation refuses pre-existing research-health objects"
                )
            transaction_gates = validate_transaction(
                cursor,
                "" if args.verify_deployed else args.migration.read_text(encoding="utf-8"),
                migration_deployed=args.verify_deployed,
            )
            if args.verify_deployed:
                cursor.execute(
                    "SELECT count(*) FROM supabase_migrations.schema_migrations "
                    "WHERE version = '20260716001000'"
                )
                transaction_gates["deployment_ledger_exact"] = (
                    int(cursor.fetchone()[0]) == 1
                )
            connection.rollback()
            after = object_state(cursor)
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
            "research_health_target_postgres_deployment_validation"
            if args.verify_deployed
            else "research_health_target_postgres_rollback_validation"
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
        "compute": {
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
        raise SystemExit("research health migration validation failed")


if __name__ == "__main__":
    main()

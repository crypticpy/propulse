#!/usr/bin/env python3
"""Rollback-validate research-health invariants and leased alert delivery."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

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
    / "supabase/migrations/20260716012000_research_health_hardening.sql"
)
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_OUTPUT = RESULT / "research_health_hardening_migration_validation.json"
DEFAULT_DEPLOYMENT_OUTPUT = (
    RESULT / "research_health_hardening_deployment_validation.json"
)
RECORD_FUNCTION = "public.record_propagation_research_health"
CLAIM_FUNCTION = (
    "public.claim_propagation_research_alerts(integer,integer,integer,uuid)"
)
COMPLETE_FUNCTION = (
    "public.complete_propagation_research_alert_attempt(text,uuid,timestamptz,text)"
)


def rolled_back_error(
    cursor: psycopg.Cursor[Any],
    savepoint: str,
    operation: Callable[[], None],
    expected: tuple[type[Exception], ...],
) -> bool:
    cursor.execute(f"SAVEPOINT {savepoint}")
    rejected = False
    try:
        operation()
    except expected:
        rejected = True
        cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
    cursor.execute(f"RELEASE SAVEPOINT {savepoint}")
    return rejected


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

    functions_hardened = True
    functions_restricted = True
    for function in (CLAIM_FUNCTION, COMPLETE_FUNCTION):
        cursor.execute(
            "SELECT prosecdef, coalesce(proconfig, '{}') FROM pg_proc "
            "WHERE oid = to_regprocedure(%s)",
            (function,),
        )
        row = cursor.fetchone()
        functions_hardened &= bool(row and row[0]) and any(
            str(value).replace(" ", "") in ("search_path=", 'search_path=""')
            for value in row[1]
        )
        for role in ("anon", "authenticated"):
            cursor.execute(
                "SELECT has_function_privilege(%s, %s, 'EXECUTE')",
                (role, function),
            )
            functions_restricted &= not bool(cursor.fetchone()[0])
        cursor.execute(
            "SELECT has_function_privilege('service_role', %s, 'EXECUTE')",
            (function,),
        )
        functions_restricted &= bool(cursor.fetchone()[0])

    cursor.execute("DELETE FROM public.propagation_research_alert_outbox")
    cursor.execute("DELETE FROM public.propagation_research_health")
    now = datetime.now(timezone.utc)
    target = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)

    def record(
        event_id: str,
        reported_at: datetime,
        decision: str,
        alerts: list[str],
        *,
        completed: int = 2,
    ) -> tuple[bool, bool]:
        cursor.execute(
            f"SELECT * FROM {RECORD_FUNCTION}(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                event_id,
                reported_at,
                decision,
                target,
                min(completed, 2),
                completed,
                720,
                0,
                0,
                alerts,
            ),
        )
        return tuple(bool(value) for value in cursor.fetchone())

    initial_alert = record("a" * 64, now, "alert", ["health_record_recent"])

    collision_rejected = rolled_back_error(
        cursor,
        "event_collision",
        lambda: record("a" * 64, now + timedelta(seconds=1), "healthy", []),
        (errors.UniqueViolation,),
    )
    cursor.execute("SELECT decision FROM public.propagation_research_health")
    collision_rolls_back_state = cursor.fetchone() == ("alert",)

    duplicate_alert_rejected = rolled_back_error(
        cursor,
        "duplicate_alert",
        lambda: record(
            "b" * 64,
            now + timedelta(seconds=1),
            "alert",
            ["health_record_recent", "health_record_recent"],
        ),
        (errors.RaiseException,),
    )
    unsupported_alert_rejected = rolled_back_error(
        cursor,
        "unsupported_alert",
        lambda: record(
            "c" * 64,
            now + timedelta(seconds=1),
            "alert",
            ["station_identity"],
        ),
        (errors.RaiseException,),
    )
    upper_counter_rejected = rolled_back_error(
        cursor,
        "upper_counter",
        lambda: record(
            "d" * 64,
            now + timedelta(seconds=1),
            "healthy",
            [],
            completed=100_001,
        ),
        (errors.RaiseException,),
    )

    direct_alert_rejected = rolled_back_error(
        cursor,
        "direct_alert",
        lambda: cursor.execute(
            "INSERT INTO public.propagation_research_alert_outbox "
            "(event_id, decision, alert_names, occurred_at) "
            "VALUES (%s, 'alert', %s, %s)",
            ("e" * 64, ["station_identity"], now),
        ),
        (errors.CheckViolation,),
    )
    direct_counter_rejected = rolled_back_error(
        cursor,
        "direct_counter",
        lambda: cursor.execute(
            "UPDATE public.propagation_research_health "
            "SET completed_hours = 100001"
        ),
        (errors.CheckViolation,),
    )

    first_token = uuid4()
    second_token = uuid4()
    cursor.execute(
        "SELECT * FROM public.claim_propagation_research_alerts(%s,%s,%s,%s)",
        (5, 8, 30, first_token),
    )
    first_claim = cursor.fetchall()
    cursor.execute(
        "SELECT * FROM public.claim_propagation_research_alerts(%s,%s,%s,%s)",
        (5, 8, 30, second_token),
    )
    second_claim = cursor.fetchall()
    lease_claim_exact = (
        len(first_claim) == 1
        and first_claim[0][0] == "a" * 64
        and second_claim == []
    )
    cursor.execute(
        "SELECT public.complete_propagation_research_alert_attempt(%s,%s,%s,%s)",
        ("a" * 64, second_token, now, None),
    )
    stale_token_rejected = cursor.fetchone() == (False,)
    cursor.execute(
        "SELECT public.complete_propagation_research_alert_attempt(%s,%s,%s,%s)",
        ("a" * 64, first_token, now, None),
    )
    success_completed = cursor.fetchone() == (True,)
    cursor.execute(
        "SELECT attempts, delivered_at IS NOT NULL, lease_token IS NULL, "
        "lease_expires_at IS NULL, last_error "
        "FROM public.propagation_research_alert_outbox WHERE event_id = %s",
        ("a" * 64,),
    )
    success_state_exact = cursor.fetchone() == (1, True, True, True, None)

    recovery = record("f" * 64, now + timedelta(seconds=2), "healthy", [])
    failure_token = uuid4()
    cursor.execute(
        "SELECT * FROM public.claim_propagation_research_alerts(%s,%s,%s,%s)",
        (5, 8, 30, failure_token),
    )
    failure_claim = cursor.fetchall()
    cursor.execute(
        "SELECT public.complete_propagation_research_alert_attempt(%s,%s,%s,%s)",
        ("f" * 64, failure_token, None, "webhook timed out"),
    )
    failure_completed = cursor.fetchone() == (True,)
    cursor.execute(
        "SELECT attempts, delivered_at, lease_token, lease_expires_at, last_error "
        "FROM public.propagation_research_alert_outbox WHERE event_id = %s",
        ("f" * 64,),
    )
    failure_state_exact = cursor.fetchone() == (
        1,
        None,
        None,
        None,
        "webhook timed out",
    )
    retry_token = uuid4()
    cursor.execute(
        "SELECT event_id FROM public.claim_propagation_research_alerts(%s,%s,%s,%s)",
        (5, 8, 30, retry_token),
    )
    failure_is_retryable = cursor.fetchall() == [("f" * 64,)]

    return {
        "migration_sql_executed_or_deployed": bool(migration_sql.strip())
        or migration_deployed,
        "security_definer_search_paths_locked": functions_hardened,
        "claim_and_complete_service_role_only": functions_restricted,
        "initial_alert_recorded": initial_alert == (True, True),
        "event_id_collision_rejected": collision_rejected,
        "collision_rolls_back_health_state": collision_rolls_back_state,
        "duplicate_alert_name_rejected": duplicate_alert_rejected,
        "unsupported_alert_name_rejected": unsupported_alert_rejected,
        "upper_counter_rejected": upper_counter_rejected,
        "direct_invalid_alert_rejected": direct_alert_rejected,
        "direct_counter_overflow_rejected": direct_counter_rejected,
        "single_active_lease_enforced": bool(lease_claim_exact),
        "stale_lease_token_rejected": stale_token_rejected,
        "success_completion_exact": success_completed and success_state_exact,
        "recovery_transition_recorded": recovery == (True, True),
        "failure_claim_exact": (
            len(failure_claim) == 1 and failure_claim[0][0] == "f" * 64
        ),
        "failure_completion_exact": failure_completed and failure_state_exact,
        "failed_delivery_remains_retryable": failure_is_retryable,
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
        application_name="propulse-research-health-hardening-validation",
    )
    gates: dict[str, bool] = {}
    server_version = ""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version")
            server_version = str(cursor.fetchone()[0])
            gates = validate_transaction(
                cursor,
                "" if args.verify_deployed else args.migration.read_text(),
                migration_deployed=args.verify_deployed,
            )
            if args.verify_deployed:
                cursor.execute(
                    "SELECT count(*) FROM supabase_migrations.schema_migrations "
                    "WHERE version = '20260716012000'"
                )
                gates["deployment_ledger_exact"] = int(cursor.fetchone()[0]) == 1
            connection.rollback()
    finally:
        connection.close()

    artifact = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "research_only": True,
        "migration": {
            "path": str(args.migration.relative_to(ROOT)),
            "sha256": sha256(args.migration),
            "deployed": args.verify_deployed,
            "server_version": server_version,
        },
        "runtime": runtime,
        "elapsed_seconds": round(time.perf_counter() - started, 6),
        "gates": gates,
        "passed": all(gates.values()),
        "privacy": {
            "station_identity_read": False,
            "locked_outcomes_read": False,
            "secret_values_written": False,
        },
    }
    atomic_write(args.output, artifact)
    print(json.dumps(artifact, indent=2, sort_keys=True))
    if not artifact["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

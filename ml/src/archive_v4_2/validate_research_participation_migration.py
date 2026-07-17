#!/usr/bin/env python3
"""Rollback-validate or verify the opt-in research participation boundary."""

from __future__ import annotations

import argparse
import json
import platform
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


MIGRATION = (
    ROOT
    / "supabase/migrations/20260716003000_propagation_research_participation.sql"
)
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_OUTPUT = RESULT / "research_participation_migration_validation.json"
DEFAULT_DEPLOYMENT_OUTPUT = (
    RESULT / "research_participation_deployment_validation.json"
)
TABLES = (
    "public.propagation_attempts",
    "public.propagation_outcomes",
    "public.ml_research_consents",
)
EXPECTED_POLICIES = {
    ("propagation_attempts", "propagation_attempts_own_read", "SELECT"),
    ("propagation_attempts", "propagation_attempts_own_delete", "DELETE"),
    ("propagation_outcomes", "propagation_outcomes_own_read", "SELECT"),
    ("propagation_outcomes", "propagation_outcomes_own_delete", "DELETE"),
    ("ml_research_consents", "ml_research_consents_own_read", "SELECT"),
}


def boundary_state(cursor: psycopg.Cursor[Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = 'ml_research_consents' "
        "AND column_name = 'retention_acknowledged_at')"
    )
    retention_column = bool(cursor.fetchone()[0])
    cursor.execute(
        "SELECT coalesce(pg_get_constraintdef(oid), '') FROM pg_constraint "
        "WHERE conname = 'ml_research_consents_allowed_uses_check'"
    )
    constraint_row = cursor.fetchone()
    cursor.execute(
        "SELECT coalesce(pg_get_indexdef(indexrelid), '') FROM pg_index "
        "WHERE indexrelid = to_regclass('public.propagation_attempts_prediction_once_idx')"
    )
    index_row = cursor.fetchone()
    cursor.execute(
        "SELECT tablename, policyname, cmd FROM pg_policies "
        "WHERE schemaname = 'public' AND tablename = ANY(%s) "
        "ORDER BY tablename, policyname",
        ([table.split(".", 1)[1] for table in TABLES],),
    )
    policies = [tuple(str(value) for value in row) for row in cursor.fetchall()]
    privileges = {}
    for table in TABLES:
        for role in ("anon", "authenticated", "service_role"):
            for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                cursor.execute(
                    "SELECT has_table_privilege(%s, %s, %s)",
                    (role, table, privilege),
                )
                privileges[f"{table}:{role}:{privilege}"] = bool(
                    cursor.fetchone()[0]
                )
    return {
        "retention_column": retention_column,
        "allowed_uses_constraint": str(constraint_row[0]) if constraint_row else "",
        "attempt_prediction_index": str(index_row[0]) if index_row else "",
        "policies": policies,
        "privileges": privileges,
    }


def validate_boundary(cursor: psycopg.Cursor[Any]) -> dict[str, bool]:
    state = boundary_state(cursor)
    constraint = state["allowed_uses_constraint"].lower()
    index = state["attempt_prediction_index"].lower()
    policy_set = {tuple(row) for row in state["policies"]}
    no_write = all(
        not state["privileges"][f"{table}:{role}:{privilege}"]
        for table in TABLES
        for role in ("anon", "authenticated")
        for privilege in ("INSERT", "UPDATE")
    )
    service_authoritative = all(
        state["privileges"][f"{table}:service_role:{privilege}"]
        for table in TABLES
        for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE")
    )
    cursor.execute(
        "SELECT bool_and(relrowsecurity) FROM pg_class "
        "WHERE oid = ANY(ARRAY[to_regclass('public.propagation_attempts'), "
        "to_regclass('public.propagation_outcomes'), "
        "to_regclass('public.ml_research_consents')])"
    )
    rls_enabled = bool(cursor.fetchone()[0])
    cursor.execute(
        "SELECT convalidated FROM pg_constraint "
        "WHERE conname = 'ml_research_consents_allowed_uses_check'"
    )
    constraint_row = cursor.fetchone()
    return {
        "retention_acknowledgement_column_present": state["retention_column"],
        "allowed_uses_constraint_validated": bool(constraint_row and constraint_row[0]),
        "allowed_uses_are_strictly_enumerated": all(
            value in constraint
            for value in (
                "anonymous_quality_metrics",
                "derived_equipment_training",
                "attempt_outcome_training",
                "research_follow_up",
            )
        ),
        "one_attempt_per_signed_prediction": (
            "create unique index" in index
            and "user_id, prediction_id" in index
            and "prediction_id is not null" in index
        ),
        "exact_user_read_delete_policies_present": EXPECTED_POLICIES <= policy_set,
        "browser_insert_update_revoked": no_write,
        "service_role_write_boundary_present": service_authoritative,
        "research_tables_rls_enabled": rls_enabled,
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
        application_name="propulse-research-participation-validation",
    )
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    gates: dict[str, bool] = {}
    server_version = ""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version")
            server_version = str(cursor.fetchone()[0])
            before = boundary_state(cursor)
            connection.commit()
            if not args.verify_deployed and before["retention_column"]:
                raise RuntimeError(
                    "rollback validation refuses an already deployed participation boundary"
                )
            cursor.execute("SET LOCAL statement_timeout = '120s'")
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            if not args.verify_deployed:
                cursor.execute(args.migration.read_text(encoding="utf-8"))
            gates = validate_boundary(cursor)
            if args.verify_deployed:
                cursor.execute(
                    "SELECT count(*) FROM supabase_migrations.schema_migrations "
                    "WHERE version = '20260716003000'"
                )
                gates["deployment_ledger_exact"] = int(cursor.fetchone()[0]) == 1
            connection.rollback()
            after = boundary_state(cursor)
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
            "research_participation_target_postgres_deployment_validation"
            if args.verify_deployed
            else "research_participation_target_postgres_rollback_validation"
        ),
        "decision": "pass" if all(gates.values()) else "fail",
        "migration_deployed": args.verify_deployed,
        "locked_outcomes_read": False,
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
        raise SystemExit("research participation migration validation failed")


if __name__ == "__main__":
    main()

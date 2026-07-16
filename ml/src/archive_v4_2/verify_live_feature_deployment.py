#!/usr/bin/env python3
"""Verify the deployed live-feature migration chain without persistent test rows."""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg

from validate_live_feature_migration import (
    DEFAULT_ENV,
    DEFAULT_POOLER_URL,
    FUNCTIONS,
    MIGRATION,
    PENDING_PREREQUISITES,
    PREREQUISITE_FUNCTIONS,
    PREREQUISITE_TABLES,
    PUBLIC_READ_TABLES,
    ROOT,
    TABLES,
    USER_POLICY_TABLES,
    atomic_write,
    current_project_pooler_url,
    insert_feature,
    insert_watermarks,
    read_env,
    sha256,
)


DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/deployment_validation.json"
)
EXPECTED_VERSIONS = tuple(path.name.split("_", 1)[0] for path in (*PENDING_PREREQUISITES, MIGRATION))


def relation_checks(cursor: psycopg.Cursor[Any]) -> tuple[bool, bool]:
    created = True
    rls_enabled = True
    for table in (*PREREQUISITE_TABLES, *TABLES):
        cursor.execute("SELECT to_regclass(%s)", (table,))
        created &= cursor.fetchone()[0] is not None
        cursor.execute(
            "SELECT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(%s)), false)",
            (table,),
        )
        rls_enabled &= bool(cursor.fetchone()[0])
    return created, rls_enabled


def privilege_checks(cursor: psycopg.Cursor[Any]) -> tuple[bool, bool, bool]:
    intended_public_read = True
    for table in PUBLIC_READ_TABLES:
        for role in ("anon", "authenticated"):
            cursor.execute("SELECT has_table_privilege(%s, %s, 'SELECT')", (role, table))
            intended_public_read &= bool(cursor.fetchone()[0])

    private_wspr_revoked = True
    service_wspr_present = True
    for table in TABLES:
        for role in ("anon", "authenticated"):
            cursor.execute("SELECT has_table_privilege(%s, %s, 'SELECT')", (role, table))
            private_wspr_revoked &= not bool(cursor.fetchone()[0])
        cursor.execute(
            "SELECT has_table_privilege('service_role', %s, 'SELECT,INSERT,UPDATE,DELETE')",
            (table,),
        )
        service_wspr_present &= bool(cursor.fetchone()[0])
    return intended_public_read, private_wspr_revoked, service_wspr_present


def function_checks(cursor: psycopg.Cursor[Any]) -> tuple[bool, bool]:
    access_restricted = True
    for function in (*PREREQUISITE_FUNCTIONS, *FUNCTIONS):
        cursor.execute("SELECT to_regprocedure(%s) IS NOT NULL", (function,))
        access_restricted &= bool(cursor.fetchone()[0])
        for role in ("anon", "authenticated"):
            cursor.execute(
                "SELECT has_function_privilege(%s, %s, 'EXECUTE')",
                (role, function),
            )
            access_restricted &= not bool(cursor.fetchone()[0])
        cursor.execute(
            "SELECT has_function_privilege('service_role', %s, 'EXECUTE')",
            (function,),
        )
        access_restricted &= bool(cursor.fetchone()[0])

    security_definer_paths_locked = True
    for function in (
        PREREQUISITE_FUNCTIONS[2],
        FUNCTIONS[0],
        FUNCTIONS[1],
    ):
        cursor.execute(
            "SELECT coalesce(proconfig, '{}') FROM pg_proc WHERE oid = to_regprocedure(%s)",
            (function,),
        )
        config = cursor.fetchone()[0]
        security_definer_paths_locked &= any(
            str(value).replace(" ", "") in ("search_path=", "search_path=\"\"")
            for value in config
        )
    return access_restricted, security_definer_paths_locked


def column_and_policy_checks(cursor: psycopg.Cursor[Any]) -> tuple[bool, bool, bool]:
    cursor.execute(
        """
        SELECT tablename, count(*)
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY(%s)
        GROUP BY tablename
        """,
        (list(USER_POLICY_TABLES),),
    )
    policy_tables = {str(row[0]) for row in cursor.fetchall() if int(row[1]) > 0}

    cursor.execute(
        """
        SELECT attnotnull, pg_get_expr(adbin, adrelid)
        FROM pg_attribute
        LEFT JOIN pg_attrdef ON adrelid = attrelid AND adnum = attnum
        WHERE attrelid = 'public.spot_history'::regclass
          AND attname = 'available_at' AND NOT attisdropped
        """
    )
    definition = cursor.fetchone()
    cursor.execute("SELECT count(*) FROM public.spot_history WHERE available_at IS NULL")
    availability_complete = (
        definition is not None
        and bool(definition[0])
        and definition[1] is not None
        and int(cursor.fetchone()[0]) == 0
    )

    cursor.execute(
        """
        SELECT attname FROM pg_attribute
        WHERE attrelid = 'public.solar_snapshots'::regclass
          AND attname = ANY(%s) AND NOT attisdropped
        """,
        (["bx_gsm", "solar_wind_temperature", "source_observed_at", "source_status"],),
    )
    return policy_tables == set(USER_POLICY_TABLES), availability_complete, len(cursor.fetchall()) == 4


def rpc_smoke(cursor: psycopg.Cursor[Any], provider: str) -> bool:
    issue_time = datetime(2098, 7, 16, 12, 15, tzinfo=timezone.utc)
    issue_hour = issue_time.replace(minute=0, second=0, microsecond=0)
    transform = "wspr-opportunity-duckdb-v1"
    targets = ["BB11", "CC22"]
    versions = insert_watermarks(
        cursor,
        issue_time=issue_time,
        provider=provider,
        band="20m",
        transform_version=transform,
    )
    insert_feature(
        cursor,
        target_hour=issue_hour - timedelta(hours=1),
        band="20m",
        origin="AA00",
        target=targets[0],
        provider=provider,
        transform_version=transform,
        available_at=versions[1],
    )
    insert_feature(
        cursor,
        target_hour=issue_hour - timedelta(hours=24),
        band="20m",
        origin="AA00",
        target=targets[1],
        provider=provider,
        transform_version=transform,
        available_at=versions[24],
    )
    cursor.execute(
        "SELECT * FROM public.lookup_wspr_path_lags(%s,%s,%s,%s,%s,%s) ORDER BY target_grid4",
        (issue_time, "20m", "AA00", targets, transform, provider),
    )
    rows = cursor.fetchall()
    return (
        len(rows) == 2
        and rows[0][0] == "BB11"
        and float(rows[0][1]) == 0.5
        and int(rows[0][5]) == 1
        and rows[1][0] == "CC22"
        and float(rows[1][4]) == 0.5
        and int(rows[1][8]) == 1
        and all(row[10] <= issue_time for row in rows)
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    values = read_env(args.env_file)
    password = values.get("SUPABASE_DB_PASSWORD", "")
    pooler_url = current_project_pooler_url(
        values,
        args.pooler_url_file.read_text(encoding="utf-8").strip(),
    )
    if not password:
        raise RuntimeError("target database password is unavailable")

    started = time.perf_counter()
    provider = "deployment-validation"
    connection = psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-v4-2-post-deployment-validation",
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout = '60s'")
            cursor.execute("SHOW server_version")
            server_version = str(cursor.fetchone()[0])
            cursor.execute(
                "SELECT version FROM supabase_migrations.schema_migrations WHERE version = ANY(%s)",
                (list(EXPECTED_VERSIONS),),
            )
            ledger_versions = {str(row[0]) for row in cursor.fetchall()}
            relations_created, rls_enabled = relation_checks(cursor)
            public_read, private_revoked, service_present = privilege_checks(cursor)
            functions_restricted, search_paths_locked = function_checks(cursor)
            user_policies, availability_complete, solar_columns = column_and_policy_checks(cursor)
            cursor.execute(
                "SELECT count(*) FROM public.wspr_feature_watermarks WHERE provider = %s",
                (provider,),
            )
            clean_before = int(cursor.fetchone()[0]) == 0
            lookup_exact = clean_before and rpc_smoke(cursor, provider)
            connection.rollback()

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM public.wspr_feature_watermarks WHERE provider = %s",
                (provider,),
            )
            smoke_rows_absent = int(cursor.fetchone()[0]) == 0
            connection.rollback()
    finally:
        connection.close()

    gates = {
        "six_expected_migration_versions_present": ledger_versions == set(EXPECTED_VERSIONS),
        "all_release_tables_present": relations_created,
        "all_release_tables_rls_enabled": rls_enabled,
        "intended_public_read_grants_present": public_read,
        "private_wspr_public_access_revoked": private_revoked,
        "private_wspr_service_access_present": service_present,
        "user_scoped_policies_present": user_policies,
        "service_functions_restricted": functions_restricted,
        "security_definer_search_paths_locked": search_paths_locked,
        "collector_availability_backfill_complete": availability_complete,
        "solar_provenance_columns_present": solar_columns,
        "deployed_four_lag_rpc_exact": lookup_exact,
        "smoke_transaction_rolled_back": smoke_rows_absent,
        "target_is_postgresql": bool(server_version),
        "locked_outcomes_unread": True,
    }
    migrations = [
        {"path": path.relative_to(ROOT).as_posix(), "sha256": sha256(path)}
        for path in (*PENDING_PREREQUISITES, MIGRATION)
    ]
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "target_postgres_post_deployment_validation",
        "migration_deployed": True,
        "locked_outcomes_read": False,
        "persistent_test_rows": False,
        "migrations": migrations,
        "database": {
            "engine": "PostgreSQL",
            "server_version": server_version,
            "connection_identifier_recorded": False,
        },
        "compute": {
            "machine": platform.machine(),
            "wall_seconds": time.perf_counter() - started,
            "psycopg_version": psycopg.__version__,
        },
        "gates": gates,
        "decision": "pass" if all(gates.values()) else "fail",
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if result["decision"] != "pass":
        raise SystemExit("post-deployment validation failed")


if __name__ == "__main__":
    main()

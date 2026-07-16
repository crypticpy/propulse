#!/usr/bin/env python3
"""Execute the live-feature migration against target Postgres and roll it back."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import errors


ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "supabase/migrations/20260716000000_wspr_live_feature_store.sql"
PENDING_PREREQUISITES = tuple(
    ROOT / "supabase/migrations" / name
    for name in (
        "20260711000000_path_hourly_stats.sql",
        "20260712000000_space_weather_forecasts.sql",
        "20260712001000_propagation_v4_product.sql",
        "20260712002000_collector_availability.sql",
        "20260715000000_solar_snapshot_provenance.sql",
    )
)
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/migration_validation.json"
)
DEFAULT_ENV = ROOT / ".env.local"
DEFAULT_POOLER_URL = ROOT / "supabase/.temp/pooler-url"
TABLES = (
    "public.wspr_observations_rolling",
    "public.wspr_path_hourly_features",
    "public.wspr_feature_watermarks",
)
FUNCTIONS = (
    "public.lookup_wspr_path_lags(timestamptz,text,text,text[],text,text)",
    "public.prune_wspr_observations(interval)",
)
PREREQUISITE_TABLES = (
    "public.path_hourly_stats",
    "public.callsign_fields",
    "public.space_weather_forecast_payloads",
    "public.space_weather_forecast_values",
    "public.propagation_model_versions",
    "public.propagation_feature_issuances",
    "public.propagation_surface_cache",
    "public.propagation_predictions",
    "public.propagation_attempts",
    "public.propagation_outcomes",
    "public.ml_research_consents",
    "public.collector_source_status",
    "public.collector_outages",
)
PUBLIC_READ_TABLES = (
    "public.path_hourly_stats",
    "public.callsign_fields",
    "public.space_weather_forecast_payloads",
    "public.space_weather_forecast_values",
    "public.propagation_model_versions",
    "public.propagation_feature_issuances",
    "public.collector_source_status",
    "public.collector_outages",
)
USER_POLICY_TABLES = (
    "propagation_surface_cache",
    "propagation_predictions",
    "propagation_attempts",
    "propagation_outcomes",
    "ml_research_consents",
)
PREREQUISITE_FUNCTIONS = (
    "public.refresh_callsign_fields(interval)",
    "public.compute_path_hourly_stats(timestamptz)",
    "public.record_collector_source_status(text,text,integer,integer,text)",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip("\"").strip("'")
    return values


def current_project_pooler_url(values: dict[str, str], cached_url: str) -> str:
    project_url = urlsplit(values.get("VITE_SUPABASE_URL", ""))
    project_ref = (project_url.hostname or "").split(".")[0]
    pooler = urlsplit(cached_url)
    if (
        len(project_ref) != 20
        or not pooler.hostname
        or not pooler.hostname.endswith(".pooler.supabase.com")
        or not pooler.path
    ):
        raise RuntimeError("Supabase project or regional pooler metadata is invalid")
    username = f"postgres.{project_ref}"
    netloc = f"{username}@{pooler.hostname}:{pooler.port or 5432}"
    return urlunsplit(("postgresql", netloc, pooler.path, "", ""))


def definition_hash(cursor: psycopg.Cursor[Any], function: str) -> str | None:
    cursor.execute(
        "SELECT pg_get_functiondef(to_regprocedure(%s))",
        (function,),
    )
    value = cursor.fetchone()[0]
    return hashlib.sha256(value.encode()).hexdigest() if value else None


def object_state(cursor: psycopg.Cursor[Any]) -> dict[str, Any]:
    tables = {}
    for table in TABLES:
        cursor.execute("SELECT to_regclass(%s) IS NOT NULL", (table,))
        exists = bool(cursor.fetchone()[0])
        row_count = None
        if exists:
            cursor.execute(f"SELECT count(*) FROM {table}")
            row_count = int(cursor.fetchone()[0])
        tables[table] = {"exists": exists, "row_count": row_count}
    functions = {}
    for function in FUNCTIONS:
        cursor.execute("SELECT to_regprocedure(%s) IS NOT NULL", (function,))
        exists = bool(cursor.fetchone()[0])
        functions[function] = {
            "exists": exists,
            "definition_sha256": definition_hash(cursor, function) if exists else None,
        }
    return {"tables": tables, "functions": functions}


def insert_watermarks(
    cursor: psycopg.Cursor[Any],
    *,
    issue_time: datetime,
    provider: str,
    band: str,
    transform_version: str,
) -> dict[int, datetime]:
    versions = {}
    issue_hour = issue_time.replace(minute=0, second=0, microsecond=0)
    for lag in (1, 2, 3, 24):
        target_hour = issue_hour - timedelta(hours=lag)
        available_at = target_hour + timedelta(hours=1, minutes=1)
        versions[lag] = available_at
        cursor.execute(
            """
            INSERT INTO public.wspr_feature_watermarks (
              target_hour, band, provider, transform_version, status,
              source_watermark, available_at, observation_count,
              feature_cell_count, quality_flags
            ) VALUES (%s, %s, %s, %s, 'complete', %s, %s, 10, 1, '{}')
            """,
            (
                target_hour,
                band,
                provider,
                transform_version,
                target_hour + timedelta(hours=1),
                available_at,
            ),
        )
    return versions


def insert_feature(
    cursor: psycopg.Cursor[Any],
    *,
    target_hour: datetime,
    band: str,
    origin: str,
    target: str,
    provider: str,
    transform_version: str,
    available_at: datetime,
) -> None:
    cursor.execute(
        """
        INSERT INTO public.wspr_path_hourly_features (
          target_hour, band, tx_grid4, rx_grid4, successes, opportunities,
          success_rate, sampled_rows, positive_rows, available_at,
          source_watermark, provider, transform_version, quality_flags
        ) VALUES (%s, %s, %s, %s, 1, 2, 0.5, 2, 1, %s, %s, %s, %s, '{}')
        """,
        (
            target_hour,
            band,
            origin,
            target,
            available_at,
            target_hour + timedelta(hours=1),
            provider,
            transform_version,
        ),
    )


def validate_transaction(
    cursor: psycopg.Cursor[Any],
    migration_sql: str,
    *,
    prerequisite_sql: tuple[str, ...] = (),
) -> dict[str, bool]:
    cursor.execute("SET LOCAL statement_timeout = '300s'")
    cursor.execute("SET LOCAL lock_timeout = '10s'")
    for sql in prerequisite_sql:
        cursor.execute(sql)
    prerequisites_executed = True
    cursor.execute(migration_sql)
    migration_executed = True

    prerequisite_tables_created = True
    prerequisite_rls_enabled = True
    for table in PREREQUISITE_TABLES:
        cursor.execute("SELECT to_regclass(%s)", (table,))
        oid = cursor.fetchone()[0]
        prerequisite_tables_created &= oid is not None
        cursor.execute(
            "SELECT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(%s)), false)",
            (table,),
        )
        prerequisite_rls_enabled &= bool(cursor.fetchone()[0])

    prerequisite_public_read_grants = True
    for table in PUBLIC_READ_TABLES:
        for role in ("anon", "authenticated"):
            cursor.execute("SELECT has_table_privilege(%s, %s, 'SELECT')", (role, table))
            prerequisite_public_read_grants &= bool(cursor.fetchone()[0])

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
    prerequisite_user_policies_present = policy_tables == set(USER_POLICY_TABLES)

    prerequisite_functions_restricted = True
    for function in PREREQUISITE_FUNCTIONS:
        cursor.execute("SELECT to_regprocedure(%s) IS NOT NULL", (function,))
        prerequisite_functions_restricted &= bool(cursor.fetchone()[0])
        for role in ("anon", "authenticated"):
            cursor.execute(
                "SELECT has_function_privilege(%s, %s, 'EXECUTE')",
                (role, function),
            )
            prerequisite_functions_restricted &= not bool(cursor.fetchone()[0])
        cursor.execute(
            "SELECT has_function_privilege('service_role', %s, 'EXECUTE')",
            (function,),
        )
        prerequisite_functions_restricted &= bool(cursor.fetchone()[0])

    cursor.execute(
        """
        SELECT attnotnull, pg_get_expr(adbin, adrelid)
        FROM pg_attribute
        LEFT JOIN pg_attrdef
          ON adrelid = attrelid AND adnum = attnum
        WHERE attrelid = 'public.spot_history'::regclass
          AND attname = 'available_at'
          AND NOT attisdropped
        """
    )
    available_at_definition = cursor.fetchone()
    cursor.execute("SELECT count(*) FROM public.spot_history WHERE available_at IS NULL")
    collector_availability_backfill_complete = (
        available_at_definition is not None
        and bool(available_at_definition[0])
        and available_at_definition[1] is not None
        and int(cursor.fetchone()[0]) == 0
    )

    cursor.execute(
        """
        SELECT attname
        FROM pg_attribute
        WHERE attrelid = 'public.solar_snapshots'::regclass
          AND attname = ANY(%s)
          AND NOT attisdropped
        """,
        (["bx_gsm", "solar_wind_temperature", "source_observed_at", "source_status"],),
    )
    solar_provenance_columns_present = len(cursor.fetchall()) == 4

    table_checks = {}
    for table in TABLES:
        cursor.execute("SELECT to_regclass(%s) IS NOT NULL", (table,))
        table_checks[table] = bool(cursor.fetchone()[0])
    cursor.execute(
        """
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = ANY(ARRAY[
          to_regclass('public.wspr_observations_rolling'),
          to_regclass('public.wspr_path_hourly_features'),
          to_regclass('public.wspr_feature_watermarks')
        ])
        """
    )
    rls_enabled = all(bool(row[0]) for row in cursor.fetchall())
    public_privileges_revoked = True
    service_privileges_present = True
    for table in TABLES:
        for role in ("anon", "authenticated"):
            cursor.execute(
                "SELECT has_table_privilege(%s, %s, 'SELECT')",
                (role, table),
            )
            public_privileges_revoked &= not bool(cursor.fetchone()[0])
        cursor.execute(
            "SELECT has_table_privilege('service_role', %s, 'SELECT,INSERT,UPDATE,DELETE')",
            (table,),
        )
        service_privileges_present &= bool(cursor.fetchone()[0])
    lookup_signature = FUNCTIONS[0]
    cursor.execute(
        "SELECT has_function_privilege('anon', %s, 'EXECUTE')",
        (lookup_signature,),
    )
    public_privileges_revoked &= not bool(cursor.fetchone()[0])
    cursor.execute(
        "SELECT has_function_privilege('service_role', %s, 'EXECUTE')",
        (lookup_signature,),
    )
    service_privileges_present &= bool(cursor.fetchone()[0])

    issue_time = datetime(2099, 7, 16, 12, 15, tzinfo=timezone.utc)
    issue_hour = issue_time.replace(minute=0, second=0, microsecond=0)
    provider = "migration-validation"
    band = "20m"
    transform_version = "wspr-opportunity-duckdb-v1"
    origin = "AA00"
    targets = ["BB11", "CC22"]
    versions = insert_watermarks(
        cursor,
        issue_time=issue_time,
        provider=provider,
        band=band,
        transform_version=transform_version,
    )
    insert_feature(
        cursor,
        target_hour=issue_hour - timedelta(hours=1),
        band=band,
        origin=origin,
        target=targets[0],
        provider=provider,
        transform_version=transform_version,
        available_at=versions[1],
    )
    insert_feature(
        cursor,
        target_hour=issue_hour - timedelta(hours=24),
        band=band,
        origin=origin,
        target=targets[1],
        provider=provider,
        transform_version=transform_version,
        available_at=versions[24],
    )
    cursor.execute(
        """
        SELECT * FROM public.lookup_wspr_path_lags(%s, %s, %s, %s, %s, %s)
        ORDER BY target_grid4
        """,
        (issue_time, band, origin, targets, transform_version, provider),
    )
    lookup = cursor.fetchall()
    lookup_exact = (
        len(lookup) == 2
        and lookup[0][0] == targets[0]
        and float(lookup[0][1]) == 0.5
        and int(lookup[0][5]) == 1
        and int(lookup[0][8]) == 0
        and lookup[1][0] == targets[1]
        and float(lookup[1][4]) == 0.5
        and int(lookup[1][5]) == 0
        and int(lookup[1][8]) == 1
        and all(row[10] <= issue_time for row in lookup)
    )
    cursor.execute(
        "SELECT count(*) FROM public.lookup_wspr_path_lags(%s, %s, %s, %s, %s, %s)",
        (issue_time, "40m", origin, targets, transform_version, provider),
    )
    missing_watermark_returns_empty = int(cursor.fetchone()[0]) == 0

    complete_watermark_constraint = False
    cursor.execute("SAVEPOINT partial_watermark")
    try:
        cursor.execute(
            """
            INSERT INTO public.wspr_feature_watermarks (
              target_hour, band, provider, transform_version, status,
              source_watermark, available_at, observation_count,
              feature_cell_count, quality_flags
            ) VALUES (%s, '30m', %s, %s, 'complete', %s, %s, 0, 0, '{}')
            """,
            (
                issue_hour - timedelta(hours=1),
                provider,
                transform_version,
                issue_hour - timedelta(minutes=1),
                issue_time,
            ),
        )
    except errors.CheckViolation:
        complete_watermark_constraint = True
        cursor.execute("ROLLBACK TO SAVEPOINT partial_watermark")
    cursor.execute("RELEASE SAVEPOINT partial_watermark")

    now = datetime.now(timezone.utc)
    observation_rows = [
        ("old", now - timedelta(hours=31)),
        ("recent", now - timedelta(hours=26)),
    ]
    for source_id, received_at in observation_rows:
        event_time = received_at - timedelta(seconds=30)
        cursor.execute(
            """
            INSERT INTO public.wspr_observations_rolling (
              source, source_id, observation_key_sha256, event_time,
              received_at, slot_epoch, target_hour, band, tx_call, tx_grid4,
              rx_call, rx_grid4, power_bin_dbm, snr_db, mode, ingest_version
            ) VALUES (%s, %s, %s, %s, %s, %s, date_trunc('hour', %s),
                      '20m', 'TX01', 'AA00', 'RX01', 'BB11', 10, -20,
                      'WSPR', 'migration-validation')
            """,
            (
                provider,
                source_id,
                hashlib.sha256(f"{provider}:{source_id}".encode()).hexdigest(),
                event_time,
                received_at,
                int(event_time.timestamp()) // 120 * 120,
                event_time,
            ),
        )
    cursor.execute("SELECT public.prune_wspr_observations(interval '30 hours')")
    prune_count = int(cursor.fetchone()[0])
    cursor.execute(
        "SELECT source_id FROM public.wspr_observations_rolling WHERE source = %s",
        (provider,),
    )
    remaining = {row[0] for row in cursor.fetchall()}
    pruning_exact = prune_count >= 1 and "old" not in remaining and "recent" in remaining
    minimum_retention_guard = False
    cursor.execute("SAVEPOINT retention_guard")
    try:
        cursor.execute("SELECT public.prune_wspr_observations(interval '26 hours')")
    except errors.RaiseException:
        minimum_retention_guard = True
        cursor.execute("ROLLBACK TO SAVEPOINT retention_guard")
    cursor.execute("RELEASE SAVEPOINT retention_guard")

    return {
        "pending_prerequisite_migrations_executed": prerequisites_executed,
        "prerequisite_tables_created": prerequisite_tables_created,
        "prerequisite_row_level_security_enabled": prerequisite_rls_enabled,
        "prerequisite_public_read_grants_present": prerequisite_public_read_grants,
        "prerequisite_user_policies_present": prerequisite_user_policies_present,
        "prerequisite_functions_service_only": prerequisite_functions_restricted,
        "collector_availability_backfill_complete": collector_availability_backfill_complete,
        "solar_provenance_columns_present": solar_provenance_columns_present,
        "migration_sql_executed": migration_executed,
        "private_tables_created": all(table_checks.values()),
        "row_level_security_enabled": rls_enabled,
        "public_privileges_revoked": public_privileges_revoked,
        "service_role_privileges_present": service_privileges_present,
        "four_lag_lookup_exact": lookup_exact,
        "missing_watermark_returns_empty": missing_watermark_returns_empty,
        "complete_watermark_constraint_enforced": complete_watermark_constraint,
        "thirty_hour_pruning_exact": pruning_exact,
        "minimum_retention_guard_enforced": minimum_retention_guard,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--migration", type=Path, default=MIGRATION)
    parser.add_argument(
        "--include-pending-prerequisites",
        action="store_true",
        help="explicitly document that the default validates all pending prerequisites",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if not args.env_file.is_file() or not args.pooler_url_file.is_file():
        raise RuntimeError("untracked target database credentials are unavailable")
    if not args.migration.is_file():
        raise FileNotFoundError(args.migration)
    prerequisite_paths = PENDING_PREREQUISITES
    missing_prerequisites = [path for path in prerequisite_paths if not path.is_file()]
    if missing_prerequisites:
        raise FileNotFoundError(missing_prerequisites[0])
    env_values = read_env(args.env_file)
    password = env_values.get("SUPABASE_DB_PASSWORD", "")
    cached_pooler_url = args.pooler_url_file.read_text(encoding="utf-8").strip()
    pooler_url = current_project_pooler_url(env_values, cached_pooler_url)
    if not password or not pooler_url.startswith("postgresql://"):
        raise RuntimeError("target database connection settings are incomplete")

    started = time.perf_counter()
    connection = psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-v4-2-migration-rollback-validation",
    )
    before = {}
    after = {}
    transaction_gates = {}
    server_version = ""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version")
            server_version = str(cursor.fetchone()[0])
            before = object_state(cursor)
            connection.commit()
            if any(value["exists"] for value in before["tables"].values()) or any(
                value["exists"] for value in before["functions"].values()
            ):
                raise RuntimeError(
                    "rollback validation refuses to touch pre-existing live-feature objects"
                )
            transaction_gates = validate_transaction(
                cursor,
                args.migration.read_text(encoding="utf-8"),
                prerequisite_sql=tuple(
                    path.read_text(encoding="utf-8") for path in prerequisite_paths
                ),
            )
            connection.rollback()
            after = object_state(cursor)
            connection.rollback()
    finally:
        connection.close()
    rollback_restored = before == after
    gates = {
        **transaction_gates,
        "rollback_restored_original_object_state": rollback_restored,
        "persistent_changes_absent": rollback_restored,
        "target_is_postgresql": bool(server_version),
        "locked_outcomes_unread": True,
    }
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "target_postgres_rollback_only_migration_validation",
        "locked_outcomes_read": False,
        "migration_deployed": False,
        "transaction_mode": "rollback_only",
        "persistent_changes": False,
        "migration": {
            "path": args.migration.relative_to(ROOT).as_posix(),
            "sha256": sha256(args.migration),
        },
        "pending_prerequisite_migrations": [
            {
                "path": path.relative_to(ROOT).as_posix(),
                "sha256": sha256(path),
            }
            for path in prerequisite_paths
        ],
        "database": {
            "engine": "PostgreSQL",
            "server_version": server_version,
            "connection_identifier_recorded": False,
        },
        "object_state_restored": rollback_restored,
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
        raise SystemExit("target Postgres migration validation failed")


if __name__ == "__main__":
    main()

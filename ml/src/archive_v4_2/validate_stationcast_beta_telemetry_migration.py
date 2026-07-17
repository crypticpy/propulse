#!/usr/bin/env python3
"""Rollback-validate or verify the aggregate StationCast telemetry boundary."""

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


BASE_MIGRATION = (
    ROOT / "supabase/migrations/20260716014000_stationcast_beta_telemetry.sql"
)
UTC_MIGRATION = (
    ROOT / "supabase/migrations/20260716015000_stationcast_beta_telemetry_utc.sql"
)
MIGRATIONS = (BASE_MIGRATION, UTC_MIGRATION)
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_OUTPUT = RESULT / "stationcast_beta_telemetry_migration_validation.json"
DEFAULT_DEPLOYMENT_OUTPUT = (
    RESULT / "stationcast_beta_telemetry_deployment_validation.json"
)
TABLE = "propagation_beta_telemetry_hourly"
FUNCTIONS = {
    "record_propagation_beta_telemetry": "text, timestamp with time zone, jsonb",
    "get_propagation_beta_api_telemetry": (
        "text, timestamp with time zone, timestamp with time zone"
    ),
}
COUNTERS = (
    "requests",
    "errors",
    "integrity_errors",
    "privacy_events",
    "consent_errors",
    "subject_binding_errors",
    "stale_profile_events",
    "equipment_math_events",
    "unsupported_support_events",
    "high_confidence_overprediction_events",
    "geographic_regression_events",
)
EXPECTED_COLUMNS = {"protocol_version", "bucket_start", *COUNTERS, "updated_at"}


def boundary_state(cursor: psycopg.Cursor[Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT column_name, data_type, is_nullable "
        "FROM information_schema.columns WHERE table_schema = 'public' "
        "AND table_name = %s ORDER BY ordinal_position",
        (TABLE,),
    )
    columns = [tuple(str(value) for value in row) for row in cursor.fetchall()]
    cursor.execute(
        "SELECT c.relrowsecurity, c.relforcerowsecurity, "
        "coalesce(obj_description(c.oid), '') "
        "FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace "
        "WHERE n.nspname = 'public' AND c.relname = %s",
        (TABLE,),
    )
    relation = cursor.fetchone()
    cursor.execute(
        "SELECT constraints.constraint_name, constraints.constraint_type, "
        "pg_get_constraintdef(definition.oid) "
        "FROM information_schema.table_constraints AS constraints "
        "JOIN pg_namespace AS namespace "
        "ON namespace.nspname = constraints.table_schema "
        "JOIN pg_class AS relation "
        "ON relation.relnamespace = namespace.oid "
        "AND relation.relname = constraints.table_name "
        "JOIN pg_constraint AS definition "
        "ON definition.conrelid = relation.oid "
        "AND definition.conname = constraints.constraint_name "
        "WHERE constraints.table_schema = 'public' "
        "AND constraints.table_name = %s "
        "ORDER BY constraints.constraint_name",
        (TABLE,),
    )
    constraints = [tuple(str(value) for value in row) for row in cursor.fetchall()]
    cursor.execute(
        "SELECT p.proname, oidvectortypes(p.proargtypes), p.prosecdef, "
        "coalesce(array_to_string(p.proconfig, ','), ''), pg_get_functiondef(p.oid) "
        "FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'public' AND p.proname = ANY(%s) ORDER BY p.proname",
        (list(FUNCTIONS),),
    )
    functions = [
        (str(name), str(arguments), bool(definer), str(config), str(body))
        for name, arguments, definer, config, body in cursor.fetchall()
    ]
    privileges = {
        f"{name}:{role}": False
        for name in FUNCTIONS
        for role in ("PUBLIC", "anon", "authenticated", "service_role")
    }
    cursor.execute(
        "SELECT procedure.proname, CASE WHEN access.grantee = 0 THEN 'PUBLIC' "
        "ELSE pg_get_userbyid(access.grantee) END, access.privilege_type "
        "FROM pg_proc AS procedure "
        "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
        "CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, "
        "acldefault('f', procedure.proowner))) AS access "
        "WHERE namespace.nspname = 'public' AND procedure.proname = ANY(%s)",
        (list(FUNCTIONS),),
    )
    for name, role, privilege in cursor.fetchall():
        key = f"{name}:{role}"
        if key in privileges and privilege == "EXECUTE":
            privileges[key] = True
    table_privileges: tuple[bool, ...] = ()
    if columns:
        cursor.execute(
            "SELECT "
            "has_table_privilege('anon', 'public.propagation_beta_telemetry_hourly', 'SELECT'), "
            "has_table_privilege('authenticated', 'public.propagation_beta_telemetry_hourly', 'SELECT'), "
            "has_table_privilege('anon', 'public.propagation_beta_telemetry_hourly', 'INSERT'), "
            "has_table_privilege('authenticated', 'public.propagation_beta_telemetry_hourly', 'INSERT'), "
            "has_table_privilege('anon', 'public.propagation_beta_telemetry_hourly', 'UPDATE'), "
            "has_table_privilege('authenticated', 'public.propagation_beta_telemetry_hourly', 'UPDATE'), "
            "has_table_privilege('anon', 'public.propagation_beta_telemetry_hourly', 'DELETE'), "
            "has_table_privilege('authenticated', 'public.propagation_beta_telemetry_hourly', 'DELETE'), "
            "has_table_privilege('service_role', 'public.propagation_beta_telemetry_hourly', 'SELECT'), "
            "has_table_privilege('service_role', 'public.propagation_beta_telemetry_hourly', 'INSERT'), "
            "has_table_privilege('service_role', 'public.propagation_beta_telemetry_hourly', 'UPDATE'), "
            "has_table_privilege('service_role', 'public.propagation_beta_telemetry_hourly', 'DELETE')"
        )
        table_privileges = tuple(bool(value) for value in cursor.fetchone())
    return {
        "columns": columns,
        "relation": tuple(relation) if relation else (),
        "constraints": constraints,
        "functions": functions,
        "function_privileges": privileges,
        "table_privileges": table_privileges,
    }


def validate_boundary(cursor: psycopg.Cursor[Any]) -> dict[str, bool]:
    state = boundary_state(cursor)
    columns = {name: (kind, nullable) for name, kind, nullable in state["columns"]}
    functions = {
        name: (arguments, definer, config, body.lower())
        for name, arguments, definer, config, body in state["functions"]
    }
    exact_functions = set(functions) == set(FUNCTIONS) and all(
        functions[name][0] == arguments for name, arguments in FUNCTIONS.items()
    )
    bodies = re.sub(r"\s+", " ", " ".join(value[3] for value in functions.values()))
    constraints = " ".join(
        definition.lower() for _, _, definition in state["constraints"]
    )
    utc_trunc = lambda argument, source: bool(re.search(  # noqa: E731
        rf"date_trunc\('hour'(?:::text)?, {argument}, 'utc'(?:::text)?\)",
        source,
    ))
    privileges = state["function_privileges"]
    table_privileges = state["table_privileges"]
    relation = state["relation"]
    gates = {
        "exact_aggregate_columns_present": set(columns) == EXPECTED_COLUMNS,
        "no_participant_or_path_columns": not any(
            token in name
            for name in columns
            if name not in COUNTERS
            for token in (
                "user", "participant", "grid", "path", "station", "equipment",
                "call", "request_id", "prediction_id", "attempt_id",
            )
        ),
        "counter_columns_are_required_bigints": all(
            columns.get(name) == ("bigint", "NO") for name in COUNTERS
        ),
        "hourly_primary_key_is_exact": any(
            kind == "PRIMARY KEY"
            and "primary key (protocol_version, bucket_start)" in definition.lower()
            for _, kind, definition in state["constraints"]
        ),
        "utc_hour_bucketing_is_explicit": (
            utc_trunc("bucket_start", constraints)
            and utc_trunc("p_observed_at", bodies)
            and utc_trunc("p_window_start", bodies)
            and utc_trunc("p_window_end", bodies)
        ),
        "row_level_security_is_forced": bool(
            len(relation) >= 2 and relation[0] is True and relation[1] is True
        ),
        "privacy_comment_is_explicit": bool(
            len(relation) >= 3
            and "participant" in str(relation[2]).lower()
            and "equipment" in str(relation[2]).lower()
            and "prohibited" in str(relation[2]).lower()
        ),
        "exact_security_definer_functions_present": exact_functions,
        "function_search_paths_hardened": exact_functions and all(
            value[1] and "search_path=pg_catalog, public" in value[2]
            for value in functions.values()
        ),
        "functions_are_service_role_only": exact_functions and all(
            privileges[f"{name}:service_role"]
            and not privileges[f"{name}:PUBLIC"]
            and not privileges[f"{name}:anon"]
            and not privileges[f"{name}:authenticated"]
            for name in FUNCTIONS
        ),
        "browser_table_access_is_revoked": bool(
            len(table_privileges) == 12 and not any(table_privileges[:8])
        ),
        "service_role_table_access_is_available": bool(
            len(table_privileges) == 12 and all(table_privileges[8:])
        ),
        "record_function_rejects_undeclared_dimensions": (
            "jsonb_object_keys" in bodies and "allowed_keys" in bodies
        ),
        "export_has_exact_window_and_privacy_marker": all(
            clause in bodies
            for clause in (
                "bucket_start >= p_window_start",
                "bucket_start < p_window_end",
                "'participant_data_present', false",
                "180 days",
            )
        ),
    }

    test_protocol = "propagation-v4.2-stationcast-beta-2099-01-01"
    start = datetime(2099, 1, 1, tzinfo=timezone.utc)
    end = datetime(2099, 1, 1, 2, tzinfo=timezone.utc)
    cursor.execute(
        "SELECT public.record_propagation_beta_telemetry(%s, %s, %s::jsonb)",
        (test_protocol, start, json.dumps({"requests": 2, "errors": 1})),
    )
    cursor.execute(
        "SELECT public.record_propagation_beta_telemetry(%s, %s, %s::jsonb)",
        (test_protocol, start, json.dumps({"requests": 3, "consent_errors": 1})),
    )
    receipt = cursor.execute(
        "SELECT public.get_propagation_beta_api_telemetry(%s, %s, %s)",
        (test_protocol, start, end),
    ).fetchone()[0]
    gates["atomic_hourly_upsert_and_exact_export"] = bool(
        receipt["counts"]["requests"] == 5
        and receipt["counts"]["errors"] == 1
        and receipt["counts"]["consent_errors"] == 1
        and receipt["participant_data_present"] is False
        and set(receipt["counts"]) == set(COUNTERS)
    )
    cursor.execute("SAVEPOINT invalid_beta_dimension")
    rejected = False
    try:
        cursor.execute(
            "SELECT public.record_propagation_beta_telemetry(%s, %s, %s::jsonb)",
            (test_protocol, start, json.dumps({"user_id": 1})),
        )
    except psycopg.Error:
        rejected = True
        cursor.execute("ROLLBACK TO SAVEPOINT invalid_beta_dimension")
    cursor.execute("RELEASE SAVEPOINT invalid_beta_dimension")
    gates["participant_dimension_increment_rejected"] = rejected
    return gates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--migration", type=Path, action="append")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--validate-pending", action="store_true")
    parser.add_argument("--verify-deployed", action="store_true")
    args = parser.parse_args()
    if args.validate_pending and args.verify_deployed:
        parser.error("--validate-pending and --verify-deployed are mutually exclusive")
    if args.verify_deployed and args.output == DEFAULT_OUTPUT:
        args.output = DEFAULT_DEPLOYMENT_OUTPUT
    migrations = tuple(args.migration or MIGRATIONS)
    migration_versions = tuple(path.name.split("_", 1)[0] for path in migrations)

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
        application_name="propulse-beta-telemetry-validation",
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
            if (
                not args.verify_deployed
                and not args.validate_pending
                and before["columns"]
            ):
                raise RuntimeError(
                    "rollback validation refuses an already deployed telemetry boundary"
                )
            if args.validate_pending and not before["columns"]:
                raise RuntimeError(
                    "pending validation requires the deployed base telemetry boundary"
                )
            cursor.execute("SET LOCAL statement_timeout = '120s'")
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            if not args.verify_deployed:
                pending_migrations = migrations[-1:] if args.validate_pending else migrations
                for migration in pending_migrations:
                    cursor.execute(migration.read_text(encoding="utf-8"))
            gates = validate_boundary(cursor)
            if args.verify_deployed:
                cursor.execute(
                    "SELECT version FROM supabase_migrations.schema_migrations "
                    "WHERE version = ANY(%s)",
                    (list(migration_versions),),
                )
                deployed_versions = {str(row[0]) for row in cursor.fetchall()}
                gates["deployment_ledger_exact"] = (
                    deployed_versions == set(migration_versions)
                )
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
            "stationcast_beta_telemetry_target_postgres_deployment_validation"
            if args.verify_deployed
            else (
                "stationcast_beta_telemetry_pending_postgres_rollback_validation"
                if args.validate_pending
                else "stationcast_beta_telemetry_target_postgres_rollback_validation"
            )
        ),
        "decision": "pass" if all(gates.values()) else "fail",
        "migration_deployed": args.verify_deployed,
        "locked_outcomes_read": False,
        "persistent_changes": False,
        "migration": {
            "path": migrations[-1].relative_to(ROOT).as_posix(),
            "sha256": sha256(migrations[-1]),
        },
        "migration_chain": [
            {
                "path": migration.relative_to(ROOT).as_posix(),
                "sha256": sha256(migration),
            }
            for migration in migrations
        ],
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
        raise SystemExit("StationCast beta telemetry migration validation failed")


if __name__ == "__main__":
    main()

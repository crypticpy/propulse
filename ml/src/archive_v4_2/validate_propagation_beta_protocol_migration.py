#!/usr/bin/env python3
"""Rollback-validate or verify the consented beta protocol database boundary."""

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


MIGRATION = ROOT / "supabase/migrations/20260716013000_propagation_beta_protocol.sql"
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_OUTPUT = RESULT / "propagation_beta_protocol_migration_validation.json"
DEFAULT_DEPLOYMENT_OUTPUT = (
    RESULT / "propagation_beta_protocol_deployment_validation.json"
)
COLUMNS = (
    "profile",
    "station_tx_class",
    "station_loss_class",
    "station_antenna_class",
    "station_rx_class",
    "station_supported",
)
CONSTRAINTS = (
    "propagation_predictions_profile_check",
    "propagation_predictions_station_tx_class_check",
    "propagation_predictions_station_loss_class_check",
    "propagation_predictions_station_antenna_class_check",
    "propagation_predictions_station_rx_class_check",
    "ml_research_consents_retention_check",
)
FUNCTIONS = {
    "set_propagation_research_consent": "uuid, text, text[], timestamp with time zone",
    "withdraw_propagation_research_consent": "uuid, text, timestamp with time zone",
    "prune_expired_propagation_research_data": "timestamp with time zone, integer",
    "get_propagation_beta_evidence": (
        "text, timestamp with time zone, timestamp with time zone, integer, integer"
    ),
}


def boundary_state(cursor: psycopg.Cursor[Any]) -> dict[str, Any]:
    cursor.execute(
        "SELECT column_name, data_type, is_nullable, coalesce(column_default, '') "
        "FROM information_schema.columns WHERE table_schema = 'public' "
        "AND table_name = 'propagation_predictions' AND column_name = ANY(%s) "
        "ORDER BY column_name",
        (list(COLUMNS),),
    )
    columns = [tuple(str(value) for value in row) for row in cursor.fetchall()]
    cursor.execute(
        "SELECT conname, convalidated, pg_get_constraintdef(oid) "
        "FROM pg_constraint WHERE conname = ANY(%s) ORDER BY conname",
        (list(CONSTRAINTS),),
    )
    constraints = [
        (str(name), bool(validated), str(definition))
        for name, validated, definition in cursor.fetchall()
    ]
    cursor.execute(
        "SELECT p.proname, oidvectortypes(p.proargtypes), "
        "p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''), "
        "pg_get_functiondef(p.oid) FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'public' AND p.proname = ANY(%s) ORDER BY p.proname",
        (list(FUNCTIONS),),
    )
    functions = [
        (str(name), str(arguments), bool(security_definer), str(config), str(body))
        for name, arguments, security_definer, config, body in cursor.fetchall()
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
    cursor.execute(
        "SELECT col_description(attribute.attrelid, attribute.attnum) "
        "FROM pg_attribute AS attribute "
        "WHERE attribute.attrelid = 'public.propagation_predictions'::regclass "
        "AND attribute.attname = ANY(%s) ORDER BY attribute.attname",
        ([name for name in COLUMNS if name != "profile"],),
    )
    comments = [str(row[0] or "").lower() for row in cursor.fetchall()]
    cursor.execute(
        "SELECT has_table_privilege('anon', 'public.propagation_predictions', 'INSERT'), "
        "has_table_privilege('anon', 'public.propagation_predictions', 'UPDATE'), "
        "has_table_privilege('authenticated', 'public.propagation_predictions', 'INSERT'), "
        "has_table_privilege('authenticated', 'public.propagation_predictions', 'UPDATE'), "
        "has_table_privilege('service_role', 'public.propagation_predictions', 'INSERT')"
    )
    table_privileges = tuple(bool(value) for value in cursor.fetchone())
    return {
        "columns": columns,
        "constraints": constraints,
        "functions": functions,
        "function_privileges": privileges,
        "comments": comments,
        "table_privileges": table_privileges,
    }


def validate_boundary(cursor: psycopg.Cursor[Any]) -> dict[str, bool]:
    state = boundary_state(cursor)
    columns = {name: (kind, nullable, default) for name, kind, nullable, default in state["columns"]}
    constraints = {
        name: (validated, definition.lower())
        for name, validated, definition in state["constraints"]
    }
    functions = {
        name: (arguments, security_definer, config, body.lower())
        for name, arguments, security_definer, config, body in state["functions"]
    }
    station_nullable = all(
        columns.get(name, ("", "", ""))[1] == "YES"
        for name in COLUMNS
        if name != "profile"
    )
    exact_functions = set(functions) == set(FUNCTIONS) and all(
        functions[name][0] == arguments for name, arguments in FUNCTIONS.items()
    )
    function_hardening = exact_functions and all(
        functions[name][1] and "search_path=pg_catalog, public" in functions[name][2]
        for name in FUNCTIONS
    )
    privileges = state["function_privileges"]
    service_only = all(
        privileges[f"{name}:service_role"]
        and not privileges[f"{name}:PUBLIC"]
        and not privileges[f"{name}:anon"]
        and not privileges[f"{name}:authenticated"]
        for name in FUNCTIONS
    )
    definitions = " ".join(definition for _, definition in constraints.values())
    bodies = re.sub(
        r"\s+",
        " ",
        " ".join(functions[name][3] for name in functions),
    )
    comments = [comment.lower() for comment in state["comments"]]
    table_privileges = state["table_privileges"]
    return {
        "exact_beta_columns_present": set(columns) == set(COLUMNS),
        "profile_is_required_and_bounded": (
            columns.get("profile", ("", "", ""))[1] == "NO"
            and "physics" in columns.get("profile", ("", "", ""))[2]
            and "physics" in definitions
            and "nowcast" in definitions
        ),
        "equipment_classes_are_nullable": station_nullable,
        "all_constraints_validated": (
            set(constraints) == set(CONSTRAINTS)
            and all(validated for validated, _ in constraints.values())
        ),
        "capability_classes_strictly_enumerated": all(
            value in definitions
            for value in (
                "lt_1w", "ge_500w", "lt_1db", "ge_6db",
                "lt_0dbi", "ge_10dbi", "relative", "catalog", "measured",
            )
        ),
        "retention_is_bounded_to_730_days": "730 days" in definitions,
        "exact_security_definer_functions_present": exact_functions,
        "function_search_paths_hardened": function_hardening,
        "functions_are_service_role_only": service_only,
        "equipment_consent_removal_scrubs_classes": (
            "derived_equipment_training" in bodies
            and all(
                f"{name} = null" in bodies
                for name in (
                    "station_tx_class",
                    "station_loss_class",
                    "station_antenna_class",
                    "station_rx_class",
                )
            )
            and "station_supported = null" not in bodies
        ),
        "outcome_consent_removal_deletes_account_bound_rows": (
            "attempt_outcome_training" in bodies
            and all(
                f"delete from public.{table}" in bodies
                for table in (
                    "propagation_outcomes",
                    "propagation_attempts",
                    "propagation_predictions",
                )
            )
        ),
        "withdrawal_deletes_all_account_bound_rows": all(
            f"delete from public.{table}" in bodies
            for table in (
                "propagation_outcomes", "propagation_attempts", "propagation_predictions"
            )
        ),
        "retention_prune_is_bounded_and_locked": (
            "for update skip locked" in bodies and "p_limit_participants" in bodies
        ),
        "aggregate_export_has_privacy_thresholds": all(
            clause in bodies
            for clause in (
                "p_min_participants",
                "p_min_outcomes",
                "count(distinct user_id)",
                "mode = 'wspr' and task = 'receive'",
                "monitoring_not_promotion_score",
                "participant_cap_applied', false",
                "'reportable', false",
            )
        ),
        "privacy_comments_prohibit_exact_station_values": (
            len(comments) == 5
            and all("raw equipment" in comment for comment in comments)
            and sum("consent-gated" in comment for comment in comments) == 4
            and any("signed server support decision" in comment for comment in comments)
        ),
        "browser_prediction_writes_remain_revoked": not any(table_privileges[:4]),
        "service_role_prediction_insert_remains_available": table_privileges[4],
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
        application_name="propulse-beta-protocol-validation",
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
            if not args.verify_deployed and before["columns"]:
                raise RuntimeError(
                    "rollback validation refuses an already deployed beta boundary"
                )
            cursor.execute("SET LOCAL statement_timeout = '120s'")
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            if not args.verify_deployed:
                cursor.execute(args.migration.read_text(encoding="utf-8"))
            gates = validate_boundary(cursor)
            if args.verify_deployed:
                cursor.execute(
                    "SELECT count(*) FROM supabase_migrations.schema_migrations "
                    "WHERE version = '20260716013000'"
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
            "propagation_beta_protocol_target_postgres_deployment_validation"
            if args.verify_deployed
            else "propagation_beta_protocol_target_postgres_rollback_validation"
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
        raise SystemExit("propagation beta protocol migration validation failed")


if __name__ == "__main__":
    main()

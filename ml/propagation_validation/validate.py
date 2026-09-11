"""Fail-closed checks for candidate protocol metadata and small synthetic fixtures.

Standard library only. This is neither an evaluator nor a production solver.
Exit 0 means consistency checks succeeded; qualification always remains BLOCKED.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
PROTOCOL_ID = "propagation-candidate-0.1.0"
# Frozen alongside PROTOCOL_ID; hash UTF-8 newline-joined sorted IDs, no trailing newline.
COVERAGE_COUNT = 37
COVERAGE_IDS_SHA256 = "83ac2525abf9f62d6fa8ec034fd9594ddd14aa54187b52e282b79cc22d5ce803"
KERNEL = "chordal_se_times_temporal_exponential"
GATES = {
    "G-REVIEW", "G-SOURCES", "G-DATA", "G-POWER", "G-COMPARATOR",
    "G-FAMILY", "G-NUMERICS", "G-RUNTIME", "G-ACCURACY",
}
ACCURACY_PREREQUISITES = GATES - {"G-ACCURACY", "G-RUNTIME"}
# Frozen sections of protocol 0.1.0 (sha256 of canonical JSON), checked last so the semantic
# checks above name a violation precisely: any edit to these sections is a new protocol
# revision, not a validator-passing change. Coverage rows and gates stay order-free and are
# pinned by their own identity checks.
FROZEN_SECTION_SHA256 = {
    "measurement": "ea8bea66f1561e775115cf5504aaa8415f0729f9e2fd8314542ed23ec4df41de",
    "replay": "774e3458a4f4fa2a11e54c471afd9e09d2cd2746dac05011f93cff6bd62e59bb",
    "events": "537495bb82a28efbe86ec35ecbe530088f4064c153791aa3a304e995651d2f53",
    "resampling": "97d0014d984c6647c9e5994d61b56ef6c56f8b9441105da09b7565d66f95b7ed",
    "numerics": "9fd68dc8b9e1b9f9117ec463dafaa14e382d603ee9600839966904d421352b62",
    "runtime_profiles": "c7b866630256fcfbba0b720ac29bb6899764491b7b8e1e6782fd1e1c6a199a2a",
}


def section_sha256(section):
    return hashlib.sha256(json.dumps(section, sort_keys=True,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()
EVENT_METRICS = {
    "circuit_support": "support_classification_error", "snr2500": "weighted_mae_db",
    "network_detection": "brier_and_log_loss", "observed_activity": "coverage_and_count_integrity",
    "conditional_decode": "brier_and_log_loss", "completed_qso": "completed_contacts_per_attempt",
    "field_strength": "field_strength_error_db", "usable_burst": "brier_and_burst_duration_error",
    "pass_geometry": "aos_los_timing_error_seconds", "doppler": "doppler_error_hz",
}


class Invalid(ValueError):
    """Invalid or insufficient protocol/fixture metadata."""


def require(condition, message):
    if not condition:
        raise Invalid(message)


def load_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def invalid_constant(value):
        raise Invalid(f"nonfinite JSON number: {value}")

    def finite_float(value):
        number = float(value)
        require(math.isfinite(number), "nonfinite JSON number")
        return number

    return json.loads(Path(path).read_text(), object_pairs_hook=pairs,
                      parse_constant=invalid_constant, parse_float=finite_float)


def schema_check(value, schema, path="$", *, check_schema=True):
    """Implement only the explicit JSON Schema vocabulary used by this package.

    Unknown keywords fail, so additions cannot silently bypass validation.
    No remote refs, formats, coercion, or defaults are supported.
    """
    supported = {"$schema", "title", "description", "type", "const", "enum",
                 "properties", "required", "additionalProperties", "items",
                 "minItems", "minLength", "minimum", "exclusiveMinimum"}
    if check_schema:
        require(isinstance(schema, dict), f"{path}: invalid schema")
        require(not set(schema) - supported, f"{path}: unsupported schema keyword")
    kinds = schema.get("type", [])
    if isinstance(kinds, str):
        kinds = [kinds]
    matches = {
        "object": isinstance(value, dict), "array": isinstance(value, list),
        "string": isinstance(value, str), "boolean": type(value) is bool,
        "number": type(value) in (int, float) and math.isfinite(value),
        "null": value is None,
    }
    require(all(kind in matches for kind in kinds), f"{path}: unsupported type")
    if kinds:
        require(any(matches[kind] for kind in kinds), f"{path}: expected {kinds}")
    if "const" in schema:
        require(type(value) is type(schema["const"]) and value == schema["const"],
                f"{path}: const mismatch")
    if "enum" in schema:
        require(any(type(value) is type(x) and value == x for x in schema["enum"]),
                f"{path}: invalid enum")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        require(all(key in value for key in schema.get("required", [])),
                f"{path}: missing required field")
        if schema.get("additionalProperties") is False:
            require(not set(value) - set(props), f"{path}: unknown field")
        for key, child in value.items():
            if key in props:
                schema_check(child, props[key], f"{path}.{key}")
    if isinstance(value, list):
        require(len(value) >= schema.get("minItems", 0), f"{path}: too few items")
        if "items" in schema:
            for index, child in enumerate(value):
                schema_check(child, schema["items"], f"{path}[{index}]")
    if isinstance(value, str):
        require(len(value.strip()) >= schema.get("minLength", 0), f"{path}: empty string")
    if type(value) in (int, float):
        require(math.isfinite(value), f"{path}: nonfinite number")
        if "minimum" in schema:
            require(value >= schema["minimum"], f"{path}: below minimum")
        if "exclusiveMinimum" in schema:
            require(value > schema["exclusiveMinimum"], f"{path}: not positive")


def nonempty(value, name):
    require(isinstance(value, str) and bool(value.strip()), f"{name}: missing text")


def records(value, name):
    require(isinstance(value, list) and bool(value), f"{name}: missing records")
    require(all(isinstance(row, dict) for row in value), f"{name}: invalid record")
    ids = [row.get("id") for row in value]
    for identity in ids:
        nonempty(identity, name + ".id")
    require(len(ids) == len(set(ids)), f"{name}: duplicate ID")
    return value


def validate_protocol(protocol):
    require(isinstance(protocol, dict), "protocol must be an object")
    require(protocol.get("protocol_id") == PROTOCOL_ID, "unrecognized protocol version")
    require(protocol.get("status") == "candidate", "candidate is not approved/validated")
    require(protocol.get("qualification") == "BLOCKED", "qualification must remain BLOCKED")
    require(protocol.get("eligible_observational_datasets") == [],
            "no observational dataset is eligible in this revision")
    gates = records(protocol.get("gates"), "gates")
    require({gate["id"] for gate in gates} == GATES, "missing or unknown gate")
    for gate in gates:
        require(gate.get("status") == "BLOCKED", f"{gate['id']}: cannot pass in v0.1")
        nonempty(gate.get("owner"), gate["id"] + ".owner")
        require(isinstance(gate.get("prerequisites"), list) and gate["prerequisites"],
                f"{gate['id']}: missing prerequisites")
        for prerequisite in gate["prerequisites"]:
            nonempty(prerequisite, gate["id"] + ".prerequisite")
            require(not prerequisite.startswith("G-") or prerequisite in GATES,
                    f"{gate['id']}: prerequisite names an unknown gate")
    accuracy = next(gate for gate in gates if gate["id"] == "G-ACCURACY")
    require(set(accuracy["prerequisites"]) == ACCURACY_PREREQUISITES and
            len(accuracy["prerequisites"]) == len(ACCURACY_PREREQUISITES),
            "G-ACCURACY: prerequisite gate set changed")
    events = protocol.get("events")
    require(isinstance(events, dict), "events missing")
    required_events = {"circuit_support": "boolean", "snr2500": "dB",
                       "network_detection": "probability", "observed_activity": "count",
                       "conditional_decode": "probability", "completed_qso": "probability",
                       "field_strength": "dBuV_per_m", "usable_burst": "probability",
                       "pass_geometry": "seconds", "doppler": "Hz"}
    require(set(events) == set(required_events), "event inventory mismatch")
    for event, units in required_events.items():
        require(isinstance(events[event], dict) and events[event].get("units") == units,
                f"{event}: event units mismatch")
        nonempty(events[event].get("definition"), event + ".definition")
    for row in records(protocol.get("coverage_rows"), "coverage_rows"):
        for field in ("band", "mechanism", "event", "domain", "horizon", "units", "owner"):
            nonempty(row.get(field), row["id"] + "." + field)
        expected_id = ".".join(row[key] for key in
                               ("band", "mechanism", "event", "domain", "horizon")) + ".v1"
        require(row["id"] == expected_id, "row identity must include event/domain/horizon")
        require(row["event"] in events and row["units"] == events[row["event"]]["units"],
                f"{row['id']}: event or units mismatch")
        require(row.get("status") in ("data_limited", "experimental"),
                f"{row['id']}: no validated/implemented coverage in this revision")
        require(row.get("qualification_metric") == EVENT_METRICS[row["event"]],
                f"{row['id']}: metric must match event")
        registration = row.get("preregistration")
        require(isinstance(registration, dict) and registration.get("status") == "BLOCKED" and
                registration.get("owner") == row["owner"], "row preregistration needs blocked owner")
        nonempty(registration.get("required"), row["id"] + ".preregistration.required")
        require(isinstance(row.get("prerequisites"), list) and
                set(row["prerequisites"]) == GATES - {"G-ACCURACY"},
                f"{row['id']}: missing owned gates")
    row_ids = sorted(row["id"] for row in protocol["coverage_rows"])
    require(len(row_ids) == COVERAGE_COUNT and
            hashlib.sha256("\n".join(row_ids).encode("utf-8")).hexdigest() == COVERAGE_IDS_SHA256,
            "frozen coverage inventory changed; requires a reviewed protocol revision")
    bands = {row["band"] for row in protocol["coverage_rows"]}
    require({"2200m", "630m", "160m", "2_30MHz", "50_300GHz"} <= bands,
            "required low/HF/high-band inventory missing")
    for comparator in records(protocol.get("comparators"), "comparators"):
        require(comparator.get("status") in ("candidate", "eligible"), "invalid comparator state")
        nonempty(comparator.get("domain"), comparator["id"] + ".domain")
        if comparator["status"] == "eligible":
            nonempty(comparator.get("version"), "eligible comparator version")
            require(isinstance(comparator.get("sha256"), str) and
                    re.fullmatch(r"[0-9a-f]{64}", comparator["sha256"]),
                    "eligible comparator needs exact SHA-256")
    measurement = protocol.get("measurement", {})
    require(isinstance(measurement, dict), "invalid measurement")
    for name, expected in {"primary_event": "snr2500", "applies_to_event": "snr2500", "primary_metric": "weighted_mae_db",
                           "ordinary_snr_labels": "observed_snr_only",
                           "target_relative_mae_reduction": 0.20,
                           "external_skill_interval_level": 0.95}.items():
        require(measurement.get(name) == expected, f"measurement.{name}: frozen rule changed")
    for name in ("estimand", "weights", "population_status", "censored_policy", "unknown_policy",
                 "missing_predictions", "skill", "pass_rule", "regression"):
        nonempty(measurement.get(name), "measurement." + name)
    require(measurement.get("power") == {"alpha": 0.05, "minimum_power": 0.80,
            "sample_size": None, "floor_blocks": 30, "floor_stations": 20,
            "floor_cases": 500, "status": "BLOCKED"}, "power has no qualified sample size")
    require(measurement.get("coverage", {}).get("interval80") == [0.75, 0.85] and
            measurement.get("coverage", {}).get("interval95") == [0.92, 0.98],
            "interval coverage thresholds changed")
    require(protocol.get("dataset_roles") == ["development", "validation",
            "independent_station_holdout", "independent_date_holdout",
            "independent_storm_holdout", "prospective"], "dataset role isolation missing")
    for section, fields in {"replay": ("times", "unknown_availability", "revisions", "pairing", "isolation", "split_assignment"),
                            "resampling": ("method", "blocks", "weights", "insufficient", "status")}.items():
        require(isinstance(protocol.get(section), dict), f"missing {section}")
        for name in fields:
            nonempty(protocol[section].get(name), section + "." + name)
    for name in ("population_status",):
        require(isinstance(measurement.get(name), str) and measurement[name].startswith("BLOCKED"),
                f"measurement.{name} must remain BLOCKED")
    require(isinstance(protocol["replay"].get("split_assignment"), str) and
            protocol["replay"]["split_assignment"].startswith("BLOCKED"),
            "replay.split_assignment must remain BLOCKED")
    bootstrap = protocol["resampling"]
    require(bootstrap.get("applies_to_event") == "snr2500" and
            bootstrap.get("method_status") == "experimental_candidate", "resampling is an experimental SNR candidate")
    require(isinstance(bootstrap.get("status"), str) and bootstrap["status"].startswith("BLOCKED"),
            "resampling.status must remain BLOCKED in this revision")
    require(bootstrap.get("method") == "paired_connected_components_percentile_bootstrap" and
            bootstrap.get("draws") == 10000 and bootstrap.get("seed") == 947 and
            bootstrap.get("interval") == [0.025, 0.975], "resampling contract changed")
    numerics = protocol.get("numerics", {})
    require(isinstance(numerics, dict) and numerics.get("covariance_kernel") == KERNEL,
            "invalid PSD kernel: geodesic squared exponential is prohibited")
    require(numerics.get("jitter_policy") == "none_in_this_revision", "jitter cannot repair invalid kernel")
    for key, expected in {"earth_radius_km": 6371, "native_cases": 1000,
                          "power_snr_loss_db": 0.01, "muf_mhz": 0.001, "geometry_deg": 0.01,
                          "complex_normalized_residual": 1e-6, "condition_number_max": 1e8,
                          "null_relative_amplitude": 1e-8, "refinement_db": 0.1,
                          "refinement_phase_deg": 1}.items():
        value = numerics.get(key)
        require(type(value) in (int, float) and math.isfinite(value) and value == expected,
                f"numerics.{key}: frozen tolerance changed")
    require(numerics.get("tail_rule") == "independent_remaining_tail_bound_required",
            "convergence needs independent tail bound")
    profiles = records(protocol.get("runtime_profiles"), "runtime_profiles")
    require({p["id"] for p in profiles} == {"existing_24x11_catalog", "all_band_fullwave", "moving_target_burst"},
            "runtime profiles must distinguish workloads")
    for section, digest in FROZEN_SECTION_SHA256.items():
        require(section_sha256(protocol[section]) == digest,
                f"{section}: frozen contract text changed; bump the protocol revision")
    for profile in profiles:
        require(profile.get("status") == "BLOCKED", "runtime has no measured qualification")
        nonempty(profile.get("prerequisite"), profile["id"] + ".prerequisite")
        if profile["id"] == "existing_24x11_catalog":
            for key, expected in {"warm_p95_ms": 500, "first_usable_ms": 2000,
                                  "worker_mib": 128, "main_thread_task_ms": 50,
                                  "ensemble_p95_ms": 3000}.items():
                require(profile.get(key) == expected, "catalog runtime target changed")


def covariance(points, times, ell_km, tau_seconds, sigma=1.0, radius_km=6371.0):
    """Small analytic chordal fixture matrix, not the assimilation implementation."""
    require(len(points) == len(times) and bool(points), "points/times mismatch")
    for number in (ell_km, tau_seconds, radius_km):
        require(math.isfinite(number) and number > 0, "positive kernel scale required")
    require(math.isfinite(sigma) and sigma >= 0, "invalid sigma")
    vectors = []
    for (lat, lon), time in zip(points, times):
        require(all(math.isfinite(x) for x in (lat, lon, time)) and
                -90 <= lat <= 90 and -180 <= lon <= 180, "invalid coordinate/time")
        phi, theta = math.radians(lat), math.radians(lon)
        vectors.append((math.cos(phi) * math.cos(theta),
                        math.cos(phi) * math.sin(theta), math.sin(phi)))
    return [[sigma ** 2 * math.exp(-sum((a-b) ** 2 for a, b in zip(u, v)) *
             radius_km ** 2 / (2 * ell_km ** 2) - abs(times[i]-times[j]) / tau_seconds)
             for j, v in enumerate(vectors)] for i, u in enumerate(vectors)]


def symmetric_eigenvalues(matrix):
    """Jacobi rotations for tiny test matrices; no jitter or PSD repair."""
    n = len(matrix)
    require(1 <= n <= 16 and all(len(row) == n for row in matrix), "small square matrix required")
    a = [list(row) for row in matrix]
    require(all(math.isfinite(a[i][j]) and abs(a[i][j]-a[j][i]) <= 1e-14
                for i in range(n) for j in range(n)), "finite symmetric matrix required")
    for _ in range(100 * n * n):
        if n == 1:
            break
        p, q = max(((i, j) for i in range(n) for j in range(i+1, n)), key=lambda ij: abs(a[ij[0]][ij[1]]))
        if abs(a[p][q]) < 1e-15:
            return sorted(a[i][i] for i in range(n))
        angle = 0.5 * math.atan2(2*a[p][q], a[q][q]-a[p][p])
        c, s = math.cos(angle), math.sin(angle)
        app, aqq, apq = a[p][p], a[q][q], a[p][q]
        for k in range(n):
            if k not in (p, q):
                akp, akq = a[k][p], a[k][q]
                a[k][p] = a[p][k] = c*akp-s*akq
                a[k][q] = a[q][k] = s*akp+c*akq
        a[p][p] = c*c*app-2*s*c*apq+s*s*aqq
        a[q][q] = s*s*app+2*s*c*apq+c*c*aqq
        a[p][q] = a[q][p] = 0.0
    if n == 1:
        return [a[0][0]]
    raise Invalid("fixture eigenvalue iteration did not converge")


def utc_time(value):
    require(isinstance(value, str) and value.endswith("Z"), "timestamp must use UTC Z")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise Invalid("invalid timestamp") from error
    require(parsed.tzinfo == timezone.utc, "timestamp must use UTC")
    return parsed


def validate_manifest(manifest, schema):
    schema_check(manifest, schema)
    records(manifest["fixtures"], "fixtures")
    require({f["id"] for f in manifest["fixtures"]} == {"M12-geodesic-invalid", "M12-chordal-valid"},
            "required independent PSD fixtures missing")
    for fixture in manifest["fixtures"]:
        require(fixture["longitudes_deg"] == [0, 90, 180, 270], "fixture requires four equatorial points")
        require(fixture["tolerance"] <= 1e-12, "fixture tolerance cannot mask invalid covariance")
        radius, ell, sigma = (fixture[k] for k in ("radius_km", "ell_km", "sigma"))
        if fixture["kernel"] == KERNEL:
            matrix = covariance([(0, 0), (0, 90), (0, 180), (0, -90)], [0]*4, ell, 1, sigma, radius)
        else:
            matrix = [[sigma**2 * math.exp(-(radius * math.radians(min(abs(x-y), 360-abs(x-y))))**2 /
                       (2*ell**2)) for y in fixture["longitudes_deg"]] for x in fixture["longitudes_deg"]]
        minimum = min(symmetric_eigenvalues(matrix))
        require(abs(minimum-fixture["expected_min_eigenvalue"]) <= fixture["tolerance"],
                fixture["id"] + ": independent eigenvalue mismatch")
        require((minimum >= -fixture["tolerance"]) == fixture["expected_psd"], "PSD expectation mismatch")
        require(fixture["expected_psd"] == (fixture["kernel"] == KERNEL), "invalid kernel cannot qualify")
    for label in records(manifest["labels"], "labels"):
        kind = label["label_kind"]
        if kind == "observed_snr":
            require(type(label["snr_db"]) in (int, float) and label["bound_db"] is None and
                    label["ordinary_mae_eligible"] is True, "observed SNR requires a real ordinary-MAE label")
        elif kind == "censored_upper_bound":
            require(label["snr_db"] is None and type(label["bound_db"]) in (int, float) and
                    label["ordinary_mae_eligible"] is False, "censored failure is not an observed SNR label")
        else:
            require(label["snr_db"] is None and label["bound_db"] is None and
                    label["ordinary_mae_eligible"] is False, "unknown is not a negative/SNR label")
        require(utc_time(label["issued_at"]) <= utc_time(label["valid_at"]) <=
                utc_time(label["available_at"]) <= utc_time(label["captured_at"]),
                "label timestamps must follow issue/valid/available/captured order")


def validate_bundle(protocol, manifest, schema):
    validate_protocol(protocol)
    validate_manifest(manifest, schema)
    require(manifest["protocol_id"] == protocol["protocol_id"], "protocol/manifest mismatch")
    return {"protocol_id": PROTOCOL_ID, "consistency": "PASS", "qualification": "BLOCKED",
            "validated_coverage_rows": 0, "synthetic_fixtures": len(manifest["fixtures"]),
            "eligible_observational_datasets": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, default=HERE / "protocol-v0.1.json")
    parser.add_argument("--manifest", type=Path, default=HERE / "fixture-manifest.json")
    args = parser.parse_args()
    try:
        result = validate_bundle(load_json(args.protocol), load_json(args.manifest),
                                 load_json(HERE / "fixture-manifest.schema.json"))
    except (Invalid, OSError, json.JSONDecodeError, TypeError, KeyError) as error:
        print(json.dumps({"consistency": "FAIL", "qualification": "BLOCKED", "error": str(error)}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

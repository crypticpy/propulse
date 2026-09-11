"""Independent analytic regressions and invalid-manifest mutation checks."""
import copy
import math
from pathlib import Path
import tempfile
import unittest

from validate import (HERE, Invalid, covariance, load_json, schema_check,
                      symmetric_eigenvalues, validate_bundle)


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.protocol = load_json(HERE / "protocol-v0.1.json")
        self.manifest = load_json(HERE / "fixture-manifest.json")
        self.schema = load_json(HERE / "fixture-manifest.schema.json")

    def check(self):
        return validate_bundle(self.protocol, self.manifest, self.schema)

    def test_valid_bundle_never_qualifies(self):
        result = self.check()
        self.assertEqual(result["consistency"], "PASS")
        self.assertEqual(result["qualification"], "BLOCKED")
        self.assertEqual(result["validated_coverage_rows"], 0)
        self.assertEqual(result["eligible_observational_datasets"], 0)

    def test_missing_row_event_domain_units(self):
        for field in ("event", "domain", "units"):
            with self.subTest(field=field):
                saved = self.protocol["coverage_rows"][0].pop(field)
                with self.assertRaises(Invalid):
                    self.check()
                self.protocol["coverage_rows"][0][field] = saved

    def test_missing_fixture_event_domain_units(self):
        for field in ("event", "domain", "units"):
            with self.subTest(field=field):
                saved = self.manifest["fixtures"][0].pop(field)
                with self.assertRaises(Invalid):
                    self.check()
                self.manifest["fixtures"][0][field] = saved

    def test_unversioned_eligible_comparator(self):
        self.protocol["comparators"][0]["status"] = "eligible"
        with self.assertRaisesRegex(Invalid, "version"):
            self.check()
        self.protocol["comparators"][0]["version"] = "fixture-only-v1"
        with self.assertRaisesRegex(Invalid, "SHA-256"):
            self.check()

    def test_claimed_qualification_rejected(self):
        self.protocol["qualification"] = "PASS"
        with self.assertRaisesRegex(Invalid, "BLOCKED"):
            self.check()

    def test_experimental_cannot_be_validated(self):
        row = next(r for r in self.protocol["coverage_rows"] if r["status"] == "experimental")
        row["status"] = "validated_current"
        with self.assertRaisesRegex(Invalid, "no validated"):
            self.check()

    def test_gate_cannot_be_passed_or_removed(self):
        self.protocol["gates"][0]["status"] = "PASS"
        with self.assertRaises(Invalid):
            self.check()
        self.protocol["gates"].pop(0)
        with self.assertRaises(Invalid):
            self.check()

    def test_invalid_geodesic_kernel_and_jitter_rejected(self):
        self.protocol["numerics"]["covariance_kernel"] = "geodesic_se"
        with self.assertRaisesRegex(Invalid, "invalid PSD kernel"):
            self.check()
        self.protocol["numerics"]["covariance_kernel"] = "chordal_se_times_temporal_exponential"
        self.protocol["numerics"]["jitter_policy"] = "add_until_cholesky_passes"
        with self.assertRaisesRegex(Invalid, "jitter"):
            self.check()

    def test_censored_bound_cannot_supply_snr_mae_label(self):
        label = self.manifest["labels"][1]
        label["snr_db"] = label["bound_db"]
        label["ordinary_mae_eligible"] = True
        with self.assertRaisesRegex(Invalid, "censored failure"):
            self.check()

    def test_unknown_cannot_be_negative_label(self):
        self.manifest["labels"][2]["snr_db"] = 0
        with self.assertRaisesRegex(Invalid, "unknown"):
            self.check()

    def test_observational_dataset_cannot_be_added(self):
        self.protocol["eligible_observational_datasets"] = ["unverified-data"]
        with self.assertRaisesRegex(Invalid, "no observational"):
            self.check()

    def test_cross_event_mae_gate_rejected(self):
        row = next(r for r in self.protocol["coverage_rows"] if r["event"] == "doppler")
        row["qualification_metric"] = "weighted_mae_db"
        with self.assertRaisesRegex(Invalid, "metric must match event"):
            self.check()

    def test_missing_row_preregistration_owner_rejected(self):
        del self.protocol["coverage_rows"][0]["preregistration"]["owner"]
        with self.assertRaisesRegex(Invalid, "blocked owner"):
            self.check()

    def test_resampling_is_experimental_and_scoped(self):
        self.protocol["resampling"]["method_status"] = "validated"
        with self.assertRaisesRegex(Invalid, "experimental SNR"):
            self.check()

    def test_accuracy_gate_prerequisites_are_pinned(self):
        accuracy = next(g for g in self.protocol["gates"] if g["id"] == "G-ACCURACY")
        frozen = list(accuracy["prerequisites"])
        for mutated in (["whatever"], frozen[:-1], frozen + ["G-RUNTIME"],
                        frozen + [frozen[0]], ["G-UNKNOWN"] + frozen[1:]):
            accuracy["prerequisites"] = list(mutated)
            with self.assertRaisesRegex(Invalid, "G-ACCURACY|unknown gate"):
                self.check()
        accuracy["prerequisites"] = list(reversed(frozen))
        self.assertEqual(self.check()["consistency"], "PASS")

    def test_measurement_and_replay_contracts_are_frozen(self):
        for section, field, value, pattern in (
                ("measurement", "population_status", "PASS", "BLOCKED"),
                ("replay", "split_assignment", "PASS", "BLOCKED"),
                ("replay", "isolation", "none", "frozen contract text"),
                ("replay", "pairing", "BLOCKED: weakened", "frozen contract text"),
                ("measurement", "censored_policy", "BLOCKED: relaxed", "frozen contract text")):
            protocol = copy.deepcopy(self.protocol)
            protocol[section][field] = value
            with self.assertRaisesRegex(Invalid, pattern):
                validate_bundle(protocol, self.manifest, self.schema)
        protocol = copy.deepcopy(self.protocol)
        protocol["replay"]["extra"] = "note"
        with self.assertRaisesRegex(Invalid, "frozen contract text"):
            validate_bundle(protocol, self.manifest, self.schema)

    def test_resampling_status_cannot_pass(self):
        for status in ("PASS", "validated", "blocked", "READY: pending", ""):
            self.protocol["resampling"]["status"] = status
            with self.assertRaisesRegex(Invalid, "BLOCKED|resampling.status"):
                self.check()

    def test_weakened_numerical_tolerance_rejected(self):
        self.protocol["numerics"]["complex_normalized_residual"] = 0.1
        with self.assertRaisesRegex(Invalid, "frozen tolerance"):
            self.check()

    def test_moving_workload_cannot_inherit_hf_pass(self):
        self.protocol["runtime_profiles"][2]["status"] = "PASS"
        with self.assertRaisesRegex(Invalid, "runtime"):
            self.check()

    def test_corrupt_expected_eigenvalue_rejected(self):
        self.manifest["fixtures"][1]["expected_min_eigenvalue"] = 1
        with self.assertRaisesRegex(Invalid, "eigenvalue mismatch"):
            self.check()

    def test_invalid_psd_fixture_cannot_be_counted_as_valid(self):
        self.manifest["fixtures"][0]["expected_psd"] = True
        with self.assertRaisesRegex(Invalid, "PSD expectation"):
            self.check()

    def test_missing_negative_psd_fixture_rejected(self):
        self.manifest["fixtures"].pop(0)
        with self.assertRaisesRegex(Invalid, "required independent"):
            self.check()

    def test_strict_schema_and_unknown_fields(self):
        self.manifest["labels"][0]["operational_data_path"] = "/not-read"
        with self.assertRaisesRegex(Invalid, "unknown field"):
            self.check()
        with self.assertRaisesRegex(Invalid, "unsupported schema"):
            schema_check(1, {"type": "number", "not": {"const": 0}})

    def test_nonfinite_duplicate_and_boolean_numeric_json(self):
        for text in ('{"x":NaN}', '{"x":Infinity}', '{"unconstrained":1e999}', '{"x":1,"x":2}'):
            with self.subTest(text=text), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "bad.json"
                path.write_text(text)
                with self.assertRaises(Invalid):
                    load_json(path)
        self.manifest["fixtures"][0]["ell_km"] = True
        with self.assertRaises(Invalid):
            self.check()

    def test_label_timestamps_and_utc(self):
        self.manifest["labels"][0]["captured_at"] = "2025-01-01T00:00:00Z"
        with self.assertRaisesRegex(Invalid, "timestamps"):
            self.check()
        self.manifest["labels"][0]["captured_at"] = "2026-01-01T01:02:00"
        with self.assertRaisesRegex(Invalid, "UTC"):
            self.check()

    def test_duplicate_row_and_identity_drift(self):
        self.protocol["coverage_rows"].append(copy.deepcopy(self.protocol["coverage_rows"][0]))
        with self.assertRaisesRegex(Invalid, "duplicate ID"):
            self.check()
        self.protocol["coverage_rows"].pop()
        self.protocol["coverage_rows"][0]["horizon"] = "forecast_seconds"
        with self.assertRaisesRegex(Invalid, "row identity"):
            self.check()

    def test_frozen_inventory_rejects_deletion_addition_and_replacement(self):
        original = copy.deepcopy(self.protocol["coverage_rows"])
        self.protocol["coverage_rows"].pop(0)  # 2200 m still has its waveguide row.
        with self.assertRaisesRegex(Invalid, "frozen coverage inventory"):
            self.check()
        self.protocol["coverage_rows"] = copy.deepcopy(original)
        replacement = copy.deepcopy(original[0])
        replacement["horizon"] = "current"
        replacement["id"] = replacement["id"].replace(".climatology.", ".current.")
        self.protocol["coverage_rows"][0] = replacement
        with self.assertRaisesRegex(Invalid, "frozen coverage inventory"):
            self.check()
        self.protocol["coverage_rows"] = copy.deepcopy(original) + [replacement]
        with self.assertRaisesRegex(Invalid, "frozen coverage inventory"):
            self.check()

    def test_inventory_freeze_is_order_independent(self):
        self.protocol["coverage_rows"].reverse()
        self.assertEqual(self.check()["consistency"], "PASS")


class CovarianceTests(unittest.TestCase):
    def test_geodesic_four_point_negative_eigenpair(self):
        radius, ell = 6371.0, 15000.0
        a = math.exp(-(math.pi*radius/2)**2/(2*ell**2))
        b = math.exp(-(math.pi*radius)**2/(2*ell**2))
        matrix = [[1, a, b, a], [a, 1, a, b], [b, a, 1, a], [a, b, a, 1]]
        vector = [1, -1, 1, -1]
        quadratic = sum(vector[i]*matrix[i][j]*vector[j] for i in range(4) for j in range(4))
        self.assertAlmostEqual(quadratic/4, -0.19037664870820725, places=12)
        self.assertAlmostEqual(min(symmetric_eigenvalues(matrix)), quadratic/4, places=12)
        self.assertLess(quadratic, 0)  # Independent PSD definition, no factorization repair.

    def test_chordal_four_point_matches_closed_form_spectrum(self):
        a = math.exp(-6371.0**2/15000.0**2)
        expected = sorted([(1+a)**2, 1-a*a, 1-a*a, (1-a)**2])
        matrix = covariance([(0, 0), (0, 90), (0, 180), (0, -90)], [0]*4, 15000, 1)
        for actual, wanted in zip(symmetric_eigenvalues(matrix), expected):
            self.assertAlmostEqual(actual, wanted, places=12)

    def test_poles_dateline_duplicate_and_temporal_psd(self):
        points = [(90, 0), (90, 180), (-90, 30), (0, 179.9), (0, -179.9), (20, 30)]
        same_time = covariance(points, [0]*6, 15000, 3600)
        self.assertAlmostEqual(same_time[0][1], 1, places=14)
        self.assertGreater(same_time[3][4], 0.999)
        self.assertGreaterEqual(min(symmetric_eigenvalues(same_time)), -1e-12)
        times = [0, 3600, 7200, 0, 100, 10000]
        matrix = covariance(points, times, 15000, 3600)
        self.assertAlmostEqual(matrix[0][1], math.exp(-1), places=14)
        self.assertGreaterEqual(min(symmetric_eigenvalues(matrix)), -1e-12)
        self.assertEqual(covariance([(0, 0)], [0], 1, 1, sigma=0), [[0.0]])

    def test_invalid_scales_coordinates_rejected(self):
        for ell in (0, -1, float("inf"), float("nan")):
            with self.subTest(ell=ell), self.assertRaises(Invalid):
                covariance([(0, 0)], [0], ell, 1)
        with self.assertRaises(Invalid):
            covariance([(91, 0)], [0], 1, 1)
        with self.assertRaises(Invalid):
            covariance([(0, 0)], [], 1, 1)


if __name__ == "__main__":
    unittest.main()

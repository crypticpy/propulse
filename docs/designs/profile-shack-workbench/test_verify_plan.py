"""Regression coverage for scope loss, broken gates and published-table drift."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("verify_plan", ROOT / "verify-plan.py")
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class PlanRegressionTests(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads((ROOT / "delivery-plan.json").read_text())
        self.document = (ROOT / "DELIVERY-PLAN.md").read_text()

    def reject(self, phrase):
        with self.assertRaisesRegex(AssertionError, phrase):
            VERIFIER.validate(self.plan)

    def test_approved_plan_and_document(self):
        self.assertEqual(VERIFIER.validate(self.plan), (22, 66))
        self.assertEqual(VERIFIER.sync_document(self.plan, self.document), self.document)

    def test_missing_requirement_mapping(self):
        self.plan["requirement_deliverables"].pop("S17")
        self.reject("Missing requirement delivery mapping")

    def test_removed_rack_deliverable(self):
        self.plan["tasks"] = [t for t in self.plan["tasks"] if t["id"] != "W20"]
        self.reject("Approved W01–W22")

    def test_removed_operator_gate_even_when_edges_are_removed(self):
        self.plan["tasks"] = [t for t in self.plan["tasks"] if t["id"] != "W22"]
        for task in self.plan["tasks"]:
            task["depends_on"] = [d for d in task["depends_on"] if d != "W22"]
        self.reject("Approved W01–W22")

    def test_removed_phase_even_when_tasks_are_reassigned(self):
        self.plan["phases"] = [p for p in self.plan["phases"] if p["id"] != "5"]
        for task in self.plan["tasks"]:
            if task["phase"] == "5":
                task["phase"] = "4"
        self.reject("Approved P0–P5")

    def test_same_phase_dependency_cycle(self):
        next(t for t in self.plan["tasks"] if t["id"] == "W02")["depends_on"].append("W03")
        self.reject("Dependency cycle")

    def test_orphaned_operator_gate(self):
        next(t for t in self.plan["tasks"] if t["id"] == "W21")["depends_on"].remove("W22")
        self.reject("Tasks bypass completion gate")

    def test_replaced_completion_gate(self):
        self.plan["completion_gate"] = "W22"
        self.reject("Approved completion gate changed")

    def test_duplicate_issue_identity(self):
        self.plan["tasks"][1]["issue"] = copy.deepcopy(self.plan["tasks"][0]["issue"])
        self.reject("Issue reused")

    def test_json_only_dependency_edit_requires_document_update(self):
        next(t for t in self.plan["tasks"] if t["id"] == "W21")["depends_on"].remove("W04")
        VERIFIER.validate(self.plan)  # Still reachable transitively; only the table is stale.
        with self.assertRaisesRegex(AssertionError, "Stale packages table"):
            VERIFIER.sync_document(self.plan, self.document)

    def test_document_only_edits_are_rejected(self):
        for name in ("phases", "packages", "coverage"):
            with self.subTest(section=name):
                altered = self.document.replace(f"<!-- workbench:{name}:start -->\n", f"<!-- workbench:{name}:start -->\nSTALE\n")
                with self.assertRaisesRegex(AssertionError, f"Stale {name} table"):
                    VERIFIER.sync_document(self.plan, altered)

    def test_regeneration_repairs_only_generated_tables(self):
        self.plan["requirement_deliverables"]["S01"].append("W03")
        VERIFIER.validate(self.plan)
        generated = VERIFIER.sync_document(self.plan, self.document, write=True)
        self.assertNotEqual(generated, self.document)
        self.assertEqual(VERIFIER.sync_document(self.plan, generated), generated)
        self.assertEqual(generated.split("## Keeping the plan honest")[1], self.document.split("## Keeping the plan honest")[1])


if __name__ == "__main__":
    unittest.main()

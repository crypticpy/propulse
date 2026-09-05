#!/usr/bin/env python3
"""Validate the versioned workbench requirement register and dependency graph."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def validate(plan):
    expected = {f"S{i:02}" for i in range(1, 18)}
    assert set(plan["requirements"]) == expected, "Approved S01–S17 scope changed"
    tasks = {t["id"]: t for t in plan["tasks"]}
    assert len(tasks) == len(plan["tasks"]), "Duplicate work package IDs"
    phases = {p["id"]: p for p in plan["phases"]}
    assert len(phases) == len(plan["phases"]), "Duplicate phase IDs"
    numbers = [t["issue"]["number"] for t in tasks.values()]
    assert len(numbers) == len(set(numbers)), "Issue reused by multiple work packages"
    owners = plan["requirement_deliverables"]
    assert set(owners) == expected, "Missing requirement delivery mapping"
    for req, ids in owners.items():
        assert ids, f"{req} has no implementation deliverable"
        for task_id in ids:
            assert task_id in tasks, f"{req}: missing {task_id}"
            assert req in tasks[task_id]["requirements"], f"{task_id} omits {req}"
    visiting, visited = set(), set()
    def visit(task_id):
        assert task_id not in visiting, f"Dependency cycle at {task_id}"
        if task_id in visited:
            return
        visiting.add(task_id)
        task = tasks[task_id]
        assert task["phase"] in phases, f"{task_id}: unknown phase"
        assert task["acceptance"] and task["verification"], f"{task_id}: no acceptance evidence contract"
        assert task["requirements"] and set(task["requirements"]) <= expected, f"{task_id}: invalid requirements"
        assert task["issue"]["url"] == f"https://github.com/{plan['repository']}/issues/{task['issue']['number']}", f"{task_id}: issue URL mismatch"
        assert len(task["depends_on"]) == len(set(task["depends_on"])), f"{task_id}: duplicate dependency"
        for dep in task["depends_on"]:
            assert dep in tasks, f"{task_id}: missing dependency {dep}"
            assert int(tasks[dep]["phase"]) <= int(task["phase"]), f"{task_id}: depends on a later phase"
            visit(dep)
        visiting.remove(task_id)
        visited.add(task_id)
    for task_id in tasks:
        visit(task_id)
    # A closure path to the cutover gate must exist for every deliverable.
    closure = set()
    def collect(task_id):
        if task_id in closure:
            return
        closure.add(task_id)
        for dep in tasks[task_id]["depends_on"]:
            collect(dep)
    collect(plan["completion_gate"])
    assert closure == set(tasks), f"Tasks bypass completion gate: {set(tasks) - closure}"
    for phase in phases.values():
        assert phase["exit_gate"] and phase["milestone"]["number"], "Missing phase gate/milestone"
    return len(tasks), sum(len(t["depends_on"]) for t in tasks.values())

if __name__ == "__main__":
    plan = json.loads((ROOT / "delivery-plan.json").read_text())
    count, edges = validate(plan)
    print(f"Workbench plan valid: 17 requirements, {count} deliverables, {len(plan['phases'])} phases, {edges} dependency edges; every deliverable reaches the completion gate.")

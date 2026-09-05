#!/usr/bin/env python3
"""Validate the versioned workbench requirement register and dependency graph."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def validate(plan):
    expected = {f"S{i:02}" for i in range(1, 18)}
    assert len(plan["requirements"]) == 17 and set(plan["requirements"]) == expected, "Approved S01–S17 scope changed"
    tasks = {t["id"]: t for t in plan["tasks"]}
    assert len(tasks) == len(plan["tasks"]), "Duplicate work package IDs"
    assert set(tasks) == {f"W{i:02}" for i in range(1, 23)}, "Approved W01–W22 work packages changed"
    assert plan["completion_gate"] == "W21", "Approved completion gate changed"
    phases = {p["id"]: p for p in plan["phases"]}
    assert len(phases) == len(plan["phases"]), "Duplicate phase IDs"
    assert set(phases) == {str(i) for i in range(6)}, "Approved P0–P5 phases changed"
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

def generated_sections(plan):
    tasks = {t["id"]: t for t in plan["tasks"]}
    def link(task):
        issue = task["issue"]
        return f"[{task['id']} · #{issue['number']}]({issue['url']})"
    phases = ["| Phase | Milestone | Exit evidence |", "|---|---|---|"]
    for phase in plan["phases"]:
        phases.append(f"| P{phase['id']} | [{phase['title']}]({phase['milestone']['url']}) | {phase['exit_gate']} |")
    packages = ["| Work package | Phase | Blocked by | Delivers |", "|---|---|---|---|"]
    for task in plan["tasks"]:
        deps = ", ".join(link(tasks[d]) for d in task["depends_on"]) or "None — ready to claim"
        packages.append(f"| {link(task)} {task['title']} | P{task['phase']} | {deps} | {', '.join(task['requirements'])} |")
    coverage = ["| Requirement | Implementation evidence belongs in |", "|---|---|"]
    for requirement, ids in plan["requirement_deliverables"].items():
        coverage.append(f"| {requirement} | {', '.join(link(tasks[i]) for i in ids)} |")
    return {name: "\n".join(lines) for name, lines in (("phases", phases), ("packages", packages), ("coverage", coverage))}


def sync_document(plan, document, write=False):
    for name, expected in generated_sections(plan).items():
        start = f"<!-- workbench:{name}:start -->"
        end = f"<!-- workbench:{name}:end -->"
        assert document.count(start) == document.count(end) == 1, f"Missing/duplicate {name} document markers"
        before, rest = document.split(start)
        actual, after = rest.split(end)
        assert start not in after, f"Invalid {name} document marker order"
        wanted = "\n" + expected + "\n"
        if not write:
            assert actual == wanted, f"Stale {name} table: run verify-plan.py --write-docs"
        document = before + start + wanted + end + after
    return document


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-docs", action="store_true", help="Regenerate the marked delivery tables from the validated JSON register")
    args = parser.parse_args()
    plan = json.loads((ROOT / "delivery-plan.json").read_text())
    count, edges = validate(plan)
    document_path = ROOT / "DELIVERY-PLAN.md"
    document = sync_document(plan, document_path.read_text(), write=args.write_docs)
    if args.write_docs:
        document_path.write_text(document)
    print(f"Workbench plan valid: 17 requirements, {count} deliverables, {len(plan['phases'])} phases, {edges} dependency edges; every deliverable reaches the completion gate and published tables match.")

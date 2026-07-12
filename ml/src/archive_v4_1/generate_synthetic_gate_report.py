#!/usr/bin/env python3
"""Generate a self-contained synthetic dry run of the V4.1 gate report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from protocol import DEFAULT_CONFIG, artifact, atomic_write_json, load_json, utc_now


ROOT = Path(__file__).resolve().parents[3]


def html_document(payload: dict) -> str:
    bars = []
    for index, row in enumerate(payload["synthetic_candidates"]):
        width = max(2, round((0.05 - row["brier"]) / 0.01 * 520))
        y = 42 + index * 44
        bars.append(
            f'<text x="0" y="{y + 17}" class="label">{row["candidate"]}</text>'
            f'<rect x="180" y="{y}" width="{width}" height="22" rx="2" '
            f'class="bar" role="img" aria-label="{row["candidate"]} synthetic Brier {row["brier"]:.4f}" />'
            f'<text x="{190 + width}" y="{y + 17}" class="value">{row["brier"]:.4f}</text>'
        )
    gate_rows = "".join(
        f'<tr><th scope="row">{row["gate"]}</th><td class="pass">PASS</td><td>{row["explanation"]}</td></tr>'
        for row in payload["synthetic_gates"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Propulse V4.1 synthetic gate report dry run</title>
<style>
:root {{ color-scheme: light; --ink:#152026; --muted:#52616a; --line:#cfd8dc; --accent:#087f5b; --warn:#9a3412; --paper:#fff; --band:#f3f7f5; }}
* {{ box-sizing:border-box; }} body {{ margin:0; font:16px/1.55 system-ui,sans-serif; color:var(--ink); background:var(--paper); }}
header,main,footer {{ max-width:1080px; margin:auto; padding:24px; }} header {{ border-bottom:4px solid var(--warn); }}
h1 {{ font-size:2.6rem; margin:.2rem 0; letter-spacing:0; }} h2 {{ margin-top:2.2rem; letter-spacing:0; }}
.warning {{ font-weight:800; color:var(--warn); text-transform:uppercase; letter-spacing:0; }}
.summary {{ background:var(--band); border-left:5px solid var(--accent); padding:16px; }}
svg {{ width:100%; height:auto; min-height:280px; border:1px solid var(--line); background:#fff; }}
.bar {{ fill:var(--accent); }} .label,.value {{ font:14px system-ui,sans-serif; fill:var(--ink); }}
table {{ width:100%; border-collapse:collapse; }} th,td {{ padding:10px; border-bottom:1px solid var(--line); text-align:left; }}
.pass {{ color:var(--accent); font-weight:800; }} code {{ background:#eef2f3; padding:2px 4px; }}
footer {{ color:var(--muted); border-top:1px solid var(--line); }}
@media (max-width:640px) {{ h1 {{ font-size:2rem; }} header,main,footer {{ padding:16px; }} th,td {{ padding:8px 4px; }} }}
@media (prefers-reduced-motion:reduce) {{ * {{ scroll-behavior:auto!important; animation:none!important; }} }}
</style>
</head>
<body>
<header><p class="warning">Synthetic fixture, not experimental evidence</p><h1>V4.1 Gate Report Dry Run</h1><p>This page validates report structure, labels, accessibility, and failure disclosure before November outcomes can be opened.</p></header>
<main>
<section class="summary" aria-labelledby="summary"><h2 id="summary">How to read this</h2><p>A probability forecast says how often an event should happen among similar cases. Brier score measures squared probability error, so lower is better. Calibration checks whether a stated 30% chance happens about 30% of the time. Untouched data matters because changing the model after seeing the exam answers makes the score unreliable.</p></section>
<section aria-labelledby="chart"><h2 id="chart">Synthetic candidate comparison</h2><svg viewBox="0 0 760 280" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">Synthetic weighted Brier scores</title><desc id="chart-desc">Illustrative lower-is-better bars used only to test report rendering.</desc>{''.join(bars)}</svg></section>
<section aria-labelledby="gates"><h2 id="gates">Synthetic gate table</h2><table><thead><tr><th>Gate</th><th>Status</th><th>Meaning</th></tr></thead><tbody>{gate_rows}</tbody></table></section>
<section><h2>Real report contract</h2><p>The final report must publish every pass and failure, candidate and fallback coverage, reliability, day-bootstrap intervals, compute use, checksums, limitations, and locked-data access state. It must never replace failed evidence with a tuned rerun.</p></section>
</main>
<footer>Generated {payload['generated_at']}. No network requests, animation, personal identifiers, station identifiers, callsigns, or exact locations are present.</footer>
</body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    root = ROOT / "ml/results/propagation_v4_1" / config["run_id"] / "synthetic_dry_run"
    root.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "synthetic_report_dry_run",
        "synthetic": True,
        "november_gate_read": False,
        "locked_archive_test_read": False,
        "synthetic_candidates": [
            {"candidate": "B0 climatology", "brier": 0.0480},
            {"candidate": "M1 physics", "brier": 0.0445},
            {"candidate": "M2 raw", "brier": 0.0439},
            {"candidate": "M2 + C4", "brier": 0.0438},
        ],
        "synthetic_gates": [
            {"gate": "Integrity", "passed": True, "explanation": "All synthetic inputs satisfy schema and time rules."},
            {"gate": "Calibration", "passed": True, "explanation": "The illustrative calibrated score is no worse than raw."},
            {"gate": "Fallback", "passed": True, "explanation": "The synthetic stale-history path selects physics and lowers confidence."},
            {"gate": "Serving parity", "passed": True, "explanation": "The fixture assumes identical offline and service probabilities."},
        ],
    }
    json_path = root / "synthetic_gate_report.json"
    html_path = root / "REPORT.html"
    atomic_write_json(json_path, payload)
    html_path.write_text(html_document(payload), encoding="utf-8")
    scan = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "synthetic": True,
        "checks": {
            "html_self_contained": "http://" not in html_path.read_text(encoding="utf-8") and "https://" not in html_path.read_text(encoding="utf-8"),
            "synthetic_label_present": "Synthetic fixture" in html_path.read_text(encoding="utf-8"),
            "accessible_chart_text": "aria-labelledby" in html_path.read_text(encoding="utf-8") and "<desc" in html_path.read_text(encoding="utf-8"),
            "reduced_motion_rule": "prefers-reduced-motion" in html_path.read_text(encoding="utf-8"),
            "no_locked_access": not payload["november_gate_read"] and not payload["locked_archive_test_read"],
        },
        "artifacts": {"json": artifact(json_path), "html": artifact(html_path)},
    }
    scan["passed"] = all(scan["checks"].values())
    scan_path = root / "report_validation.json"
    atomic_write_json(scan_path, scan)
    if not scan["passed"]:
        raise RuntimeError("synthetic report validation failed")
    print(scan_path)


if __name__ == "__main__":
    main()

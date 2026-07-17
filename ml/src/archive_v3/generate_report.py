"""Generate a self-contained animated technical report for Archive V3."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any

from common import MANIFESTS, RESULTS, load_config, relative, utc_now


COLORS = ["#087f5b", "#1971c2", "#e67700", "#c92a2a", "#5f3dc4", "#0b7285"]


def esc(value: Any) -> str:
    return html.escape(str(value))


def metric(value: Any, digits: int = 4) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, (int, float)):
        return f"{value:.{digits}f}"
    return str(value)


def compact(value: float | int) -> str:
    number = float(value)
    for unit, divisor in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if abs(number) >= divisor:
            return f"{number/divisor:.1f}{unit}"
    return f"{number:.0f}"


def bar_chart(title: str, items: list[tuple[str, float]], digits: int = 4) -> str:
    width, height = 760, 300
    left, right, top, bottom = 72, 18, 32, 70
    chart_w, chart_h = width - left - right, height - top - bottom
    maximum = max((value for _, value in items), default=1) or 1
    gap = chart_w / max(len(items), 1)
    bars = []
    for index, (label, value) in enumerate(items):
        bar_w = min(72, gap * 0.58)
        x = left + gap * index + (gap - bar_w) / 2
        bar_h = chart_h * value / maximum
        y = top + chart_h - bar_h
        color = COLORS[index % len(COLORS)]
        bars.append(
            f'<g><rect class="animated-bar" x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" '
            f'height="{bar_h:.1f}" rx="3" fill="{color}"/>'
            f'<text x="{x+bar_w/2:.1f}" y="{y-8:.1f}" text-anchor="middle" class="chart-value">{value:.{digits}f}</text>'
            f'<text x="{x+bar_w/2:.1f}" y="{height-bottom+24}" text-anchor="middle" class="chart-label">{esc(label)}</text></g>'
        )
    return (
        f'<figure class="chart reveal"><figcaption>{esc(title)}</figcaption>'
        f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">'
        f'<line x1="{left}" y1="{top+chart_h}" x2="{width-right}" y2="{top+chart_h}" class="axis"/>'
        + "".join(bars)
        + "</svg></figure>"
    )


def horizontal_bar_chart(
    title: str, items: list[tuple[str, float]], digits: int = 2
) -> str:
    width = 760
    row_height = 32
    left, right, top, bottom = 175, 90, 28, 24
    height = top + bottom + row_height * max(len(items), 1)
    chart_width = width - left - right
    maximum = max((value for _, value in items), default=1) or 1
    rows = []
    for index, (label, value) in enumerate(items):
        y = top + index * row_height
        bar_width = chart_width * value / maximum
        color = COLORS[index % len(COLORS)]
        rows.append(
            f'<g><text x="{left-10}" y="{y+15}" text-anchor="end" '
            f'class="chart-label">{esc(label)}</text>'
            f'<rect class="animated-hbar" x="{left}" y="{y}" width="{bar_width:.1f}" '
            f'height="20" rx="3" fill="{color}"/>'
            f'<text x="{left+bar_width+7:.1f}" y="{y+15}" class="chart-value">'
            f'{value:.{digits}f}</text></g>'
        )
    return (
        f'<figure class="chart reveal"><figcaption>{esc(title)}</figcaption>'
        f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">'
        + "".join(rows)
        + "</svg></figure>"
    )


def line_chart(
    title: str,
    series: list[tuple[str, list[tuple[float, float]]]],
    x_label: str,
    y_label: str,
) -> str:
    width, height = 760, 330
    left, right, top, bottom = 78, 24, 32, 60
    points = [point for _, values in series for point in values]
    if not points:
        return f'<div class="empty reveal">No data for {esc(title)}</div>'
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    if x_min == x_max:
        x_max += 1
    if y_min == y_max:
        y_max += 1
    y_pad = (y_max - y_min) * 0.08
    y_min, y_max = max(0, y_min - y_pad), y_max + y_pad

    def xy(point: tuple[float, float]) -> tuple[float, float]:
        x = left + (point[0] - x_min) / (x_max - x_min) * (width - left - right)
        y = top + (y_max - point[1]) / (y_max - y_min) * (height - top - bottom)
        return x, y

    paths = []
    legends = []
    for index, (name, values) in enumerate(series):
        color = COLORS[index % len(COLORS)]
        coords = [xy(point) for point in values]
        path = " ".join(("M" if i == 0 else "L") + f"{x:.1f},{y:.1f}" for i, (x, y) in enumerate(coords))
        dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{color}"/>' for x, y in coords)
        paths.append(f'<path class="animated-line" d="{path}" fill="none" stroke="{color}" stroke-width="3"/>{dots}')
        legends.append(f'<span><i style="background:{color}"></i>{esc(name)}</span>')
    ticks = []
    for index in range(5):
        value = y_min + (y_max - y_min) * index / 4
        y = top + (height - top - bottom) * (1 - index / 4)
        ticks.append(f'<line x1="{left}" y1="{y:.1f}" x2="{width-right}" y2="{y:.1f}" class="grid"/><text x="{left-10}" y="{y+4:.1f}" text-anchor="end" class="tick">{value:.3f}</text>')
    return (
        f'<figure class="chart reveal"><figcaption>{esc(title)}</figcaption>'
        f'<div class="legend">{"".join(legends)}</div>'
        f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">'
        + "".join(ticks)
        + f'<line x1="{left}" y1="{top}" x2="{left}" y2="{height-bottom}" class="axis"/>'
        + f'<line x1="{left}" y1="{height-bottom}" x2="{width-right}" y2="{height-bottom}" class="axis"/>'
        + "".join(paths)
        + f'<text x="{width/2}" y="{height-12}" text-anchor="middle" class="axis-title">{esc(x_label)}</text>'
        + f'<text transform="translate(18,{height/2}) rotate(-90)" text-anchor="middle" class="axis-title">{esc(y_label)}</text>'
        + "</svg></figure>"
    )


def result_profile(results: dict, profile: str) -> dict:
    return results.get("profiles", {}).get(profile, {})


def source_table(bronze: dict, opportunities: dict) -> str:
    opp = {row["month"]: row for row in opportunities.get("months", [])}
    rows = []
    for month in bronze.get("months", []):
        related = opp.get(month["month"], {})
        rows.append(
            "<tr>"
            f"<td>{esc(month['month'])}</td>"
            f"<td>{compact(month['rows'])}</td>"
            f"<td>{compact(month['source_size'])}</td>"
            f"<td>{compact(related.get('rows', 0))}</td>"
            f"<td>{metric(related.get('weighted_prevalence'), 5)}</td>"
            f"<td>{compact(month.get('six_meter_rows', 0))}</td>"
            "</tr>"
        )
    return "".join(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    result_dir = RESULTS / config["run_id"]
    hf_path = result_dir / "hf_results.json"
    if not hf_path.exists():
        raise FileNotFoundError(hf_path)
    hf = json.loads(hf_path.read_text())
    six_path = result_dir / "6m_results.json"
    six = json.loads(six_path.read_text()) if six_path.exists() else None
    bronze = json.loads((MANIFESTS / f"{config['run_id']}_bronze.json").read_text())
    hf_opp = json.loads((MANIFESTS / f"{config['run_id']}_hf_opportunities.json").read_text())
    validation_path = result_dir / "hf_validation.json"
    validation = json.loads(validation_path.read_text()) if validation_path.exists() else {"summary": {}}
    rolling_path = result_dir / "hf_rolling_results.json"
    rolling = json.loads(rolling_path.read_text()) if rolling_path.exists() else None
    physics, nowcast = result_profile(hf, "physics"), result_profile(hf, "nowcast")
    physics_test = physics.get("test_calibrated", {})
    nowcast_test = nowcast.get("test_calibrated", {})
    climate = nowcast.get("climatology", physics.get("climatology", {}))
    global_climate = nowcast.get(
        "global_climatology", physics.get("global_climatology", {})
    )
    skill = nowcast.get("brier_skill_vs_climatology")
    interval = nowcast.get("day_block_vs_climatology", {}).get("bootstrap_95_ci", [])
    locked_passed = skill is not None and skill > 0 and len(interval) == 2 and interval[1] < 0
    rolling_profiles = [
        (fold["name"], name, profile)
        for fold in (rolling or {}).get("folds", [])
        for name, profile in fold.get("profiles", {}).items()
    ]
    rolling_nowcasts = [
        profile for _, name, profile in rolling_profiles if name == "nowcast"
    ]
    rolling_passed = bool(rolling_nowcasts) and all(
        profile.get("brier_skill", 0) > 0
        and profile.get("day_block", {}).get("bootstrap_95_ci", [0, 0])[1] < 0
        for profile in rolling_nowcasts
    )
    passed = locked_passed and (rolling is None or rolling_passed)
    learning_curve = nowcast.get("learning_curve", [])
    curve_by_size = {row["train_rows"]: row for row in learning_curve}
    row_20m = curve_by_size.get(20_000_000)
    row_50m = curve_by_size.get(50_000_000)
    marginal_gain = None
    if row_20m and row_50m:
        brier_20m = row_20m["test"]["weighted_brier"]
        brier_50m = row_50m["test"]["weighted_brier"]
        marginal_gain = (brier_20m - brier_50m) / brier_20m
    multi_year_ready = False
    if passed and rolling:
        verdict = (
            "Eight-month statistical gate supported: the nowcast beats fold-specific climatology "
            "in both rolling-origin tests and in the locked final month. Do not expand blindly to "
            f"multiple years: the 20M-to-50M relative Brier gain is {metric(marginal_gain, 3)}, "
            "and the P.533 plus prospective collector gates remain open."
        )
    elif passed:
        verdict = (
            "Smoke gate supported: the exposure-aware model beats climatology with a separated "
            "day-block interval. Rolling-origin evidence is required for the multi-month decision."
        )
    else:
        verdict = (
            "Gate not established: treat this as diagnostic evidence and do not advance the "
            "model without resolving the failed temporal-stability condition."
        )

    comparison_items = []
    for name, profile in (
        ("Global", {"test_calibrated": global_climate}),
        ("Band-hour", {"test_calibrated": climate}),
        ("Physics", physics),
        ("Nowcast", nowcast),
    ):
        values = profile.get("test_calibrated", {})
        if values.get("weighted_brier") is not None:
            comparison_items.append((name, values["weighted_brier"]))
    pr_items = []
    for name, profile in (("Physics", physics), ("Nowcast", nowcast)):
        value = profile.get("test_calibrated", {}).get("open_pr_auc")
        if value is not None:
            pr_items.append((name, value))
    calibration = nowcast.get("calibration_bins", [])
    calibration_chart = line_chart(
        "Locked October 2024 reliability",
        [
            ("Observed", [(row["mean_prediction"], row["observed_rate"]) for row in calibration]),
            ("Ideal", [(0, 0), (1, 1)]),
        ],
        "Mean predicted probability",
        "Weighted observed rate",
    )
    daily = nowcast.get("day_block_vs_climatology", {}).get("daily", [])
    daily_chart = line_chart(
        "Locked October 2024 daily weighted Brier",
        [
            ("Nowcast", [(index + 1, row["model_brier"]) for index, row in enumerate(daily)]),
            ("Climatology", [(index + 1, row["baseline_brier"]) for index, row in enumerate(daily)]),
        ],
        "Test day",
        "Weighted Brier (lower is better)",
    )
    bands = nowcast.get("slices", {}).get("band", [])
    band_chart = bar_chart(
        "Locked October 2024 nowcast Brier by band",
        [(row["band"], row["weighted_brier"]) for row in bands],
    )
    importance = nowcast.get("feature_importance_gain", [])[:12]
    importance_chart = horizontal_bar_chart(
        "Top XGBoost feature gains in the 50M nowcast",
        [(row["feature"].replace("path_success_", "path_"), row["gain"]) for row in importance],
        2,
    )
    curve_chart = line_chart(
        "Locked October 2024 learning curve",
        [("Nowcast", [(row["train_rows"], row["test"]["weighted_brier"]) for row in learning_curve])],
        "Training rows",
        "Weighted Brier",
    )
    distance_chart = bar_chart(
        "Locked October 2024 Brier by path distance",
        [
            (row["bucket"], row["weighted_brier"])
            for row in nowcast.get("slices", {}).get("distance", [])
        ],
    )
    claims = nowcast.get("claim_metrics", [])
    claim_chart = line_chart(
        "Locked October 2024 high-confidence claims",
        [
            (
                "Observed",
                [
                    (row["threshold"], row["weighted_observed_rate"])
                    for row in claims
                    if row["weighted_observed_rate"] is not None
                ],
            ),
            ("Claim threshold", [(row["threshold"], row["threshold"]) for row in claims]),
        ],
        "Minimum predicted probability",
        "Weighted observed rate",
    )
    volume_chart = bar_chart(
        "Valid WSPR observations by month (millions)",
        [(row["month"], row["rows"] / 1_000_000) for row in bronze.get("months", [])],
        1,
    )
    bakeoff = hf.get("engine_bakeoff", {})
    bakeoff_chart = bar_chart(
        "July 2024 engine bakeoff validation Brier",
        [
            (name, value["validation"]["weighted_brier"])
            for name, value in bakeoff.items()
        ],
    )
    rolling_chart = ""
    rolling_rows = ""
    if rolling_profiles:
        rolling_items = [
            (
                f"{'2019' if name == '2019_seasonal' else '2019-24'} {profile_name}",
                profile["brier_skill"],
            )
            for name, profile_name, profile in rolling_profiles
        ]
        rolling_chart = bar_chart(
            "Pre-test rolling-origin Brier skill versus climatology",
            rolling_items,
            3,
        )
        rolling_rows = "".join(
            "<tr>"
            f"<td>{esc(name.replace('_', ' '))}</td>"
            f"<td>{esc(profile_name)}</td>"
            f"<td>{metric(profile['test'].get('weighted_brier'))}</td>"
            f"<td>{metric(profile.get('brier_skill'), 3)}</td>"
            f"<td>{metric(profile.get('day_block', {}).get('bootstrap_95_ci', ['n/a'])[0])}</td>"
            f"<td>{metric(profile.get('day_block', {}).get('bootstrap_95_ci', ['n/a', 'n/a'])[-1])}</td>"
            "</tr>"
            for name, profile_name, profile in rolling_profiles
        )
    six_summary = "Not run or not available."
    if six:
        six_now = result_profile(six, "nowcast")
        if "skipped" in six_now:
            six_summary = f"6m model skipped: {esc(six_now['skipped'])}."
        else:
            six_metric = six_now.get("test_calibrated", {})
            six_summary = (
                f"6m nowcast: weighted Brier {metric(six_metric.get('weighted_brier'))}, "
                f"open PR-AUC {metric(six_metric.get('open_pr_auc'))}."
            )
    six_chart = ""
    if six:
        six_items = []
        for name in ("physics", "nowcast"):
            profile = result_profile(six, name)
            value = profile.get("test_calibrated", {}).get("weighted_brier")
            if value is not None:
                six_items.append((name.title(), value))
        if six_items:
            six_chart = bar_chart(
                "Independent 6m locked October 2024 Brier", six_items
            )

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Propulse Archive V3 - {esc(config['run_id'])}</title>
<style>
:root{{--ink:#162018;--muted:#59645d;--paper:#f7f8f5;--panel:#fff;--line:#d9ded9;--green:#087f5b;--blue:#1971c2;--amber:#e67700;--red:#c92a2a;}}
*{{box-sizing:border-box}} html{{scroll-behavior:smooth}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}}
header{{background:#162018;color:#fff;padding:52px max(24px,calc((100vw - 1180px)/2)) 44px;border-bottom:6px solid var(--green)}}
header h1{{font-size:clamp(34px,6vw,68px);line-height:1.02;margin:8px 0 16px;letter-spacing:0;max-width:950px}} header p{{max-width:840px;color:#d7dfda;font-size:18px;margin:0}}
.eyebrow{{font-size:12px;text-transform:uppercase;font-weight:800;color:#8ce0bd;letter-spacing:.12em}}
main{{max-width:1180px;margin:auto;padding:32px 24px 80px}} section{{padding:30px 0;border-bottom:1px solid var(--line)}} h2{{font-size:26px;margin:0 0 14px}} h3{{font-size:18px;margin:24px 0 10px}} p{{max-width:900px}} code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#e9ede9;padding:2px 5px;border-radius:3px}}
.verdict{{border-left:5px solid {"var(--green)" if passed else "var(--amber)"};background:#fff;padding:20px 22px;margin:0;max-width:1050px;font-size:17px}}
.metrics{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}} .metric{{background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--green);padding:17px;min-height:116px;border-radius:6px}} .metric strong{{display:block;font-size:29px;line-height:1.1;margin:8px 0}} .metric span{{color:var(--muted);font-size:13px}}
.charts{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}} .chart{{margin:0;background:#fff;border:1px solid var(--line);border-radius:6px;padding:16px;overflow:hidden}} .chart figcaption{{font-size:16px;font-weight:750;margin-bottom:6px}} .chart svg{{width:100%;height:auto;display:block}} .axis{{stroke:#677169;stroke-width:1.2}} .grid{{stroke:#e5e9e5;stroke-width:1}} .chart-label,.tick{{font-size:11px;fill:#5d675f}} .chart-value{{font-size:11px;font-weight:700;fill:#263029}} .axis-title{{font-size:12px;fill:#4d5850}} .legend{{display:flex;gap:14px;font-size:12px;color:var(--muted)}} .legend i{{width:9px;height:9px;display:inline-block;margin-right:5px;border-radius:50%}}
table{{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--line)}} th,td{{padding:10px 12px;text-align:right;border-bottom:1px solid var(--line)}} th:first-child,td:first-child{{text-align:left}} th{{background:#edf1ed;font-size:12px;text-transform:uppercase}} .flow{{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:20px 0}} .flow div{{background:#fff;border:1px solid var(--line);border-bottom:4px solid var(--blue);padding:15px;border-radius:5px;min-height:90px}} .flow b{{display:block;margin-bottom:5px}} ul{{max-width:930px;padding-left:20px}}
.reveal{{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease}} .reveal.visible{{opacity:1;transform:none}} .animated-bar{{transform-box:fill-box;transform-origin:center bottom;transform:scaleY(0)}} .visible .animated-bar{{animation:grow .8s cubic-bezier(.2,.8,.2,1) forwards}} .animated-hbar{{transform-box:fill-box;transform-origin:left center;transform:scaleX(0)}} .visible .animated-hbar{{animation:growx .8s cubic-bezier(.2,.8,.2,1) forwards}} .animated-line{{stroke-dasharray:1800;stroke-dashoffset:1800}} .visible .animated-line{{animation:draw 1.25s ease forwards}} @keyframes grow{{to{{transform:scaleY(1)}}}} @keyframes growx{{to{{transform:scaleX(1)}}}} @keyframes draw{{to{{stroke-dashoffset:0}}}}
.sources{{font-size:13px;color:var(--muted)}} footer{{max-width:1180px;margin:auto;padding:25px 24px 50px;color:var(--muted)}}
@media(max-width:850px){{.metrics{{grid-template-columns:repeat(2,1fr)}}.charts{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr 1fr}}}}
@media(max-width:520px){{header{{padding:34px 18px}}main{{padding:20px 14px 60px}}.metrics{{grid-template-columns:1fr 1fr}}.metric strong{{font-size:23px}}.flow{{grid-template-columns:1fr}}th,td{{padding:8px 6px;font-size:12px}}}}
@media(prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important}}.reveal{{opacity:1;transform:none}}.animated-bar,.animated-hbar{{transform:none}}.animated-line{{stroke-dashoffset:0}}}}
</style>
</head>
<body>
<header><div class="eyebrow">Propulse open research / Archive V3</div><h1>Exposure-aware propagation model experiment</h1><p>Representative WSPR months, inferred listening opportunities, inverse-probability weighted labels, prediction-time space weather, spatial cold-start slices, and a separate 6m task.</p></header>
<main>
<section><h2>Decision</h2><p class="verdict reveal">{esc(verdict)}</p>
<div class="metrics">
<div class="metric reveal"><span>Nowcast weighted Brier</span><strong>{metric(nowcast_test.get('weighted_brier'))}</strong><span>Lower is better</span></div>
<div class="metric reveal"><span>Skill vs climatology</span><strong>{metric(skill,3)}</strong><span>1 - model / baseline Brier</span></div>
<div class="metric reveal"><span>Open-path PR-AUC</span><strong>{metric(nowcast_test.get('open_pr_auc'))}</strong><span>Ranking of path-hours with a decode</span></div>
<div class="metric reveal"><span>Validation checks</span><strong>{validation.get('summary',{}).get('checks','n/a')}</strong><span>{validation.get('summary',{}).get('failures','n/a')} failures</span></div>
</div></section>
<section><h2>Experiment architecture</h2><div class="flow reveal"><div><b>1. Immutable source</b>Official monthly WSPR gzip plus NASA OMNI2 and GFZ Hp60.</div><div><b>2. Typed bronze</b>Validated calls, grids, bands, power, SNR, and timestamps.</div><div><b>3. Exposure inference</b>Active transmitters and receivers within each WSPR slot.</div><div><b>4. Weighted learning</b>Deterministic negative receiver samples with inverse weights.</div><div><b>5. Locked evaluation</b>Temporal split, unseen grids, band slices, and day-block intervals.</div></div>
<p>The primary estimand is a single WSPR decode conditional on an observed-active transmitter and receiver. A transmitter decoded nowhere remains unobservable, so this is a materially better exposure model, not a controlled transmission log.</p></section>
<section><h2>Core results</h2><div class="charts">{bar_chart('Locked October 2024 weighted Brier', comparison_items)}{bar_chart('Locked October 2024 open-path PR-AUC', pr_items)}{calibration_chart}{daily_chart}{band_chart}{distance_chart}{claim_chart}{bakeoff_chart}{curve_chart}{importance_chart}{rolling_chart}{volume_chart}</div></section>
{"<section><h2>Pre-test rolling evaluation</h2><p>These folds were evaluated before the locked October 2024 test was opened. Positive skill and a day-block interval wholly below zero are required from the nowcast in each fold.</p><div style='overflow:auto'><table><thead><tr><th>Fold</th><th>Profile</th><th>Test Brier</th><th>Brier skill</th><th>CI low</th><th>CI high</th></tr></thead><tbody>" + rolling_rows + "</tbody></table></div></section>" if rolling_rows else ""}
<section><h2>Data audit</h2><div style="overflow:auto"><table><thead><tr><th>Month</th><th>Valid spots</th><th>Raw compressed</th><th>Path-hours</th><th>Weighted rate</th><th>6m spots</th></tr></thead><tbody>{source_table(bronze,hf_opp)}</tbody></table></div></section>
<section><h2>6m result</h2><p>{six_summary}</p><p>6m remains an independent task. It is not combined with HF and is not declared product-ready merely because the shared pipeline can fit it.</p><div class="charts">{six_chart}</div></section>
<section><h2>Evidence classification</h2><h3>Observed</h3><p>Source byte counts and hashes, valid bronze rows, inferred-opportunity totals, split sizes, model scores, calibration bins, and slice metrics are direct outputs of this frozen run.</p><h3>Statistical inference</h3><p>Day-block bootstrap intervals support improvement over the declared climatology within the sampled WSPR exposure population. They do not establish universal amateur-radio contact probability.</p><h3>Engineering judgment</h3><p>The eight-month model is strong enough for a prospective collector comparison and a proper P.533 baseline. It is not yet strong evidence for an all-years build, public product probability, or GPU/deep-model investment.</p></section>
<section><h2>Interpretation limits</h2><ul><li>WSPR exposure is inferred from stations heard or hearing something in the same slot and band; transmissions heard nowhere are absent.</li><li>Amateur networks have geographic, equipment, antenna, power, and local-noise selection effects.</li><li>OMNI2 values are definitive or reprocessed. The operational profile uses H-1 availability, but a live system must preserve revision and latency semantics.</li><li>Inverse-probability weights correct deterministic negative sampling under the declared receiver sampler; they do not correct unobserved stations.</li><li>PR-AUC uses binary any-decode path-hours while Brier/log loss use the fractional opportunity target.</li></ul></section>
<section><h2>Reproducibility</h2><p>Run <code>{esc(config['run_id'])}</code> from <code>{esc(config['config_path'])}</code>. Raw data and fitted binaries remain ignored; committed manifests, aggregate metrics, validation, methodology, and this report are sufficient to audit and rebuild the result.</p><p class="sources">Sources: WSPRnet monthly archive; NASA GSFC/SPDF OMNI2; GFZ Potsdam Hp60; ITU-R P.533/NTIA references as documented in the V3 execution plan.</p></section>
</main><footer>Generated {esc(utc_now())}. Self-contained report; no network request is required to view it.</footer>
<script>
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{{if(e.isIntersecting){{e.target.classList.add('visible');observer.unobserve(e.target)}}}}),{{threshold:.12}});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
</script></body></html>"""
    output = result_dir / "REPORT.html"
    output.write_text(document, encoding="utf-8")
    summary = {
        "schema_version": 1,
        "run_id": config["run_id"],
        "generated_at": utc_now(),
        "gate_supported": passed,
        "multi_year_ready": multi_year_ready,
        "headline": {
            "nowcast_weighted_brier": nowcast_test.get("weighted_brier"),
            "brier_skill_vs_climatology": skill,
            "open_pr_auc": nowcast_test.get("open_pr_auc"),
            "day_block_95_ci": interval,
            "relative_brier_gain_20m_to_50m": marginal_gain,
        },
        "report": relative(output),
    }
    (result_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(output)


if __name__ == "__main__":
    main()

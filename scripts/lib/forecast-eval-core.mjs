/**
 * forecast-eval-core — pure scoring math for the M4 F2 eval harness.
 *
 * Everything here is deterministic and I/O-free so it can be unit tested
 * with `node --test`. The runner (scripts/eval-forecast.mjs) fetches
 * forecast_snapshots + band_hourly_stats and feeds them in.
 *
 * Definitions (documented in every report):
 * - Outcome: band b is "open" at hour h iff spot_count >= threshold(b, hod)
 *   where hod is the UTC hour-of-day and threshold is a climatology
 *   percentile of the baseline spot counts, floored at `minSpots`.
 * - Climatology forecast: p_open_clim(b, hod) = fraction of baseline hours
 *   in which (b, hod) was open under the same threshold.
 * - Held-out fitting: thresholds and climatology are fit ONLY on baseline
 *   hours strictly before each evaluation window, so an evaluated outcome
 *   never contributes to the threshold that labels it. With no pre-window
 *   baseline rows, thresholds fall back to `minSpots` (the report shows the
 *   training-hour count per window).
 */

/**
 * Nearest-rank percentile of a numeric array (p in [0, 100]).
 * @param {number[]} values
 * @param {number} p
 * @returns {number|null} null for an empty array
 */
export function nearestRankPercentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/** UTC hour-of-day (0-23) for an ISO timestamp. */
export function hourOfDay(hourUtc) {
  return new Date(hourUtc).getUTCHours();
}

function climKey(band, hod) {
  return `${band}|${hod}`;
}

/**
 * Fill in the zero-spot rows band_hourly_stats omits: for every hour that
 * was aggregated at all (appears for any band) and every band in `bands`,
 * a missing (hour, band) row means zero spots that hour.
 * @param {Array<{hour_utc: string, band: string, spot_count: number}>} truthRows
 * @param {string[]} bands
 */
export function densifyTruth(truthRows, bands) {
  const present = new Set(truthRows.map((r) => `${r.hour_utc}|${r.band}`));
  const hours = [...new Set(truthRows.map((r) => r.hour_utc))];
  const dense = [...truthRows];
  for (const hour of hours) {
    for (const band of bands) {
      if (!present.has(`${hour}|${band}`)) {
        dense.push({ hour_utc: hour, band, spot_count: 0 });
      }
    }
  }
  return dense;
}

/**
 * Build per-(band, hour-of-day) open thresholds and the climatology
 * forecast from densified baseline truth rows.
 * @param {Array<{hour_utc: string, band: string, spot_count: number}>} denseTruth
 * @param {{percentile: number, minSpots: number}} opts
 */
export function buildClimatology(denseTruth, { percentile, minSpots }) {
  /** @type {Map<string, number[]>} */
  const samples = new Map();
  for (const row of denseTruth) {
    const key = climKey(row.band, hourOfDay(row.hour_utc));
    const list = samples.get(key);
    if (list) list.push(row.spot_count);
    else samples.set(key, [row.spot_count]);
  }

  const thresholds = new Map();
  const pOpen = new Map();
  for (const [key, counts] of samples) {
    const raw = nearestRankPercentile(counts, percentile) ?? 0;
    const threshold = Math.max(minSpots, raw);
    thresholds.set(key, threshold);
    const open = counts.filter((c) => c >= threshold).length;
    pOpen.set(key, open / counts.length);
  }

  return {
    thresholds,
    pOpen,
    threshold: (band, hod) => thresholds.get(climKey(band, hod)),
    climForecast: (band, hod) => pOpen.get(climKey(band, hod)),
    sampleCount: (band, hod) => samples.get(climKey(band, hod))?.length ?? 0,
  };
}

/**
 * Mean squared error between forecast probabilities and binary outcomes.
 * @param {Array<{p: number, outcome: boolean}>} pairs
 * @returns {number|null}
 */
export function brierScore(pairs) {
  if (pairs.length === 0) return null;
  let sum = 0;
  for (const { p, outcome } of pairs) {
    const o = outcome ? 1 : 0;
    sum += (p - o) * (p - o);
  }
  return sum / pairs.length;
}

/**
 * Equal-width reliability bins over [0, 1].
 * @param {Array<{p: number, outcome: boolean}>} pairs
 * @param {number} nBins
 * @returns {Array<{lo: number, hi: number, n: number, meanForecast: number|null, observedFreq: number|null}>}
 */
export function reliabilityBins(pairs, nBins = 10) {
  const bins = Array.from({ length: nBins }, (_, i) => ({
    lo: i / nBins,
    hi: (i + 1) / nBins,
    n: 0,
    sumP: 0,
    opens: 0,
  }));
  for (const { p, outcome } of pairs) {
    const idx = Math.min(nBins - 1, Math.floor(p * nBins));
    const bin = bins[idx];
    bin.n += 1;
    bin.sumP += p;
    if (outcome) bin.opens += 1;
  }
  return bins.map(({ lo, hi, n, sumP, opens }) => ({
    lo,
    hi,
    n,
    meanForecast: n > 0 ? sumP / n : null,
    observedFreq: n > 0 ? opens / n : null,
  }));
}

/**
 * Skill relative to a reference Brier score: 1 - brier/brierRef.
 * Positive = better than the reference.
 * @param {number|null} brier
 * @param {number|null} brierRef
 * @returns {number|null}
 */
export function skillScore(brier, brierRef) {
  if (brier == null || brierRef == null || brierRef === 0) return null;
  return 1 - brier / brierRef;
}

/**
 * Score every (source, horizon) in the snapshots against densified truth,
 * per evaluation window, with climatology and physics references computed
 * on exactly the same (hour, band) keys.
 *
 * @param {object} input
 * @param {Array<{hour_utc: string, band: string, source: string, horizon_hours: number, p_open: number}>} input.snapshots
 * @param {Array<{hour_utc: string, band: string, spot_count: number}>} input.truth  raw baseline rows; the pre-window portion doubles as climatology training data
 * @param {number} [input.percentile]
 * @param {number} [input.minSpots]
 * @param {number[]} [input.windowsDays]
 * @param {number} input.nowMs
 */
export function evaluateForecasts({
  snapshots,
  truth,
  percentile = 25,
  minSpots = 5,
  windowsDays = [7, 30],
  nowMs,
}) {
  const bands = [
    ...new Set([...snapshots.map((s) => s.band), ...truth.map((t) => t.band)]),
  ].sort();
  const denseTruth = densifyTruth(truth, bands);

  /** @type {Map<string, number>} spot_count by hour|band */
  const truthByKey = new Map(
    denseTruth.map((r) => [`${r.hour_utc}|${r.band}`, r.spot_count]),
  );
  const aggregatedHours = new Set(truth.map((r) => r.hour_utc));

  // Held-out training: only baseline rows strictly before an evaluation
  // window may define its thresholds and climatology reference, otherwise
  // each evaluated outcome would help set the threshold that labels it.
  const trainingRowsBefore = (sinceMs) =>
    denseTruth.filter((r) => Date.parse(r.hour_utc) < sinceMs);

  const windows = windowsDays.map((days) => {
    const sinceMs = nowMs - days * 86_400_000;
    const trainingRows = trainingRowsBefore(sinceMs);
    const clim = buildClimatology(trainingRows, { percentile, minSpots });

    // Snapshots inside the window whose target hour has ground truth
    const evaluable = snapshots.filter((s) => {
      const t = Date.parse(s.hour_utc);
      return t >= sinceMs && t <= nowMs && aggregatedHours.has(s.hour_utc);
    });

    /** @type {Map<string, typeof evaluable>} */
    const bySourceHorizon = new Map();
    for (const snap of evaluable) {
      const key = `${snap.source}|${snap.horizon_hours}`;
      const list = bySourceHorizon.get(key);
      if (list) list.push(snap);
      else bySourceHorizon.set(key, [snap]);
    }

    const physicsPByKey = new Map(
      evaluable
        .filter((s) => s.source === "physics" && s.horizon_hours === 0)
        .map((s) => [`${s.hour_utc}|${s.band}`, s.p_open]),
    );

    const sources = [...bySourceHorizon.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, snaps]) => {
        const [source, horizonStr] = key.split("|");
        const outcomes = snaps.map((s) => ({
          hourBand: `${s.hour_utc}|${s.band}`,
          band: s.band,
          p: s.p_open,
          pClim: clim.climForecast(s.band, hourOfDay(s.hour_utc)) ?? 0,
          outcome:
            (truthByKey.get(`${s.hour_utc}|${s.band}`) ?? 0) >=
            (clim.threshold(s.band, hourOfDay(s.hour_utc)) ?? minSpots),
        }));

        const pairs = outcomes.map(({ p, outcome }) => ({ p, outcome }));
        const climPairs = outcomes.map(({ pClim, outcome }) => ({
          p: pClim,
          outcome,
        }));
        const physicsMatched = outcomes.filter((o) =>
          physicsPByKey.has(o.hourBand),
        );
        const physicsPairsSelf = physicsMatched.map((o) => ({
          p: o.p,
          outcome: o.outcome,
        }));
        const physicsPairsRef = physicsMatched.map((o) => ({
          p: physicsPByKey.get(o.hourBand),
          outcome: o.outcome,
        }));

        const brier = brierScore(pairs);
        const brierClim = brierScore(climPairs);
        const isPhysics = source === "physics" && horizonStr === "0";

        const perBand = {};
        for (const band of bands) {
          const bandPairs = outcomes
            .filter((o) => o.band === band)
            .map(({ p, outcome }) => ({ p, outcome }));
          if (bandPairs.length > 0) {
            perBand[band] = { n: bandPairs.length, brier: brierScore(bandPairs) };
          }
        }

        return {
          source,
          horizonHours: Number(horizonStr),
          n: pairs.length,
          baseRate:
            pairs.length > 0
              ? pairs.filter((x) => x.outcome).length / pairs.length
              : null,
          brier,
          brierClim,
          skillVsClim: skillScore(brier, brierClim),
          // Skill vs physics on the intersecting keys only (meaningless for
          // physics itself)
          skillVsPhysics: isPhysics
            ? null
            : skillScore(
                brierScore(physicsPairsSelf),
                brierScore(physicsPairsRef),
              ),
          reliability: reliabilityBins(pairs),
          perBand,
        };
      });

    return {
      days,
      trainingHours: new Set(trainingRows.map((r) => r.hour_utc)).size,
      sources,
    };
  });

  // Sensitivity of the physics Brier score to the percentile choice —
  // held out the same way, against the largest evaluation window.
  const sensSinceMs = nowMs - Math.max(...windowsDays) * 86_400_000;
  const sensTraining = trainingRowsBefore(sensSinceMs);
  const sensitivity = [10, 25, 50].map((p) => {
    const c = buildClimatology(sensTraining, { percentile: p, minSpots });
    const pairs = snapshots
      .filter((s) => {
        const t = Date.parse(s.hour_utc);
        return (
          s.source === "physics" &&
          s.horizon_hours === 0 &&
          t >= sensSinceMs &&
          t <= nowMs &&
          aggregatedHours.has(s.hour_utc)
        );
      })
      .map((s) => ({
        p: s.p_open,
        outcome:
          (truthByKey.get(`${s.hour_utc}|${s.band}`) ?? 0) >=
          (c.threshold(s.band, hourOfDay(s.hour_utc)) ?? minSpots),
      }));
    return {
      percentile: p,
      n: pairs.length,
      baseRate:
        pairs.length > 0
          ? pairs.filter((x) => x.outcome).length / pairs.length
          : null,
      brier: brierScore(pairs),
    };
  });

  return { bands, percentile, minSpots, windows, sensitivity };
}

function fmt(value, digits = 4) {
  return value == null ? "—" : value.toFixed(digits);
}

/**
 * Render the eval results as the markdown report committed to docs/reports/.
 * @param {ReturnType<typeof evaluateForecasts>} results
 * @param {{generatedAt: string, snapshotHours: number, truthHours: number, baselineDays: number}} meta
 */
export function renderReport(results, meta) {
  const lines = [];
  lines.push(`# Forecast evaluation — ${meta.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(
    `Generated ${meta.generatedAt} by \`npm run eval:forecast\` (M4 F2). ` +
      `Scores \`forecast_snapshots\` against \`band_hourly_stats\` ground truth.`,
  );
  lines.push("");
  lines.push("## Data coverage");
  lines.push("");
  lines.push(`- Snapshot hours evaluated: ${meta.snapshotHours}`);
  lines.push(`- Ground-truth hours (baseline): ${meta.truthHours} (${meta.baselineDays}-day climatology window)`);
  lines.push(`- Bands: ${results.bands.join(", ")}`);
  lines.push("");
  lines.push("## Outcome definition");
  lines.push("");
  lines.push(
    `Band open at hour *h* iff \`spot_count >= max(${results.minSpots}, ` +
      `P${results.percentile}(baseline counts for that band+UTC-hour))\`. ` +
      `Climatology reference forecast = baseline open-rate per band+UTC-hour ` +
      `under the same threshold. Thresholds and climatology are held-out: ` +
      `fit only on baseline hours strictly before each evaluation window.`,
  );
  lines.push("");
  lines.push(
    "### Percentile sensitivity (physics source, largest window, held-out thresholds)",
  );
  lines.push("");
  lines.push("| Percentile | n | Base rate | Brier |");
  lines.push("| --- | --- | --- | --- |");
  for (const s of results.sensitivity) {
    lines.push(
      `| P${s.percentile} | ${s.n} | ${fmt(s.baseRate, 3)} | ${fmt(s.brier)} |`,
    );
  }
  lines.push("");

  for (const window of results.windows) {
    lines.push(`## ${window.days}-day window`);
    lines.push("");
    lines.push(
      `_Thresholds fit on ${window.trainingHours} held-out baseline hours ` +
        `(strictly before the window${window.trainingHours === 0 ? "; NONE available — thresholds fell back to minSpots" : ""})._`,
    );
    lines.push("");
    if (window.sources.length === 0) {
      lines.push("_No evaluable snapshots in this window._");
      lines.push("");
      continue;
    }
    lines.push(
      "| Source | Horizon | n | Base rate | Brier | Brier (clim) | Skill vs clim | Skill vs physics |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const s of window.sources) {
      lines.push(
        `| ${s.source} | ${s.horizonHours}h | ${s.n} | ${fmt(s.baseRate, 3)} | ` +
          `${fmt(s.brier)} | ${fmt(s.brierClim)} | ${fmt(s.skillVsClim, 3)} | ` +
          `${fmt(s.skillVsPhysics, 3)} |`,
      );
    }
    lines.push("");

    for (const s of window.sources) {
      lines.push(`### ${s.source} (h+${s.horizonHours}) — reliability`);
      lines.push("");
      lines.push("| Forecast bin | n | Mean forecast | Observed freq |");
      lines.push("| --- | --- | --- | --- |");
      for (const bin of s.reliability) {
        if (bin.n === 0) continue;
        lines.push(
          `| ${bin.lo.toFixed(1)}–${bin.hi.toFixed(1)} | ${bin.n} | ` +
            `${fmt(bin.meanForecast, 3)} | ${fmt(bin.observedFreq, 3)} |`,
        );
      }
      lines.push("");
      lines.push(`### ${s.source} (h+${s.horizonHours}) — per band`);
      lines.push("");
      lines.push("| Band | n | Brier |");
      lines.push("| --- | --- | --- |");
      for (const [band, stats] of Object.entries(s.perBand)) {
        lines.push(`| ${band} | ${stats.n} | ${fmt(stats.brier)} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

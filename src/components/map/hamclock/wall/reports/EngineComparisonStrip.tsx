import {
  compareEngines,
  type EngineReading,
  type EngineStepClassifier,
} from "@/lib/hamclock/engineComparison";
import { formatAge } from "../tokens";

export interface EngineComparisonStripProps {
  /** What the three engines are being asked about, e.g. "20M" or "14.2 MHz". */
  subject: string;
  physics: EngineReading;
  nowcast: EngineReading;
  observed: EngineReading;
  /** How a numeric reading maps onto the shared open/marginal/closed ladder
   * this report compares across — see `engineComparison.ts`. */
  classify: EngineStepClassifier;
  now?: Date | number;
}

const ENGINE_TITLE = {
  physics: "PHYSICS",
  nowcast: "NOWCAST",
  observed: "OBSERVED",
} as const;

/** An engine with no comparable reads its own honest label rather than a
 * shared "NO DATA" — an operator should never wonder which engine went
 * quiet. Physics is a deterministic function of Kp/SFI and effectively never
 * has nothing to say, so its unavailable case still reads a plain fallback. */
const UNAVAILABLE_LABEL = {
  physics: "NO DATA",
  nowcast: "MODEL OFF",
  observed: "NO SPOTS",
} as const;

function EngineColumn({
  engine,
  reading,
  now,
}: {
  engine: keyof typeof ENGINE_TITLE;
  reading: EngineReading;
  now: Date | number;
}) {
  const unavailable =
    reading.state === "unavailable" || reading.comparable.kind === "none";
  const dim = unavailable || reading.state === "stale";

  return (
    <div className="hcr-enginestrip-col">
      <p className="hcr-enginestrip-label">{ENGINE_TITLE[engine]}</p>
      <p className={`hcr-enginestrip-value${dim ? " hc-dim-text" : ""}`}>
        {unavailable ? UNAVAILABLE_LABEL[engine] : reading.value}
      </p>
      {reading.confidence != null && !unavailable && (
        <span className="hcr-bar hcr-enginestrip-conf">
          <i
            style={{
              width: `${Math.max(0, Math.min(100, reading.confidence))}%`,
            }}
          />
        </span>
      )}
      <p className="hcr-enginestrip-detail">
        {unavailable ? "—" : (reading.detail ?? "—")}
      </p>
      <p className="hcr-enginestrip-age">
        {unavailable ? "—" : formatAge(reading.updatedAt, now)}
      </p>
    </div>
  );
}

/**
 * The wall's core claim, rendered once: three engines, one verdict. Every
 * report that shows a comparable reading opens with this strip instead of
 * inventing its own tri-column layout, so "AGREE/SPLIT/DISAGREE" always means
 * the same thing and is always computed the same way (`compareEngines`).
 *
 * No engine ever borrows another engine's number: an unavailable reading
 * renders its own honest label (`MODEL OFF`, `NO SPOTS`) and is excluded from
 * the comparison entirely, not defaulted to zero or to a neighbour's value.
 */
export function EngineComparisonStrip({
  subject,
  physics,
  nowcast,
  observed,
  classify,
  now = Date.now(),
}: EngineComparisonStripProps) {
  const result = compareEngines(physics, nowcast, observed, classify);
  const toneClass =
    result.tone === "good"
      ? "hc-good"
      : result.tone === "warn"
        ? "hc-warn"
        : result.tone === "bad"
          ? "hc-bad"
          : "hc-info-text";

  return (
    <div className="hcr-box hcr-enginestrip">
      <div className="hcr-enginestrip-head">
        <p className="hcr-bandtable-caption">Engine comparison · {subject}</p>
        <p className={`hcr-enginestrip-word ${toneClass}`}>{result.word}</p>
      </div>
      <p className="hcr-enginestrip-reason">
        {result.reason.charAt(0).toUpperCase() + result.reason.slice(1)}
      </p>
      <div className="hcr-enginestrip-cols">
        <EngineColumn engine="physics" reading={physics} now={now} />
        <EngineColumn engine="nowcast" reading={nowcast} now={now} />
        <EngineColumn engine="observed" reading={observed} now={now} />
      </div>
      {/* Decorative columns above are read as one flowing sentence by
          assistive tech; this table is the structured twin. */}
      <table className="sr-only">
        <caption>Engine comparison for {subject}</caption>
        <thead>
          <tr>
            <th scope="col">Engine</th>
            <th scope="col">Value</th>
            <th scope="col">Detail</th>
            <th scope="col">Age</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["physics", physics],
              ["nowcast", nowcast],
              ["observed", observed],
            ] as const
          ).map(([engine, reading]) => {
            const unavailable =
              reading.state === "unavailable" ||
              reading.comparable.kind === "none";
            return (
              <tr key={engine}>
                <th scope="row">{ENGINE_TITLE[engine]}</th>
                <td>
                  {unavailable ? UNAVAILABLE_LABEL[engine] : reading.value}
                </td>
                <td>{unavailable ? "—" : (reading.detail ?? "—")}</td>
                <td>{unavailable ? "—" : formatAge(reading.updatedAt, now)}</td>
              </tr>
            );
          })}
          <tr>
            <th scope="row">Verdict</th>
            <td colSpan={3}>
              {result.word}. {result.reason}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

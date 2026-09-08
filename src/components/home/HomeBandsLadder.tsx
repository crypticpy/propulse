/**
 * DS-07 "On the bands now" ladder.
 *
 * One row per HF band, 160 → 10 m, in the reading order the owner approved:
 * band, verdict, trend, relative activity, reports, share, reporters, top
 * mode. A real table, so a screen reader can walk it by column header and a
 * row announces itself in full; the visual grid comes from fixed column
 * widths, not from divs pretending to be cells.
 *
 * Nothing here is hover-only and nothing scrolls inside the card. The one
 * click target per row is the band button, which opens nearby reports.
 */

import type { CSSProperties } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  formatRatio,
  formatShare,
  type BandsLadderRow,
} from "@/lib/home/bandsLadder";
import { LADDER_LABEL, TREND_ARROW } from "@/lib/verdict/presentation";
import type { LadderState } from "@/lib/verdict/ladder";
import type { ActivityTrend } from "@/lib/utils/bandActivity";
import { getBandColor } from "@/lib/utils/spotColors";

/**
 * Below this the trend column is dropped rather than squeezed: the counts and
 * the verdict are what a narrow window must keep. Same breakpoint as the
 * approved mock.
 */
const TREND_COLUMN_MIN_PX = 1440;

/** Tone tokens, matching how PropSphere colours the same five states. */
const TONE: Record<LadderState, string> = {
  hot: "hot",
  verified: "success",
  stirring: "warning",
  forecast: "info",
  closed: "muted",
};

/** Shape carries the state too, for colour-blind and monochrome displays. */
const ICON: Record<LadderState, string> = {
  hot: "▲",
  verified: "●",
  stirring: "◐",
  forecast: "◇",
  closed: "○",
};

const TREND_LABEL: Record<ActivityTrend, string> = {
  rising: "Rising",
  steady: "Steady",
  falling: "Falling",
};

function VerdictCell({ row }: { row: BandsLadderRow }) {
  const state = row.verdict;
  return (
    <td className="home-ladder-c-verdict">
      <span className="home-ladder-verdict">
        <span
          className="home-ladder-pill"
          data-tone={state === null ? "muted" : TONE[state]}
        >
          <span aria-hidden="true">{state === null ? "○" : ICON[state]}</span>
          {state === null ? "No verdict" : LADDER_LABEL[state]}
        </span>
        {row.ratio !== null && (
          <span className="home-ladder-ratio">{formatRatio(row.ratio)}</span>
        )}
      </span>
    </td>
  );
}

export function HomeBandsLadder({
  rows,
  stale,
  selectedBand,
  onSelectBand,
}: {
  rows: BandsLadderRow[];
  stale: boolean;
  selectedBand: string | null;
  onSelectBand: (band: string) => void;
}) {
  const showTrend = !useIsMobile(TREND_COLUMN_MIN_PX);
  return (
    <>
    <table className="home-ladder" data-stale={stale ? "true" : undefined}>
      <caption className="sr-only">
        Reception reports by band over the last 20 minutes, longest wavelength
        first.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="home-ladder-c-band">
            Band
          </th>
          <th scope="col" className="home-ladder-c-verdict">
            Verdict
          </th>
          {showTrend && (
            <th scope="col" className="home-ladder-c-trend">
              Trend<span className="sr-only"> over the last 20 minutes</span>
            </th>
          )}
          <th scope="col" className="home-ladder-c-relative">
            Relative activity
          </th>
          <th scope="col" className="home-ladder-c-reports">
            Reports
          </th>
          <th scope="col" className="home-ladder-c-share">
            Share
          </th>
          <th scope="col" className="home-ladder-c-reporters">
            Reporters
          </th>
          <th scope="col" className="home-ladder-c-mode">
            Top mode
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.band} data-empty={row.obs20m === 0 ? "true" : undefined}>
            <th scope="row" className="home-ladder-c-band">
              <button
                type="button"
                aria-controls="home-nearby-reports"
                aria-expanded={selectedBand === row.band}
                onClick={() => onSelectBand(row.band)}
                style={
                  { "--band-hue": getBandColor(row.band) } as CSSProperties
                }
              >
                {row.band}
                <span className="sr-only"> — open nearby reports</span>
              </button>
            </th>
            <VerdictCell row={row} />
            {showTrend && (
              <td className="home-ladder-c-trend">
                {row.trend === null ? (
                  "—"
                ) : (
                  <>
                    <span aria-hidden="true">{TREND_ARROW[row.trend]}</span>{" "}
                    {TREND_LABEL[row.trend]}
                  </>
                )}
              </td>
            )}
            <td className="home-ladder-c-relative">
              <span
                className="home-ladder-bar"
                role="img"
                aria-label={`${Math.round(row.relative * 100)} percent of the busiest band`}
              >
                <i style={{ width: `${row.relative * 100}%` }} />
              </span>
            </td>
            <td className="home-ladder-c-reports">
              {row.obs20m.toLocaleString()}
            </td>
            <td className="home-ladder-c-share">{formatShare(row.share)}</td>
            <td className="home-ladder-c-reporters">
              {row.reporters20m.toLocaleString()}
            </td>
            <td className="home-ladder-c-mode">
              {row.topMode ? (
                <>
                  {row.topMode.label}{" "}
                  <span>{row.topMode.count.toLocaleString()}</span>
                </>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="home-note">
      Verdict: the scored Band Health state for this scope. The × figure
      compares the last 60 minutes of raw reports with this band-hour&rsquo;s
      90-day median where there is enough history — a different count from
      the 20-minute Reports column.{" "}
      {showTrend && "Trend: the last 10 minutes against the 10 before. "}
      Bar: reports relative to the busiest band.
    </p>
    </>
  );
}

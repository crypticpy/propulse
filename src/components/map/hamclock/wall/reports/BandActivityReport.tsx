import { useMemo } from "react";
import { useBandActivity, scopeQueryString } from "@/hooks/useBandActivity";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { getBandColor } from "@/lib/utils/spotColors";
import { WallReport, type WallReportFact } from "./WallReport";
import { useHamClockSessionTrend } from "./sessionTrend";
import { reportFooter } from "../tokens";
import { WallSeriesChart } from "./WallSeriesChart";

export interface BandActivityReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Every band the activity feed can see, not just the six the tile has room
 * for. Counts are the trailing 60 minutes in the scope the Band Health ladder
 * is using, so the report describes exactly the population of spots the rail
 * is scoring.
 */
export function BandActivityReport({ open, onClose }: BandActivityReportProps) {
  const { scope, activityScope } = useBandVerdicts();
  const { data, isPending, isError } = useBandActivity(activityScope);

  const bars = useMemo(() => {
    const entries = [...(data?.values() ?? [])].filter(
      (entry) => entry.count60m > 0,
    );
    entries.sort((a, b) => b.count60m - a.count60m);
    return entries;
  }, [data]);

  const top = bars[0] ?? null;
  const total = bars.reduce((sum, entry) => sum + entry.count60m, 0);
  const fetchedAt = data?.fetchedAt ?? null;

  const activityScopeKey = `${activityScope.type}${scopeQueryString(activityScope)}`;
  const trend = useHamClockSessionTrend(
    `band-activity-${activityScopeKey}`,
    bars.length > 0 ? total : null,
    fetchedAt ?? undefined,
  );

  const facts: WallReportFact[] = [
    { label: "TOTAL SPOTS", value: total.toLocaleString() },
    { label: "BANDS OPEN", value: bars.length },
    { label: "WINDOW", value: "60 MIN" },
    { label: "SCOPE", value: scope.label.toUpperCase() },
    {
      label: "TOP SHARE",
      value:
        top && total > 0 ? `${Math.round((top.count60m / total) * 100)}%` : "—",
    },
  ];

  const { footer, updated } = reportFooter(
    "LIVE ACTIVITY FEED · TRAILING 60 MINUTES",
    fetchedAt,
  );

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Band activity report · ${scope.label}`}
      tone="accent"
      hero={top ? top.band.toUpperCase() : "—"}
      verdict={top ? top.count60m.toLocaleString() : "QUIET"}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId={`band-activity-${activityScopeKey}`}
      pinElement={<BandActivityReport open onClose={onClose} />}
    >
      <div className="hcr-box">
        <h4>All bands · spots in the last 60 minutes</h4>
        {bars.length === 0 ? (
          <p className="hcr-note">
            {isError
              ? "The activity feed is unavailable right now."
              : isPending
                ? "Counting spots…"
                : "No spots reported in this scope yet."}
          </p>
        ) : (
          <div className="hcr-bars">
            {bars.map((entry) => (
              <BandRow
                key={entry.band}
                entry={entry}
                top={top?.count60m ?? 1}
              />
            ))}
          </div>
        )}
      </div>
      <div className="hcr-chart">
        <p className="hcr-chart-title">TOTAL SPOTS — 2 H · SESSION</p>
        <WallSeriesChart
          label="TOTAL SPOTS — 2 H · SESSION"
          points={trend}
          unit="spots"
          maxGapMs={10 * 60 * 1000}
        />
      </div>
    </WallReport>
  );
}

/** One band row: band key, proportional bar, count. */
function BandRow({
  entry,
  top,
}: {
  entry: { band: string; count60m: number };
  top: number;
}) {
  return (
    <>
      <span className="hcr-bars-k" style={{ color: getBandColor(entry.band) }}>
        {entry.band}
      </span>
      <span className="hcr-bar">
        <i
          style={{
            width: `${Math.max(2, (entry.count60m / top) * 100)}%`,
            color: getBandColor(entry.band),
          }}
        />
      </span>
      <span className="hcr-bars-v">{entry.count60m.toLocaleString()}</span>
    </>
  );
}

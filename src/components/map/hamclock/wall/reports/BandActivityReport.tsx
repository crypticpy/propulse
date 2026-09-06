import { useMemo, useState } from "react";
import { useBandActivity, scopeQueryString } from "@/hooks/useBandActivity";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useLiveBandHistory } from "@/hooks/useLiveBandHistory";
import { useBandHistory } from "@/hooks/useBandHistory";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { WallReport, type WallReportFact } from "./WallReport";
import { reportFooter } from "../tokens";
import { HamClockButton, HamClockTabs } from "../controls";
import { BandHistoryChart } from "./BandHistoryChart";
import { BandTopDx } from "./BandTopDx";

export interface BandActivityReportProps {
  open: boolean;
  onClose: () => void;
  initialGlobalCounts?: boolean;
}

/** Live counters retain their scope and population; historical counts are global only. */
export function BandActivityReport({ open, onClose, initialGlobalCounts = false }: BandActivityReportProps) {
  const { scope: activeScope, activityScope: activeActivityScope } = useBandVerdicts();
  const [globalCounts, setGlobalCounts] = useState(initialGlobalCounts);
  const scope = globalCounts ? { label: "Global" } : activeScope;
  const activityScope = globalCounts ? { type: "global" as const } : activeActivityScope;
  const { data, isPending, isError } = useBandActivity(activityScope, open);
  const live = useLiveBandHistory(open && activityScope.type === "global" ? data : undefined);
  const history = useBandHistory(open && activityScope.type === "global");
  const bars = useMemo(
    () =>
      [...(data?.values() ?? [])]
        .filter((entry) => entry.count60m > 0)
        .sort((a, b) => b.count60m - a.count60m),
    [data],
  );
  const sources = useMemo(() => {
    const result: Record<string, number | undefined> = {
      pskreporter: undefined,
      rbn: undefined,
      dxcluster: undefined,
    };
    for (const entry of data?.values() ?? []) {
      for (const [source, count] of Object.entries(entry.sourceCounts60m ?? {}))
        result[source] = (result[source] ?? 0) + count;
    }
    return Object.entries(result)
      .map(
        ([source, count]) =>
          `${source.toUpperCase()} ${count === undefined ? "WAITING" : count.toLocaleString()}`,
      )
      .join(" · ");
  }, [data]);
  const modeCount = (mode: string) =>
    [...(data?.values() ?? [])].reduce(
      (sum, entry) => sum + (entry.modeObs20m?.[mode] ?? 0),
      0,
    );
  const top = bars[0];
  const total = bars.reduce((sum, entry) => sum + entry.count60m, 0);
  const current10m = bars.reduce((sum, entry) => sum + entry.count10mRecent, 0);
  const activityScopeKey = `${activityScope.type}${scopeQueryString(activityScope)}`;
  const facts: WallReportFact[] = [
    { label: "SPOTS · 60 MIN", value: data ? total.toLocaleString() : "—" },
    { label: "ACTIVE BANDS", value: data ? bars.length : "—" },
    { label: "CW OBS · 20 MIN", value: data ? modeCount("cw") : "—" },
    { label: "PHONE OBS · 20 MIN", value: data ? modeCount("phone") : "—" },
    { label: "DIGITAL · 20 MIN", value: data ? modeCount("digital") : "—" },
    { label: "OTHER OBS · 20 MIN", value: data ? modeCount("unknown") : "—" },
  ];
  const { footer, updated } = reportFooter(
    "LIVE ACTIVITY · RAW 60 MIN / DEDUPED MODES 20 MIN",
    data?.fetchedAt,
  );

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Band activity report · ${scope.label}`}
      tone="accent"
      hero={top ? top.band.toUpperCase() : "—"}
      verdict={
        isError ? "FEED OFF" : isPending ? "WAITING" : top ? "LEADS" : "QUIET"
      }
      facts={facts}
      footer={footer}
      updated={updated}
      pinId={`band-activity-${activityScopeKey}`}
      pinElement={<BandActivityReport open onClose={onClose} initialGlobalCounts={globalCounts} />}
    >
      {activeActivityScope.type !== "global" && (
        <HamClockButton onClick={() => setGlobalCounts((value) => !value)}>
          {globalCounts ? `USE ${activeScope.label.toUpperCase()}` : "VIEW GLOBAL COUNTS + HISTORY"}
        </HamClockButton>
      )}
      <HamClockTabs
        label="Band activity views"
        tabs={[
          {
            id: "bands",
            label: "BANDS",
            content: (
              <>
                <div className="hcr-band-focus">
                  {bars.map((entry) => (
                    <HamClockButton
                      key={entry.band}
                      onClick={() => {
                        useHamClockStore.getState().setBandFocus([entry.band]);
                        const map = useMapStore.getState();
                        map.setSpotFilters({
                          ...map.spotFilters,
                          bands: [entry.band],
                        });
                      }}
                    >
                      {entry.band.toUpperCase()} ·{" "}
                      {entry.count60m.toLocaleString()}
                    </HamClockButton>
                  ))}
                </div>
                <p className="hcr-chart-title">{sources}</p>
                {bars.length === 0 && (
                  <p className="hcr-note">
                    {isError
                      ? "The activity feed is unavailable right now."
                      : isPending
                        ? "Counting spots…"
                        : "NO SPOTS IN WINDOW · 60 MIN"}
                  </p>
                )}
                <p className="hcr-chart-title">
                  LIVE · LAST 10 MIN{" "}
                  {data ? current10m.toLocaleString() : "WAITING"} ·{" "}
                  {scope.label}
                </p>
              </>
            ),
          },
          {
            id: "history",
            label: "HISTORY",
            content: (
              <>
                {activityScope.type !== "global" ? (
                  <p className="hcr-note">
                    Six-hour history is unavailable for this scope. Global
                    hourly totals are not substituted for regional or path
                    observations.
                  </p>
                ) : (
                  <>
                    <BandHistoryChart snapshot={history.data} live={live} />
                    <p className="hcr-chart-title">
                      {history.isError ? (history.data ? `HISTORY STALE · READ ${history.data.fetchedAt.slice(11, 16)}Z` : "HOURLY HISTORY UNAVAILABLE · LIVE SAMPLES AVAILABLE") : history.data ? `HISTORY THROUGH ${history.data.windowEnd.slice(11, 16)}Z · READ ${history.data.fetchedAt.slice(11, 16)}Z` : "READING COMPLETED HOURS · LIVE SAMPLES AVAILABLE"}
                    </p>
                  </>
                )}
              </>
            ),
          },
          { id: "dx", label: "TOP DX", content: <BandTopDx /> },
        ]}
      />
    </WallReport>
  );
}

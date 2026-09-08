import { useMemo } from "react";
import { useBandActivity, type BandActivityScope } from "@/hooks/useBandActivity";
import { useBandLadder } from "@/hooks/useBandLadder";
import { continentForLatLon, CONTINENT_LABEL } from "@/lib/utils/continent";
import type { LadderState } from "@/lib/verdict/ladder";
import { canonicalForBand } from "@/lib/verdict/bestBand";
import { useHomeLocation } from "./useHomeLocation";
import { activityRows, activityIsCurrent } from "@/lib/home/presentation";
import { LADDER_BANDS } from "@/lib/home/bandsLadder";
export function useHomeBandActivity(now: number, enabled = true) {
  const { location } = useHomeLocation();
  const continent = location ? continentForLatLon(location.lat, location.lon) : null;
  const scope = useMemo<BandActivityScope>(() => continent ? { type: "regional", continent } : { type: "global" }, [continent]);
  const query = useBandActivity(scope, enabled);
  const fetchedAt = query.data?.fetchedAt ?? null;
  // Once a payload has ever landed, keep it (and its rows) on screen — even
  // after an error or once it goes stale — instead of dropping back to text.
  const hasData = enabled && fetchedAt !== null;
  const current = hasData && activityIsCurrent(fetchedAt, query.isError, Math.max(now, Date.now()));
  const rows = hasData ? activityRows(query.data).sort((a, b) => parseFloat(b.band) - parseFloat(a.band)) : [];
  // The collector's scored ladder, read on the same scope as the counts so
  // the verdict and the numbers in a row describe one population. A regional
  // scope with no scored row for a band gets no verdict for it — never the
  // global row, which describes a different population.
  const ladder = useBandLadder(enabled);
  const ladderData = ladder.data;
  const verdictByBand = useMemo(() => {
    const byBand = new Map<string, LadderState>();
    if (!ladderData) return byBand;
    const bands = new Set<string>([...LADDER_BANDS, ...[...ladderData.values()].map(row => row.band)]);
    const scope = continent ? { type: "regional" as const, continent } : { type: "global" as const, continent: null };
    for (const band of bands) {
      const row = canonicalForBand(ladderData, scope, band, Math.max(now, Date.now()));
      // A row that has stopped ticking is not a verdict about now.
      if (row && !row.stale) byBand.set(band, row.state);
    }
    return byBand;
  }, [ladderData, continent, now]);
  return { query, current, hasData, fetchedAt, rows, verdictByBand, scopeLabel: continent ? `Regional · ${CONTINENT_LABEL[continent]}` : "Global" };
}

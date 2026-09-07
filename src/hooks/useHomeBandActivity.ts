import { useMemo } from "react";
import { useBandActivity, type BandActivityScope } from "@/hooks/useBandActivity";
import { canonicalKey, useBandLadder } from "@/hooks/useBandLadder";
import { continentForLatLon, CONTINENT_LABEL } from "@/lib/utils/continent";
import type { LadderState } from "@/lib/verdict/ladder";
import { useHomeLocation } from "./useHomeLocation";
import { activityRows, activityIsCurrent } from "@/lib/home/presentation";
import { LADDER_BANDS, verdictIsCurrent } from "@/lib/home/bandsLadder";
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
  // the verdict and the numbers in a row describe one population. Regional
  // falls back to the global row for a band its continent has not scored.
  const ladder = useBandLadder(enabled);
  const ladderData = ladder.data;
  const verdictByBand = useMemo(() => {
    const byBand = new Map<string, LadderState>();
    if (!ladderData) return byBand;
    const bands = new Set<string>([...LADDER_BANDS, ...[...ladderData.values()].map(row => row.band)]);
    for (const band of bands) {
      const row = (continent ? ladderData.get(canonicalKey("regional", continent, band)) : undefined)
        ?? ladderData.get(canonicalKey("global", "", band));
      // A row that has stopped ticking is not a verdict about now.
      if (row && verdictIsCurrent(Date.parse(row.updatedAt), Math.max(now, Date.now()))) byBand.set(band, row.state);
    }
    return byBand;
  }, [ladderData, continent, now]);
  return { query, current, hasData, fetchedAt, rows, verdictByBand, scopeLabel: continent ? `Regional · ${CONTINENT_LABEL[continent]}` : "Global" };
}

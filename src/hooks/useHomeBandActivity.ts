import { useMemo } from "react";
import { useBandActivity, type BandActivityScope } from "@/hooks/useBandActivity";
import { continentForLatLon, CONTINENT_LABEL } from "@/lib/utils/continent";
import { useHomeLocation } from "./useHomeLocation";
import { activityRows, activityIsCurrent } from "@/lib/home/presentation";
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
  return { query, current, hasData, fetchedAt, rows, scopeLabel: continent ? `Regional · ${CONTINENT_LABEL[continent]}` : "Global" };
}

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
  const current = enabled && activityIsCurrent(query.data?.fetchedAt ?? 0, query.isError, Math.max(now, Date.now()));
  const rows = current ? activityRows(query.data).sort((a, b) => parseFloat(b.band) - parseFloat(a.band)) : [];
  return { query, current, rows, scopeLabel: continent ? `Regional · ${CONTINENT_LABEL[continent]}` : "Global" };
}

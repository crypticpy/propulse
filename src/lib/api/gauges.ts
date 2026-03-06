/**
 * River Gauge API Client
 *
 * Parses USGS NWIS instantaneous values (parameterCd=00065 = gage height)
 * into typed RiverGauge objects with simplified flood classification.
 */

export interface RiverGauge {
  siteId: string;
  name: string;
  lat: number;
  lon: number;
  gageHeightFt: number | null;
  floodStatus: "normal" | "action" | "minor" | "moderate" | "major";
  timestamp: string | null;
}

/**
 * Fetch river gauge data from the USGS proxy edge function.
 *
 * @param west  - Bounding box west longitude
 * @param south - Bounding box south latitude
 * @param east  - Bounding box east longitude
 * @param north - Bounding box north latitude
 * @param signal - Optional AbortSignal for cancellation
 */
export async function fetchRiverGauges(
  west: number,
  south: number,
  east: number,
  north: number,
  signal?: AbortSignal,
): Promise<RiverGauge[]> {
  const res = await fetch(
    `/api/atmos/gauges?west=${west}&south=${south}&east=${east}&north=${north}`,
    { signal },
  );
  if (!res.ok) return [];

  try {
    const raw = await res.json();
    const timeSeries = raw?.value?.timeSeries;
    if (!Array.isArray(timeSeries)) return [];

    return timeSeries
      .map((ts: Record<string, unknown>) => {
        const info = (ts as Record<string, unknown>).sourceInfo as
          | Record<string, unknown>
          | undefined;
        const valuesArr = (
          (ts as Record<string, unknown>).values as
            | Array<Record<string, unknown>>
            | undefined
        )?.[0]?.value;
        const latestValue =
          Array.isArray(valuesArr) && valuesArr.length > 0
            ? (valuesArr[valuesArr.length - 1] as Record<string, unknown>)
            : null;
        const gageHeight =
          latestValue?.value != null ? Number(latestValue.value) : null;

        const geoLoc = (
          info?.geoLocation as Record<string, unknown> | undefined
        )?.geogLocation as Record<string, unknown> | undefined;
        const lat = Number(geoLoc?.latitude ?? 0);
        const lon = Number(geoLoc?.longitude ?? 0);

        const siteCodes = info?.siteCode as
          | Array<Record<string, unknown>>
          | undefined;

        return {
          siteId: String(siteCodes?.[0]?.value ?? ""),
          name: String(info?.siteName ?? "Unknown"),
          lat,
          lon,
          gageHeightFt: gageHeight,
          floodStatus: classifyFloodStatus(gageHeight),
          timestamp: (latestValue?.dateTime as string) ?? null,
        };
      })
      .filter((g: RiverGauge) => g.lat !== 0 && g.lon !== 0);
  } catch {
    return [];
  }
}

/**
 * Classify gage height into a flood status category.
 *
 * This is a simplified universal classification. Real flood stages vary
 * per gauge and are defined by the NWS for each site. This provides a
 * rough visual indicator based on absolute gage height.
 */
function classifyFloodStatus(
  heightFt: number | null,
): RiverGauge["floodStatus"] {
  if (heightFt == null) return "normal";
  if (heightFt > 25) return "major";
  if (heightFt > 18) return "moderate";
  if (heightFt > 12) return "minor";
  if (heightFt > 8) return "action";
  return "normal";
}

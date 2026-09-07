import type { BandActivitySnapshot } from "@/hooks/useBandActivity";

export interface LiveBandSample {
  at: number;
  counts: Record<string, number>;
}
const HOUR = 3_600_000;
const STEP = 600_000;

/** One latest observed trailing-ten-minute snapshot per UTC ten-minute slot.
 * These overlap and must never be summed into an hourly count. */
export function recordLiveBandSample(
  previous: LiveBandSample[],
  data: BandActivitySnapshot | undefined,
  now: number,
): LiveBandSample[] {
  const start = Math.floor(now / HOUR) * HOUR;
  const retained = previous.filter((sample) => sample.at >= start && sample.at <= now);
  const current = retained.length === previous.length ? previous : retained;
  const at = data?.fetchedAt;
  if (!data || at == null || at < start || at > now || !Number.isFinite(at)) return current;
  const counts: Record<string, number> = {};
  for (const row of data.values()) {
    if (!/^(160|80|60|40|30|20|17|15|12|10|6|2)m$/.test(row.band) ||
      !Number.isSafeInteger(row.count10mRecent) || row.count10mRecent < 0) return current;
    counts[row.band] = row.count10mRecent;
  }
  // An empty response does not establish a measured zero on every band.
  if (!Object.keys(counts).length) return current;
  const slot = Math.floor(at / STEP);
  if (current.some((sample) => Math.floor(sample.at / STEP) === slot && sample.at >= at)) return current;
  return [...current.filter((sample) => Math.floor(sample.at / STEP) !== slot), { at, counts }]
    .sort((a, b) => a.at - b.at);
}

export function liveBandSlots(samples: LiveBandSample[], now: number) {
  const start = Math.floor(now / HOUR) * HOUR;
  return Array.from({ length: 6 }, (_, i) => {
    const slot = start + i * STEP;
    const sample = samples.find((entry) => entry.at >= slot && entry.at < slot + STEP && entry.at <= now);
    return { slot, sample, future: slot > now };
  });
}

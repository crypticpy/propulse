import { useState } from "react";
import { HomeBandsLadder, Surface } from "propulse";

const ROWS = [
  { band: "160m", obs20m: 12, reporters20m: 8, count60m: 40, share: 0.05, relative: 0.15, topMode: { label: "FT8", count: 9 }, verdict: "stirring", trend: "rising", ratio: 1.2 },
  { band: "80m", obs20m: 34, reporters20m: 21, count60m: 120, share: 0.14, relative: 0.42, topMode: { label: "FT8", count: 28 }, verdict: "verified", trend: "steady", ratio: 0.95 },
  { band: "40m", obs20m: 88, reporters20m: 52, count60m: 310, share: 0.36, relative: 1.0, topMode: { label: "FT8", count: 71 }, verdict: "hot", trend: "rising", ratio: 1.6 },
  { band: "20m", obs20m: 61, reporters20m: 44, count60m: 260, share: 0.25, relative: 0.69, topMode: { label: "SSB", count: 30 }, verdict: "verified", trend: "steady", ratio: 1.05 },
  { band: "17m", obs20m: 9, reporters20m: 6, count60m: 30, share: 0.04, relative: 0.1, topMode: { label: "CW", count: 5 }, verdict: "closed", trend: "falling", ratio: 0.4 },
  { band: "15m", obs20m: 0, reporters20m: 0, count60m: 5, share: 0, relative: 0, topMode: null, verdict: null, trend: null, ratio: null },
  { band: "12m", obs20m: 2, reporters20m: 2, count60m: 8, share: 0.01, relative: 0.02, topMode: { label: "FT8", count: 2 }, verdict: "forecast", trend: null, ratio: null },
  { band: "10m", obs20m: 4, reporters20m: 3, count60m: 20, share: 0.02, relative: 0.05, topMode: { label: "FT8", count: 3 }, verdict: "stirring", trend: "steady", ratio: 0.6 },
];

export function Live() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Surface>
      <HomeBandsLadder rows={ROWS} stale={false} selectedBand={selected} onSelectBand={setSelected} />
    </Surface>
  );
}

export function Stale() {
  return (
    <Surface>
      <HomeBandsLadder rows={ROWS} stale onSelectBand={() => {}} selectedBand={"40m"} />
    </Surface>
  );
}

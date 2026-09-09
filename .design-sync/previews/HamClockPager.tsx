import { useState } from "react";
import { HamClockPager } from "propulse";

const WALL_PAGES = [
  { id: "spots", title: "Spots & Activity" },
  { id: "solar", title: "Solar & Space Wx" },
  { id: "forecast", title: "Forecast" },
  { id: "weather", title: "Weather & Emergency" },
  { id: "sdr", title: "SDR" },
];

/** Footer pager: fully controllable through props (`pages`, `pageIndex`,
 * `onStep`), so each story is real interactive state rather than a fallback. */
export function MidCycle() {
  const [index, setIndex] = useState(1);
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockPager
        pages={WALL_PAGES}
        pageIndex={index}
        onStep={(delta) =>
          setIndex((i) => Math.min(WALL_PAGES.length - 1, Math.max(0, i + delta)))
        }
      />
    </div>
  );
}

export function FirstPage() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockPager pages={WALL_PAGES} pageIndex={0} onStep={() => {}} />
    </div>
  );
}

export function SinglePage() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockPager
        pages={[{ id: "spots", title: "Spots & Activity" }]}
        pageIndex={0}
        onStep={() => {}}
      />
    </div>
  );
}

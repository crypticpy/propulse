import { lazy, Suspense, useState } from "react";
import {
  countdownAllowed,
  launchPad,
  launchProvider,
  netDateLabel,
  useLaunches,
  type LaunchRecord,
} from "@/hooks/useLaunches";
import { useUTCClock } from "@/hooks/useUTCClock";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";
import { formatCountdown } from "../tokens";

const LaunchesReport = lazy(() =>
  import("../reports/LaunchesReport").then((m) => ({
    default: m.LaunchesReport,
  })),
);

const TICK_MS = 60_000;

function statusTone(status: string): { tone: string; state: string } {
  const key = status.toUpperCase();
  if (key === "GO" || key === "IN FLIGHT") {
    return { tone: "hc-good", state: "var(--hc-good)" };
  }
  if (key === "HOLD" || key === "TBD" || key === "TBC") {
    return { tone: "hc-warn", state: "var(--hc-warn)" };
  }
  return { tone: "hc-info-text", state: "var(--hc-info)" };
}

function launchHero(launch: LaunchRecord, now: Date): string {
  const status = launch.status.toUpperCase();
  if (launch.webcastLive || status === "IN FLIGHT") return "LIVE";
  if (countdownAllowed(launch) && launch.net) {
    const minutes = (Date.parse(launch.net) - now.getTime()) / 60_000;
    if (minutes <= 0) return "NOW";
    return formatCountdown(minutes);
  }
  if (launch.net) return netDateLabel(launch.net, now);
  return status || "TBD";
}

export function LaunchesTile({ title = "Launches" }: WallTileProps) {
  const { launches, next, status, stale, isLoading, error } = useLaunches();
  const now = useUTCClock(TICK_MS);
  const [reportOpen, setReportOpen] = useState(false);

  const report = reportOpen && (
    <Suspense fallback={null}>
      <LaunchesReport open onClose={() => setReportOpen(false)} />
    </Suspense>
  );

  const source = stale ? "LL2 · STALE" : "LL2";

  if (error && launches.length === 0) {
    return (
      <HamClockTile title={title} source="LL2">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">Launch Library unreachable. Retrying.</p>
      </HamClockTile>
    );
  }

  if (isLoading && launches.length === 0) {
    return (
      <HamClockTile title={title} source="LL2">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">Loading upcoming launches…</p>
      </HamClockTile>
    );
  }

  if (!next) {
    return (
      <>
        <HamClockTile
          title={title}
          source={source}
          onOpen={() => setReportOpen(true)}
          openLabel="No upcoming launches. Open the launches report"
        >
          <TileHero tone="hc-dim-text">NONE</TileHero>
          <TileSub>
            <span>
              {status === "unavailable"
                ? "LAUNCH FEED UNAVAILABLE"
                : "NO UPCOMING LAUNCHES"}
            </span>
          </TileSub>
        </HamClockTile>
        {report}
      </>
    );
  }

  const { tone, state } = statusTone(next.status);
  const hero = launchHero(next, now);
  const spoken = next.statusName || next.status || "scheduled";

  return (
    <>
      <HamClockTile
        title={title}
        source={source}
        state={state}
        onOpen={() => setReportOpen(true)}
        openLabel={`${next.name}, ${spoken}. Open the launches report`}
      >
        <TileHero tone={tone} large={hero.length <= 8}>
          {hero}
        </TileHero>
        <TileSub>
          <span>{launchProvider(next)}</span>
          <span>{launchPad(next)}</span>
        </TileSub>
      </HamClockTile>
      {report}
    </>
  );
}

import { useMemo } from "react";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import type { WeatherAlert } from "@/lib/api/weather";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";

/** Severity ranking; `Unknown` sorts last so a named severity always wins. */
const SEVERITY_RANK: Record<WeatherAlert["severity"], number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

const SEVERITY_TONE: Record<WeatherAlert["severity"], string> = {
  Extreme: "hc-bad",
  Severe: "hc-bad",
  Moderate: "hc-warn",
  Minor: "hc-info-text",
  Unknown: "hc-dim-text",
};

const SEVERITY_STATE: Record<WeatherAlert["severity"], string> = {
  Extreme: "var(--hc-bad)",
  Severe: "var(--hc-bad)",
  Moderate: "var(--hc-warn)",
  Minor: "var(--hc-info)",
  Unknown: "var(--hc-dim2)",
};

/** Immediate action outranks a watch at the same severity. */
const URGENCY_RANK: Record<WeatherAlert["urgency"], number> = {
  Immediate: 4,
  Expected: 3,
  Future: 2,
  Past: 1,
  Unknown: 0,
};

function worstAlert(alerts: WeatherAlert[]): WeatherAlert | null {
  let worst: WeatherAlert | null = null;
  for (const alert of alerts) {
    if (!worst) {
      worst = alert;
      continue;
    }
    const bySeverity =
      SEVERITY_RANK[alert.severity] - SEVERITY_RANK[worst.severity];
    if (bySeverity > 0) worst = alert;
    else if (
      bySeverity === 0 &&
      URGENCY_RANK[alert.urgency] > URGENCY_RANK[worst.urgency]
    ) {
      worst = alert;
    }
  }
  return worst;
}

/**
 * Active NWS alerts. The upstream feed is the nationwide active-alert set —
 * the same one `useRIM` scores against — so the count is US-wide and the title
 * says so rather than implying it is local.
 *
 * `fetchWeatherAlerts` drops any alert it cannot place on the map (zone-based
 * warnings arrive without geometry), so an empty list is not proof that
 * nothing is in force. The quiet state therefore reports what was mapped and
 * stays neutral rather than sounding an all-clear the feed cannot support.
 */
export function AlertsTile({ title = "Weather alerts" }: WallTileProps) {
  const { alerts, isLoading, error } = useWeatherAlerts();
  const worst = useMemo(() => worstAlert(alerts), [alerts]);

  if (error) {
    return (
      <HamClockTile title={title} source="NWS">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">NWS alert feed unreachable. Retrying.</p>
      </HamClockTile>
    );
  }

  if (isLoading && alerts.length === 0) {
    return (
      <HamClockTile title={title} source="NWS">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hcf-idle">Loading active alerts…</p>
      </HamClockTile>
    );
  }

  if (!worst) {
    return (
      <HamClockTile title={title} source="NWS · MAPPED ALERTS ONLY">
        <TileHero tone="hc-dim-text">NONE</TileHero>
        <TileSub>
          <span>NO MAPPED NWS ALERTS</span>
        </TileSub>
      </HamClockTile>
    );
  }

  const tone = SEVERITY_TONE[worst.severity];

  return (
    <HamClockTile
      title={title}
      source="NWS · US"
      state={SEVERITY_STATE[worst.severity]}
    >
      <div className="hc-heroline">
        <TileHero tone={tone} flush>
          {alerts.length}
        </TileHero>
        <div className={`hc-verdict hc-glow ${tone}`}>
          {worst.severity.toUpperCase()}
        </div>
      </div>
      <div className={`hcf-alert ${tone}`}>
        <b>{worst.event}</b>
        <span>{worst.areaDesc}</span>
      </div>
    </HamClockTile>
  );
}

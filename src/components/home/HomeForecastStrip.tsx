import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import type { useSolarModel } from "@/hooks/useSolarModel";
import {
  buildHomeBandOutlook,
  pickHomeOutlookBand,
  OUTLOOK_LABELS,
  OUTLOOK_LEVELS,
} from "@/lib/home/bandOutlook";
import { HomeStatus } from "./HomeStatus";

const CAPTION = "Full 24h grid, path analysis and NowCast in PropSphere →";

function pad(hour: number) {
  return String(hour).padStart(2, "0");
}

export function HomeForecastStrip({
  model,
  now,
}: {
  model: ReturnType<typeof useSolarModel>;
  now: number;
}) {
  const { location } = useHomeLocation();
  const activeBand = useActiveBand();
  const kp = model.current.kp?.kp ?? null;
  const sfi = model.current.flux?.flux ?? null;
  const predictedKp = model.current.predictedKp;
  const fluxForecast =
    model.resources.forecast.state === "fresh" ||
    model.resources.forecast.state === "refreshing"
      ? model.resources.forecast.data
      : undefined;

  const outlook = useMemo(() => {
    if (!location || kp === null || sfi === null) return null;
    const choice = pickHomeOutlookBand(activeBand, {
      lat: location.lat,
      lon: location.lon,
      now,
      kp,
      sfi,
    });
    const hours = buildHomeBandOutlook({
      band: choice.band,
      lat: location.lat,
      lon: location.lon,
      now,
      kp,
      sfi,
      predictedKp,
      fluxForecast,
    });
    return hours.length === 24 ? { ...choice, hours, grid: location.grid } : null;
  }, [
    location,
    activeBand,
    now,
    kp,
    sfi,
    predictedKp,
    fluxForecast,
  ]);

  return (
    <section
      className="home-panel home-forecast-strip"
      aria-label="Next 24 hours on your band"
    >
      <div className="home-panel-heading">
        <h2>
          Next 24 hours{outlook ? ` on ${outlook.band}` : ""}
        </h2>
        <HomeStatus state={model.resources.kp.state} />
      </div>

      {!outlook ? (
        <p>
          {!location
            ? "Set your Home location for a 24-hour band outlook."
            : "Awaiting current Kp and solar flux. The outlook is withheld while these inputs are unavailable."}
        </p>
      ) : (
        <>
          <p className="home-note">
            {outlook.reason === "active"
              ? `Your active band, from ${outlook.grid}.`
              : `Best band right now, from ${outlook.grid}.`}{" "}
            Modeled outlook, hour by hour in UTC — not a measured band.
          </p>

          <Link
            to="/map"
            className="home-forecast-strip-link"
            aria-label={`${outlook.band} 24-hour outlook, starting ${pad(outlook.hours[0].hour)} UTC. ${CAPTION}`}
          >
            <span className="home-forecast-strip-row">
              {outlook.hours.map((cell, index) => (
                <span
                  key={cell.at}
                  role="img"
                  className="home-forecast-strip-cell"
                  data-level={cell.level}
                  data-now={index === 0 ? "true" : undefined}
                  aria-label={`${pad(cell.hour)} UTC${index === 0 ? " (now)" : ""}: ${cell.label}`}
                  title={`${pad(cell.hour)} UTC${index === 0 ? " · now" : ""} · ${cell.label} · ${cell.daylight ? "daylight" : "darkness"} · Kp ${cell.kp} (${cell.kpSource}), SFI ${cell.sfi} (${cell.fluxSource})`}
                />
              ))}
            </span>
            <span className="home-forecast-strip-ticks" aria-hidden="true">
              {outlook.hours.map((cell, index) => (
                <span key={cell.at}>
                  {index === 0 ? "Now" : index % 6 === 0 ? pad(cell.hour) : ""}
                </span>
              ))}
            </span>
          </Link>

          <ul className="home-forecast-strip-legend">
            {OUTLOOK_LEVELS.map((level) => (
              <li key={level} data-level={level}>
                <span aria-hidden="true" />
                {OUTLOOK_LABELS[level]}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="home-actions">
        <Link to="/map">{CAPTION}</Link>
      </div>
    </section>
  );
}

import { useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRIM, type RimFocus, type RimHistoryPoint } from "@/hooks/useRIM";
import { DUCTING_QUERY_KEY } from "@/hooks/useDuctingForecast";
import type { RIMResult, RIMSubScore } from "@/types/atmos";
import { useAtmosStore } from "@/stores/atmosStore";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { HamClockButton, HamClockTabs } from "../controls";
import { useElementSize } from "../useElementSize";
import { useVisibleRows } from "../useVisibleRows";
import { reportFooter, reportTone, rimGrade } from "../tokens";
import { WallReport, type WallReportFact } from "./WallReport";

type SubKey = "hf" | "vhf" | "infra" | "emcomm";

const SUBS: Array<{ key: SubKey; pick: (rim: RIMResult) => RIMSubScore }> = [
  { key: "hf", pick: (rim) => rim.hfBand },
  { key: "vhf", pick: (rim) => rim.vhfUhf },
  { key: "infra", pick: (rim) => rim.infraRisk },
  { key: "emcomm", pick: (rim) => rim.emcommReadiness },
];

const WINDOW_MS = 12 * 60 * 60 * 1000;
const CHART_FALLBACK = { width: 720, height: 220 };

const SERIES = {
  composite: { color: "var(--hcr-chart-observed, #44ddff)", width: 1 },
  hf: { color: "var(--hcr-chart-estimated, #c4b5fd)", width: 0.45 },
  vhf: { color: "var(--hcr-chart-predicted, #ffd23f)", width: 0.45 },
  infra: { color: "var(--hcr-chart-warn, #fbbf24)", width: 0.45 },
  emcomm: { color: "var(--hcr-chart-dim, #cbd5e1)", width: 0.45 },
} as const;

function scoreText(part: RIMSubScore): string {
  return part.dataAvailable ? part.value.toFixed(1) : "NO DATA";
}

function impactTail(
  lightningKm: number | null,
  flood: string | undefined,
): string | null {
  const nearLightning = lightningKm != null && lightningKm < 500;
  const flooding = flood != null && flood !== "none";
  if (nearLightning && flooding) return "LIGHTNING AND FLOODING NEAR HOME";
  if (nearLightning) return "LIGHTNING AND STORMS NEAR HOME";
  if (flooding) return "FLOODING NEAR HOME";
  return null;
}

function verdictLine(
  result: RIMResult,
  lightningKm: number | null,
  flood: string | undefined,
): string {
  const { word } = rimGrade(result.composite);
  const prefix = result.partial ? `PARTIAL · ${word}` : word;
  const tail =
    impactTail(lightningKm, flood) ??
    (result.excludedInputs?.length
      ? result.excludedInputs.join(", ").toUpperCase()
      : null);
  return tail ? `${prefix} — ${tail}` : prefix;
}

function tropoWord(
  regions: Array<{ lat: number; lon: number; probability: number; type: string }>,
  lat: number | null,
  lon: number | null,
): string {
  if (lat == null || lon == null || regions.length === 0) return "NO DATA";
  let best = regions[0];
  let bestD = Infinity;
  for (const region of regions) {
    const d = Math.abs(region.lat - lat) + Math.abs(region.lon - lon);
    if (d < bestD) {
      bestD = d;
      best = region;
    }
  }
  if (best.probability >= 0.6) {
    return `${best.type.toUpperCase()} DUCT LIKELY`;
  }
  if (best.probability >= 0.3) return "DUCTING POSSIBLE";
  return "UNLIKELY";
}

function polyline(
  points: Array<{ t: number; v: number }>,
  x: (t: number) => number,
  y: (v: number) => number,
): string {
  return points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`,
    )
    .join(" ");
}

function RimCompositeChart({ history }: { history: RimHistoryPoint[] }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementSize(ref);
  const width = measured.width || CHART_FALLBACK.width;
  const height = measured.height || CHART_FALLBACK.height;
  const vh =
    typeof window === "undefined"
      ? CHART_FALLBACK.height / 72
      : window.innerHeight / 100;
  const fs = Math.max(11, Math.round(vh * 1.45));
  const left = Math.round(fs * 3.2);
  const right = Math.round(fs * 1.2);
  const top = Math.round(fs * 0.6);
  const bottom = Math.round(fs * 1.4);
  const now = Date.now();
  const start = now - WINDOW_MS;
  const x = (t: number) =>
    left + ((t - start) / WINDOW_MS) * (width - left - right);
  const y = (v: number) => top + (1 - v / 100) * (height - top - bottom);

  const rows = history
    .map((p) => ({ ...p, t: Date.parse(p.timestamp) }))
    .filter((p) => Number.isFinite(p.t) && p.t >= start);

  const series = {
    composite: rows.map((p) => ({ t: p.t, v: p.composite })),
    hf: rows
      .filter((p) => p.hf != null)
      .map((p) => ({ t: p.t, v: p.hf as number })),
    vhf: rows
      .filter((p) => p.vhf != null)
      .map((p) => ({ t: p.t, v: p.vhf as number })),
    infra: rows
      .filter((p) => p.infra != null)
      .map((p) => ({ t: p.t, v: p.infra as number })),
    emcomm: rows
      .filter((p) => p.emcomm != null)
      .map((p) => ({ t: p.t, v: p.emcomm as number })),
  };

  return (
    <div className="hcr-chart">
      <p className="hcr-chart-title">RIM COMPOSITE — 12 H · COMPUTED</p>
      {rows.length === 0 ? (
        <p className="hcr-empty">WAITING FOR SAMPLES</p>
      ) : (
        <>
          <div className="hcr-plot" ref={ref}>
            <svg
              role="img"
              aria-labelledby={id}
              width="100%"
              height="100%"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
            >
            <title id={id}>RIM composite and sub-scores over 12 hours</title>
            <line
              x1={left}
              x2={width - right}
              y1={y(50)}
              y2={y(50)}
              stroke="var(--hcr-chart-grid, rgba(255,255,255,.10))"
            />
            <text x={4} y={y(100) + fs * 0.4} fill="var(--hcr-chart-dim, #cbd5e1)">
              100
            </text>
            <text x={4} y={y(0) + fs * 0.2} fill="var(--hcr-chart-dim, #cbd5e1)">
              0
            </text>
            {(
              ["hf", "vhf", "infra", "emcomm", "composite"] as const
            ).map((key) => {
              const pts = series[key];
              if (pts.length < 1) return null;
              return (
                <path
                  key={key}
                  data-series={key}
                  d={polyline(pts, x, y)}
                  fill="none"
                  stroke={SERIES[key].color}
                  strokeWidth={Math.max(1.2, fs * 0.14 * SERIES[key].width * 2)}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          </div>
          <table className="sr-only">
            <caption>RIM composite and sub-scores over 12 hours</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Composite</th>
                <th scope="col">HF</th>
                <th scope="col">VHF/UHF</th>
                <th scope="col">Infrastructure</th>
                <th scope="col">EmComm</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.timestamp}>
                  <th scope="row">{row.timestamp.slice(11, 16)}Z</th>
                  <td>{row.composite}</td>
                  <td>{row.hf ?? "—"}</td>
                  <td>{row.vhf ?? "—"}</td>
                  <td>{row.infra ?? "—"}</td>
                  <td>{row.emcomm ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function homeFocusFromStation(
  station: { lat?: number; lon?: number; name?: string } | null,
): RimFocus | null {
  if (station?.lat == null || station.lon == null) return null;
  return {
    id: "home",
    name: station.name?.trim() ? station.name.toUpperCase() : "HOME",
    lat: station.lat,
    lon: station.lon,
  };
}

export interface RimReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Radio Impact Model drill-down: SCORE (facts, sub-score reasons, 12 h
 * chart, map layer toggles) and REGIONS (monitored-region list, no chart).
 */
export function RimReport({ open, onClose }: RimReportProps) {
  const station = useUserStore((s) => s.station);
  const monitored = useAtmosStore((s) => s.monitoredRegions);
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const [regionId, setRegionId] = useState("home");
  const [subKey, setSubKey] = useState<SubKey>("hf");

  const home = homeFocusFromStation(station);
  const focus = useMemo<RimFocus | null>(() => {
    if (regionId === "home") return home;
    const found = monitored.find((region) => region.id === regionId);
    return found
      ? { id: found.id, name: found.name, lat: found.lat, lon: found.lon }
      : home;
  }, [regionId, home, monitored]);

  const {
    rimResult,
    isLoading,
    history,
    regionScores,
    nearestLightningKm,
    lightningStrikeCount,
    floodProximity,
    floodActionCount,
    repeaterCount,
    operationalRepeaterRatio,
    nvis,
  } = useRIM(focus);

  const ductingQuery = useQuery({
    queryKey: [...DUCTING_QUERY_KEY],
    queryFn: async () => {
      const response = await fetch("/api/propagation/ducting");
      if (!response.ok) throw new Error("ducting unavailable");
      return response.json() as Promise<{
        regions: Array<{
          lat: number;
          lon: number;
          probability: number;
          type: string;
        }>;
      }>;
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const regionRows = useMemo(() => {
    const rows: Array<{ id: string; name: string; result: RIMResult | null }> =
      [];
    if (home) {
      rows.push({
        id: home.id,
        name: home.name,
        result:
          regionScores.find((row) => row.region.id === "home")?.result ??
          (rimResult?.regionId === "home" ? rimResult : null),
      });
    }
    for (const region of monitored) {
      if (region.id === "home") continue;
      rows.push({
        id: region.id,
        name: region.name,
        result:
          regionScores.find((row) => row.region.id === region.id)?.result ??
          null,
      });
    }
    return rows;
  }, [home, monitored, regionScores, rimResult]);

  const [listRef, visibleRegions] = useVisibleRows<HTMLDivElement>(
    regionRows.length,
  );

  const tropo = tropoWord(
    ductingQuery.data?.regions ?? [],
    focus?.lat ?? null,
    focus?.lon ?? null,
  );

  if (!rimResult) {
    const idle = reportFooter("RIM · SPACE WEATHER + NWS + USGS", null);
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Radio impact report · RIM"
        hero="—"
        verdict="NO SCORE"
        footer={idle.footer}
        updated={idle.updated}
      >
        <p className="hcr-note">
          {isLoading
            ? "Computing radio impact from space and severe weather…"
            : "NO DATA — space weather and severe-weather feeds have not arrived."}
        </p>
      </WallReport>
    );
  }

  const { tone } = rimGrade(rimResult.composite);
  const { footer, updated } = reportFooter(
    "RIM · SPACE WEATHER + NWS + USGS",
    rimResult.updatedAt,
  );
  const selected = SUBS.find((row) => row.key === subKey)?.pick(rimResult);
  const nvisValue = nvis
    ? nvis.nvisViable
      ? `VIABLE · ${(nvis.recommendedBands[0] ?? "80M").toUpperCase()}`
      : "NOT VIABLE"
    : "NO DATA";
  const lightningValue = `${lightningStrikeCount} / 15 MIN${
    nearestLightningKm == null
      ? ""
      : ` · ${Math.round(nearestLightningKm)} KM`
  }`;
  const floodValue =
    floodActionCount === 0 && (floodProximity == null || floodProximity === "none")
      ? "NO DATA"
      : `${floodActionCount} AT ACTION · ${(floodProximity ?? "none").toUpperCase()}`;
  const repeaterValue =
    repeaterCount === 0
      ? "NO DATA"
      : operationalRepeaterRatio == null
        ? `${repeaterCount}`
        : `${Math.round(operationalRepeaterRatio * 100)}% OF ${repeaterCount}`;

  const facts: WallReportFact[] = [
    {
      label: "COMPOSITE",
      value: rimResult.partial
        ? `${rimResult.composite.toFixed(1)} · PARTIAL`
        : rimResult.composite.toFixed(1),
    },
    { label: "NVIS", value: nvisValue },
    { label: "HF IMPACT", value: scoreText(rimResult.hfBand) },
    { label: "LIGHTNING", value: lightningValue },
    { label: "VHF/UHF IMPACT", value: scoreText(rimResult.vhfUhf) },
    { label: "FLOODING", value: floodValue },
    { label: "INFRASTRUCTURE", value: scoreText(rimResult.infraRisk) },
    { label: "REPEATERS", value: repeaterValue },
    { label: "EMCOMM", value: scoreText(rimResult.emcommReadiness) },
    { label: "TROPO DUCTING", value: tropo },
  ];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Radio impact report · RIM"
      tone={reportTone(tone)}
      hero={Math.round(rimResult.composite).toString()}
      verdict={verdictLine(rimResult, nearestLightningKm, floodProximity)}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="rim"
      pinElement={<RimReport open onClose={onClose} />}
    >
      <HamClockTabs
        label="Radio impact report tabs"
        tabs={[
          {
            id: "score",
            label: "SCORE",
            content: (
              <div className="hcr-cols hcr-cols--fill">
                <div>
                  <div className="hcr-list hcr-list--row" role="group" aria-label="Sub-scores">
                    {SUBS.map((row) => {
                      const part = row.pick(rimResult);
                      return (
                        <button
                          key={row.key}
                          type="button"
                          className="hcc-btn hcc-btn--quiet hcc-btn--md"
                          aria-pressed={subKey === row.key}
                          onClick={() => setSubKey(row.key)}
                        >
                          <b>
                            {part.dataAvailable ? part.value.toFixed(1) : "NO DATA"}
                          </b>
                          <span>{part.label.toUpperCase()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="hcr-note">
                    {selected?.reason ??
                      "Select a sub-score to see which inputs moved it."}
                  </p>
                  <HamClockButton
                    variant="quiet"
                    onClick={() => toggleLayer("lightning")}
                    aria-pressed={layers.lightning}
                  >
                    {layers.lightning ? "HIDE LIGHTNING" : "SHOW LIGHTNING"}
                  </HamClockButton>
                  <HamClockButton
                    variant="quiet"
                    onClick={() => toggleLayer("riverGauges")}
                    aria-pressed={layers.riverGauges}
                  >
                    {layers.riverGauges
                      ? "HIDE RIVER GAUGES"
                      : "SHOW RIVER GAUGES"}
                  </HamClockButton>
                </div>
                <RimCompositeChart history={history} />
              </div>
            ),
          },
          {
            id: "regions",
            label: "REGIONS",
            content: (
              <div className="hcr-box hcr-box--fill">
                <h4>
                  Monitored regions
                  {visibleRegions < regionRows.length
                    ? ` · top ${visibleRegions} of ${regionRows.length}`
                    : ""}
                </h4>
                {regionRows.length === 0 ? (
                  <p className="hcr-empty">NO STATION OR MONITORED REGIONS</p>
                ) : (
                  <div className="hcr-list" ref={listRef}>
                    {regionRows.slice(0, visibleRegions).map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="hcc-btn hcc-btn--quiet hcc-btn--md"
                        aria-pressed={regionId === row.id}
                        onClick={() => setRegionId(row.id)}
                      >
                        <b>
                          {row.result
                            ? row.result.partial
                              ? `${Math.round(row.result.composite)} PARTIAL`
                              : Math.round(row.result.composite)
                            : "NO DATA"}
                        </b>
                        <span>{row.name.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </WallReport>
  );
}

import { useEffect, useState } from "react";
import {
  PrimaryMetrics,
  SolarSummary,
  BandConditions,
  KIndexChart,
  AIndexChart,
  BzChart,
  FlareProbability,
  SolarFluxChart,
  EventAlert,
  PropagationIndex,
  AnimationModal,
  KIndexChartModal,
  AIndexChartModal,
  BzChartModal,
  SolarFluxChartModal,
  SolarSummaryModal,
  FlareProbabilityModal,
  BandConditionsModal,
  PropagationIndexModal,
} from "@/components/solar";
import {
  useKIndex,
  useSolarFlux,
  useProbabilities,
  useSunspots,
  useMagnetometer,
} from "@/hooks/useSolarData";
import { useSolarStore } from "@/stores/solarStore";
import { kpToAp } from "@/lib/utils/solarConversions";

// --- SWPC live ops add-ons (images + alerts + scales) ---

type NoaaScalesResponse = Record<
  string,
  {
    DateStamp: string;
    TimeStamp: string;
    R: {
      Scale: string | null;
      Text: string | null;
      MinorProb: string | null;
      MajorProb: string | null;
    };
    S: {
      Scale: string | null;
      Text: string | null;
      Prob: string | null;
    };
    G: {
      Scale: string | null;
      Text: string | null;
    };
  }
>;

type SwpcAlertItem = {
  product_id: string;
  issue_datetime: string; // e.g. "2026-02-02 11:43:12.050" (UTC)
  message: string;
};

type XrayFlareLatestItem = {
  time_tag: string;
  satellite: number;
  current_class: string;
  current_int_xrlong: number;
  begin_time: string;
  begin_class: string;
  max_time: string;
  max_class: string;
  max_xrlong: number;
  end_time: string;
  end_class: string | null;
};

type SwpcMatrix = (string | number | null)[][];

type SolarWindMag5mRow = {
  time_tag: string;
  bx_gsm: number | null;
  by_gsm: number | null;
  bz_gsm: number | null;
  bt: number | null;
};

type SolarWindPlasma5mRow = {
  time_tag: string;
  density: number | null;
  speed: number | null;
  temperature: number | null;
};

const SWPC_ENDPOINTS = {
  noaaScales: "https://services.swpc.noaa.gov/products/noaa-scales.json",
  alerts: "https://services.swpc.noaa.gov/products/alerts.json",
  xrayLatest:
    "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json",
  swMag5m:
    "https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json",
  swPlasma5m:
    "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json",
} as const;

const SWPC_IMAGES = {
  drapGlobal: "https://services.swpc.noaa.gov/images/d-rap/global.png",
  drapF10: "https://services.swpc.noaa.gov/images/d-rap/global_f10.png",
  drapF20: "https://services.swpc.noaa.gov/images/d-rap/global_f20.png",
  auroraNorth:
    "https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg",
  synopticMap: "https://services.swpc.noaa.gov/images/synoptic-map.jpg",
} as const;

// Animation JSON manifests (contain arrays of frame URLs)
const SWPC_ANIMATIONS = {
  drapGlobal:
    "https://services.swpc.noaa.gov/products/animations/d-rap/global.json",
  auroraNorth:
    "https://services.swpc.noaa.gov/products/animations/ovation_north_24h.json",
} as const;

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSwpcMatrixLatestRow(
  matrix: SwpcMatrix | null | undefined,
): Record<string, unknown> | null {
  if (!matrix || matrix.length < 2) {
    return null;
  }
  const header = matrix[0];
  const last = matrix[matrix.length - 1];
  if (!Array.isArray(header) || !Array.isArray(last)) {
    return null;
  }
  const obj: Record<string, unknown> = {};
  header.forEach((h, i) => {
    obj[String(h)] = last[i];
  });
  return obj;
}

function parseIssueDatetimeUtc(issueDatetime: string): Date {
  // SWPC alerts.json uses "YYYY-MM-DD HH:MM:SS.sss" and is issued in UTC.
  const iso = `${issueDatetime.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function isHamRelevantAlert(a: SwpcAlertItem): boolean {
  const m = a.message;
  return (
    /NOAA Scale:\s*[RSG]\d/i.test(m) ||
    /HF\b/i.test(m) ||
    /radio\b/i.test(m) ||
    /Geomagnetic Storm/i.test(m) ||
    /Solar Radiation Storm/i.test(m)
  );
}

function alertSummaryLine(message: string): string {
  const lines = message
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const firstKeyLine = lines.find((l) =>
    /^(SUMMARY:|ALERT:|WATCH:|WARNING:)/i.test(l),
  );
  return firstKeyLine ?? lines[0] ?? "";
}

function parseNoaaScaleCode(message: string): string | null {
  // Example: "NOAA Scale: R2 - Moderate"
  const m = message.match(/NOAA Scale:\s*([RSG]\d)\s*-/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function severityFromNoaaScaleCode(
  code: string | null,
): "minor" | "moderate" | "major" | "extreme" {
  if (!code) {
    return "minor";
  }
  const n = Number(code.slice(1));
  if (!Number.isFinite(n)) {
    return "minor";
  }
  if (n <= 1) {
    return "minor";
  }
  if (n === 2) {
    return "moderate";
  }
  if (n === 3) {
    return "major";
  }
  return "extreme";
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function SolarPulse() {
  // Fetch all solar data
  const {
    data: kIndexData,
    isLoading: kLoading,
    isError: kError,
  } = useKIndex();
  const { data: fluxData, isLoading: fluxLoading } = useSolarFlux();
  const { data: probData, isLoading: probLoading } = useProbabilities();
  const { data: sunspotData, isLoading: sunspotLoading } = useSunspots();
  const { data: magnetometerData, isLoading: magLoading } = useMagnetometer();

  // --- Live SWPC additions (scales, alerts, x-ray, 5-min solar wind) ---
  const [noaaScales, setNoaaScales] = useState<NoaaScalesResponse | null>(null);
  const [alerts, setAlerts] = useState<SwpcAlertItem[] | null>(null);
  const [xrayLatest, setXrayLatest] = useState<XrayFlareLatestItem | null>(
    null,
  );
  const [swMag5m, setSwMag5m] = useState<SolarWindMag5mRow | null>(null);
  const [swPlasma5m, setSwPlasma5m] = useState<SolarWindPlasma5mRow | null>(
    null,
  );
  const [imageTick, setImageTick] = useState(0);

  // Cache-bust images ~1/min so users see fresh SWPC plots.
  useEffect(() => {
    const id = window.setInterval(() => setImageTick((x) => x + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      try {
        const data = await fetchJson<NoaaScalesResponse>(
          SWPC_ENDPOINTS.noaaScales,
          ac.signal,
        );
        setNoaaScales(data);
      } catch {
        // Non-fatal
      }
    };
    load();
    const id = window.setInterval(load, 5 * 60_000);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      try {
        const data = await fetchJson<SwpcAlertItem[]>(
          SWPC_ENDPOINTS.alerts,
          ac.signal,
        );
        // newest first
        const sorted = data
          .slice()
          .sort(
            (a, b) =>
              parseIssueDatetimeUtc(b.issue_datetime).getTime() -
              parseIssueDatetimeUtc(a.issue_datetime).getTime(),
          );
        setAlerts(sorted);
      } catch {
        // Non-fatal
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      try {
        const data = await fetchJson<XrayFlareLatestItem[]>(
          SWPC_ENDPOINTS.xrayLatest,
          ac.signal,
        );
        setXrayLatest(data?.[0] ?? null);
      } catch {
        // Non-fatal
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const load = async () => {
      try {
        const mag = await fetchJson<SwpcMatrix>(
          SWPC_ENDPOINTS.swMag5m,
          ac.signal,
        );
        const plasma = await fetchJson<SwpcMatrix>(
          SWPC_ENDPOINTS.swPlasma5m,
          ac.signal,
        );

        const magRow = parseSwpcMatrixLatestRow(mag);
        const plasmaRow = parseSwpcMatrixLatestRow(plasma);

        if (magRow) {
          setSwMag5m({
            time_tag: String(magRow.time_tag ?? ""),
            bx_gsm: toNumber(magRow.bx_gsm),
            by_gsm: toNumber(magRow.by_gsm),
            bz_gsm: toNumber(magRow.bz_gsm),
            bt: toNumber(magRow.bt),
          });
        }

        if (plasmaRow) {
          setSwPlasma5m({
            time_tag: String(plasmaRow.time_tag ?? ""),
            density: toNumber(plasmaRow.density),
            speed: toNumber(plasmaRow.speed),
            temperature: toNumber(plasmaRow.temperature),
          });
        }
      } catch {
        // Non-fatal
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, []);

  // Store state
  const { setLastUpdate, setIsLive } = useSolarStore();

  // Modal states for chart/summary modals
  const [kIndexChartOpen, setKIndexChartOpen] = useState(false);
  const [aIndexChartOpen, setAIndexChartOpen] = useState(false);
  const [bzChartOpen, setBzChartOpen] = useState(false);
  const [solarFluxChartOpen, setSolarFluxChartOpen] = useState(false);
  const [propagationIndexOpen, setPropagationIndexOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [flareProbOpen, setFlareProbOpen] = useState(false);
  const [bandConditionsOpen, setBandConditionsOpen] = useState(false);

  // Image modal states for NOAA/SWPC images
  const [drapGlobalOpen, setDrapGlobalOpen] = useState(false);
  const [drapF10Open, setDrapF10Open] = useState(false);
  const [drapF20Open, setDrapF20Open] = useState(false);
  const [auroraOpen, setAuroraOpen] = useState(false);
  const [synopticOpen, setSynopticOpen] = useState(false);

  // Update store when data changes
  useEffect(() => {
    if (kIndexData && !kError) {
      setLastUpdate(new Date());
      setIsLive(true);
    } else if (kError) {
      setIsLive(false);
    }
  }, [kIndexData, kError, setLastUpdate, setIsLive]);

  // Extract current values
  const currentKp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? 3;
  const currentFlux = fluxData?.[fluxData.length - 1]?.flux ?? 100;
  const currentSsn = sunspotData?.[sunspotData.length - 1]?.ssn ?? 0;
  const currentBz =
    magnetometerData
      ?.slice()
      .reverse()
      .find((d) => typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm))
      ?.bz_gsm ?? null;

  const isLoading =
    kLoading || fluxLoading || probLoading || sunspotLoading || magLoading;

  // --- Derived: ops banner + cards ---
  const latestHamAlert = (alerts ?? []).find(isHamRelevantAlert) ?? null;
  const latestHamAlertScale = latestHamAlert
    ? parseNoaaScaleCode(latestHamAlert.message)
    : null;
  const latestHamAlertSeverity = severityFromNoaaScaleCode(latestHamAlertScale);
  const latestHamAlertText = latestHamAlert
    ? `${alertSummaryLine(latestHamAlert.message)}${latestHamAlertScale ? ` (${latestHamAlertScale})` : ""}`
    : "";

  const scalesNow = noaaScales?.["0"] ?? null;
  const scalesForecast1 = noaaScales?.["1"] ?? null;

  const rNow = scalesNow?.R?.Scale ? `R${scalesNow.R.Scale}` : "—";
  const sNow = scalesNow?.S?.Scale ? `S${scalesNow.S.Scale}` : "—";
  const gNow = scalesNow?.G?.Scale ? `G${scalesNow.G.Scale}` : "—";

  const scaleStamp = scalesNow
    ? `${scalesNow.DateStamp} ${scalesNow.TimeStamp}Z`
    : "—";

  const xrayCurrent = xrayLatest?.current_class ?? "—";
  const xrayMax = xrayLatest?.max_class ?? "—";
  const xrayBegin = xrayLatest?.begin_time ?? "—";
  const xrayMaxTime = xrayLatest?.max_time ?? "—";

  const swStamp = swMag5m?.time_tag || swPlasma5m?.time_tag || "—";
  const swBt = swMag5m?.bt;
  const swBz = swMag5m?.bz_gsm;
  const swSpeed = swPlasma5m?.speed;
  const swDensity = swPlasma5m?.density;

  const imgQs = `?t=${imageTick}`;
  const drapGlobalUrl = `${SWPC_IMAGES.drapGlobal}${imgQs}`;
  const drapF10Url = `${SWPC_IMAGES.drapF10}${imgQs}`;
  const drapF20Url = `${SWPC_IMAGES.drapF20}${imgQs}`;
  const auroraUrl = `${SWPC_IMAGES.auroraNorth}${imgQs}`;
  const synopticUrl = `${SWPC_IMAGES.synopticMap}${imgQs}`;

  const recentHamAlerts = (alerts ?? []).filter(isHamRelevantAlert).slice(0, 5);

  return (
    <div className="min-h-screen px-4">
      {/* Main content */}
      <main className="max-w-7xl mx-auto py-4 space-y-6">
        {/* Event Alert (SWPC alerts feed, ham-relevant only) */}
        {latestHamAlertText ? (
          <EventAlert
            eventType={null}
            severity={latestHamAlertSeverity}
            message={latestHamAlertText}
          />
        ) : null}

        {/* Primary Metrics */}
        <PrimaryMetrics
          kIndex={currentKp}
          solarFlux={currentFlux}
          sunspotNumber={currentSsn}
          aIndex={kpToAp(currentKp)}
          bz={currentBz}
          bzData={
            magnetometerData?.map((d) => ({
              time_tag: d.time_tag,
              bz_gsm: d.bz_gsm,
            })) ?? []
          }
          loading={isLoading}
          solarFluxData={
            fluxData?.map((d) => ({
              time_tag: d.time_tag,
              flux: d.flux,
            })) ?? []
          }
        />

        {/* Propagation Index - Hero Metric */}
        <PropagationIndex
          solarFlux={currentFlux}
          kIndex={currentKp}
          bz={currentBz}
          loading={isLoading}
          onExpand={() => setPropagationIndexOpen(true)}
        />

        {/* Summary */}
        <SolarSummary
          kIndex={currentKp}
          solarFlux={currentFlux}
          loading={isLoading}
          onExpand={() => setSummaryOpen(true)}
        />

        {/* Operational "Now" cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* NOAA scales */}
          <section className="rounded-2xl border border-plasma-orange/20 bg-white/[0.03] backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
                NOAA Scales
              </h2>
              <span className="text-xs text-gray-400 font-mono">
                {scaleStamp}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-gradient-to-br from-plasma-orange/10 to-transparent border border-plasma-orange/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Radio
                </div>
                <div className="mt-1 text-2xl font-bold text-plasma-orange font-mono">
                  {rNow}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {scalesNow?.R?.Text ?? ""}
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-caution-amber/10 to-transparent border border-caution-amber/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Radiation
                </div>
                <div className="mt-1 text-2xl font-bold text-caution-amber font-mono">
                  {sNow}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {scalesNow?.S?.Text ?? ""}
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-aurora-purple/10 to-transparent border border-aurora-purple/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Geomag
                </div>
                <div className="mt-1 text-2xl font-bold text-aurora-purple font-mono">
                  {gNow}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {scalesNow?.G?.Text ?? ""}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 text-xs text-gray-400">
              <span className="text-gray-500">Next day forecast:</span>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="text-plasma-orange">R:</span>{" "}
                  {scalesForecast1?.R?.MinorProb ||
                  scalesForecast1?.R?.MajorProb
                    ? `${scalesForecast1.R.MinorProb ?? "0"}%/${scalesForecast1.R.MajorProb ?? "0"}%`
                    : "—"}
                </span>
                <span>
                  <span className="text-caution-amber">S:</span>{" "}
                  {scalesForecast1?.S?.Prob
                    ? `${scalesForecast1.S.Prob}%`
                    : "—"}
                </span>
                <span>
                  <span className="text-aurora-purple">G:</span>{" "}
                  {scalesForecast1?.G?.Scale
                    ? `G${scalesForecast1.G.Scale}`
                    : "—"}
                </span>
              </div>
            </div>
          </section>

          {/* Latest GOES X-ray flare */}
          <section className="rounded-2xl border border-alert-red/20 bg-white/[0.03] backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
                GOES X-ray Flare
              </h2>
              <span className="text-xs text-gray-400 font-mono">
                {xrayLatest?.time_tag ?? "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-alert-red/10 to-transparent border border-alert-red/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Current
                </div>
                <div className="mt-1 text-2xl font-bold text-alert-red font-mono">
                  {xrayCurrent}
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-caution-amber/10 to-transparent border border-caution-amber/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Max
                </div>
                <div className="mt-1 text-2xl font-bold text-caution-amber font-mono">
                  {xrayMax}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-gray-400">
                Begin:{" "}
                <span className="text-gray-300 font-mono">{xrayBegin}</span>
              </span>
              <span className="text-gray-400">
                Max:{" "}
                <span className="text-gray-300 font-mono">{xrayMaxTime}</span>
              </span>
              <span className="text-gray-400">
                Sat:{" "}
                <span className="text-gray-300 font-mono">
                  {xrayLatest?.satellite ?? "—"}
                </span>
              </span>
            </div>
          </section>

          {/* Solar wind (5-minute) */}
          <section className="rounded-2xl border border-cosmic-cyan/20 bg-white/[0.03] backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
                Solar Wind
              </h2>
              <span className="text-xs text-gray-400 font-mono">
                {swStamp}Z
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-cosmic-cyan/10 to-transparent border border-cosmic-cyan/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Speed
                </div>
                <div className="mt-1 text-xl font-bold text-cosmic-cyan font-mono">
                  {typeof swSpeed === "number" ? `${Math.round(swSpeed)}` : "—"}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    km/s
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-signal-green/10 to-transparent border border-signal-green/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Density
                </div>
                <div className="mt-1 text-xl font-bold text-signal-green font-mono">
                  {typeof swDensity === "number" ? swDensity.toFixed(1) : "—"}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    /cc
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-plasma-orange/10 to-transparent border border-plasma-orange/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Bt
                </div>
                <div className="mt-1 text-xl font-bold text-plasma-orange font-mono">
                  {typeof swBt === "number" ? swBt.toFixed(1) : "—"}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    nT
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-aurora-purple/10 to-transparent border border-aurora-purple/20 p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Bz
                </div>
                <div
                  className="mt-1 text-xl font-bold font-mono"
                  style={{
                    color:
                      typeof swBz === "number"
                        ? swBz >= 0
                          ? "#00ff88"
                          : "#ff7700"
                        : "#888",
                  }}
                >
                  {typeof swBz === "number"
                    ? `${swBz > 0 ? "+" : ""}${swBz.toFixed(1)}`
                    : "—"}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    nT
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Live Maps - unified section with efficient grid */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
              Live Maps
            </h2>
            <a
              href="https://www.swpc.noaa.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-plasma-orange hover:text-white bg-plasma-orange/10 hover:bg-plasma-orange/20 border border-plasma-orange/30 rounded-lg transition-all duration-200"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              NOAA SWPC
            </a>
          </div>

          {/* 5-item grid: responsive from 2 cols to 5 cols */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* D-RAP Global (animated) */}
            <figure
              className="group cursor-pointer"
              onClick={() => setDrapGlobalOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setDrapGlobalOpen(true)}
            >
              <div className="relative overflow-hidden rounded-xl border border-white/10 group-hover:border-plasma-orange/40 transition-all duration-200 aspect-[4/3]">
                <img
                  src={drapGlobalUrl}
                  alt="SWPC D-RAP global"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Animated badge */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-plasma-orange/80 rounded text-[10px] font-mono text-white uppercase tracking-wider">
                  Animated
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-3">
                  <span className="text-xs text-white font-medium flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play
                  </span>
                </div>
              </div>
              <figcaption className="text-xs text-gray-500 mt-2 text-center">
                D-RAP Global HF
              </figcaption>
            </figure>

            {/* D-RAP 20 MHz (static) */}
            <figure
              className="group cursor-pointer"
              onClick={() => setDrapF20Open(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setDrapF20Open(true)}
            >
              <div className="relative overflow-hidden rounded-xl border border-white/10 group-hover:border-plasma-orange/40 transition-all duration-200 aspect-[4/3]">
                <img
                  src={drapF20Url}
                  alt="SWPC D-RAP 20 MHz"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-3">
                  <span className="text-xs text-white font-medium">
                    Enlarge
                  </span>
                </div>
              </div>
              <figcaption className="text-xs text-gray-500 mt-2 text-center">
                D-RAP 20 MHz / 15m
              </figcaption>
            </figure>

            {/* D-RAP 10 MHz (static) */}
            <figure
              className="group cursor-pointer"
              onClick={() => setDrapF10Open(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setDrapF10Open(true)}
            >
              <div className="relative overflow-hidden rounded-xl border border-white/10 group-hover:border-plasma-orange/40 transition-all duration-200 aspect-[4/3]">
                <img
                  src={drapF10Url}
                  alt="SWPC D-RAP 10 MHz"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-3">
                  <span className="text-xs text-white font-medium">
                    Enlarge
                  </span>
                </div>
              </div>
              <figcaption className="text-xs text-gray-500 mt-2 text-center">
                D-RAP 10 MHz / 30m
              </figcaption>
            </figure>

            {/* Aurora (animated) */}
            <figure
              className="group cursor-pointer"
              onClick={() => setAuroraOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setAuroraOpen(true)}
            >
              <div className="relative overflow-hidden rounded-xl border border-white/10 group-hover:border-aurora-purple/40 transition-all duration-200 aspect-[4/3]">
                <img
                  src={auroraUrl}
                  alt="Aurora forecast"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Animated badge */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-aurora-purple/80 rounded text-[10px] font-mono text-white uppercase tracking-wider">
                  Animated
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-3">
                  <span className="text-xs text-white font-medium flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play
                  </span>
                </div>
              </div>
              <figcaption className="text-xs text-gray-500 mt-2 text-center">
                Aurora N. Hemisphere
              </figcaption>
            </figure>

            {/* Synoptic Map (static) */}
            <figure
              className="group cursor-pointer"
              onClick={() => setSynopticOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSynopticOpen(true)}
            >
              <div className="relative overflow-hidden rounded-xl border border-white/10 group-hover:border-caution-amber/40 transition-all duration-200 aspect-[4/3]">
                <img
                  src={synopticUrl}
                  alt="Solar synoptic map"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-3">
                  <span className="text-xs text-white font-medium">
                    Enlarge
                  </span>
                </div>
              </div>
              <figcaption className="text-xs text-gray-500 mt-2 text-center">
                Solar Synoptic Map
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Recent ham-relevant alerts */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
              Recent SWPC Alerts
            </h2>
            <a
              href="https://www.swpc.noaa.gov/products/alerts-watches-and-warnings"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-plasma-orange hover:text-white bg-plasma-orange/10 hover:bg-plasma-orange/20 border border-plasma-orange/30 rounded-lg transition-all duration-200"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              All Alerts
            </a>
          </div>
          {recentHamAlerts.length ? (
            <div className="space-y-2">
              {recentHamAlerts.map((a) => {
                const code = parseNoaaScaleCode(a.message);
                const severity = severityFromNoaaScaleCode(code);
                const line = alertSummaryLine(a.message);
                const severityColors = {
                  minor: {
                    border: "border-signal-green/30",
                    bg: "bg-signal-green/10",
                    text: "text-signal-green",
                    dot: "bg-signal-green",
                  },
                  moderate: {
                    border: "border-caution-amber/30",
                    bg: "bg-caution-amber/10",
                    text: "text-caution-amber",
                    dot: "bg-caution-amber",
                  },
                  major: {
                    border: "border-plasma-orange/30",
                    bg: "bg-plasma-orange/10",
                    text: "text-plasma-orange",
                    dot: "bg-plasma-orange",
                  },
                  extreme: {
                    border: "border-alert-red/30",
                    bg: "bg-alert-red/10",
                    text: "text-alert-red",
                    dot: "bg-alert-red",
                  },
                };
                const colors = severityColors[severity];
                return (
                  <div
                    key={`${a.product_id}-${a.issue_datetime}`}
                    className={`rounded-xl ${colors.border} ${colors.bg} border p-3 transition-colors hover:bg-white/5`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${colors.dot} mt-1.5 flex-shrink-0`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-gray-200 leading-snug">
                            {line}
                            {code && (
                              <span
                                className={`ml-2 text-xs font-mono ${colors.text}`}
                              >
                                {code}
                              </span>
                            )}
                          </p>
                          <span className="text-xs text-gray-500 font-mono whitespace-nowrap flex-shrink-0">
                            {a.issue_datetime.split(" ")[1]?.slice(0, 5) ?? ""}Z
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(
                            a.issue_datetime.replace(" ", "T") + "Z",
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              <svg
                className="w-8 h-8 mx-auto mb-2 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              No ham-relevant alerts at this time
            </div>
          )}
        </section>

        {/* Two-column layout for K-index and A-index charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* K-Index Chart */}
          <KIndexChart
            data={
              kIndexData?.map((d) => ({
                time_tag: d.time_tag,
                kp_index: d.kp_index,
              })) ?? []
            }
            loading={kLoading}
            onExpand={() => setKIndexChartOpen(true)}
          />

          {/* A-Index Chart */}
          <AIndexChart
            data={
              kIndexData?.map((d) => ({
                time_tag: d.time_tag,
                kp_index: d.kp_index,
              })) ?? []
            }
            loading={kLoading}
            onExpand={() => setAIndexChartOpen(true)}
          />
        </div>

        {/* Two-column layout for Solar Flux and IMF Bz */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Solar Flux Chart */}
          <SolarFluxChart
            data={
              fluxData?.map((d) => ({
                time_tag: d.time_tag,
                flux: d.flux,
              })) ?? []
            }
            loading={fluxLoading}
            onExpand={() => setSolarFluxChartOpen(true)}
          />

          {/* IMF Bz Chart */}
          <BzChart
            data={
              magnetometerData?.flatMap((d) =>
                typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm)
                  ? [{ time_tag: d.time_tag, bz_gsm: d.bz_gsm }]
                  : [],
              ) ?? []
            }
            loading={magLoading}
            onExpand={() => setBzChartOpen(true)}
          />
        </div>

        {/* Two-column layout for probability and bands */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Flare Probability */}
          <FlareProbability
            cProb={probData?.c_prob ?? 0}
            mProb={probData?.m_prob ?? 0}
            xProb={probData?.x_prob ?? 0}
            protonProb={probData?.proton_prob ?? 0}
            loading={probLoading}
            onExpand={() => setFlareProbOpen(true)}
          />

          {/* Band Conditions */}
          <BandConditions
            kIndex={currentKp}
            solarFlux={currentFlux}
            loading={isLoading}
            onExpand={() => setBandConditionsOpen(true)}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-8 text-center text-xs text-gray-500">
        <p>
          Data sourced from{" "}
          <a
            href="https://www.swpc.noaa.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-plasma-orange hover:underline"
          >
            NOAA Space Weather Prediction Center
          </a>
        </p>
        <p className="mt-1">Propulse — The ionosphere, visualized</p>
      </footer>

      {/* Chart/Summary Modals */}
      <KIndexChartModal
        isOpen={kIndexChartOpen}
        onClose={() => setKIndexChartOpen(false)}
        data={
          kIndexData?.map((d) => ({
            time_tag: d.time_tag,
            kp_index: d.kp_index,
          })) ?? []
        }
      />

      <AIndexChartModal
        isOpen={aIndexChartOpen}
        onClose={() => setAIndexChartOpen(false)}
        data={
          kIndexData?.map((d) => ({
            time_tag: d.time_tag,
            kp_index: d.kp_index,
          })) ?? []
        }
      />

      <BzChartModal
        isOpen={bzChartOpen}
        onClose={() => setBzChartOpen(false)}
        data={
          magnetometerData?.flatMap((d) =>
            typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm)
              ? [{ time_tag: d.time_tag, bz_gsm: d.bz_gsm }]
              : [],
          ) ?? []
        }
      />

      <SolarFluxChartModal
        isOpen={solarFluxChartOpen}
        onClose={() => setSolarFluxChartOpen(false)}
        data={
          fluxData?.map((d) => ({
            time_tag: d.time_tag,
            flux: d.flux,
          })) ?? []
        }
      />

      <SolarSummaryModal
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        kIndex={currentKp}
        solarFlux={currentFlux}
      />

      <PropagationIndexModal
        isOpen={propagationIndexOpen}
        onClose={() => setPropagationIndexOpen(false)}
        solarFlux={currentFlux}
        kIndex={currentKp}
        bz={currentBz}
      />

      <FlareProbabilityModal
        isOpen={flareProbOpen}
        onClose={() => setFlareProbOpen(false)}
        cProb={probData?.c_prob ?? 0}
        mProb={probData?.m_prob ?? 0}
        xProb={probData?.x_prob ?? 0}
        protonProb={probData?.proton_prob ?? 0}
      />

      <BandConditionsModal
        isOpen={bandConditionsOpen}
        onClose={() => setBandConditionsOpen(false)}
        kIndex={currentKp}
        solarFlux={currentFlux}
      />

      {/* NOAA Image/Animation Modals */}
      <AnimationModal
        isOpen={drapGlobalOpen}
        onClose={() => setDrapGlobalOpen(false)}
        thumbnailUrl={drapGlobalUrl}
        animationJsonUrl={SWPC_ANIMATIONS.drapGlobal}
        alt="SWPC D-RAP global: highest affected HF frequency"
        title="D-RAP Global HF Absorption"
        caption="Shows the highest HF frequency affected by D-region absorption. Higher values indicate stronger absorption affecting more frequencies."
        sourceUrl="https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap"
        sourceLabel="View at NOAA"
        defaultFps={10}
      />

      <AnimationModal
        isOpen={drapF10Open}
        onClose={() => setDrapF10Open(false)}
        thumbnailUrl={drapF10Url}
        alt="SWPC D-RAP global 10 MHz slice"
        title="D-RAP 10 MHz Absorption"
        caption="HF absorption impact at 10 MHz - useful for 30m and 40m band operations."
        sourceUrl="https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap"
        sourceLabel="View at NOAA"
      />

      <AnimationModal
        isOpen={drapF20Open}
        onClose={() => setDrapF20Open(false)}
        thumbnailUrl={drapF20Url}
        alt="SWPC D-RAP global 20 MHz slice"
        title="D-RAP 20 MHz Absorption"
        caption="HF absorption impact at 20 MHz - useful for 15m and 17m band operations."
        sourceUrl="https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap"
        sourceLabel="View at NOAA"
      />

      <AnimationModal
        isOpen={auroraOpen}
        onClose={() => setAuroraOpen(false)}
        thumbnailUrl={auroraUrl}
        animationJsonUrl={SWPC_ANIMATIONS.auroraNorth}
        alt="SWPC aurora forecast (northern hemisphere)"
        title="Aurora Forecast (Northern Hemisphere)"
        caption="30-minute aurora forecast. Higher activity indicates potential VHF propagation opportunities and HF disruption at high latitudes."
        sourceUrl="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast"
        sourceLabel="View at NOAA"
        defaultFps={8}
      />

      <AnimationModal
        isOpen={synopticOpen}
        onClose={() => setSynopticOpen(false)}
        thumbnailUrl={synopticUrl}
        alt="SWPC solar synoptic map"
        title="Solar Synoptic Map"
        caption="Shows active regions (sunspots) and coronal holes on the sun. Coronal holes can produce high-speed solar wind streams affecting propagation."
        sourceUrl="https://www.swpc.noaa.gov/products/solar-synoptic-map"
        sourceLabel="View at NOAA"
      />
    </div>
  );
}

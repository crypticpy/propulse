import { PropagationForecastModal } from "propulse";

const BANDS = ["10m", "12m", "15m", "17m", "20m", "30m", "40m", "80m", "160m"];

type Status = "excellent" | "good" | "fair" | "poor" | "closed";

function statusFor(band: string, hour: number): Status {
  const highBand = ["10m", "12m", "15m", "17m", "20m"].includes(band);
  const daylight = hour >= 12 && hour <= 23;
  if (highBand) {
    if (daylight) return hour >= 16 && hour <= 20 ? "excellent" : "good";
    return band === "20m" ? "fair" : "closed";
  }
  if (daylight) return "poor";
  return hour >= 2 && hour <= 8 ? "excellent" : "good";
}

function buildForecast() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    bands: BANDS.map((band) => {
      const status = statusFor(band, hour);
      const snr =
        status === "excellent" ? 8 : status === "good" ? 2 : status === "fair" ? -6 : status === "poor" ? -14 : -30;
      return { band, status, snrEstimate: snr, confidence: 78 };
    }),
  }));
}

const FORECAST = buildForecast();

const BEST_WINDOWS = [
  { band: "20m", startHour: 16, endHour: 20, peakHour: 18, peakStatus: "excellent" as const, peakSnr: 9 },
  { band: "15m", startHour: 17, endHour: 19, peakHour: 18, peakStatus: "good" as const, peakSnr: 3 },
  { band: "40m", startHour: 3, endHour: 7, peakHour: 5, peakStatus: "excellent" as const, peakSnr: 10 },
  { band: "17m", startHour: 15, endHour: 21, peakHour: 18, peakStatus: "fair" as const, peakSnr: -5 },
];

function nowCastState() {
  const predictions = new Map([
    ["20m", { model_version: "nowcast-hf-v4.2", feature_contract: "station-chain-v1", issue_time: "2026-09-08T18:00:00Z", valid_time: "2026-09-08T18:00:00Z", band: "20m", mode: "WSPR", target_grid4: "JO31", core_probability: 0.82, personalized_probability: 0.76, confidence: 0.91, ood_flags: [] as string[], data_freshness: { path_history: 240, space_weather: 900 }, top_factors: ["solar_zenith_angle", "kp_index"], assumptions: [], profile: "nowcast" }],
    ["40m", { model_version: "nowcast-hf-v4.2", feature_contract: "station-chain-v1", issue_time: "2026-09-08T18:00:00Z", valid_time: "2026-09-08T18:00:00Z", band: "40m", mode: "WSPR", target_grid4: "JO31", core_probability: 0.64, personalized_probability: 0.58, confidence: 0.83, ood_flags: [] as string[], data_freshness: { path_history: 300, space_weather: 900 }, top_factors: ["path_history_snr"], assumptions: [], profile: "nowcast" }],
    ["15m", { model_version: "nowcast-hf-v4.2", feature_contract: "station-chain-v1", issue_time: "2026-09-08T18:00:00Z", valid_time: "2026-09-08T18:00:00Z", band: "15m", mode: "WSPR", target_grid4: "JO31", core_probability: 0.31, personalized_probability: 0.19, confidence: 0.62, ood_flags: ["sparse_path_history"], data_freshness: { path_history: 600, space_weather: 900 }, top_factors: ["grayline_offset"], assumptions: [], profile: "physics" }],
  ]);
  return {
    enabled: true,
    visible: true,
    available: true,
    personalized: true,
    pending: false,
    capabilityError: null,
    predictions,
    stationEnvelopes: new Map(),
    errors: new Map(),
    requestedCount: 3,
    failedCount: 0,
    partial: false,
    fallbackBands: ["15m"],
    staleInputBands: [] as string[],
    nowcastBands: ["20m", "40m", "15m"],
  };
}

export function WithNowCast() {
  return (
    <div style={{ position: "relative", width: 900, height: 760, background: "#05070a" }}>
      <PropagationForecastModal
        isOpen
        onClose={() => {}}
        forecast={FORECAST}
        bestWindows={BEST_WINDOWS}
        currentHour={18}
        kp={3}
        sfi={142}
        stationCallsign="W1AW"
        targetName="JA1XYZ (JO31)"
        nowCast={nowCastState()}
        mode="FT8"
        stationLabel="IC-7300 · G5RV"
        locationLabel="EM12 -> JO31"
      />
    </div>
  );
}

export function NoFavorableWindows() {
  return (
    <div style={{ position: "relative", width: 900, height: 760, background: "#05070a" }}>
      <PropagationForecastModal
        isOpen
        onClose={() => {}}
        forecast={FORECAST.map((h) => ({
          ...h,
          bands: h.bands.map((b) => ({ ...b, status: "poor" as const, snrEstimate: -18 })),
        }))}
        bestWindows={[]}
        currentHour={9}
        kp={6}
        sfi={78}
        stationCallsign="VK6LC"
        targetName="DL2ABC (JO31)"
      />
    </div>
  );
}

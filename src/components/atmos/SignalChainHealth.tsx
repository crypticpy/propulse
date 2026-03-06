/**
 * SignalChainHealth — Sun-to-Antenna signal path visualization
 * Shows current status at each stage of the radio signal chain:
 *   Sun/Corona -> Solar Wind -> Magnetosphere -> Ionosphere -> Troposphere -> Antenna/Station
 */

import { useState, useMemo } from "react";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  useXrayFlux,
  useProtonFlux,
  useDstIndex,
} from "@/hooks/useSolarExpanded";
import { useMagnetometer } from "@/hooks/useSolarData";
import { useTEC } from "@/hooks/useTEC";
import { useLightning } from "@/hooks/useLightning";
import { useLocalWeather } from "@/hooks/useLocalWeather";
import { weatherCodeToDescription } from "@/lib/api/openMeteo";
import { useActiveRadio, useUserAntennas } from "@/stores/shackStore";
import { useActiveLocation } from "@/hooks/useActiveLocation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "good" | "degraded" | "poor";

interface ChainStage {
  id: string;
  label: string;
  sublabel: string;
  status: Status;
  details: string[];
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusColor(s: Status): string {
  switch (s) {
    case "good":
      return "bg-signal-green";
    case "degraded":
      return "bg-caution-amber";
    case "poor":
      return "bg-alert-red";
  }
}

function statusTextColor(s: Status): string {
  switch (s) {
    case "good":
      return "text-signal-green";
    case "degraded":
      return "text-caution-amber";
    case "poor":
      return "text-alert-red";
  }
}

// ---------------------------------------------------------------------------
// X-ray flux -> flare class string
// ---------------------------------------------------------------------------

function fluxToClass(flux: number): string {
  if (flux >= 1e-4) return `X${(flux / 1e-4).toFixed(1)}`;
  if (flux >= 1e-5) return `M${(flux / 1e-5).toFixed(1)}`;
  if (flux >= 1e-6) return `C${(flux / 1e-6).toFixed(1)}`;
  if (flux >= 1e-7) return `B${(flux / 1e-7).toFixed(1)}`;
  return `A${(flux / 1e-8).toFixed(1)}`;
}

function fluxToStatus(flux: number): Status {
  // M-class or X-class = poor
  if (flux >= 1e-5) return "poor";
  // C-class = degraded
  if (flux >= 1e-6) return "degraded";
  // A or B class = good
  return "good";
}

// ---------------------------------------------------------------------------
// Haversine distance (km) for lightning proximity
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

interface ChainInputs {
  latestXrayFlux: number | null;
  sfi: number | null;
  protonFlux: number | null;
  bz: number | null;
  bt: number | null;
  kp: number | null;
  dst: number | null;
  tecAvg: number | null;
  weatherCode: number | null;
  temperature: number | null;
  windSpeed: number | null;
  lightningNearestKm: number | null;
  lightningCount: number;
  hasRadio: boolean;
  radioName: string | null;
  antennaName: string | null;
}

function buildChainStages(inputs: ChainInputs): ChainStage[] {
  const stages: ChainStage[] = [];

  // ── 1. Sun / Corona ──────────────────────────────────────────────────
  {
    let status: Status = "good";
    let sublabel = "\u2014";
    const details: string[] = [];

    if (inputs.latestXrayFlux != null) {
      status = fluxToStatus(inputs.latestXrayFlux);
      sublabel = fluxToClass(inputs.latestXrayFlux);
    }
    if (inputs.sfi != null) {
      details.push(`SFI ${inputs.sfi}`);
    }
    if (inputs.protonFlux != null) {
      details.push(`Protons ${inputs.protonFlux.toFixed(1)} pfu`);
    }

    stages.push({
      id: "sun",
      label: "Sun / Corona",
      sublabel,
      status,
      details,
    });
  }

  // ── 2. Solar Wind ────────────────────────────────────────────────────
  {
    let status: Status = "good";
    const details: string[] = [];

    // We use Bz from magnetometer as the primary solar wind indicator
    // (no dedicated solar wind speed hook available)
    if (inputs.bz != null) {
      if (inputs.bz < -5) status = "poor";
      else if (inputs.bz < 0) status = "degraded";
      details.push(`Bz ${inputs.bz > 0 ? "+" : ""}${inputs.bz.toFixed(1)} nT`);
    }
    if (inputs.bt != null) {
      details.push(`Bt ${inputs.bt.toFixed(1)} nT`);
    }

    const sublabel =
      inputs.bz != null
        ? `Bz ${inputs.bz > 0 ? "+" : ""}${inputs.bz.toFixed(1)} nT`
        : "\u2014";

    stages.push({
      id: "solar-wind",
      label: "Solar Wind",
      sublabel,
      status,
      details,
    });
  }

  // ── 3. Magnetosphere ─────────────────────────────────────────────────
  {
    let status: Status = "good";
    let sublabel = "\u2014";
    const details: string[] = [];

    if (inputs.kp != null) {
      if (inputs.kp >= 6) status = "poor";
      else if (inputs.kp >= 4) status = "degraded";
      sublabel = `Kp ${inputs.kp}`;
    }

    if (inputs.dst != null) {
      details.push(`Dst ${inputs.dst} nT`);
      // Strengthen status if Dst is very negative
      if (inputs.dst < -100 && status !== "poor") status = "poor";
      else if (inputs.dst < -50 && status === "good") status = "degraded";

      // Informal storm level label
      if (inputs.dst < -200) details.push("Severe storm");
      else if (inputs.dst < -100) details.push("Intense storm");
      else if (inputs.dst < -50) details.push("Moderate storm");
    }

    stages.push({
      id: "magnetosphere",
      label: "Magnetosphere",
      sublabel,
      status,
      details,
    });
  }

  // ── 4. Ionosphere ────────────────────────────────────────────────────
  {
    let status: Status = "good";
    let sublabel = "\u2014";
    const details: string[] = [];

    if (inputs.tecAvg != null) {
      if (inputs.tecAvg > 60) status = "poor";
      else if (inputs.tecAvg > 40) status = "degraded";
      sublabel = `${inputs.tecAvg.toFixed(0)} TECU`;
      details.push(`TEC ${inputs.tecAvg.toFixed(1)} TECU`);
    }

    stages.push({
      id: "ionosphere",
      label: "Ionosphere",
      sublabel,
      status,
      details,
    });
  }

  // ── 5. Troposphere ───────────────────────────────────────────────────
  {
    let status: Status = "good";
    let sublabel = "\u2014";
    const details: string[] = [];

    if (inputs.weatherCode != null) {
      const desc = weatherCodeToDescription(inputs.weatherCode);
      sublabel = desc;
      // Thunderstorm codes 80-99 (rain showers, hail, thunderstorm)
      if (inputs.weatherCode >= 95) {
        status = "poor";
      } else if (inputs.weatherCode >= 80) {
        status = "degraded";
      }
    }

    // Lightning proximity overrides
    if (inputs.lightningCount > 0 && inputs.lightningNearestKm != null) {
      if (inputs.lightningNearestKm < 30) {
        status = "poor";
        details.push(
          `Lightning ${inputs.lightningNearestKm.toFixed(0)} km away (${inputs.lightningCount} strikes)`,
        );
      } else if (inputs.lightningNearestKm < 100) {
        if (status === "good") status = "degraded";
        details.push(
          `Lightning ${inputs.lightningNearestKm.toFixed(0)} km away`,
        );
      }
    }

    if (inputs.temperature != null) {
      details.push(`${inputs.temperature.toFixed(0)}\u00B0C`);
    }
    if (inputs.windSpeed != null) {
      details.push(`Wind ${inputs.windSpeed.toFixed(0)} km/h`);
    }

    stages.push({
      id: "troposphere",
      label: "Troposphere",
      sublabel,
      status,
      details,
    });
  }

  // ── 6. Antenna / Station ─────────────────────────────────────────────
  {
    let status: Status = "good";
    const details: string[] = [];
    let sublabel: string;

    if (inputs.hasRadio && inputs.radioName) {
      sublabel = inputs.radioName;
    } else {
      sublabel = "Not configured";
      status = "degraded";
    }

    if (inputs.antennaName) {
      details.push(inputs.antennaName);
    }

    stages.push({
      id: "station",
      label: "Antenna / Station",
      sublabel,
      status,
      details,
    });
  }

  return stages;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignalChainHealth() {
  const [expanded, setExpanded] = useState(false);

  // ── Solar data ──────────────────────────────────────────────────────
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();
  const { data: xrayFluxData } = useXrayFlux();
  const { data: protonFluxData } = useProtonFlux();
  const { data: dstData } = useDstIndex();
  const { data: magData } = useMagnetometer();

  // ── Ionosphere ──────────────────────────────────────────────────────
  const { tecData } = useTEC();

  // ── Troposphere ─────────────────────────────────────────────────────
  const { weather } = useLocalWeather();
  const { strikes } = useLightning();
  const location = useActiveLocation();

  // ── Station ─────────────────────────────────────────────────────────
  const activeRadio = useActiveRadio();
  const antennas = useUserAntennas();

  // ── Derived values ──────────────────────────────────────────────────
  const inputs = useMemo<ChainInputs>(() => {
    // Latest X-ray flux value (last entry, 0.1-0.8nm band)
    const latestXray =
      xrayFluxData && xrayFluxData.length > 0
        ? (xrayFluxData.filter((e) => e.energy === "0.1-0.8nm").at(-1)?.flux ??
          xrayFluxData.at(-1)?.flux ??
          null)
        : null;

    // Latest SFI
    const sfi =
      solarFluxData && solarFluxData.length > 0
        ? (solarFluxData.at(-1)?.flux ?? null)
        : null;

    // Latest proton flux
    const protonFlux =
      protonFluxData && protonFluxData.length > 0
        ? (protonFluxData.at(-1)?.flux ?? null)
        : null;

    // Latest Bz and Bt from magnetometer
    const latestMag = magData?.at(-1);
    const bz = latestMag?.bz_gsm ?? null;
    const bt = latestMag?.bt ?? null;

    // Latest Kp
    const kp =
      kIndexData && kIndexData.length > 0
        ? (kIndexData.at(-1)?.kp_index ?? null)
        : null;

    // Latest Dst
    const dst =
      dstData && dstData.length > 0 ? (dstData.at(-1)?.dst ?? null) : null;

    // Average TEC across grid (if available)
    let tecAvg: number | null = null;
    if (tecData.available && tecData.grid.length > 0) {
      const sum = tecData.grid.reduce((acc, p) => acc + p.tec, 0);
      tecAvg = sum / tecData.grid.length;
    }

    // Lightning proximity
    let lightningNearestKm: number | null = null;
    let lightningCount = 0;
    if (
      location &&
      location.lat != null &&
      location.lon != null &&
      strikes.length > 0
    ) {
      let nearest = Infinity;
      const stationLat = location.lat;
      const stationLon = location.lon;
      for (const s of strikes) {
        const d = haversineKm(stationLat, stationLon, s.lat, s.lon);
        if (d < 200) lightningCount++;
        if (d < nearest) nearest = d;
      }
      if (nearest < Infinity) lightningNearestKm = nearest;
    }

    // Radio & antenna
    const radioName = activeRadio
      ? (activeRadio.displayName ??
        `${activeRadio.manufacturer} ${activeRadio.model}`)
      : null;

    const antennaName =
      antennas.length > 0 ? antennas[0].name || antennas[0].antennaType : null;

    return {
      latestXrayFlux: latestXray,
      sfi,
      protonFlux,
      bz,
      bt,
      kp,
      dst,
      tecAvg,
      weatherCode: weather?.weatherCode ?? null,
      temperature: weather?.temperature ?? null,
      windSpeed: weather?.windSpeed ?? null,
      lightningNearestKm,
      lightningCount,
      hasRadio: activeRadio != null,
      radioName,
      antennaName,
    };
  }, [
    xrayFluxData,
    solarFluxData,
    protonFluxData,
    magData,
    kIndexData,
    dstData,
    tecData,
    weather,
    strikes,
    location,
    activeRadio,
    antennas,
  ]);

  const stages = useMemo(() => buildChainStages(inputs), [inputs]);

  // Overall health: worst status wins
  const overallStatus = stages.reduce<Status>((worst, s) => {
    if (s.status === "poor" || worst === "poor") return "poor";
    if (s.status === "degraded" || worst === "degraded") return "degraded";
    return "good";
  }, "good");

  return (
    <div className="bg-void-black/40 rounded-lg border border-white/5 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${statusColor(overallStatus)}`}
          />
          <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
            Signal Chain
          </span>
        </div>
        <svg
          className={`w-3 h-3 text-gray-600 transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded view */}
      {expanded && (
        <div className="px-3 pb-3 space-y-0.5">
          {stages.map((stage, i) => (
            <div key={stage.id}>
              {/* Connector line */}
              {i > 0 && (
                <div className="flex justify-center py-0.5">
                  <div className="w-px h-3 bg-white/10" />
                </div>
              )}
              {/* Stage card */}
              <div className="flex items-start gap-2 px-2 py-1.5 rounded bg-white/[0.02]">
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${statusColor(stage.status)}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-medium text-gray-300">
                      {stage.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${statusTextColor(stage.status)}`}
                    >
                      {stage.sublabel}
                    </span>
                  </div>
                  {stage.details.length > 0 && (
                    <div className="mt-0.5 space-y-0">
                      {stage.details.map((d, j) => (
                        <span
                          key={j}
                          className="block text-[9px] text-gray-600"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

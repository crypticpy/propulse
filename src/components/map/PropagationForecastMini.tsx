/**
 * PropagationForecastMini Component
 *
 * Compact horizontal version of the propagation forecast for top bar placement.
 * Shows a condensed heatmap strip and best band recommendation.
 * Clicks to expand full PropagationForecastModal.
 */

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useForecastDisplayPrefs } from "@/stores/userStore";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { useKIndex, useSolarFlux, useMagnetometer } from "@/hooks/useSolarData";
import { useNowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useResearchParticipation } from "@/hooks/useResearchParticipation";
import { latLonToGrid } from "@/lib/utils/grid";
import {
  getForecastForPath,
  getBestWindows,
  getForecastStatusColor,
  getKIndexColor,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";
import { getSunTimes } from "@/lib/utils/time";
import { PropagationForecastModal } from "./modals/PropagationForecastModal";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";
import type { BandId } from "@/types/user";

interface PropagationForecastMiniProps {
  displayTime: Date;
  className?: string;
}

// Band descriptions for tooltips
const BAND_INFO: Record<
  string,
  { freq: string; bestFor: string; needsSfi: number }
> = {
  "10m": { freq: "28 MHz", bestFor: "Solar max DX, local", needsSfi: 110 },
  "12m": { freq: "24 MHz", bestFor: "Solar max DX", needsSfi: 100 },
  "15m": { freq: "21 MHz", bestFor: "Daytime DX, contests", needsSfi: 90 },
  "17m": { freq: "18 MHz", bestFor: "Daytime DX", needsSfi: 80 },
  "20m": { freq: "14 MHz", bestFor: "Daytime DX workhorse", needsSfi: 70 },
  "30m": { freq: "10 MHz", bestFor: "CW/digital, day/night", needsSfi: 0 },
  "40m": { freq: "7 MHz", bestFor: "All-day workhorse", needsSfi: 0 },
  "60m": { freq: "5.3 MHz", bestFor: "NVIS, emergency", needsSfi: 0 },
  "80m": { freq: "3.5 MHz", bestFor: "Night DX, regional nets", needsSfi: 0 },
  "160m": { freq: "1.8 MHz", bestFor: "Night DX, regional", needsSfi: 0 },
};

// Status descriptions
const STATUS_LABELS: Record<string, { label: string; tip: string }> = {
  excellent: { label: "Excellent", tip: "Strong model support" },
  good: { label: "Good", tip: "Supportive model estimate" },
  fair: { label: "Fair", tip: "Marginal model support" },
  poor: { label: "Poor", tip: "Low model support" },
  closed: { label: "Closed", tip: "Below the model display threshold" },
};

interface HoverInfo {
  band: string;
  hour: number;
  status: string;
  snr: number;
  confidence?: number;
  // Screen coordinates for smart positioning
  screenX: number;
  screenY: number;
}

// Tooltip dimensions (approximate)
const TOOLTIP_WIDTH = 160;
const TOOLTIP_HEIGHT = 180;
const TOOLTIP_OFFSET = 12; // Gap between cursor and tooltip

/**
 * Calculate smart tooltip position that keeps it within viewport
 * Appears to the right of cursor if room, otherwise left
 * Centered vertically on cursor, clamped to viewport bounds
 */
function calculateTooltipPosition(
  screenX: number,
  screenY: number,
): { left: number; top: number; side: "left" | "right" } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Determine horizontal position - prefer right, fallback to left
  let left: number;
  let side: "left" | "right";

  const spaceOnRight = viewportWidth - screenX - TOOLTIP_OFFSET;
  const spaceOnLeft = screenX - TOOLTIP_OFFSET;

  if (spaceOnRight >= TOOLTIP_WIDTH) {
    // Enough room on right
    left = screenX + TOOLTIP_OFFSET;
    side = "right";
  } else if (spaceOnLeft >= TOOLTIP_WIDTH) {
    // Use left side
    left = screenX - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
    side = "left";
  } else if (spaceOnRight >= spaceOnLeft) {
    left = screenX + TOOLTIP_OFFSET;
    side = "right";
  } else {
    left = Math.max(8, screenX - TOOLTIP_OFFSET - TOOLTIP_WIDTH);
    side = "left";
  }

  // Clamp left to viewport bounds
  left = Math.max(8, Math.min(left, viewportWidth - TOOLTIP_WIDTH - 8));

  // Calculate vertical position - center on cursor, clamp to viewport
  let top = screenY - TOOLTIP_HEIGHT / 2;

  // Clamp to viewport bounds with padding
  top = Math.max(8, Math.min(top, viewportHeight - TOOLTIP_HEIGHT - 8));

  return { left, top, side };
}

// Common bands (default 5)
const COMMON_BANDS: string[] = ["10m", "15m", "20m", "40m", "80m"];

// All HF bands in frequency order (highest first)
const ALL_BANDS_ORDERED: string[] = [
  "10m",
  "12m",
  "15m",
  "17m",
  "20m",
  "30m",
  "40m",
  "80m",
];

// Band frequency sort order for custom bands (highest frequency first)
const BAND_SORT_ORDER: Record<string, number> = {
  "10m": 0,
  "12m": 1,
  "15m": 2,
  "17m": 3,
  "20m": 4,
  "30m": 5,
  "40m": 6,
  "80m": 7,
};

// Probability tone thresholds match NowCastBandPanel
function nowCastTone(probability: number): string {
  if (probability >= 0.5) return "text-signal-green";
  if (probability >= 0.2) return "text-caution-amber";
  return "text-gray-200";
}

/**
 * Adjust color saturation by mixing toward/away from perceptual gray.
 * amount > 0: desaturate (toward gray). amount < 0: boost (away from gray).
 */
function adjustSaturation(hex: string, amount: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = r * 0.299 + g * 0.587 + b * 0.114;
  const nr = Math.max(0, Math.min(255, Math.round(r + (gray - r) * amount)));
  const ng = Math.max(0, Math.min(255, Math.round(g + (gray - g) * amount)));
  const nb = Math.max(0, Math.min(255, Math.round(b + (gray - b) * amount)));
  return `rgb(${nr},${ng},${nb})`;
}

export function PropagationForecastMini({
  displayTime,
  className = "",
}: PropagationForecastMiniProps) {
  const target = useMapStore((s) => s.target);
  const { station } = useUserStore();
  const activeBand = useActiveBand();
  const forecastDisplay = useForecastDisplayPrefs();
  const updateForecastDisplay = useUserStore((s) => s.updateForecastDisplay);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch current solar data
  const {
    data: kIndexData,
    isLoading: kLoading,
    isError: kError,
    dataUpdatedAt: kUpdatedAt,
  } = useKIndex();
  const {
    data: solarFluxData,
    isLoading: sfiLoading,
    isError: sfiError,
    dataUpdatedAt: fluxUpdatedAt,
  } = useSolarFlux();
  const { data: magnetometerData, dataUpdatedAt: magUpdatedAt } =
    useMagnetometer();

  // Get current Kp and SFI values (null when data unavailable)
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) {
      return null;
    }
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return null;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Get current Bz value from magnetometer data
  const currentBz = useMemo(() => {
    if (!magnetometerData || magnetometerData.length === 0) {
      return null;
    }
    return (
      magnetometerData
        .slice()
        .reverse()
        .find((d) => typeof d.bz_gsm === "number" && Number.isFinite(d.bz_gsm))
        ?.bz_gsm ?? null
    );
  }, [magnetometerData]);

  // NowCast model predictions (Railway-served) shown alongside the physics forecast
  const stationCast = useStationCastContext();
  const researchParticipation = useResearchParticipation();
  const modelWeather = useMemo(
    () => ({
      ...(currentKp == null ? {} : { kp: currentKp }),
      ...(currentSfi == null ? {} : { f107: currentSfi }),
      ...(currentBz == null ? {} : { bz_gsm: currentBz }),
    }),
    [currentKp, currentSfi, currentBz],
  );
  const modelWeatherUpdatedAt =
    Math.max(kUpdatedAt || 0, fluxUpdatedAt || 0, magUpdatedAt || 0) ||
    undefined;
  const nowCastTarget = useMemo(() => {
    if (!target) {
      return null;
    }
    try {
      return {
        grid: target.grid ?? latLonToGrid(target.lat, target.lon, 4),
        lat: target.lat,
        lon: target.lon,
      };
    } catch {
      return null;
    }
  }, [target]);
  const modelNowCast = useNowCastBandPredictions({
    origin: stationCast.location,
    target: nowCastTarget,
    weather: modelWeather,
    weatherUpdatedAt: modelWeatherUpdatedAt,
    deriveEnvelope: stationCast.deriveEnvelope,
    researchSubjectBinding: researchParticipation.state?.subjectBinding,
  });

  // Helper function to get SFI color
  const getSfiColor = (sfi: number): string => {
    if (sfi >= 150) {
      return "#00ff88";
    } // Excellent
    if (sfi >= 100) {
      return "#44dd66";
    } // Good
    if (sfi >= 70) {
      return "#ffaa00";
    } // Fair
    return "#ff4455"; // Poor
  };

  // Helper function to get Bz color and arrow
  const getBzDisplay = (
    bz: number | null,
  ): { arrow: string; color: string } => {
    if (bz === null) {
      return { arrow: "-", color: "#6b7280" };
    } // Gray for no data
    if (bz > 0) {
      return { arrow: "\u2191", color: "#00ff88" };
    } // Green northward
    if (bz < -5) {
      return { arrow: "\u2193", color: "#ff4455" };
    } // Red southward
    return { arrow: "\u2193", color: "#ffaa00" }; // Amber for slightly negative
  };

  // Current UTC hour
  const currentHour = useMemo(() => {
    return displayTime.getUTCHours();
  }, [displayTime]);

  // Dynamic bands based on forecast display preferences
  const displayBands = useMemo(() => {
    switch (forecastDisplay.bandMode) {
      case "common":
        return COMMON_BANDS;
      case "all":
        return ALL_BANDS_ORDERED;
      case "custom": {
        const sorted = [...forecastDisplay.customBands].sort((a, b) => {
          const orderA = BAND_SORT_ORDER[a] ?? 99;
          const orderB = BAND_SORT_ORDER[b] ?? 99;
          return orderA - orderB;
        });
        return sorted.length > 0 ? sorted : COMMON_BANDS;
      }
      default:
        return COMMON_BANDS;
    }
  }, [forecastDisplay.bandMode, forecastDisplay.customBands]);

  // Hours to show from preferences
  const hoursToShow = forecastDisplay.hoursToShow;

  // NowCast chips for the currently displayed bands (empty when the model
  // capability is unavailable — the physics forecast stands alone)
  const nowCastChips = !modelNowCast.visible
    ? []
    : displayBands.flatMap((band) => {
        const prediction = modelNowCast.predictions.get(band);
        if (!prediction) {
          return [];
        }
        const probability = modelNowCast.personalized
          ? prediction.personalized_probability
          : prediction.core_probability;
        return [{ band, prediction, probability }];
      });

  // Generate 24-hour forecast
  const forecast = useMemo<HourlyForecast[]>(() => {
    if (!station || !target || currentKp === null || currentSfi === null) {
      return [];
    }
    return getForecastForPath(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      currentKp,
      currentSfi,
      displayTime,
    );
  }, [station, target, currentKp, currentSfi, displayTime]);

  // Calculate best windows
  const bestWindows = useMemo<BestWindow[]>(() => {
    if (forecast.length === 0) {
      return [];
    }
    return getBestWindows(forecast);
  }, [forecast]);

  // Best recommendation (top window)
  const topRecommendation = useMemo(() => {
    if (bestWindows.length === 0) {
      return null;
    }
    const best = bestWindows[0];
    return {
      band: best.band,
      time: best.peakHour.toString().padStart(2, "0"),
      status: best.peakStatus,
    };
  }, [bestWindows]);

  // Get hours around current time
  const visibleHours = useMemo(() => {
    const hours: number[] = [];
    if (hoursToShow === 24) {
      // Show all 24 hours starting from current hour
      for (let i = 0; i < 24; i++) {
        hours.push((currentHour + i) % 24);
      }
    } else {
      // +/- 6 hours centered on current
      const start = currentHour - 6;
      for (let i = 0; i < 13; i++) {
        hours.push((start + i + 24) % 24);
      }
    }
    return hours;
  }, [currentHour, hoursToShow]);

  // Index of current hour in visible hours for caret + fade positioning
  const currentHourIndex = visibleHours.indexOf(currentHour);
  const fadeSpan = Math.max(Math.floor(hoursToShow / 2), 1);

  // Caret center-on-column position (CSS calc)
  // Band label column = w-8 (2rem), flex gap = gap-1 (0.25rem) → 2.25rem offset
  // Grid gap = 3px (inline, pixel-based), caret width = 24px → center offset = 12px
  const totalGapPx = (hoursToShow - 1) * 3;
  const caretLeft =
    currentHourIndex >= 0
      ? `calc(2.25rem + ${currentHourIndex * 3}px + ${2 * currentHourIndex + 1} * (100% - 2.25rem - ${totalGapPx}px) / ${2 * hoursToShow} - 12px)`
      : "0px";

  // Calculate target sunrise/sunset times
  const targetSunTimes = useMemo(() => {
    if (!target) {
      return null;
    }
    return getSunTimes(target.lat, target.lon, displayTime);
  }, [target, displayTime]);

  // Get top 3 bands sorted by current conditions
  const topBandsNow = useMemo(() => {
    const hourData = forecast.find((f) => f.hour === currentHour);
    if (!hourData) {
      return [];
    }
    return hourData.bands
      .filter((b) => b.status !== "closed")
      .sort((a, b) => b.snrEstimate - a.snrEstimate)
      .slice(0, 3);
  }, [forecast, currentHour]);

  // Find next band opening (first future hour where a closed band opens)
  const nextOpening = useMemo(() => {
    for (let i = 1; i < 6; i++) {
      const futureHour = (currentHour + i) % 24;
      const futureData = forecast.find((f) => f.hour === futureHour);
      const currentData = forecast.find((f) => f.hour === currentHour);
      if (futureData && currentData) {
        for (const band of futureData.bands) {
          const currentBand = currentData.bands.find(
            (b) => b.band === band.band,
          );
          if (
            currentBand?.status === "closed" &&
            (band.status === "good" || band.status === "excellent")
          ) {
            return { band: band.band, hour: futureHour, hoursAway: i };
          }
        }
      }
    }
    return null;
  }, [forecast, currentHour]);

  // Propagation score (0-10)
  const propagationScore = useMemo(() => {
    const hourData = forecast.find((f) => f.hour === currentHour);
    if (!hourData) {
      return null;
    }

    const openBands = hourData.bands.filter((b) => b.status !== "closed");
    const totalBands = hourData.bands.length;

    if (totalBands === 0) {
      return { score: 0, color: "#ff4455" };
    }

    // Open band score: 0-4 points based on percentage of bands open
    const openRatio = openBands.length / totalBands;
    const openBandScore = openRatio * 4;

    // Average SNR score: 0-4 points based on average SNR of open bands
    let avgSnrScore = 0;
    if (openBands.length > 0) {
      const avgSnr =
        openBands.reduce((sum, b) => sum + b.snrEstimate, 0) / openBands.length;
      // SNR range: roughly -20 to +20. Map to 0-4.
      avgSnrScore = Math.max(0, Math.min(4, (avgSnr + 20) / 10));
    }

    // Kp penalty: 0-2 points deducted for high Kp
    const kp = currentKp ?? 0;
    let kpPenalty = 0;
    if (kp >= 5) {
      kpPenalty = 2;
    } else if (kp >= 4) {
      kpPenalty = 1;
    } else if (kp >= 3) {
      kpPenalty = 0.5;
    }

    const rawScore = openBandScore + avgSnrScore - kpPenalty;
    const score = Math.max(0, Math.min(10, rawScore));

    let color = "#ff4455"; // red
    if (score >= 7) {
      color = "#00ff88"; // green
    } else if (score >= 4) {
      color = "#ffaa00"; // amber
    }

    return { score, color };
  }, [forecast, currentHour, currentKp]);

  // Greyline countdown
  const greylineCountdown = useMemo(() => {
    if (!targetSunTimes) {
      return null;
    }

    const now = displayTime.getTime();
    const candidates: { label: string; minutesAway: number }[] = [];

    if (targetSunTimes.sunrise) {
      // Check today's sunrise
      let srTime = targetSunTimes.sunrise.getTime();
      let diff = srTime - now;
      // If sunrise already passed today, check tomorrow
      if (diff < 0) {
        srTime += 24 * 60 * 60 * 1000;
        diff = srTime - now;
      }
      const minutes = Math.round(diff / 60000);
      if (minutes <= 120 && minutes > 0) {
        candidates.push({ label: "SR", minutesAway: minutes });
      }
    }

    if (targetSunTimes.sunset) {
      let ssTime = targetSunTimes.sunset.getTime();
      let diff = ssTime - now;
      if (diff < 0) {
        ssTime += 24 * 60 * 60 * 1000;
        diff = ssTime - now;
      }
      const minutes = Math.round(diff / 60000);
      if (minutes <= 120 && minutes > 0) {
        candidates.push({ label: "SS", minutesAway: minutes });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Return the closest event
    candidates.sort((a, b) => a.minutesAway - b.minutesAway);
    return candidates[0];
  }, [targetSunTimes, displayTime]);

  // Generate plain English recommendation
  const getRecommendation = (): string => {
    if (
      (currentKp !== null && currentKp >= 5) ||
      (currentBz !== null && currentBz < -5)
    ) {
      return "Storm conditions - expect degraded HF";
    }
    if (topBandsNow.length === 0) {
      return "No bands open - check back later";
    }
    const best = topBandsNow[0];
    if (best.status === "excellent") {
      return `Great time for ${best.band} - strong signals expected`;
    }
    if (best.status === "good") {
      return `${best.band} is workable - try FT8 or CW`;
    }
    return `Marginal conditions - stick to digital modes`;
  };

  // Format time as HH:MM
  const formatTime = (date: Date): string => {
    return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  };

  // Handle card click
  const handleClick = useCallback(() => {
    if (station && target) {
      setIsModalOpen(true);
    }
  }, [station, target]);

  // Calculate path distance (must be before early returns)
  const pathDistance = useMemo(() => {
    if (!station || !target) {
      return null;
    }
    const R = 6371;
    const dLat = ((target.lat - station.lat) * Math.PI) / 180;
    const dLon = ((target.lon - station.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((station.lat * Math.PI) / 180) *
        Math.cos((target.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }, [station, target]);

  const hopCount = pathDistance ? Math.ceil(pathDistance / 3000) : null;

  const estimatedMuf = useMemo(() => {
    if (currentSfi === null || currentKp === null) return null;
    const baseMuf = 8 + (currentSfi - 70) * 0.12;
    const kpPenalty = currentKp > 4 ? (currentKp - 4) * 2 : 0;
    return Math.max(5, Math.min(35, baseMuf - kpPenalty));
  }, [currentSfi, currentKp]);

  // Settings popover: ESC key and click-outside handler
  useEffect(() => {
    if (!showSettings) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettings(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const clickTarget = e.target as Node;
      // Don't close if clicking the settings button itself
      if (settingsButtonRef.current?.contains(clickTarget)) {
        return;
      }
      // Don't close if clicking inside the popover
      const popover = document.getElementById("forecast-settings-popover");
      if (popover?.contains(clickTarget)) {
        return;
      }
      setShowSettings(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSettings]);

  // Calculate settings popover position after paint so getBoundingClientRect is accurate
  const [settingsPopoverPos, setSettingsPopoverPos] = useState({
    top: 0,
    left: 0,
  });
  useEffect(() => {
    if (!showSettings || !settingsButtonRef.current) {
      return;
    }
    const updatePosition = () => {
      if (!settingsButtonRef.current) return;
      const rect = settingsButtonRef.current.getBoundingClientRect();
      const popoverWidth = 240;
      let left = rect.left + rect.width / 2 - popoverWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));
      setSettingsPopoverPos({ top: rect.bottom + 6, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showSettings]);

  // Loading state
  if (kLoading || sfiLoading) {
    return (
      <>
        <div
          className={`${className} h-full flex items-center justify-center text-gray-400 text-xs relative`}
        >
          <div className="absolute -top-1 -right-1 flex items-center gap-1 z-10">
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
          <div className="animate-pulse">Loading forecast...</div>
        </div>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.forecast.title}
          sections={HELP_CONTENT.forecast.sections}
        />
      </>
    );
  }

  // Solar data unavailable (API failed after retries)
  if (currentKp === null || currentSfi === null) {
    return (
      <>
        <div
          className={`${className} h-full flex items-center justify-center relative`}
        >
          <div className="absolute -top-1 -right-1 flex items-center gap-1 z-10">
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
          <div className="text-xs text-gray-400">
            {kError || sfiError
              ? "Solar data unavailable — NOAA API error"
              : "Waiting for solar data..."}
          </div>
        </div>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.forecast.title}
          sections={HELP_CONTENT.forecast.sections}
        />
      </>
    );
  }

  // No station or target
  if (!station || !target) {
    return (
      <>
        <div
          className={`${className} h-full flex items-center justify-center relative`}
        >
          <div className="absolute -top-1 -right-1 flex items-center gap-1 z-10">
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
          <div className="text-xs text-gray-400">
            Select a target on the map
          </div>
        </div>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.forecast.title}
          sections={HELP_CONTENT.forecast.sections}
        />
      </>
    );
  }

  // Get Bz display values
  const bzDisplay = getBzDisplay(currentBz);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="24-hour propagation forecast - click to expand"
        className={`${className} h-full cursor-pointer hover:opacity-90 transition-opacity relative flex flex-col`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* TOP: Header with path metrics + Solar indices + Prop score + ACTION ICONS */}
        <div className="flex items-center justify-between gap-1.5 mb-0.5 text-xs">
          {/* Left: Path metrics + Solar indices */}
          <div className="flex items-center gap-5 min-w-0">
            <div className="flex items-center gap-3 font-mono min-w-0">
              {pathDistance && (
                <span className="text-gray-300">
                  <span className="text-gray-400">PATH</span>{" "}
                  {pathDistance.toLocaleString()}km
                  {hopCount && (
                    <span className="text-gray-400"> {hopCount}F2</span>
                  )}
                </span>
              )}
              {estimatedMuf !== null && (
                <span>
                  <span className="text-gray-400">MUF</span>{" "}
                  <span className="text-cyan-400">
                    {estimatedMuf.toFixed(1)}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span
                style={{ color: getSfiColor(currentSfi) }}
                title="Solar Flux Index"
              >
                SFI {Math.round(currentSfi)}
              </span>
              <span
                style={{ color: getKIndexColor(currentKp) }}
                title="K-index"
              >
                Kp {currentKp.toFixed(1)}
              </span>
              <span style={{ color: bzDisplay.color }} title="IMF Bz">
                Bz {bzDisplay.arrow}
              </span>
            </div>
          </div>

          {/* Propagation Score Pill */}
          {propagationScore && (
            <div
              className="font-mono text-xs font-bold px-1.5 py-0.5 rounded border flex-shrink-0"
              style={{
                color: propagationScore.color,
                borderColor: `${propagationScore.color}40`,
                backgroundColor: `${propagationScore.color}15`,
              }}
              title={`Propagation Score: ${propagationScore.score.toFixed(1)}/10\nBased on open bands, SNR, and Kp`}
            >
              PROP {propagationScore.score.toFixed(1)}
            </div>
          )}

          {/* Right: ACTION ICONS - Help + Settings */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <HelpButton onClick={() => setShowHelp(true)} />
            <button
              ref={settingsButtonRef}
              className="p-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors"
              title="Forecast settings"
              aria-label="Forecast settings"
              onClick={(e) => {
                e.stopPropagation();
                setShowSettings((prev) => !prev);
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              className="p-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors"
              title="Expand full forecast"
              aria-label="Expand forecast"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* MAIN: Full-width Heatmap */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Heatmap row: labels + grid */}
          <div className="flex-1 flex gap-1 min-h-0 relative">
            {/* Current hour caret markers — clip-path triangles (immune to
                .contrast-more border-color !important overrides) */}
            {currentHourIndex >= 0 && (
              <>
                {/* Top caret - points down */}
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: caretLeft,
                    top: "-1px",
                    width: 24,
                    height: 12,
                    backgroundColor: "white",
                    clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)",
                    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.9))",
                  }}
                />
                {/* Bottom caret - points up */}
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    left: caretLeft,
                    bottom: "-1px",
                    width: 24,
                    height: 12,
                    backgroundColor: "white",
                    clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
                  }}
                />
              </>
            )}
            {/* Band labels - use CSS Grid to match heatmap rows exactly */}
            <div
              className="w-8 grid"
              style={{
                gridTemplateRows: `repeat(${displayBands.length}, 1fr)`,
                gap: "2px",
              }}
            >
              {displayBands.map((band) => {
                const isSynced = activeBand === band;
                return (
                  <div
                    key={band}
                    className={`text-xs font-mono flex items-center ${
                      isSynced ? "text-cyan-400 font-bold" : "text-gray-400"
                    }`}
                  >
                    {isSynced && (
                      <svg
                        className="w-2.5 h-2.5 mr-0.5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                    )}
                    {band}
                  </div>
                );
              })}
            </div>

            {/* Heatmap grid - CSS Grid, fills available height */}
            <div
              ref={containerRef}
              className="flex-1 min-w-0 grid"
              style={{
                gridTemplateColumns: `repeat(${hoursToShow}, 1fr)`,
                gridTemplateRows: `repeat(${displayBands.length}, 1fr)`,
                gap: "3px",
              }}
            >
              {displayBands.map((band) =>
                visibleHours.map((hour, colIdx) => {
                  const hourData = forecast.find((f) => f.hour === hour);
                  const bandData = hourData?.bands.find((b) => b.band === band);
                  const status = bandData?.status || "closed";
                  const snr = bandData?.snrEstimate ?? -30;
                  const conf = bandData?.confidence;
                  const color = getForecastStatusColor(status);
                  const isCurrentHour = hour === currentHour;
                  const isSynced = activeBand === band;

                  // Color intensity gradient: vivid at center, muted at edges
                  const dist = Math.abs(colIdx - currentHourIndex);
                  const t =
                    currentHourIndex >= 0 ? Math.min(dist / fadeSpan, 1) : 0;
                  // -0.15 = slight boost at center, 0.65 = desaturated at edge
                  const desatAmount = -0.15 + t * 0.8;
                  const adjustedColor = adjustSaturation(color, desatAmount);

                  return (
                    <div
                      key={`${band}-${hour}`}
                      className={`rounded-sm cursor-pointer transition-all hover:brightness-125 relative flex items-center justify-center ${isCurrentHour ? "-translate-y-0.5 z-10 shadow-[5px_5px_8px_rgba(0,0,0,0.75)]" : ""} ${isSynced ? "ring-1 ring-cyan-400/60" : ""}`}
                      style={{
                        backgroundColor: adjustedColor,
                        opacity:
                          status === "closed" ? 0.25 : isSynced ? 1 : 0.9,
                      }}
                      onMouseEnter={(e) =>
                        setHoverInfo({
                          band,
                          hour,
                          status,
                          snr,
                          confidence: conf,
                          screenX: e.clientX,
                          screenY: e.clientY,
                        })
                      }
                      onMouseMove={(e) =>
                        setHoverInfo((prev) =>
                          prev
                            ? {
                                ...prev,
                                screenX: e.clientX,
                                screenY: e.clientY,
                              }
                            : null,
                        )
                      }
                      onMouseLeave={() => setHoverInfo(null)}
                    >
                      {forecastDisplay.showSnrValues && status !== "closed" && (
                        <span
                          className={`${hoursToShow === 24 ? "text-[14px]" : "text-[16px]"} font-mono font-bold leading-none text-black/80`}
                        >
                          {snr > 0 ? "+" : ""}
                          {snr}
                        </span>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          {/* Hour labels - below heatmap, offset to align with grid (skip band label column) */}
          <div className="flex gap-1">
            <div className="w-8" /> {/* Spacer matching band labels width */}
            <div
              className="flex-1 grid mt-1 text-xs font-mono"
              style={{ gridTemplateColumns: `repeat(${hoursToShow}, 1fr)` }}
            >
              {visibleHours.map((hour, idx) => {
                // For 24h mode, show every 3rd label; for 13h, show every 2nd
                const showLabel =
                  hoursToShow === 24 ? idx % 3 === 0 : idx % 2 === 0;
                return (
                  <div
                    key={hour}
                    className={`text-center ${hour === currentHour ? "text-white font-bold text-sm" : "text-gray-400"}`}
                  >
                    {showLabel ? hour.toString().padStart(2, "0") : ""}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* NowCast model chips — live ML predictions alongside the physics forecast */}
        {nowCastChips.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1 text-xs overflow-hidden">
            <span
              className="text-[10px] font-mono font-semibold text-cyan-300 uppercase tracking-wide flex-shrink-0 cursor-help"
              title={`${modelNowCast.personalized ? "NOWCAST + STATIONCAST" : "NOWCAST"} MODEL\nLive ML band predictions (WSPR single-decode probability) from the model service.\nShown alongside the physics forecast above — computed independently from it.`}
            >
              NowCast
            </span>
            {nowCastChips.map(({ band, prediction, probability }) => (
              <div
                key={band}
                className="font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.06] flex items-center gap-1 flex-shrink-0 cursor-help"
                title={`NOWCAST MODEL — ${band}\nProfile: ${prediction.profile === "physics" ? "Physics fallback" : "NowCast ML"}\nCore probability: ${(prediction.core_probability * 100).toFixed(1)}%${
                  modelNowCast.personalized
                    ? `\nYour station: ${(prediction.personalized_probability * 100).toFixed(1)}%`
                    : ""
                }\nConfidence: ${Math.round(prediction.confidence * 100)}%${
                  prediction.ood_flags.length > 0
                    ? `\nOut of distribution: ${prediction.ood_flags.join(", ")}`
                    : ""
                }`}
              >
                <span className="text-gray-300">{band}</span>
                <span className={`font-semibold ${nowCastTone(probability)}`}>
                  {Math.round(probability * 100)}%
                </span>
                {prediction.ood_flags.length > 0 && (
                  <span className="text-caution-amber font-bold">!</span>
                )}
              </div>
            ))}
            {modelNowCast.pending && (
              <span className="text-gray-500 animate-pulse flex-shrink-0">
                &hellip;
              </span>
            )}
          </div>
        )}

        {/* BOTTOM: Footer - detailed or compact */}
        {forecastDisplay.detailedFooter ? (
          /* Detailed footer: Two-row layout */
          <div className="flex flex-col gap-1 mt-1 text-xs">
            {/* Row 1: Best band + alternatives + peak windows */}
            <div className="flex gap-2 flex-wrap">
              {/* Best band NOW - primary recommendation */}
              {topBandsNow.length > 0 && (
                <div
                  className="bg-signal-green/20 border border-signal-green/50 rounded px-2 py-1 flex items-center gap-1.5 cursor-help"
                  title={`BEST BAND RIGHT NOW\n${topBandsNow[0].band} (${BAND_INFO[topBandsNow[0].band]?.freq || ""})\nEstimated SNR: ${topBandsNow[0].snrEstimate}dB\nCondition: ${topBandsNow[0].status}\nRecommended mode: ${topBandsNow[0].status === "excellent" ? "SSB or CW for voice/morse" : "FT8/FT4 digital modes"}`}
                >
                  <span className="text-signal-green">&#9654;</span>
                  <span className="font-mono font-bold text-white">
                    {topBandsNow[0].band}
                  </span>
                  <span className="font-mono text-signal-green font-semibold">
                    {topBandsNow[0].snrEstimate > 0 ? "+" : ""}
                    {topBandsNow[0].snrEstimate}dB
                  </span>
                  <span className="text-gray-200">
                    {topBandsNow[0].status === "excellent" ? "SSB/CW" : "FT8"}
                  </span>
                </div>
              )}

              {/* Also Open - alternative bands */}
              {topBandsNow.length > 1 && (
                <div
                  className="bg-white/[0.06] rounded px-2 py-1 flex items-center gap-1.5 cursor-help"
                  title={`ALTERNATIVE BANDS\nThese bands are also open right now:\n${topBandsNow
                    .slice(1)
                    .map(
                      (b) =>
                        `${b.band} (${BAND_INFO[b.band]?.freq || ""}): ${b.snrEstimate}dB, ${b.status}`,
                    )
                    .join("\n")}`}
                >
                  <span className="text-gray-400">Also:</span>
                  {topBandsNow.slice(1).map((band) => (
                    <span key={band.band} className="font-mono text-white">
                      {band.band}{" "}
                      <span
                        className="font-semibold"
                        style={{ color: getForecastStatusColor(band.status) }}
                      >
                        {band.snrEstimate > 0 ? "+" : ""}
                        {band.snrEstimate}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Peak Windows - best upcoming time */}
              <div
                className="bg-white/[0.06] rounded px-2 py-1 flex items-center gap-1.5 cursor-help"
                title={
                  topRecommendation
                    ? `PEAK PROPAGATION WINDOW\n${topRecommendation.band} will peak at ${topRecommendation.time}:00 UTC\nCondition: ${topRecommendation.status}\n\nThis is the best time to work this band on this path.${nextOpening ? `\n\nNEXT BAND OPENING\n${nextOpening.band} opens in ${nextOpening.hoursAway} hour${nextOpening.hoursAway > 1 ? "s" : ""}` : ""}`
                    : "No peak windows predicted in the next 24 hours"
                }
              >
                {topRecommendation && (
                  <>
                    <span className="text-gray-400">Peak:</span>
                    <span
                      className="font-mono font-bold"
                      style={{
                        color: getForecastStatusColor(topRecommendation.status),
                      }}
                    >
                      {topRecommendation.band}
                    </span>
                    <span className="text-gray-300 font-mono">
                      @{topRecommendation.time}z
                    </span>
                  </>
                )}
                {nextOpening && (
                  <>
                    {topRecommendation && (
                      <span className="text-gray-600 mx-0.5">|</span>
                    )}
                    <span className="font-mono text-signal-green font-semibold">
                      {nextOpening.band}
                    </span>
                    <span className="text-gray-400">
                      +{nextOpening.hoursAway}h
                    </span>
                  </>
                )}
                {!topRecommendation && !nextOpening && (
                  <span className="text-gray-500">No windows</span>
                )}
              </div>
            </div>

            {/* Row 2: Greyline times + Operating tip */}
            <div className="flex gap-2 items-center">
              {/* DX sun times - sunrise/sunset at target (greyline) */}
              {target && targetSunTimes && (
                <div
                  className="bg-white/[0.06] rounded px-2 py-1 flex items-center gap-2 font-mono cursor-help flex-shrink-0"
                  title={`GREYLINE WINDOW AT DX\n${target.name || target.grid || "Target"}\n\nSunrise: ${targetSunTimes.sunrise ? formatTime(targetSunTimes.sunrise) : "N/A"} UTC\nSunset: ${targetSunTimes.sunset ? formatTime(targetSunTimes.sunset) : "N/A"} UTC\n\nGreyline propagation is enhanced around these times.\nLow bands (40m-160m) often peak near sunset/sunrise.`}
                >
                  <span className="text-gray-500 text-[10px]">&#9733;</span>
                  <span className="text-amber-300">
                    {targetSunTimes.sunrise
                      ? formatTime(targetSunTimes.sunrise)
                      : "--:--"}
                  </span>
                  <span className="text-gray-600">&rarr;</span>
                  <span className="text-orange-300">
                    {targetSunTimes.sunset
                      ? formatTime(targetSunTimes.sunset)
                      : "--:--"}
                  </span>
                  {greylineCountdown && (
                    <span className="text-cosmic-cyan font-semibold">
                      GL in {greylineCountdown.minutesAway}m
                    </span>
                  )}
                </div>
              )}

              {/* Tip - operating recommendation (path-specific) */}
              <div
                className="flex-1 bg-plasma-orange/10 border-l-2 border-plasma-orange rounded-r px-2 py-1 flex items-center min-w-0 cursor-help"
                title={`PATH FORECAST\n${getRecommendation()}\n\nBased on current solar conditions:\nSFI: ${Math.round(currentSfi)} (${currentSfi >= 150 ? "excellent" : currentSfi >= 100 ? "good" : currentSfi >= 70 ? "fair" : "low"})\nKp: ${currentKp.toFixed(1)} (${currentKp <= 2 ? "quiet" : currentKp <= 4 ? "unsettled" : "storm"})`}
              >
                <span className="text-[10px] text-gray-500 uppercase mr-1.5 flex-shrink-0">
                  Path:
                </span>
                <span className="text-gray-200 truncate">
                  {getRecommendation()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Compact footer: Single-line summary */
          <div className="flex gap-2 items-center mt-1 text-xs">
            {/* Best band now pill */}
            {topBandsNow.length > 0 && (
              <div className="bg-signal-green/20 border border-signal-green/50 rounded px-2 py-0.5 flex items-center gap-1 font-mono flex-shrink-0">
                <span className="text-signal-green">&#9654;</span>
                <span className="font-bold text-white">
                  {topBandsNow[0].band}
                </span>
                <span className="text-signal-green font-semibold">
                  {topBandsNow[0].snrEstimate > 0 ? "+" : ""}
                  {topBandsNow[0].snrEstimate}dB
                </span>
                <span className="text-gray-200">
                  {topBandsNow[0].status === "excellent" ? "SSB/CW" : "FT8"}
                </span>
              </div>
            )}

            {/* Propagation score */}
            {propagationScore && (
              <div
                className="font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0"
                style={{
                  color: propagationScore.color,
                  borderColor: `${propagationScore.color}40`,
                  backgroundColor: `${propagationScore.color}15`,
                }}
              >
                PROP {propagationScore.score.toFixed(1)}
              </div>
            )}

            {/* Peak window */}
            {topRecommendation && (
              <div className="font-mono flex items-center gap-1 text-gray-300 flex-shrink-0">
                <span className="text-gray-400">Peak:</span>
                <span
                  className="font-bold"
                  style={{
                    color: getForecastStatusColor(topRecommendation.status),
                  }}
                >
                  {topRecommendation.band}
                </span>
                <span>@{topRecommendation.time}z</span>
              </div>
            )}

            {/* Greyline countdown (compact) */}
            {greylineCountdown && (
              <span className="text-cosmic-cyan font-mono font-semibold flex-shrink-0">
                GL in {greylineCountdown.minutesAway}m
              </span>
            )}
          </div>
        )}
      </div>

      {/* Settings Popover - rendered via portal */}
      {showSettings &&
        createPortal(
          <div
            id="forecast-settings-popover"
            className="fixed z-[9999]"
            style={{
              top: settingsPopoverPos.top,
              left: settingsPopoverPos.left,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-3 min-w-[200px] max-w-[260px]">
              {/* Band Selection */}
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
                  Bands
                </div>
                {/* Three-way segmented toggle */}
                <div className="flex gap-0.5 mb-2">
                  {(["common", "all", "custom"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                        forecastDisplay.bandMode === mode
                          ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/50"
                          : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateForecastDisplay({ bandMode: mode });
                      }}
                    >
                      {mode === "common"
                        ? "Common"
                        : mode === "all"
                          ? "All"
                          : "Custom"}
                    </button>
                  ))}
                </div>
                {/* Custom band pills */}
                {forecastDisplay.bandMode === "custom" && (
                  <div className="flex flex-wrap gap-1">
                    {ALL_BANDS_ORDERED.map((band) => {
                      const isActive = forecastDisplay.customBands.includes(
                        band as BandId,
                      );
                      return (
                        <button
                          key={band}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors font-mono ${
                            isActive
                              ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/50"
                              : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentBands = [
                              ...forecastDisplay.customBands,
                            ];
                            if (isActive) {
                              // Don't allow removing last band
                              if (currentBands.length > 1) {
                                updateForecastDisplay({
                                  customBands: currentBands.filter(
                                    (b) => b !== band,
                                  ) as BandId[],
                                });
                              }
                            } else {
                              updateForecastDisplay({
                                customBands: [...currentBands, band as BandId],
                              });
                            }
                          }}
                        >
                          {band}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Display Options */}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
                  Display
                </div>

                {/* SNR on cells toggle */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-gray-300">
                    SNR on cells
                  </span>
                  <button
                    role="switch"
                    aria-checked={forecastDisplay.showSnrValues}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      forecastDisplay.showSnrValues
                        ? "bg-plasma-orange"
                        : "bg-white/10"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateForecastDisplay({
                        showSnrValues: !forecastDisplay.showSnrValues,
                      });
                    }}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        forecastDisplay.showSnrValues
                          ? "translate-x-3.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {/* Full details toggle */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-gray-300">
                    Full details
                  </span>
                  <button
                    role="switch"
                    aria-checked={forecastDisplay.detailedFooter}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      forecastDisplay.detailedFooter
                        ? "bg-plasma-orange"
                        : "bg-white/10"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateForecastDisplay({
                        detailedFooter: !forecastDisplay.detailedFooter,
                      });
                    }}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        forecastDisplay.detailedFooter
                          ? "translate-x-3.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {/* Hours segmented toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-300">Hours</span>
                  <div className="flex gap-0.5">
                    {([13, 24] as const).map((h) => (
                      <button
                        key={h}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          forecastDisplay.hoursToShow === h
                            ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/50"
                            : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateForecastDisplay({ hoursToShow: h });
                        }}
                      >
                        {h === 13 ? "\u00B16h" : "24h"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Tooltip - rendered via portal to document.body for proper positioning */}
      {hoverInfo &&
        createPortal(
          (() => {
            const pos = calculateTooltipPosition(
              hoverInfo.screenX,
              hoverInfo.screenY,
            );
            return (
              <div
                className="fixed pointer-events-none"
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: TOOLTIP_WIDTH,
                  zIndex: 99999,
                }}
              >
                <div className="bg-nebula-blue/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-lg font-bold font-mono text-white">
                      {hoverInfo.band}
                    </span>
                    <span className="text-xs text-gray-400">
                      {BAND_INFO[hoverInfo.band]?.freq}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">
                    {hoverInfo.hour.toString().padStart(2, "0")}:00 UTC
                    {hoverInfo.hour === currentHour && (
                      <span className="ml-2 text-white font-bold">NOW</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{
                        backgroundColor: getForecastStatusColor(
                          hoverInfo.status as
                            | "excellent"
                            | "good"
                            | "fair"
                            | "poor"
                            | "closed",
                        ),
                      }}
                    />
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: getForecastStatusColor(
                          hoverInfo.status as
                            | "excellent"
                            | "good"
                            | "fair"
                            | "poor"
                            | "closed",
                        ),
                      }}
                    >
                      {STATUS_LABELS[hoverInfo.status]?.label ||
                        hoverInfo.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-gray-400">Est. SNR</span>
                    <span className="font-mono text-white font-bold text-lg">
                      {hoverInfo.snr > 0 ? "+" : ""}
                      {hoverInfo.snr}dB
                    </span>
                  </div>
                  {hoverInfo.confidence != null && (
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-gray-400">Confidence</span>
                      <span
                        className={`font-mono font-bold ${hoverInfo.confidence >= 70 ? "text-signal-green" : hoverInfo.confidence >= 50 ? "text-caution-amber" : "text-plasma-orange"}`}
                      >
                        {hoverInfo.confidence}%
                      </span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 border-t border-white/10 pt-2">
                    {STATUS_LABELS[hoverInfo.status]?.tip}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {BAND_INFO[hoverInfo.band]?.bestFor}
                  </div>
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    [pos.side === "right" ? "left" : "right"]: -6,
                    width: 6,
                    height: 12,
                    backgroundColor: "rgba(30, 41, 59, 0.95)",
                    clipPath:
                      pos.side === "right"
                        ? "polygon(100% 0%, 100% 100%, 0% 50%)"
                        : "polygon(0% 0%, 0% 100%, 100% 50%)",
                  }}
                />
              </div>
            );
          })(),
          document.body,
        )}

      {/* Expanded Modal */}
      <PropagationForecastModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        forecast={forecast}
        bestWindows={bestWindows}
        currentHour={currentHour}
        kp={currentKp}
        sfi={currentSfi}
        stationCallsign={station?.callsign || ""}
        targetName={target?.name || target?.grid || "Target"}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title={HELP_CONTENT.forecast.title}
        sections={HELP_CONTENT.forecast.sections}
      />
    </>
  );
}

export default PropagationForecastMini;

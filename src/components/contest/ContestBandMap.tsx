/**
 * ContestBandMap - Band map integrated for contest operation
 *
 * Wraps the existing BandMap component with contest-specific features:
 * - Spot selection triggers callback to prefill entry form
 * - Color-codes spots based on contest status (dupe/new mult/needed)
 * - Highlights current operating frequency
 * - Uses contest dupe checking for accurate status
 */

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import { useRadioDaemon } from "@/hooks/useRadioDaemon";
import { useActiveBand, useActiveMode } from "@/hooks/useActiveBandMode";
import { getContestById } from "@/lib/data/contests";
import {
  getNeededMultipliers,
  extractMultiplierValue,
  generateDupeKey,
} from "@/lib/contest";
import {
  getEffectiveDupeRule,
  getEffectiveMultiplierRules,
} from "@/types/contest";
import type { DXSpot } from "@/types/dxcluster";
import type { NeededMult } from "@/lib/contest";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import { getWaterfallPaletteLut } from "@/components/sdr/waterfallPalette";
import { useSettingsStore } from "@/stores/settingsStore";

// ============================================================================
// Types
// ============================================================================

export interface ContestBandMapProps {
  /** Current operating band (e.g., "20m") */
  currentBand: string;
  /** Current operating mode (e.g., "CW", "SSB") */
  currentMode: string;
  /** Callback when a spot is selected - prefills callsign and optionally frequency */
  onSpotSelect: (callsign: string, frequency?: number) => void;
  /** Optional callback with the full selected spot object */
  onSpotClick?: (spot: DXSpot) => void;
  /** Current operating frequency in kHz (optional, for highlighting) */
  currentFrequency?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Contest-specific spot status for coloring
 */
type SpotContestStatus = "dupe" | "new-mult" | "needed-mult" | "normal";

/**
 * Band frequency ranges in kHz
 */
const BAND_FREQUENCY_RANGES: Record<string, { min: number; max: number }> = {
  "160m": { min: 1800, max: 2000 },
  "80m": { min: 3500, max: 4000 },
  "60m": { min: 5330, max: 5405 },
  "40m": { min: 7000, max: 7300 },
  "30m": { min: 10100, max: 10150 },
  "20m": { min: 14000, max: 14350 },
  "17m": { min: 18068, max: 18168 },
  "15m": { min: 21000, max: 21450 },
  "12m": { min: 24890, max: 24990 },
  "10m": { min: 28000, max: 29700 },
  "6m": { min: 50000, max: 54000 },
  "2m": { min: 144000, max: 148000 },
};

/**
 * Status-based colors for contest spots
 */
const STATUS_COLORS: Record<SpotContestStatus, string> = {
  dupe: "#6b7280", // Gray - already worked
  "new-mult": "#ff6b35", // Plasma orange - NEW multiplier (best)
  "needed-mult": "#22d3ee", // Cosmic cyan - needed mult on another band
  normal: "#10b981", // Signal green - not worked, no mult value
};

/**
 * Time window in minutes for the Y-axis
 */
const TIME_WINDOW_MINUTES = 30;

/**
 * Margin configuration for the canvas
 */
const MARGINS = {
  top: 35,
  right: 20,
  bottom: 30,
  left: 50,
};

// ============================================================================
// Utility Functions
// ============================================================================

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Calculate spot size based on age (newer = larger)
 */
function getSpotSize(spotTime: Date, now: number): number {
  const ageMs = now - spotTime.getTime();
  const ageMinutes = ageMs / 60000;
  return Math.max(4, 8 - (ageMinutes / TIME_WINDOW_MINUTES) * 4);
}

/**
 * Get status label for tooltip
 */
function getStatusLabel(status: SpotContestStatus): string {
  switch (status) {
    case "dupe":
      return "DUPE";
    case "new-mult":
      return "NEW MULT";
    case "needed-mult":
      return "NEEDED";
    case "normal":
      return "";
  }
}

/**
 * Calculate appropriate frequency step for grid lines
 */
function getFrequencyStep(range: number): number {
  if (range <= 100) {
    return 10;
  }
  if (range <= 500) {
    return 50;
  }
  if (range <= 1000) {
    return 100;
  }
  if (range <= 5000) {
    return 500;
  }
  return 1000;
}

// ============================================================================
// Hook: useContestSpotStatus
// ============================================================================

interface SpotStatusMap {
  getStatus: (spot: DXSpot) => SpotContestStatus;
  neededMults: NeededMult[];
}

/**
 * Hook to compute contest status for spots
 */
function useContestSpotStatus(
  currentBand: string,
  currentMode: string,
): SpotStatusMap {
  const session = useContestStore((s) => s.activeSession);
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const qsoCount = useContestStore((s) => s.activeSession?.qsos.length ?? 0);

  return useMemo(() => {
    if (!session || !contestId) {
      return {
        getStatus: () => "normal" as SpotContestStatus,
        neededMults: [],
      };
    }

    const contest = getContestById(contestId);
    if (!contest) {
      return {
        getStatus: () => "normal" as SpotContestStatus,
        neededMults: [],
      };
    }

    // Build worked callsigns set with dupe keys
    const dupeRule = getEffectiveDupeRule(contest);
    const workedDupeKeys = new Set<string>();

    for (const qso of session.qsos) {
      if (qso.isDupe) {
        continue;
      }
      const key = generateDupeKey(qso.callsign, qso.band, qso.mode, dupeRule);
      workedDupeKeys.add(key);
    }

    // Get needed multipliers
    const neededMults = getNeededMultipliers(session, contest);

    // Build a lookup set of needed mult values for quick checking
    const neededMultValues = new Set<string>();
    const neededMultValuesOnCurrentBand = new Set<string>();

    for (const mult of neededMults) {
      neededMultValues.add(mult.value.toUpperCase());
      // If this mult is needed on current band specifically
      if (!mult.band || mult.band === currentBand) {
        neededMultValuesOnCurrentBand.add(mult.value.toUpperCase());
      }
    }

    // Build worked mults map for checking new mults
    const workedMultsMap = new Map<string, Set<string>>();
    for (const mult of session.multipliers) {
      let typeSet = workedMultsMap.get(mult.type);
      if (!typeSet) {
        typeSet = new Set();
        workedMultsMap.set(mult.type, typeSet);
      }
      const key = mult.band
        ? `${mult.value.toUpperCase()}|${mult.band.toLowerCase()}`
        : mult.value.toUpperCase();
      typeSet.add(key);
    }

    // Get multiplier rules that apply to callsign (for spot evaluation)
    const multRules = getEffectiveMultiplierRules(contest);
    const callsignMultRules = multRules.filter((r) => r.source === "callsign");

    const getStatus = (spot: DXSpot): SpotContestStatus => {
      const callsign = spot.dx.toUpperCase();
      const spotBand = spot.band ?? currentBand;
      const spotMode = spot.mode ?? currentMode;

      // Check if dupe
      const dupeKey = generateDupeKey(callsign, spotBand, spotMode, dupeRule);
      if (workedDupeKeys.has(dupeKey)) {
        return "dupe";
      }

      // Extract potential multiplier values from callsign based on contest rules
      // (We can only extract callsign-based mults from spots, not exchange-based)
      for (const rule of callsignMultRules) {
        const multValue = extractMultiplierValue(
          callsign,
          rule.type,
          "callsign",
        );

        if (multValue) {
          const upperMultValue = multValue.toUpperCase();

          // Check if this would be a NEW multiplier on this band
          // (not yet worked on any band, or per-band and not worked on this band)
          const isNewOnThisBand =
            neededMultValuesOnCurrentBand.has(upperMultValue);
          if (isNewOnThisBand) {
            return "new-mult";
          }

          // Check if it's a needed mult (worked elsewhere but not on current band)
          if (neededMultValues.has(upperMultValue)) {
            return "needed-mult";
          }
        }
      }

      return "normal";
    };

    return { getStatus, neededMults };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, contestId, currentBand, currentMode, qsoCount]);
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ContestBandMap Component
 *
 * A frequency-over-time visualization optimized for contest operation.
 * Spots are color-coded by contest status and clicking selects for prefill.
 */
export function ContestBandMap({
  currentBand: currentBandProp,
  currentMode: currentModeProp,
  onSpotSelect,
  onSpotClick,
  currentFrequency,
  className = "",
}: ContestBandMapProps) {
  const activeBand = useActiveBand();
  const activeMode = useActiveMode();
  const currentBand = currentBandProp ?? activeBand;
  const currentMode = currentModeProp ?? activeMode;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [canvasHeight, setCanvasHeight] = useState(250);
  const [hoveredSpot, setHoveredSpot] = useState<DXSpot | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // Get spots from DX cluster
  const { allSpots } = useDXCluster();

  // Optional SDR FFT background (from Radio Daemon, if configured)
  const [daemonUrl, setDaemonUrl] = useState<string | null>(null);
  const [daemonDeviceId, setDaemonDeviceId] = useState<string | null>(null);
  const daemon = useRadioDaemon({
    enabled: !!daemonUrl,
    url: daemonUrl ?? undefined,
  });
  const daemonConnected = daemon.connected;
  const daemonSendCommand = daemon.sendCommand;
  const daemonLastFrame = daemon.lastFrame;
  const [fftFrame, setFftFrame] = useState<Extract<
    RadioBinaryFrame,
    { kind: "fft" }
  > | null>(null);
  const sdrWaterfallRef = useRef<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    w: number;
    h: number;
    band: string;
  } | null>(null);
  const paletteName = useSettingsStore((s) => s.sdrWaterfallPalette);
  const paletteLut = useMemo(
    () => getWaterfallPaletteLut(paletteName),
    [paletteName],
  );

  useEffect(() => {
    try {
      setDaemonUrl(localStorage.getItem("propulse-radio-daemon-url"));
      setDaemonDeviceId(localStorage.getItem("propulse-radio-daemon-device"));
    } catch {
      setDaemonUrl(null);
      setDaemonDeviceId(null);
    }
  }, []);

  useEffect(() => {
    if (!daemonConnected) return;
    if (!daemonDeviceId) return;

    daemonSendCommand("radio:connect", { device_id: daemonDeviceId });
    daemonSendCommand("stream:fft:start", {
      device_id: daemonDeviceId,
      fft_size: 4096,
      fps: 10,
      averaging: 4,
    });

    return () => {
      daemonSendCommand("stream:fft:stop", { device_id: daemonDeviceId });
    };
  }, [daemonConnected, daemonDeviceId, daemonSendCommand]);

  useEffect(() => {
    if (daemonLastFrame?.kind === "fft") {
      setFftFrame(daemonLastFrame);
    }
  }, [daemonLastFrame]);

  // Get contest status for spots
  const { getStatus } = useContestSpotStatus(currentBand, currentMode);

  // Filter spots for the selected band and time window
  const filteredSpots = useMemo(() => {
    if (!currentBand) {
      return [];
    }
    const now = Date.now();
    const cutoffTime = now - TIME_WINDOW_MINUTES * 60 * 1000;

    return allSpots.filter((spot) => {
      if (spot.band !== currentBand) {
        return false;
      }
      if (spot.time.getTime() < cutoffTime) {
        return false;
      }
      return true;
    });
  }, [allSpots, currentBand]);

  // Get frequency range for the selected band
  const frequencyRange = useMemo(() => {
    if (!currentBand) {
      return null;
    }
    return BAND_FREQUENCY_RANGES[currentBand] || null;
  }, [currentBand]);

  const plotSize = useMemo(() => {
    return {
      w: Math.max(1, Math.floor(canvasWidth - MARGINS.left - MARGINS.right)),
      h: Math.max(1, Math.floor(canvasHeight - MARGINS.top - MARGINS.bottom)),
    };
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!currentBand) {
      sdrWaterfallRef.current = null;
      return;
    }
    const w = plotSize.w;
    const h = plotSize.h;
    if (w < 2 || h < 2) {
      sdrWaterfallRef.current = null;
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      sdrWaterfallRef.current = null;
      return;
    }
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);
    sdrWaterfallRef.current = { canvas, ctx, w, h, band: currentBand };
  }, [currentBand, plotSize.h, plotSize.w]);

  useEffect(() => {
    const wf = sdrWaterfallRef.current;
    if (!wf) return;
    if (!fftFrame) return;
    if (!frequencyRange) return;
    if (wf.band !== currentBand) return;

    const w = wf.w;
    const h = wf.h;
    if (w < 2 || h < 2) return;

    const bins = fftFrame.bins;
    if (bins.length === 0) return;

    const bandMinHz = frequencyRange.min * 1000;
    const bandMaxHz = frequencyRange.max * 1000;
    const bandSpan = Math.max(1, bandMaxHz - bandMinHz);

    const startFrame = fftFrame.centerHz - fftFrame.spanHz / 2;
    const rangeDb = 80;
    const minDb = -125;

    wf.ctx.drawImage(wf.canvas, 0, 1);
    const row = wf.ctx.createImageData(w, 1);
    const data = row.data;

    for (let x = 0; x < w; x++) {
      const hz = bandMinHz + (x / (w - 1)) * bandSpan;
      const idx = clamp(
        Math.floor(((hz - startFrame) / fftFrame.spanHz) * bins.length),
        0,
        bins.length - 1,
      );
      const db = bins[idx] ?? minDb;
      const t = clamp((db - minDb) / rangeDb, 0, 1);
      const lutIdx = clamp(Math.round(t * 255), 0, 255);
      const i = x * 4;
      data[i] = paletteLut[lutIdx * 3] ?? 0;
      data[i + 1] = paletteLut[lutIdx * 3 + 1] ?? 0;
      data[i + 2] = paletteLut[lutIdx * 3 + 2] ?? 0;
      data[i + 3] = 255;
    }

    wf.ctx.putImageData(row, 0, 0);
  }, [currentBand, fftFrame, frequencyRange, paletteLut]);

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
        const availableHeight = entry.contentRect.height - 36;
        setCanvasHeight(Math.max(180, availableHeight));
      }
    });

    resizeObserver.observe(container);
    setCanvasWidth(container.clientWidth);
    const availableHeight = container.clientHeight - 36;
    setCanvasHeight(Math.max(180, availableHeight));

    return () => resizeObserver.disconnect();
  }, []);

  // Map frequency to X position
  const frequencyToX = useCallback(
    (frequency: number): number => {
      if (!frequencyRange) {
        return 0;
      }
      const plotWidth = canvasWidth - MARGINS.left - MARGINS.right;
      const normalized =
        (frequency - frequencyRange.min) /
        (frequencyRange.max - frequencyRange.min);
      return MARGINS.left + normalized * plotWidth;
    },
    [frequencyRange, canvasWidth],
  );

  // Map time to Y position (newest at top)
  const timeToY = useCallback(
    (time: Date): number => {
      const now = Date.now();
      const plotHeight = canvasHeight - MARGINS.top - MARGINS.bottom;
      const ageMs = now - time.getTime();
      const ageMinutes = ageMs / 60000;
      const normalized = ageMinutes / TIME_WINDOW_MINUTES;
      return MARGINS.top + normalized * plotHeight;
    },
    [canvasHeight],
  );

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Fill background
    ctx.fillStyle = "rgba(10, 15, 30, 0.9)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const plotWidth = canvasWidth - MARGINS.left - MARGINS.right;
    const plotHeight = canvasHeight - MARGINS.top - MARGINS.bottom;

    if (!frequencyRange || !currentBand) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Select a band to view spots",
        canvasWidth / 2,
        canvasHeight / 2,
      );
      return;
    }

    const wf = sdrWaterfallRef.current;
    if (wf && fftFrame && wf.band === currentBand) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(
        wf.canvas,
        MARGINS.left,
        MARGINS.top,
        plotWidth,
        plotHeight,
      );
      ctx.restore();
    }

    // Draw grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    // Vertical grid lines (frequency markers)
    const freqRange = frequencyRange.max - frequencyRange.min;
    const freqStep = getFrequencyStep(freqRange);
    const startFreq = Math.ceil(frequencyRange.min / freqStep) * freqStep;

    ctx.font = "10px monospace";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";

    for (let freq = startFreq; freq <= frequencyRange.max; freq += freqStep) {
      const x = frequencyToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, MARGINS.top);
      ctx.lineTo(x, canvasHeight - MARGINS.bottom);
      ctx.stroke();

      const label = freq >= 1000 ? `${(freq / 1000).toFixed(3)}` : `${freq}`;
      ctx.fillText(label, x, canvasHeight - 10);
    }

    // Horizontal grid lines (time markers)
    const timeStep = 5;
    ctx.textAlign = "right";

    for (let t = 0; t <= TIME_WINDOW_MINUTES; t += timeStep) {
      const y = MARGINS.top + (t / TIME_WINDOW_MINUTES) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(MARGINS.left, y);
      ctx.lineTo(canvasWidth - MARGINS.right, y);
      ctx.stroke();

      if (t === 0) {
        ctx.fillText("Now", MARGINS.left - 5, y + 4);
      } else {
        ctx.fillText(`-${t}m`, MARGINS.left - 5, y + 4);
      }
    }

    // Draw current frequency indicator if provided
    if (
      currentFrequency &&
      currentFrequency >= frequencyRange.min &&
      currentFrequency <= frequencyRange.max
    ) {
      const freqX = frequencyToX(currentFrequency);
      ctx.strokeStyle = "#ff6b35";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(freqX, MARGINS.top);
      ctx.lineTo(freqX, canvasHeight - MARGINS.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = "#ff6b35";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `${(currentFrequency / 1000).toFixed(3)}`,
        freqX,
        MARGINS.top - 5,
      );
    }

    // Draw axis labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Frequency (MHz)", canvasWidth / 2, canvasHeight - 2);

    // Draw plot border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGINS.left, MARGINS.top, plotWidth, plotHeight);

    const now = Date.now();

    // Draw spots - sort so dupes are drawn first (behind), new mults on top
    const sortedSpots = [...filteredSpots].sort((a, b) => {
      const statusOrder: Record<SpotContestStatus, number> = {
        dupe: 0,
        normal: 1,
        "needed-mult": 2,
        "new-mult": 3,
      };
      return statusOrder[getStatus(a)] - statusOrder[getStatus(b)];
    });

    for (const spot of sortedSpots) {
      const x = frequencyToX(spot.frequency);
      const y = timeToY(spot.time);
      const size = getSpotSize(spot.time, now);
      const status = getStatus(spot);
      const color = STATUS_COLORS[status];
      const isSelected = selectedSpotId === spot.id;
      const isHovered = hoveredSpot?.id === spot.id;

      // Draw glow ring for selected spot
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff6b35";
        ctx.lineWidth = 2;
        ctx.stroke();

        const gradient = ctx.createRadialGradient(x, y, size, x, y, size + 8);
        gradient.addColorStop(0, "rgba(255, 107, 53, 0.4)");
        gradient.addColorStop(1, "rgba(255, 107, 53, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, size + 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw hover highlight
      if (isHovered && !isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, size + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw spot circle
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Add subtle border (darker for dupes)
      ctx.strokeStyle =
        status === "dupe" ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw star/diamond for new multipliers
      if (status === "new-mult") {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("*", x, y);
      }
    }
  }, [
    canvasWidth,
    canvasHeight,
    filteredSpots,
    frequencyRange,
    currentBand,
    currentFrequency,
    frequencyToX,
    timeToY,
    selectedSpotId,
    hoveredSpot,
    getStatus,
    fftFrame,
  ]);

  // Handle mouse move for hover detection
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !frequencyRange) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      let foundSpot: DXSpot | null = null;
      const now = Date.now();

      for (const spot of filteredSpots) {
        const spotX = frequencyToX(spot.frequency);
        const spotY = timeToY(spot.time);
        const size = getSpotSize(spot.time, now);
        const distance = Math.sqrt((x - spotX) ** 2 + (y - spotY) ** 2);

        if (distance <= size + 2) {
          foundSpot = spot;
          break;
        }
      }

      setHoveredSpot(foundSpot);
      if (foundSpot) {
        setTooltipPosition({ x: event.clientX, y: event.clientY });
      }
    },
    [filteredSpots, frequencyRange, frequencyToX, timeToY],
  );

  // Handle click for spot selection
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !frequencyRange) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const now = Date.now();

      for (const spot of filteredSpots) {
        const spotX = frequencyToX(spot.frequency);
        const spotY = timeToY(spot.time);
        const size = getSpotSize(spot.time, now);
        const distance = Math.sqrt((x - spotX) ** 2 + (y - spotY) ** 2);

        if (distance <= size + 2) {
          // Toggle selection
          if (selectedSpotId === spot.id) {
            setSelectedSpotId(null);
          } else {
            setSelectedSpotId(spot.id);
            // Call onSpotSelect to prefill the entry form
            onSpotSelect(spot.dx, spot.frequency);
            onSpotClick?.(spot);
          }
          return;
        }
      }

      // Click on empty area - deselect
      setSelectedSpotId(null);
    },
    [
      filteredSpots,
      frequencyRange,
      frequencyToX,
      timeToY,
      selectedSpotId,
      onSpotSelect,
      onSpotClick,
    ],
  );

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setHoveredSpot(null);
  }, []);

  // Get hovered spot status for tooltip
  const hoveredSpotStatus = hoveredSpot ? getStatus(hoveredSpot) : null;
  const hoveredStatusLabel = hoveredSpotStatus
    ? getStatusLabel(hoveredSpotStatus)
    : "";

  return (
    <div
      ref={containerRef}
      className={`relative rounded-lg border border-white/10 backdrop-blur-sm overflow-hidden ${className}`}
      style={{
        background:
          "linear-gradient(135deg, rgba(10, 15, 30, 0.95) 0%, rgba(20, 30, 50, 0.95) 100%)",
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{ width: "100%", height: `${canvasHeight}px` }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
        className="cursor-crosshair"
      />

      {/* Tooltip */}
      {hoveredSpot && (
        <div
          className="fixed z-50 px-3 py-2 text-xs bg-gray-900/95 border border-white/20 rounded-lg shadow-lg pointer-events-none backdrop-blur-sm"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y + 10,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-white">
              {hoveredSpot.dx}
            </span>
            {hoveredStatusLabel && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  hoveredSpotStatus === "dupe"
                    ? "bg-gray-600/50 text-gray-300"
                    : hoveredSpotStatus === "new-mult"
                      ? "bg-plasma-orange/30 text-plasma-orange"
                      : "bg-cosmic-cyan/30 text-cosmic-cyan"
                }`}
              >
                {hoveredStatusLabel}
              </span>
            )}
          </div>
          <div className="text-gray-400">
            {(hoveredSpot.frequency / 1000).toFixed(3)} MHz
            {hoveredSpot.mode && (
              <span className="ml-2 text-gray-500">{hoveredSpot.mode}</span>
            )}
          </div>
          <div className="text-gray-500 text-[10px] mt-1">
            Spotted by {hoveredSpot.spotter}
          </div>
          <div className="text-cosmic-cyan text-[10px] mt-1">
            Click to select
          </div>
        </div>
      )}

      {/* Header with band info */}
      {currentBand && frequencyRange && (
        <div className="absolute top-2 left-14 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-gray-300 font-mono">
          {currentBand}: {(frequencyRange.min / 1000).toFixed(3)} -{" "}
          {(frequencyRange.max / 1000).toFixed(3)} MHz
          <span className="ml-2 text-gray-500">
            ({filteredSpots.length} spots)
          </span>
        </div>
      )}

      {/* Contest status legend */}
      <div className="flex items-center justify-center gap-4 py-2 px-3 border-t border-white/5 bg-black/30">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: STATUS_COLORS["new-mult"] }}
          />
          <span className="text-[10px] text-gray-400 font-mono">NEW MULT</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: STATUS_COLORS["needed-mult"] }}
          />
          <span className="text-[10px] text-gray-400 font-mono">NEEDED</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: STATUS_COLORS["normal"] }}
          />
          <span className="text-[10px] text-gray-400 font-mono">AVAIL</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: STATUS_COLORS["dupe"] }}
          />
          <span className="text-[10px] text-gray-400 font-mono">DUPE</span>
        </div>
      </div>
    </div>
  );
}

ContestBandMap.displayName = "ContestBandMap";

export default ContestBandMap;

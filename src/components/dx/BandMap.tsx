/**
 * BandMap Component
 *
 * A frequency-over-time visualization for DX spots using canvas rendering.
 * X-axis shows frequency range for the selected band.
 * Y-axis shows time (last 30 minutes, newest at top).
 * Spots are rendered as colored circles based on mode.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";

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
 * Mode colors for spot visualization
 */
const MODE_COLORS: Record<string, string> = {
  CW: "#54a0ff", // Blue
  SSB: "#1dd1a1", // Green
  FT8: "#ff9f43", // Orange
  FT4: "#feca57", // Yellow
  RTTY: "#a55eea", // Purple
  PSK31: "#ff6b6b", // Red
  JS8: "#00d2d3", // Cyan
  FM: "#c8d6e5", // Gray
  DEFAULT: "#ffffff", // White for unknown modes
};

/**
 * Time window in minutes for the Y-axis
 */
const TIME_WINDOW_MINUTES = 30;

/**
 * Margin configuration for the canvas
 * Increased top margin to accommodate header overlay
 */
const MARGINS = {
  top: 35,
  right: 20,
  bottom: 30,
  left: 50,
};

export interface BandMapProps {
  /** Array of DX spots to display */
  spots: DXSpot[];
  /** Currently selected band (e.g., "20m") */
  selectedBand: string | null;
  /** Height of the canvas in pixels (if not provided, fills container) */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get the color for a mode
 */
function getModeColor(mode?: string): string {
  if (!mode) {
    return MODE_COLORS.DEFAULT;
  }
  return MODE_COLORS[mode.toUpperCase()] || MODE_COLORS.DEFAULT;
}

/**
 * Calculate spot size based on age (newer = larger)
 */
function getSpotSize(spotTime: Date, now: number): number {
  const ageMs = now - spotTime.getTime();
  const ageMinutes = ageMs / 60000;
  // Size ranges from 8 (newest) to 4 (oldest)
  return Math.max(4, 8 - (ageMinutes / TIME_WINDOW_MINUTES) * 4);
}

/**
 * BandMap Component
 *
 * Renders a frequency-over-time visualization for DX spots.
 */
export function BandMap({
  spots,
  selectedBand,
  height: propHeight,
  className = "",
}: BandMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [canvasHeight, setCanvasHeight] = useState(propHeight ?? 300);
  const [hoveredSpot, setHoveredSpot] = useState<DXSpot | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Get store methods for selection
  const { selectedSpot, setSelectedSpot } = useDXStore();

  // Filter spots for the selected band and time window
  const filteredSpots = useMemo(() => {
    if (!selectedBand) {
      return [];
    }
    const now = Date.now();
    const cutoffTime = now - TIME_WINDOW_MINUTES * 60 * 1000;

    return spots.filter((spot) => {
      if (spot.band !== selectedBand) {
        return false;
      }
      if (spot.time.getTime() < cutoffTime) {
        return false;
      }
      return true;
    });
  }, [spots, selectedBand]);

  // Get frequency range for the selected band
  const frequencyRange = useMemo(() => {
    if (!selectedBand) {
      return null;
    }
    return BAND_FREQUENCY_RANGES[selectedBand] || null;
  }, [selectedBand]);

  // Handle canvas resize - track both width and height
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
        // Only update height if no fixed height prop provided
        // Subtract legend height (approx 36px) to leave room for it
        if (propHeight === undefined) {
          const availableHeight = entry.contentRect.height - 36;
          setCanvasHeight(Math.max(200, availableHeight));
        }
      }
    });

    resizeObserver.observe(container);
    setCanvasWidth(container.clientWidth);
    if (propHeight === undefined) {
      const availableHeight = container.clientHeight - 36;
      setCanvasHeight(Math.max(200, availableHeight));
    }

    return () => resizeObserver.disconnect();
  }, [propHeight]);

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

    if (!frequencyRange || !selectedBand) {
      // Draw "no band selected" message
      ctx.fillStyle = "#6b7280";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Select a band to view the band map",
        canvasWidth / 2,
        canvasHeight / 2,
      );
      return;
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

      // Frequency label
      const label = freq >= 1000 ? `${(freq / 1000).toFixed(3)}` : `${freq}`;
      ctx.fillText(label, x, canvasHeight - 10);
    }

    // Horizontal grid lines (time markers)
    const timeStep = 5; // 5-minute intervals
    ctx.textAlign = "right";

    for (let t = 0; t <= TIME_WINDOW_MINUTES; t += timeStep) {
      const y = MARGINS.top + (t / TIME_WINDOW_MINUTES) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(MARGINS.left, y);
      ctx.lineTo(canvasWidth - MARGINS.right, y);
      ctx.stroke();

      // Time label
      if (t === 0) {
        ctx.fillText("Now", MARGINS.left - 5, y + 4);
      } else {
        ctx.fillText(`-${t}m`, MARGINS.left - 5, y + 4);
      }
    }

    // Draw axis labels
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Frequency (MHz)", canvasWidth / 2, canvasHeight - 2);

    // Draw plot border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeRect(MARGINS.left, MARGINS.top, plotWidth, plotHeight);

    const now = Date.now();

    // Draw spots
    for (const spot of filteredSpots) {
      const x = frequencyToX(spot.frequency);
      const y = timeToY(spot.time);
      const size = getSpotSize(spot.time, now);
      const color = getModeColor(spot.mode);
      const isSelected = selectedSpot?.id === spot.id;
      const isHovered = hoveredSpot?.id === spot.id;

      // Draw glow ring for selected spot
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff6b35";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Outer glow
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

      // Add subtle border
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Note: Legend is now rendered as HTML overlay below canvas
  }, [
    canvasWidth,
    canvasHeight,
    filteredSpots,
    frequencyRange,
    selectedBand,
    frequencyToX,
    timeToY,
    selectedSpot,
    hoveredSpot,
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

      // Find spot under cursor
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
          // Toggle selection if clicking the same spot
          setSelectedSpot(selectedSpot?.id === spot.id ? null : spot);
          return;
        }
      }

      // Click on empty area - deselect
      setSelectedSpot(null);
    },
    [
      filteredSpots,
      frequencyRange,
      frequencyToX,
      timeToY,
      selectedSpot,
      setSelectedSpot,
    ],
  );

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setHoveredSpot(null);
  }, []);

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
          <div className="font-mono font-bold text-white">{hoveredSpot.dx}</div>
          <div className="text-gray-400">
            {(hoveredSpot.frequency / 1000).toFixed(3)} MHz
            {hoveredSpot.mode && (
              <span
                className="ml-2 px-1 py-0.5 rounded text-[10px]"
                style={{
                  backgroundColor: getModeColor(hoveredSpot.mode) + "30",
                  color: getModeColor(hoveredSpot.mode),
                }}
              >
                {hoveredSpot.mode}
              </span>
            )}
          </div>
          <div className="text-gray-500 text-[10px] mt-1">
            Spotted by {hoveredSpot.spotter}
          </div>
        </div>
      )}

      {/* Header with band info - positioned to not overlap Y-axis */}
      {selectedBand && frequencyRange && (
        <div className="absolute top-2 left-14 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-gray-300 font-mono">
          {selectedBand}: {(frequencyRange.min / 1000).toFixed(3)} -{" "}
          {(frequencyRange.max / 1000).toFixed(3)} MHz
          <span className="ml-2 text-gray-500">
            ({filteredSpots.length} spots)
          </span>
        </div>
      )}

      {/* Mode legend - below canvas to prevent overlap with spots */}
      <div className="flex items-center justify-center gap-4 py-2 px-3 border-t border-white/5 bg-black/30">
        {["CW", "SSB", "FT8", "FT4", "RTTY"].map((mode) => (
          <div key={mode} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: MODE_COLORS[mode] }}
            />
            <span className="text-[10px] text-gray-400 font-mono">{mode}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

BandMap.displayName = "BandMap";

export default BandMap;

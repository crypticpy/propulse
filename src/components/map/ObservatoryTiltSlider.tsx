/**
 * ObservatoryTiltSlider Component
 *
 * Floating horizontal slider for adjusting the Earth's axial tilt angle
 * during observatory mode. Appears at the bottom-center of the screen
 * and fades in/out with the ambient mode top bar.
 *
 * Controls mapStore.rotation.x (tilt in degrees, 0-90).
 */

import { useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";

interface ObservatoryTiltSliderProps {
  visible: boolean; // controlled by parent (showTopBar && observatoryMode)
}

export function ObservatoryTiltSlider({ visible }: ObservatoryTiltSliderProps) {
  const rotation = useMapStore((s) => s.rotation);
  const setRotation = useMapStore((s) => s.setRotation);

  const tiltAngle = rotation.x;

  const handleTiltChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRotation({ x: parseFloat(e.target.value), y: rotation.y });
    },
    [setRotation, rotation.y],
  );

  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[220] pointer-events-auto
      transition-opacity duration-500
      ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 select-none">
        {/* Tilted globe icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-cyan-300/60 flex-shrink-0"
        >
          <circle cx="12" cy="12" r="9" />
          <line
            x1="12"
            y1="1"
            x2="12"
            y2="5"
            strokeLinecap="round"
            transform="rotate(-23.5 12 12)"
          />
          <line
            x1="12"
            y1="19"
            x2="12"
            y2="23"
            strokeLinecap="round"
            transform="rotate(-23.5 12 12)"
          />
          <ellipse
            cx="12"
            cy="12"
            rx="9"
            ry="4"
            transform="rotate(-23.5 12 12)"
          />
        </svg>

        <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
          Tilt
        </span>

        <input
          type="range"
          min="0"
          max="90"
          step="0.5"
          value={tiltAngle}
          onChange={handleTiltChange}
          className="tilt-slider"
          aria-label="Earth tilt angle"
        />

        <span className="text-[11px] font-mono text-cyan-300/80 w-10 text-right tabular-nums">
          {tiltAngle.toFixed(1)}&deg;
        </span>
      </div>

      {/* Inline slider styles (pattern from MapSizeSliders) */}
      <style>{`
        .tilt-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 5px;
          background: linear-gradient(to right, rgba(0, 220, 220, 0.15), rgba(0, 220, 220, 0.4));
          border-radius: 2.5px;
          outline: none;
          width: 200px;
        }
        .tilt-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgb(100, 220, 220);
          cursor: pointer;
          border: 2px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 0 6px rgba(0, 220, 220, 0.4);
          transition: background 0.15s, box-shadow 0.15s;
        }
        .tilt-slider::-webkit-slider-thumb:active {
          background: #ffffff;
          box-shadow: 0 0 10px rgba(0, 220, 220, 0.7);
        }
        .tilt-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgb(100, 220, 220);
          cursor: pointer;
          border: 2px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 0 6px rgba(0, 220, 220, 0.4);
          transition: background 0.15s, box-shadow 0.15s;
        }
        .tilt-slider::-moz-range-thumb:active {
          background: #ffffff;
          box-shadow: 0 0 10px rgba(0, 220, 220, 0.7);
        }
        .tilt-slider::-moz-range-track {
          height: 5px;
          background: linear-gradient(to right, rgba(0, 220, 220, 0.15), rgba(0, 220, 220, 0.4));
          border-radius: 2.5px;
          border: none;
        }
      `}</style>
    </div>
  );
}

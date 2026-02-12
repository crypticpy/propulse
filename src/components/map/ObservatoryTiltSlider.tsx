/**
 * ObservatoryTiltSlider Component
 *
 * Compact floating slider for adjusting the Earth's axial tilt angle.
 * Shown whenever the 3D globe is active (normal, Pro, and observatory modes).
 * Range: 0° (poles straight up/down) to 23.5° (Earth's real axial tilt).
 *
 * Controls mapStore.rotation.x (tilt in degrees, 0–23.5).
 */

import { useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";

interface ObservatoryTiltSliderProps {
  visible: boolean;
  /** Override wrapper positioning (default: fixed bottom-16 right-4) */
  className?: string;
}

export function ObservatoryTiltSlider({
  visible,
  className,
}: ObservatoryTiltSliderProps) {
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
      className={`${className ?? "fixed bottom-16 right-4"} z-[220] pointer-events-auto
      transition-opacity duration-500
      ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-lg px-2 py-1.5 flex items-center gap-1.5 select-none">
        {/* Tilted globe icon */}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-cyan-300/50 flex-shrink-0"
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

        <input
          type="range"
          min="0"
          max="23.5"
          step="0.1"
          value={tiltAngle}
          onChange={handleTiltChange}
          className="tilt-slider"
          aria-label="Earth tilt angle"
        />

        <span className="text-[9px] font-mono text-cyan-300/70 w-7 text-right tabular-nums leading-none">
          {tiltAngle.toFixed(1)}&deg;
        </span>
      </div>

      {/* Inline slider styles */}
      <style>{`
        .tilt-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 3px;
          background: linear-gradient(to right, rgba(0, 220, 220, 0.12), rgba(0, 220, 220, 0.35));
          border-radius: 1.5px;
          outline: none;
          width: 72px;
        }
        .tilt-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgb(100, 220, 220);
          cursor: pointer;
          border: 1.5px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 0 4px rgba(0, 220, 220, 0.35);
          transition: background 0.15s, box-shadow 0.15s;
        }
        .tilt-slider::-webkit-slider-thumb:active {
          background: #ffffff;
          box-shadow: 0 0 8px rgba(0, 220, 220, 0.6);
        }
        .tilt-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgb(100, 220, 220);
          cursor: pointer;
          border: 1.5px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 0 4px rgba(0, 220, 220, 0.35);
          transition: background 0.15s, box-shadow 0.15s;
        }
        .tilt-slider::-moz-range-thumb:active {
          background: #ffffff;
          box-shadow: 0 0 8px rgba(0, 220, 220, 0.6);
        }
        .tilt-slider::-moz-range-track {
          height: 3px;
          background: linear-gradient(to right, rgba(0, 220, 220, 0.12), rgba(0, 220, 220, 0.35));
          border-radius: 1.5px;
          border: none;
        }
      `}</style>
    </div>
  );
}

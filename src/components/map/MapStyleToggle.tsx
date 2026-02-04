/**
 * MapStyleToggle Component
 *
 * Compact toggle button for switching between Satellite and Standard (grayscale)
 * map styles. Syncs across all map views (Globe, Flat, Azimuthal).
 */

import { useMapStore } from "@/stores/mapStore";

interface MapStyleToggleProps {
  className?: string;
}

/** Satellite icon (small globe with signal lines) */
const SatelliteIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13 7L9 3 5 7l4 4" />
    <path d="m17 11 4 4-4 4-4-4" />
    <path d="m8 12 4 4 6-6-4-4Z" />
    <path d="m16 8 3-3" />
    <path d="M9 21a6 6 0 0 0-6-6" />
  </svg>
);

/** Map icon (simple folded map) */
const MapIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
    <path d="M15 5.764v15" />
    <path d="M9 3.236v15" />
  </svg>
);

export function MapStyleToggle({ className = "" }: MapStyleToggleProps) {
  const { mapStyle, setMapStyle } = useMapStore();
  const isSatellite = mapStyle === "satellite";

  return (
    <div className={`inline-flex rounded-md bg-white/5 p-0.5 ${className}`}>
      <button
        onClick={() => setMapStyle("satellite")}
        title="Satellite imagery"
        aria-pressed={isSatellite}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
          isSatellite
            ? "bg-white/20 text-white"
            : "text-gray-400 hover:text-white hover:bg-white/10"
        }`}
      >
        <SatelliteIcon />
        <span>Satellite</span>
      </button>
      <button
        onClick={() => setMapStyle("standard")}
        title="Standard grayscale map"
        aria-pressed={!isSatellite}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
          !isSatellite
            ? "bg-white/20 text-white"
            : "text-gray-400 hover:text-white hover:bg-white/10"
        }`}
      >
        <MapIcon />
        <span>Standard</span>
      </button>
    </div>
  );
}

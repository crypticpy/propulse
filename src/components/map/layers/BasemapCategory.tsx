/**
 * BasemapCategory — Basemap style picker for the LayersPopover submenu
 *
 * Shows two thumbnail cards (satellite vs standard) in a compact grid.
 * Active card gets a cyan border ring; clicking switches the map style.
 */

import { useMapStore } from "@/stores/mapStore";
import type { MapStyle } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import {
  DISPLAY_QUALITY_OPTIONS,
} from "@/lib/map/displayQuality";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Thumbnail SVGs
// ---------------------------------------------------------------------------

/** Satellite/terrain thumbnail — stylized topographic map with landmass shapes */
function SatelliteThumbnail({ active }: { active: boolean }) {
  const land = active ? "#2d6a4f" : "#2d5a44";
  const water = active ? "#1a3a5c" : "#192d44";
  const highlight = active ? "#3a8f6e" : "#2a6a4f";
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full rounded-md">
      <rect width="80" height="60" fill={water} />
      {/* Ocean texture lines */}
      <path
        d="M0 15 Q20 12 40 16 T80 14"
        stroke="#1e4470"
        strokeWidth="0.5"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M0 35 Q25 32 50 36 T80 34"
        stroke="#1e4470"
        strokeWidth="0.5"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M0 50 Q30 47 60 52 T80 49"
        stroke="#1e4470"
        strokeWidth="0.5"
        fill="none"
        opacity="0.4"
      />
      {/* Landmass 1 — large continent upper right */}
      <path
        d="M42 5 Q50 3 62 8 Q68 14 65 22 Q60 28 52 26 Q44 22 38 16 Q36 10 42 5Z"
        fill={land}
      />
      <path
        d="M48 8 Q54 7 58 12 Q56 18 50 16 Q46 13 48 8Z"
        fill={highlight}
        opacity="0.7"
      />
      {/* Landmass 2 — lower left */}
      <path
        d="M8 30 Q16 26 26 30 Q32 36 28 44 Q22 48 14 46 Q6 42 8 30Z"
        fill={land}
      />
      <path
        d="M14 33 Q20 31 22 36 Q18 40 14 38Z"
        fill={highlight}
        opacity="0.6"
      />
      {/* Island chain */}
      <ellipse cx="56" cy="40" rx="6" ry="4" fill={land} opacity="0.8" />
      <ellipse cx="66" cy="44" rx="3" ry="2" fill={land} opacity="0.7" />
      {/* Topo contour lines on large landmass */}
      <path
        d="M46 10 Q52 9 56 13"
        stroke="#4a9e72"
        strokeWidth="0.4"
        fill="none"
        opacity="0.5"
      />
      <path
        d="M44 14 Q50 12 54 16"
        stroke="#4a9e72"
        strokeWidth="0.4"
        fill="none"
        opacity="0.4"
      />
      {/* Cloud wisps */}
      <ellipse cx="30" cy="12" rx="8" ry="2" fill="white" opacity="0.12" />
      <ellipse cx="60" cy="50" rx="10" ry="2.5" fill="white" opacity="0.1" />
    </svg>
  );
}

/** Standard/grayscale thumbnail — clean vector globe with grid lines */
function StandardThumbnail({ active }: { active: boolean }) {
  const bg = active ? "#2a2d35" : "#25272e";
  const stroke = active ? "#555e6e" : "#444a55";
  const land = active ? "#55606e" : "#484f5a";
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full rounded-md">
      <rect width="80" height="60" fill={bg} />
      {/* Globe circle */}
      <circle
        cx="40"
        cy="30"
        r="24"
        fill="none"
        stroke={stroke}
        strokeWidth="0.8"
      />
      {/* Latitude lines */}
      <ellipse
        cx="40"
        cy="30"
        rx="24"
        ry="8"
        fill="none"
        stroke={stroke}
        strokeWidth="0.4"
        opacity="0.6"
      />
      <ellipse
        cx="40"
        cy="30"
        rx="24"
        ry="16"
        fill="none"
        stroke={stroke}
        strokeWidth="0.4"
        opacity="0.5"
      />
      {/* Longitude curves */}
      <ellipse
        cx="40"
        cy="30"
        rx="8"
        ry="24"
        fill="none"
        stroke={stroke}
        strokeWidth="0.4"
        opacity="0.6"
      />
      <ellipse
        cx="40"
        cy="30"
        rx="16"
        ry="24"
        fill="none"
        stroke={stroke}
        strokeWidth="0.4"
        opacity="0.5"
      />
      {/* Equator */}
      <line
        x1="16"
        y1="30"
        x2="64"
        y2="30"
        stroke={stroke}
        strokeWidth="0.5"
        opacity="0.7"
      />
      {/* Prime meridian */}
      <line
        x1="40"
        y1="6"
        x2="40"
        y2="54"
        stroke={stroke}
        strokeWidth="0.5"
        opacity="0.7"
      />
      {/* Simplified continent shapes */}
      <path
        d="M32 18 Q36 16 42 18 Q46 22 44 26 Q40 28 36 26 Q32 23 32 18Z"
        fill={land}
        opacity="0.7"
      />
      <path
        d="M26 30 Q30 28 34 32 Q32 38 28 38 Q24 36 26 30Z"
        fill={land}
        opacity="0.6"
      />
      <path d="M46 32 Q50 30 54 34 Q52 38 48 36Z" fill={land} opacity="0.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Basemap option definition
// ---------------------------------------------------------------------------

interface BasemapOption {
  id: MapStyle;
  label: string;
  thumbnail: (active: boolean) => ReactNode;
  subtitle?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BasemapCategory() {
  const mapStyle = useMapStore((s) => s.mapStyle);
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const nightDarkness = useMapStore((s) => s.nightDarkness);
  const setNightDarkness = useMapStore((s) => s.setNightDarkness);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const setDisplayQuality = useDisplayQualityStore(
    (s) => s.setDisplayQuality,
  );
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const effectiveQuality = useResolvedDisplayQuality(displayQuality);

  const satelliteSubtitle =
    subscriptionTier === "pro" ? "HD Satellite" : "ESRI World Imagery";

  const options: BasemapOption[] = [
    {
      id: "satellite",
      label: "Satellite",
      thumbnail: (active) => <SatelliteThumbnail active={active} />,
      subtitle: satelliteSubtitle,
    },
    {
      id: "standard",
      label: "Standard",
      thumbnail: (active) => <StandardThumbnail active={active} />,
      subtitle: "OpenStreetMap",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const isActive = mapStyle === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMapStyle(opt.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all duration-150 cursor-pointer border ${
                isActive
                  ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/40"
                  : "border-zinc-700 bg-white/[0.03] hover:bg-white/[0.06] hover:border-zinc-600"
              }`}
            >
              {/* Thumbnail preview */}
              <div
                className={`w-full aspect-[4/3] overflow-hidden rounded-md ${
                  isActive ? "ring-1 ring-cyan-500/30" : ""
                }`}
              >
                {opt.thumbnail(isActive)}
              </div>
              {/* Label + subtitle */}
              <span
                className={`text-[11px] font-medium transition-colors ${
                  isActive ? "text-cyan-400" : "text-white/60"
                }`}
              >
                {opt.label}
              </span>
              {opt.subtitle && (
                <span className="text-[9px] text-white/40">{opt.subtitle}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[9px] text-white/30 text-center">
        {mapStyle === "satellite"
          ? subscriptionTier === "pro"
            ? "\u00A9 Mapbox \u00A9 OpenStreetMap"
            : "Powered by Esri"
          : "\u00A9 OpenStreetMap contributors"}
      </p>

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/50">
            Image quality
          </span>
          <span className="text-[9px] text-cyan-400/80">
            Effective: {effectiveQuality.label}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {DISPLAY_QUALITY_OPTIONS.map((quality) => (
            <button
              key={quality.id}
              type="button"
              onClick={() => setDisplayQuality(quality.id)}
              title={quality.description}
              aria-pressed={displayQuality === quality.id}
              className={`rounded border px-1 py-1.5 text-[9px] transition-colors ${
                displayQuality === quality.id
                  ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300"
                  : "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.07] hover:text-white/80"
              }`}
            >
              {quality.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[9px] leading-relaxed text-white/30">
          Controls globe refinement, map tiles, textures, and HiDPI rendering.
        </p>
        {displayQuality === "extreme" && (
          <p className="mt-2 text-[9px] leading-snug text-amber-400">
            Extreme can use substantial bandwidth and GPU memory. It refines
            to the provider&apos;s highest useful zoom after movement settles.
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <label
          htmlFor="basemap-night-darkness"
          className="flex items-center justify-between text-[10px] text-white/60"
        >
          <span>Night darkness</span>
          <output htmlFor="basemap-night-darkness" className="font-mono text-cyan-300">
            {Math.round(nightDarkness * 100)}%
          </output>
        </label>
        <input
          id="basemap-night-darkness"
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(nightDarkness * 100)}
          onChange={(event) => setNightDarkness(Number(event.target.value) / 100)}
          className="mt-2 w-full accent-cyan-400"
          aria-describedby="basemap-night-darkness-help"
        />
        <p
          id="basemap-night-darkness-help"
          className="mt-1 text-[9px] leading-relaxed text-white/30"
        >
          Controls dark-side intensity when the Day/Night layer is on.
        </p>
      </div>
    </div>
  );
}

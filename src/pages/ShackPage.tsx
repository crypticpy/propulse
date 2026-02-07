/**
 * ShackPage — Station equipment & signal chain management.
 *
 * Manages "what you have": radios, antennas, and station configuration.
 * Desktop: centered content (max-width 1200px) with section cards.
 * Mobile: stacked vertically with compact spacing.
 */

import { useActiveRadio } from "@/stores/shackStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { RadioManager } from "@/components/settings/RadioManager";
import { ANTENNA_TYPES, type AntennaType } from "@/lib/data/antennas";

// ─── Header ─────────────────────────────────────────────────────────────────

function ShackHeader({ isMobile }: { isMobile: boolean }) {
  const activeRadio = useActiveRadio();
  const antennaType = useSettingsStore((s) => s.antennaType);
  const selectedAntenna = ANTENNA_TYPES.find((a) => a.type === antennaType);

  return (
    <div
      className={`flex flex-wrap items-start gap-3 ${isMobile ? "mb-4" : "mb-6"}`}
    >
      <div className="flex-1 min-w-0">
        <h1
          className={`font-bold text-white ${isMobile ? "text-xl" : "text-2xl"}`}
        >
          Shack
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Station equipment &amp; signal chain
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {activeRadio && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-plasma-orange/15 text-plasma-orange">
            {activeRadio.displayName?.trim() ||
              `${activeRadio.manufacturer} ${activeRadio.model}`}
          </span>
        )}
        {selectedAntenna && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-plasma-orange/15 text-plasma-orange">
            {selectedAntenna.name}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Antenna Configuration ──────────────────────────────────────────────────

function AntennaConfiguration() {
  const antennaType = useSettingsStore((s) => s.antennaType);
  const setAntennaType = useSettingsStore((s) => s.setAntennaType);
  const selected = ANTENNA_TYPES.find((a) => a.type === antennaType);

  return (
    <section className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">
        Antenna Configuration
      </h2>

      <div className="space-y-3">
        <label
          htmlFor="shack-antenna-type"
          className="block text-sm font-medium text-gray-300"
        >
          Antenna Type
        </label>
        <p className="text-xs text-gray-400">
          Used for propagation predictions — affects gain calculations based on
          path takeoff angle.
        </p>
        <select
          id="shack-antenna-type"
          value={antennaType}
          onChange={(e) => setAntennaType(e.target.value as AntennaType)}
          className="w-full bg-void-black border border-white/10 text-gray-200 rounded-lg px-3 py-2 text-sm focus:border-plasma-orange/50 focus:outline-none"
        >
          {ANTENNA_TYPES.map((ant) => (
            <option key={ant.type} value={ant.type}>
              {ant.name} ({ant.peakGainDbi > 0 ? "+" : ""}
              {ant.peakGainDbi} dBi peak)
            </option>
          ))}
        </select>
        {selected && (
          <div className="text-xs text-gray-400 space-y-1 pl-1">
            <p>{selected.description}</p>
            <p className="font-mono">
              Optimal elevation: {selected.optimalElevationDeg}°
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ShackPage() {
  const isMobile = useIsMobile();

  return (
    <div
      className={`max-w-[1200px] mx-auto ${isMobile ? "px-4 py-4" : "px-6 py-6"}`}
    >
      <ShackHeader isMobile={isMobile} />

      <div className="space-y-6">
        {/* Radio Fleet */}
        <section className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Radio Fleet
          </h2>
          <RadioManager />
        </section>

        {/* Antenna Configuration */}
        <AntennaConfiguration />
      </div>
    </div>
  );
}

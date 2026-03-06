import { useAtmosStore } from "@/stores/atmosStore";
import { useEmcommStore } from "@/stores/emcommStore";
import type { AtmosLayerId } from "@/types/atmos";
import { RIMScoreCard } from "./RIMScoreCard";
import { LocalWeatherCard } from "./LocalWeatherCard";
import { SignalChainHealth } from "./SignalChainHealth";
import { MonitoredRegionManager } from "./MonitoredRegionManager";
import { EmCommSidebarPanel } from "./emcomm/EmCommSidebarPanel";

/** Layer metadata for display */
const LAYER_META: { id: AtmosLayerId; label: string; icon: string }[] = [
  { id: "radar", label: "Weather Radar", icon: "\u{1F327}\u{FE0F}" },
  { id: "lightning", label: "Lightning", icon: "\u26A1" },
  { id: "alerts", label: "NWS Alerts", icon: "\u26A0\u{FE0F}" },
  { id: "fires", label: "Fire Hotspots", icon: "\u{1F525}" },
  { id: "goesCloud", label: "GOES Cloud", icon: "\u2601\u{FE0F}" },
  { id: "tec", label: "Ionospheric TEC", icon: "\u{1F310}" },
  { id: "repeaters", label: "Repeaters", icon: "\u{1F4E1}" },
  { id: "riverGauges", label: "River Gauges", icon: "\u{1F30A}" },
  { id: "sst", label: "Sea Surface Temp", icon: "\u{1F321}\u{FE0F}" },
  { id: "aprs", label: "APRS Stations", icon: "\u{1F4CD}" },
  { id: "shadowZones", label: "Coverage Gaps", icon: "\u{1F6AB}" },
  { id: "aurora", label: "Aurora", icon: "\u{1F30C}" },
  { id: "earthquakes", label: "Earthquakes", icon: "\u{1F30D}" },
  { id: "tropical", label: "Tropical Systems", icon: "\u{1F300}" },
];

export function AtmosSidebar() {
  const sidebarOpen = useAtmosStore((s) => s.sidebarOpen);
  const layerVisibility = useAtmosStore((s) => s.layerVisibility);
  const toggleLayer = useAtmosStore((s) => s.toggleLayer);
  const activeIncident = useEmcommStore((s) => s.activeIncident);

  if (!sidebarOpen) return null;

  if (activeIncident) return <EmCommSidebarPanel />;

  return (
    <aside className="w-56 shrink-0 bg-deep-space/60 border-r border-white/5 overflow-y-auto">
      {/* RIM Summary */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Radio Impact
        </h2>
        <RIMScoreCard />
      </div>

      {/* Local Weather */}
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Station Weather
        </h2>
        <LocalWeatherCard />
      </div>

      {/* Signal Chain Health */}
      <div className="p-3 border-b border-white/5">
        <SignalChainHealth />
      </div>

      {/* Layer toggles */}
      <div className="p-3">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Layers
        </h2>
        <div className="space-y-0.5">
          {LAYER_META.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => toggleLayer(id)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                layerVisibility[id]
                  ? "bg-white/5 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]"
              }`}
            >
              <span className="text-sm">{icon}</span>
              <span className="font-medium">{label}</span>
              {layerVisibility[id] && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-signal-green" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Monitored Regions */}
      <div className="p-3 border-t border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Monitored Regions
        </h2>
        <MonitoredRegionManager />
      </div>
    </aside>
  );
}

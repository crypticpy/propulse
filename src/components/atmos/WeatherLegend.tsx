/**
 * WeatherLegend — Floating HTML overlay (bottom-left) showing color
 * scales for whichever AtmosPulse data layers are currently active.
 * Auto-hides when no relevant layers are turned on.
 */

import { useAtmosStore } from "@/stores/atmosStore";

/* ── Legend entry renderers ────────────────────────────────────────── */

function GradientBar({
  label,
  from,
  to,
  via,
}: {
  label: string;
  from: string;
  to: string;
  via?: string;
}) {
  const bg = via
    ? `linear-gradient(to right, ${from}, ${via}, ${to})`
    : `linear-gradient(to right, ${from}, ${to})`;

  return (
    <div className="space-y-0.5">
      <div className="h-1.5 w-full rounded-sm" style={{ background: bg }} />
      <span className="text-[9px] font-mono text-gray-400">{label}</span>
    </div>
  );
}

function DotRow({
  label,
  items,
}: {
  label: string;
  items: { color: string; text: string }[];
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-[9px] font-mono text-gray-400">{label}</span>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <div key={item.text} className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[9px] font-mono text-gray-500">
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

const DATA_LAYERS = [
  "radar",
  "lightning",
  "alerts",
  "fires",
  "aurora",
  "tropical",
  "sst",
] as const;

export function WeatherLegend() {
  const layerVisibility = useAtmosStore((s) => s.layerVisibility);

  const anyActive = DATA_LAYERS.some((id) => layerVisibility[id]);
  if (!anyActive) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 max-w-[200px] bg-void-black/70 backdrop-blur-sm border border-white/10 rounded-lg p-2 space-y-2">
      {layerVisibility.radar && (
        <div className="space-y-0.5">
          <div
            className="h-1.5 w-full rounded-sm"
            style={{
              background:
                "linear-gradient(to right, #04e9e7, #019ff4, #0300f4, #02fd02, #01c501, #008e00, #fdf802, #e5bc00, #fd9500, #fd0000, #d40000, #bc0000, #f800fd, #9854c6)",
            }}
          />
          <div className="flex justify-between">
            <span className="text-[8px] font-mono text-gray-500">5 dBZ</span>
            <span className="text-[8px] font-mono text-gray-500">75 dBZ</span>
          </div>
          <span className="text-[9px] font-mono text-gray-400">
            Radar (NEXRAD + RainViewer)
          </span>
        </div>
      )}

      {layerVisibility.lightning && (
        <DotRow
          label="Lightning"
          items={[
            { color: "#22c55e", text: "< 50 kA" },
            { color: "#eab308", text: "50-100 kA" },
            { color: "#ef4444", text: "> 100 kA" },
          ]}
        />
      )}

      {layerVisibility.alerts && (
        <DotRow
          label="Alerts"
          items={[
            { color: "#3b82f6", text: "Minor" },
            { color: "#eab308", text: "Moderate" },
            { color: "#f97316", text: "Severe" },
            { color: "#ef4444", text: "Extreme" },
          ]}
        />
      )}

      {layerVisibility.fires && (
        <GradientBar label="Fire Radiative Power" from="#f97316" to="#ef4444" />
      )}

      {layerVisibility.aurora && (
        <GradientBar label="Kp Activity" from="#22c55e" to="#a855f7" />
      )}

      {layerVisibility.tropical && (
        <DotRow
          label="Tropical Systems"
          items={[
            { color: "#3b82f6", text: "TD" },
            { color: "#eab308", text: "TS" },
            { color: "#f97316", text: "Cat 1-2" },
            { color: "#ef4444", text: "Cat 3-5" },
          ]}
        />
      )}

      {layerVisibility.sst && (
        <GradientBar
          label="Sea Surface Temp"
          from="#001a80"
          via="#22c55e"
          to="#e60000"
        />
      )}
    </div>
  );
}

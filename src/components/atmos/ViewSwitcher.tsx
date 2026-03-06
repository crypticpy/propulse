import { useAtmosStore } from "@/stores/atmosStore";
import type { AtmosViewMode } from "@/types/atmos";

export function ViewSwitcher() {
  const viewMode = useAtmosStore((s) => s.viewMode);
  const setViewMode = useAtmosStore((s) => s.setViewMode);

  return (
    <div className="flex items-center gap-1 rounded-lg bg-void-black/60 border border-white/10 p-0.5">
      <ViewButton
        mode="2d"
        label="2D"
        active={viewMode === "2d"}
        onClick={() => setViewMode("2d")}
      />
      <ViewButton
        mode="3d"
        label="3D"
        active={viewMode === "3d"}
        onClick={() => setViewMode("3d")}
      />
    </div>
  );
}

function ViewButton({
  mode: _mode,
  label,
  active,
  onClick,
}: {
  mode: AtmosViewMode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-mono font-semibold rounded-md transition-all ${
        active
          ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30"
          : "text-gray-500 hover:text-gray-300 border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

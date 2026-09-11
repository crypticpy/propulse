import type { PathPointDescriptor } from "@/lib/views/spotContracts";
import type { PathPointBuildStatus } from "@/lib/spots/pathPoints";

function formatCoord(lat: number, lon: number): string {
  const latHem = lat >= 0 ? "N" : "S";
  const lonHem = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latHem} ${Math.abs(lon).toFixed(2)}°${lonHem}`;
}

function formatModelTime(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "Model time unavailable";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function roleTitle(role: PathPointDescriptor["role"]): string {
  if (role === "ray-apex") return "Modeled ray apex";
  if (role === "shell-highlight") return "Decorative shell intersection";
  return "Ground hop";
}

function Fact({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-su-line/40 bg-su-line/10 px-2 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wider text-su-muted">
        {label}
      </div>
      <div
        className={`mt-0.5 font-mono text-[11px] ${warn ? "text-caution-amber" : "text-su-text"}`}
      >
        {value}
      </div>
    </div>
  );
}

export interface PathPointCardProps {
  point: PathPointDescriptor | null;
  status: PathPointBuildStatus;
  unavailableReason: string | null;
  pathSummary?: string;
  onOpenPathAnalysis?: () => void;
}

export function PathPointCard({
  point,
  status,
  unavailableReason,
  pathSummary,
  onOpenPathAnalysis,
}: PathPointCardProps) {
  const modeledHeight =
    point?.modeledHeightKm === null || point?.modeledHeightKm === undefined
      ? "Height unavailable"
      : `${Math.round(point.modeledHeightKm)} km modeled`;
  const displayHeight =
    point != null ? `${Math.round(point.displayHeightKm)} km drawn` : null;
  const heightsDiffer =
    point != null &&
    point.modeledHeightKm !== null &&
    Math.abs(point.displayHeightKm - point.modeledHeightKm) > 0.5;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-su-line/40 px-3 py-2.5">
        <h3 className="text-sm font-semibold text-su-text">
          {point ? roleTitle(point.role) : "Path details"}
        </h3>
        <p className="mt-0.5 text-[10px] text-su-muted">
          {point
            ? `Hop ${point.hopIndex + 1} · modeled prediction`
            : "Modeled path — not a measured bounce"}
        </p>
      </div>

      {status === "model-stale" && unavailableReason && (
        <div
          role="status"
          className="border-b border-caution-amber/30 bg-caution-amber/10 px-3 py-2 text-[11px] text-caution-amber"
        >
          {unavailableReason}
        </div>
      )}

      {(status === "model-unavailable" || status === "no-hops") && (
        <div role="status" className="px-3 py-3 text-xs text-su-muted">
          {unavailableReason ?? "Path point details are unavailable."}
        </div>
      )}

      {!point && status === "ready" && (
        <p className="px-3 py-3 text-xs text-su-muted">
          {pathSummary
            ? pathSummary
            : "This line is a modeled path. A click on the trace is not a measured bounce. Choose a listed point for hop details."}
        </p>
      )}

      {point && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-2 gap-1.5">
            <Fact label="Hop" value={`Hop ${point.hopIndex + 1}`} />
            <Fact
              label="Layer"
              value={point.layer ?? "Not supplied by the model"}
              warn={point.layer === null}
            />
            <Fact
              label="Modeled height"
              value={modeledHeight}
              warn={point.modeledHeightKm === null}
            />
            {displayHeight && (point.role === "shell-highlight" || heightsDiffer) && (
              <Fact
                label={
                  point.role === "shell-highlight"
                    ? "Decorative shell height"
                    : "Drawn height"
                }
                value={displayHeight}
              />
            )}
            <Fact
              label="Position"
              value={formatCoord(point.coordinates.lat, point.coordinates.lon)}
            />
            <Fact
              label="Precision"
              value={
                point.locationPrecision === "approximate"
                  ? "Approximate"
                  : "Modeled"
              }
              warn={point.locationPrecision === "approximate"}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-su-text">
            {point.explanation}
          </p>
          <div className="rounded-md border border-su-line/40 px-2 py-1.5 text-[10px] text-su-muted">
            <div>
              {point.model.name} {point.model.version}
            </div>
            <div>Modeled {formatModelTime(point.model.modeledAtMs)}</div>
            <div>
              {point.model.inputsAsOfMs == null
                ? "Input time unavailable"
                : `Inputs as of ${formatModelTime(point.model.inputsAsOfMs)}`}
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-su-line/40 px-3 py-2">
        <button
          type="button"
          onClick={() => onOpenPathAnalysis?.()}
          disabled={!onOpenPathAnalysis}
          className="w-full rounded-md border border-su-line/40 bg-su-line/10 px-2 py-1.5 text-[11px] font-medium text-su-text hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-default disabled:opacity-50"
        >
          Full path analysis
        </button>
      </div>
    </div>
  );
}

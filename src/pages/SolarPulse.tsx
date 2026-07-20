import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AccessibleDialog } from "@/components/ui";
import { SolarDisclosure } from "@/components/solar/SolarDisclosure";
import { SolarImageCard } from "@/components/solar/SolarImageCard";
import { SolarImageDetail } from "@/components/solar/SolarImageDetail";
import { SolarSeriesChart } from "@/components/solar/SolarSeriesChart";
import { WidgetShell } from "@/components/solar/WidgetShell";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useSolarModel,
  type SolarResourceView,
} from "@/hooks/useSolarModel";
import type { SolarWidgetState } from "@/lib/solar/contracts";
import type {
  OfficialSolarAlert,
  SolarFluxPoint,
} from "@/lib/solar/dataTypes";
import {
  SOLAR_IMAGE_PRODUCTS,
  type SolarImageProductId,
} from "@/lib/solar/mediaProducts";
import {
  getSolarSourcePolicy,
  type SolarSourceGroup,
} from "@/lib/solar/sourcePolicies";

const SolarAnimationPlayer = lazy(() =>
  import("@/components/solar/SolarAnimationPlayer").then((module) => ({
    default: module.SolarAnimationPlayer,
  })),
);

type ModalState =
  | { kind: "image"; productId: SolarImageProductId }
  | { kind: "animation"; productId: SolarImageProductId }
  | { kind: "alert"; alert: OfficialSolarAlert }
  | { kind: "metric"; metric: "kp" | "sfi" | "bz" | "xray" }
  | null;

const ALL_GROUPS = new Set<SolarSourceGroup>([
  "now",
  "impacts",
  "forecast",
  "details",
]);

const imageProducts = Object.keys(SOLAR_IMAGE_PRODUCTS) as SolarImageProductId[];

function formatNumber(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function formatUtc(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function hasData<T>(view: SolarResourceView<T>): boolean {
  if (Array.isArray(view.data)) return view.data.length > 0;
  return view.data !== undefined && view.data !== null;
}

function sourceProps<T>(view: SolarResourceView<T>) {
  const policy = getSolarSourcePolicy(view.sourceId);
  return {
    state: view.state,
    observedAt: view.resource?.envelope.observedAt,
    provider: view.resource?.envelope.provider ?? policy.provider,
    sourceUrl: view.resource?.envelope.sourceUrl ?? policy.sourceUrl,
    hasData: hasData(view),
    staleMessage: view.resource?.lastError
      ? "The latest refresh failed. Last validated data remains visible."
      : "The latest validated observation is older than this product's normal cadence. Last validated data remains visible.",
    onRetry: () => void view.query.refetch(),
  };
}

function MetricValue({
  value,
  unit,
  note,
  tone = "cyan",
}: {
  value: string;
  unit?: string;
  note: string;
  tone?: "cyan" | "amber" | "green" | "rose";
}) {
  const colors = {
    cyan: "from-cyan-200 to-cyan-400",
    amber: "from-amber-200 to-orange-400",
    green: "from-emerald-200 to-emerald-400",
    rose: "from-rose-200 to-rose-400",
  };
  return (
    <div>
      <p className={`bg-gradient-to-br ${colors[tone]} bg-clip-text font-mono text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl`}>
        {value}
        {unit && <span className="ml-2 text-base font-medium text-slate-400">{unit}</span>}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{note}</p>
    </div>
  );
}

function DetailButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
    >
      Explain
    </button>
  );
}

function oldestObservation(values: Array<string | undefined>): string | undefined {
  const parsed = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return parsed.length ? new Date(Math.min(...parsed)).toISOString() : undefined;
}

export function SolarPulse() {
  const isMobile = useIsMobile();
  const [mobileGroups, setMobileGroups] = useState<Set<SolarSourceGroup>>(
    () => new Set(["now"]),
  );
  const [desktopGroups, setDesktopGroups] = useState<Set<SolarSourceGroup>>(
    () => new Set(ALL_GROUPS),
  );
  const [mobileImagesOpen, setMobileImagesOpen] = useState(false);
  const [desktopImagesOpen, setDesktopImagesOpen] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const enabledGroups = useMemo(
    () => (isMobile ? mobileGroups : desktopGroups),
    [desktopGroups, isMobile, mobileGroups],
  );
  const model = useSolarModel({ enabledGroups });
  const { resources, current } = model;

  const toggleGroup = (group: SolarSourceGroup) => {
    const setter = isMobile ? setMobileGroups : setDesktopGroups;
    setter((existing) => {
      const next = new Set(existing);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      next.add("now");
      return next;
    });
  };

  const impactsOpen = enabledGroups.has("impacts");
  const forecastOpen = enabledGroups.has("forecast");
  const detailsOpen = enabledGroups.has("details");
  const imageryOpen = isMobile ? mobileImagesOpen : desktopImagesOpen;

  const guidanceInputs = [resources.flux, resources.kp, resources.magnetometer];
  const guidanceHasData = current.guidance.level !== "insufficient";
  const guidanceState: SolarWidgetState = !guidanceHasData
    ? guidanceInputs.some((resource) => resource.state === "loading")
      ? "loading"
      : "unavailable"
    : current.guidance.missing.length > 0 ||
        guidanceInputs.some((resource) => ["stale", "error", "unavailable"].includes(resource.state))
      ? "partial"
      : guidanceInputs.some((resource) => resource.state === "refreshing")
        ? "refreshing"
        : "fresh";
  const guidanceObservedAt = oldestObservation(
    guidanceInputs.map((resource) => resource.resource?.envelope.observedAt),
  );

  const maxDrapFrequency = useMemo(() => {
    const grid = resources.drap.data?.frequencies;
    if (!grid) return null;
    let maximum = -Infinity;
    for (const row of grid) for (const value of row) maximum = Math.max(maximum, value);
    return Number.isFinite(maximum) ? maximum : null;
  }, [resources.drap.data]);

  const refreshSummary = model.refreshResult.running
    ? "Refreshing every visible data feed…"
    : model.refreshResult.failed.length
      ? `${model.refreshResult.succeeded.length} refreshed · ${model.refreshResult.failed.length} could not refresh`
      : model.refreshResult.succeeded.length
        ? `${model.refreshResult.succeeded.length} sources refreshed`
        : "Refreshes visible structured feeds; imagery checks itself";

  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(68,221,255,0.08),transparent_32%),radial-gradient(circle_at_top_right,rgba(255,107,53,0.08),transparent_28%)] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-4 sm:space-y-6">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-5 shadow-xl shadow-black/20 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-orange-200">
                  Solar weather
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] ${
                    model.pageHealth === "healthy"
                      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
                      : model.pageHealth === "loading"
                        ? "border-slate-300/20 bg-slate-300/10 text-slate-300"
                        : "border-amber-300/20 bg-amber-300/10 text-amber-200"
                  }`}
                  role="status"
                >
                  {model.pageHealth === "healthy"
                    ? "All critical products current"
                    : model.pageHealth === "loading"
                      ? "Checking sources"
                      : model.pageHealth === "degraded"
                        ? `${model.degradedCritical.length} critical source${model.degradedCritical.length === 1 ? "" : "s"} stale`
                        : `${model.unavailableCritical.length} critical source${model.unavailableCritical.length === 1 ? "" : "s"} unavailable`}
                </span>
              </div>
              <h1 className="mt-4 font-orbitron text-3xl font-bold tracking-tight text-white sm:text-4xl">
                What the Sun is doing now
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
                Current observations, official forecasts, and global HF implications—with source age and uncertainty kept visible.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <p className="text-xs text-slate-500" role="status" aria-live="polite">{refreshSummary}</p>
              <button
                type="button"
                onClick={() => void model.refreshVisible()}
                disabled={model.refreshResult.running}
                className="min-h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15 disabled:cursor-wait disabled:opacity-60"
              >
                {model.refreshResult.running ? "Refreshing…" : "Refresh visible data feeds"}
              </button>
            </div>
          </div>
        </header>

        <section aria-labelledby="solar-now-heading">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Now</p>
              <h2 id="solar-now-heading" className="mt-1 font-orbitron text-xl font-bold text-white">Current global observations</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WidgetShell
              title="Planetary Kp"
              eyebrow="3-hour observed / estimated"
              {...sourceProps(resources.kp)}
              action={<DetailButton onClick={() => setModal({ kind: "metric", metric: "kp" })} />}
            >
              <MetricValue
                value={formatNumber(current.kp?.kp)}
                note={current.kp ? `${current.kp.kind === "observed" ? "Observed" : "Estimated"} planetary value for the interval ending ${formatUtc(current.kp.time_tag)}.` : "No current Kp interval."}
                tone={current.kp && current.kp.kp >= 5 ? "rose" : current.kp && current.kp.kp >= 4 ? "amber" : "green"}
              />
            </WidgetShell>
            <WidgetShell
              title="10.7 cm solar flux"
              eyebrow="Observed SFI"
              {...sourceProps(resources.flux)}
              action={<DetailButton onClick={() => setModal({ kind: "metric", metric: "sfi" })} />}
            >
              <MetricValue
                value={formatNumber(current.flux?.flux, 0)}
                unit="sfu"
                note="A global proxy for solar EUV output and ionospheric ionization—not a path forecast by itself."
                tone="amber"
              />
            </WidgetShell>
            <WidgetShell
              title="IMF Bz"
              eyebrow="Solar wind at L1"
              {...sourceProps(resources.magnetometer)}
              action={<DetailButton onClick={() => setModal({ kind: "metric", metric: "bz" })} />}
            >
              <MetricValue
                value={formatNumber(current.mag?.bz_gsm)}
                unit="nT"
                note={current.mag?.bz_gsm !== null && current.mag?.bz_gsm !== undefined && current.mag.bz_gsm < 0 ? "Southward Bz can increase geomagnetic coupling when sustained." : "Northward or near-neutral Bz is less favorable for strong coupling."}
                tone={current.mag?.bz_gsm !== null && current.mag?.bz_gsm !== undefined && current.mag.bz_gsm <= -8 ? "rose" : "cyan"}
              />
            </WidgetShell>
            <WidgetShell
              title="GOES long X-ray"
              eyebrow="Exact 0.1–0.8 nm channel"
              {...sourceProps(resources.xray)}
              action={<DetailButton onClick={() => setModal({ kind: "metric", metric: "xray" })} />}
            >
              <MetricValue
                value={current.xrayClass ?? "—"}
                note={current.xray ? `${current.xray.flux.toExponential(2)} W/m². Elevated flux can produce sunlit-side HF absorption.` : "No usable long-channel observation."}
                tone={current.xrayClass?.startsWith("M") || current.xrayClass?.startsWith("X") ? "rose" : "cyan"}
              />
            </WidgetShell>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
          <WidgetShell
            title="General HF guidance"
            eyebrow="Transparent global heuristic"
            state={guidanceState}
            observedAt={guidanceObservedAt}
            provider="NOAA SWPC inputs"
            hasData={guidanceHasData}
            partialMessage={
              current.guidance.missing.length > 0
                ? "One or more required inputs are unavailable; conclusions are intentionally limited."
                : "One or more inputs are delayed; conclusions are intentionally limited."
            }
          >
            <div className="flex h-full flex-col justify-between gap-5">
              <div>
                <p className="text-xl font-bold text-white">{current.guidance.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{current.guidance.summary}</p>
                <ul className="mt-4 space-y-2 text-sm text-slate-400">
                  {current.guidance.evidence.map((item) => (
                    <li key={item} className="flex gap-2"><span className="text-cyan-300" aria-hidden="true">•</span>{item}</li>
                  ))}
                </ul>
                {current.guidance.missing.length > 0 && (
                  <p className="mt-3 text-xs text-amber-200">Missing: {current.guidance.missing.join(", ")}.</p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-400">
                This is general context, not a confidence score or station-to-station forecast.
                <Link to="/map" className="ml-1 rounded font-semibold text-cyan-300 underline decoration-cyan-300/30 underline-offset-2 hover:text-cyan-200">
                  Open PropSphere for path-aware analysis.
                </Link>
              </div>
            </div>
          </WidgetShell>

          <WidgetShell title="Official NOAA scales" eyebrow="Current R / S / G snapshot" {...sourceProps(resources.scales)}>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["R", "Radio blackout", resources.scales.data?.radio_blackout],
                ["S", "Radiation storm", resources.scales.data?.solar_radiation],
                ["G", "Geomagnetic", resources.scales.data?.geomagnetic_storm],
              ].map(([code, label, value]) => {
                const scale = value as { scale: number | null; text: string | null } | undefined;
                return (
                  <div key={String(code)} className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                    <p className="text-xs font-bold text-slate-500">{String(label)}</p>
                    <p className="mt-2 font-mono text-2xl font-bold text-white">{scale?.scale === null || scale?.scale === undefined ? "—" : `${code}${scale.scale}`}</p>
                    <p className="mt-1 min-h-5 text-xs text-slate-400">{scale?.text ?? "Not reported"}</p>
                  </div>
                );
              })}
            </div>
          </WidgetShell>
        </div>

        <WidgetShell
          title="Recent official SWPC bulletins"
          eyebrow="Alerts, watches, warnings, and summaries"
          {...sourceProps(resources.alerts)}
          hasData={resources.alerts.state === "empty" || hasData(resources.alerts)}
        >
          {resources.alerts.data?.length ? (
            <div className="divide-y divide-white/[0.07]">
              {resources.alerts.data.slice(0, 5).map((alert) => (
                <button
                  type="button"
                  key={`${alert.product_id}-${alert.issued_at}`}
                  onClick={() => setModal({ kind: "alert", alert })}
                  className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left hover:text-white"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-200">{alert.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{formatUtc(alert.issued_at)} · {alert.product_id}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold capitalize text-cyan-300">{alert.severity}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
              No recent bulletins were reported in the current successful response.
            </p>
          )}
        </WidgetShell>

        <SolarDisclosure
          id="solar-impacts"
          title="Impacts"
          summary="Radiation, geomagnetic, absorption, and CME indicators"
          open={impactsOpen}
          onToggle={() => toggleGroup("impacts")}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <WidgetShell title=">=10 MeV proton flux" eyebrow="Exact NOAA S-scale channel" {...sourceProps(resources.protons)}>
              <MetricValue
                value={formatNumber(current.proton?.flux, 2)}
                unit="pfu"
                note={`${current.protonScale}. NOAA S-scale thresholds are applied only to the validated >=10 MeV channel.`}
                tone={current.proton && current.proton.flux >= 10 ? "rose" : "green"}
              />
            </WidgetShell>
            <WidgetShell title="Dst index" eyebrow="Geomagnetic storm intensity" {...sourceProps(resources.dst)}>
              <MetricValue
                value={formatNumber(current.dst?.dst, 0)}
                unit="nT"
                note="More-negative Dst indicates a stronger ring current; values below −50 nT suggest storm conditions."
                tone={current.dst && current.dst.dst <= -50 ? "rose" : "cyan"}
              />
            </WidgetShell>
            <WidgetShell title="Latest classified flare" eyebrow="GOES event record" {...sourceProps(resources.latestFlare)}>
              <MetricValue
                value={resources.latestFlare.data?.max_class || "—"}
                note={resources.latestFlare.data ? `Peak at ${formatUtc(resources.latestFlare.data.max_time)}; current classification ${resources.latestFlare.data.current_class}.` : "No latest flare record is usable."}
                tone={resources.latestFlare.data?.max_class.startsWith("M") || resources.latestFlare.data?.max_class.startsWith("X") ? "rose" : "cyan"}
              />
            </WidgetShell>
            <WidgetShell title="D-RAP grid" eyebrow="HF absorption model" {...sourceProps(resources.drap)}>
              <MetricValue
                value={formatNumber(maxDrapFrequency, 1)}
                unit="MHz max"
                note="Highest modeled affected frequency anywhere on the current global grid; inspect imagery for location."
                tone={maxDrapFrequency && maxDrapFrequency >= 10 ? "rose" : "amber"}
              />
            </WidgetShell>
          </div>
          <WidgetShell title="Recent CME analyses" eyebrow="NASA DONKI · current event set" {...sourceProps(resources.cme)} className="mt-3">
            {resources.cme.data?.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {resources.cme.data.slice(-6).reverse().map((event) => (
                  <a key={`${event.time21_5}-${event.link}`} href={event.link} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-black/20 p-3 hover:bg-white/[0.04]">
                    <p className="font-mono text-sm font-semibold text-white">{event.speed.toFixed(0)} km/s</p>
                    <p className="mt-1 text-xs text-slate-400">{formatUtc(event.time21_5)} · half-angle {event.halfAngle.toFixed(0)}°</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{event.note || "No analyst note supplied."}</p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No CME analyses were returned in the current event window.</p>
            )}
          </WidgetShell>
        </SolarDisclosure>

        <SolarDisclosure
          id="solar-forecast"
          title="Official forecast"
          summary="NOAA predicted Kp, solar flux, planetary A, and event probabilities"
          open={forecastOpen}
          onToggle={() => toggleGroup("forecast")}
        >
          <div className="grid gap-3 xl:grid-cols-[1.4fr_.6fr]">
            <WidgetShell title="Planetary Kp timeline" eyebrow="Three-hour grain · observed and official prediction" {...sourceProps(resources.kp)}>
              <SolarSeriesChart
                points={(resources.kp.data ?? []).map((point) => ({ timestamp: point.time_tag, value: point.kp, kind: point.kind }))}
                label="Planetary Kp observed, estimated, and predicted three-hour intervals"
                unit="Kp"
                min={0}
                max={9}
              />
            </WidgetShell>
            <WidgetShell title="One-day event probabilities" eyebrow="Official NOAA forecast" {...sourceProps(resources.probabilities)}>
              {resources.probabilities.data && (
                <div className="space-y-3">
                  {[
                    ["C-class flare", resources.probabilities.data.c_class],
                    ["M-class flare", resources.probabilities.data.m_class],
                    ["X-class flare", resources.probabilities.data.x_class],
                    [">=10 MeV proton event", resources.probabilities.data.proton_10mev],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <div className="flex justify-between text-xs"><span className="text-slate-400">{label}</span><span className="font-mono text-white">{value}%</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300" style={{ width: `${value}%` }} /></div>
                    </div>
                  ))}
                  <p className="border-t border-white/[0.07] pt-3 text-xs text-slate-500">Issued {formatUtc(resources.probabilities.data.issue_time)} · one-day horizon.</p>
                </div>
              )}
            </WidgetShell>
          </div>
          <WidgetShell title="Three-day solar / geomagnetic prediction" eyebrow="Official NOAA forecast product" {...sourceProps(resources.forecast)} className="mt-3">
            {resources.forecast.data && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <caption className="sr-only">NOAA three-day predicted 10.7 cm solar flux and planetary A index</caption>
                  <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Forecast date</th><th className="pb-3">Predicted SFI</th><th className="pb-3">Predicted planetary A</th></tr></thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {resources.forecast.data.forecast.map((day) => (
                      <tr key={day.date}><td className="py-3 text-slate-200">{new Date(day.date).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}</td><td className="py-3 font-mono text-cyan-200">{day.predicted_flux} sfu</td><td className="py-3 font-mono text-amber-200">{day.predicted_planetary_a}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">Issued {formatUtc(resources.forecast.data.issued_at)}. These are official forecast values, distinct from current observations.</p>
              </div>
            )}
          </WidgetShell>
        </SolarDisclosure>

        <SolarDisclosure
          id="solar-details"
          title="Details and history"
          summary="Chronological trends, solar cycle context, and independent wind products"
          open={detailsOpen}
          onToggle={() => toggleGroup("details")}
        >
          <div className="grid gap-3 xl:grid-cols-2">
            <WidgetShell title="Observed solar flux history" eyebrow="Chronological 2.8 GHz observations" {...sourceProps(resources.flux)}>
              <SolarSeriesChart points={(resources.flux.data ?? []).map((point: SolarFluxPoint) => ({ timestamp: point.time_tag, value: point.flux }))} label="Observed 10.7 centimetre solar flux history" unit="sfu" />
            </WidgetShell>
            <WidgetShell title="IMF Bz history" eyebrow="True latest-hour window" {...sourceProps(resources.magnetometer)}>
              <SolarSeriesChart points={(resources.magnetometer.data ?? []).filter((point) => point.bz_gsm !== null).map((point) => ({ timestamp: point.time_tag, value: point.bz_gsm! }))} label="Interplanetary magnetic field Bz over the latest hour" unit="nT" />
            </WidgetShell>
            <WidgetShell title="Solar cycle context" eyebrow="Monthly observed sunspot number" {...sourceProps(resources.sunspots)}>
              <MetricValue
                value={formatNumber(current.sunspot?.ssn, 1)}
                note={current.sunspot ? `Observed monthly SSN for ${new Date(`${current.sunspot.time_tag}-01T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", month: "long", year: "numeric" })}. Comparisons use the same monthly product.` : "No current monthly sunspot observation."}
                tone="amber"
              />
              <div className="mt-4"><SolarSeriesChart points={(resources.sunspots.data ?? []).map((point) => ({ timestamp: `${point.time_tag}-01T00:00:00Z`, value: point.ssn }))} label="Monthly observed sunspot number" unit="SSN" height={140} /></div>
            </WidgetShell>
            <div className="grid gap-3 sm:grid-cols-2">
              <WidgetShell title="Solar-wind magnetic summary" eyebrow="Independent NOAA summary" {...sourceProps(resources.windMag)}>
                <MetricValue value={formatNumber(resources.windMag.data?.at(-1)?.bz_gsm)} unit="nT Bz" note="A compact current summary; failure does not hide the independent speed product." tone="cyan" />
              </WidgetShell>
              <WidgetShell title="Solar-wind speed summary" eyebrow="Independent NOAA summary" {...sourceProps(resources.windPlasma)}>
                <MetricValue value={formatNumber(current.plasma?.speed, 0)} unit="km/s" note="Compact current speed summary. Magnetic-product failure is isolated." tone="green" />
              </WidgetShell>
            </div>
          </div>
        </SolarDisclosure>

        <SolarDisclosure
          id="solar-imagery"
          title="Imagery"
          summary="Cache-stable scientific maps with complete legends and recoverable timelines"
          open={imageryOpen}
          onToggle={() =>
            isMobile
              ? setMobileImagesOpen((value) => !value)
              : setDesktopImagesOpen((value) => !value)
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {imageProducts.map((productId) => (
              <SolarImageCard
                key={productId}
                productId={productId}
                onOpen={(selected, animation) =>
                  setModal({ kind: animation ? "animation" : "image", productId: selected })
                }
              />
            ))}
          </div>
        </SolarDisclosure>

        <footer className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4 text-xs leading-5 text-slate-500">
          Measurements and official forecasts are supplied by NOAA SWPC, NASA SDO, NASA DONKI, and Kyoto WDC products. “Observed,” “estimated,” “predicted,” and “general guidance” are deliberately kept distinct throughout this page.
        </footer>
      </div>

      <SolarModalHost modal={modal} onClose={() => setModal(null)} />
    </main>
  );
}

function SolarModalHost({ modal, onClose }: { modal: ModalState; onClose: () => void }) {
  if (!modal) return null;
  if (modal.kind === "alert") {
    return (
      <AccessibleDialog open onClose={onClose} title={modal.alert.title} description={`Official SWPC ${modal.alert.severity} · issued ${formatUtc(modal.alert.issued_at)}`} size="lg">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-300">{modal.alert.message}</pre>
      </AccessibleDialog>
    );
  }
  if (modal.kind === "metric") {
    const content = {
      kp: ["Planetary Kp", "NOAA’s official three-hour product separates observed, estimated, and predicted intervals. Kp 5 or higher corresponds to geomagnetic storm levels; a minute estimate is never relabeled as a three-hour forecast."],
      sfi: ["10.7 cm solar flux", "Observed 2.8 GHz radio flux is a broad proxy for solar EUV output. It helps describe global ionization, but station, target, path, band, season, and local time are still required for a path forecast."],
      bz: ["Interplanetary magnetic field Bz", "Southward Bz can couple more efficiently with Earth’s magnetic field. A brief negative sample is context—not a forecast—and By/Bt gaps do not erase a usable Bz observation."],
      xray: ["GOES long X-ray channel", "Radio-blackout context uses the exact 0.1–0.8 nm channel. C, M, and X classifications are derived from that validated channel; a missing channel remains unavailable rather than becoming zero."],
    } as const;
    return (
      <AccessibleDialog open onClose={onClose} title={content[modal.metric][0]} description="How this observation is selected and how to interpret it" size="md">
        <p className="text-sm leading-7 text-slate-300">{content[modal.metric][1]}</p>
      </AccessibleDialog>
    );
  }
  const product = SOLAR_IMAGE_PRODUCTS[modal.productId];
  if (modal.kind === "animation" && product.animation) {
    return (
      <AccessibleDialog open onClose={onClose} title={`${product.title} timeline`} description={`${product.description} Frames load only while this dialog is open.`} size="xl">
        <Suspense fallback={<p role="status" className="py-12 text-center text-sm text-slate-400">Loading timeline controls…</p>}>
          <SolarAnimationPlayer animationId={product.animation} thumbnailProductId={modal.productId} alt={product.alt} />
        </Suspense>
      </AccessibleDialog>
    );
  }
  return (
    <AccessibleDialog open onClose={onClose} title={product.title} description={product.description} size="xl">
      <SolarImageDetail productId={modal.productId} />
    </AccessibleDialog>
  );
}

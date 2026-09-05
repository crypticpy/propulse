import { parseUtcInstant } from "@/lib/solar/normalization";
import { lazy, Suspense, useMemo, useState } from "react";
import { AccessibleDialog } from "@/components/ui";
import { SolarBriefingCard } from "@/components/solar/SolarBriefingCard";
import { SolarOperatingActions } from "@/components/solar/SolarOperatingActions";
import { useSolarDisclosureState } from "@/hooks/useSolarDisclosureState";
import { SolarDisclosure } from "@/components/solar/SolarDisclosure";
import { SolarImageCard } from "@/components/solar/SolarImageCard";
import { SolarImageDetail } from "@/components/solar/SolarImageDetail";
import type { SolarSeriesChartProps } from "@/components/solar/SolarSeriesChart";
const Chart = lazy(() => import("@/components/solar/SolarSeriesChart").then((module) => ({ default: module.SolarSeriesChart })));
function SolarSeriesChart(props: SolarSeriesChartProps) {
  return <Suspense fallback={<p role="status" className="py-8 text-sm text-slate-400">Loading chart…</p>}><Chart {...props} /></Suspense>;
}
import { WidgetShell } from "@/components/solar/WidgetShell";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useSolarModel,
  type SolarResourceView,
} from "@/hooks/useSolarModel";
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

const imageProducts = Object.keys(SOLAR_IMAGE_PRODUCTS) as SolarImageProductId[];

function formatNumber(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function formatUtc(value: string): string {
  return new Date(parseUtcInstant(value) ?? NaN).toLocaleString(undefined, {
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
    cyan: "text-cyan-200",
    amber: "text-amber-200",
    green: "text-emerald-200",
    rose: "text-rose-200",
  };
  return (
    <div>
      <p className={`${colors[tone]} font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl`}>
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

export function SolarPulse() {
  const isMobile = useIsMobile();
  const wideBriefing = !useIsMobile(1280);
  const { open: openSections, toggle: toggleGroup } = useSolarDisclosureState(isMobile);
  const [modal, setModal] = useState<ModalState>(null);
  const [allBulletins, setAllBulletins] = useState(false);
  const enabledGroups = useMemo(() => new Set<SolarSourceGroup>(["now", ...openSections.filter((s): s is Exclude<SolarSourceGroup, "now"> => s !== "imagery")]), [openSections]);
  const model = useSolarModel({ enabledGroups });
  const { resources, current } = model;

  const impactsOpen = enabledGroups.has("impacts");
  const forecastOpen = enabledGroups.has("forecast");
  const detailsOpen = enabledGroups.has("details");
  const imageryOpen = openSections.includes("imagery");

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
        : "Visible sections refresh together; images update separately";

  return (
    <main className="min-h-full bg-deep-space px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-4 sm:space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div><h1 className="font-orbitron text-2xl font-bold text-white">Solar Pulse</h1><p className="mt-1 text-sm text-slate-400">Space weather for your next session</p></div>
          <div className="max-w-md text-xs text-slate-400">
            <button type="button" onClick={() => void model.refreshVisible()} disabled={model.refreshResult.running} className="min-h-11 rounded-lg border border-white/10 px-4 text-sm text-cyan-200 hover:bg-white/5 disabled:opacity-60">{model.refreshResult.running ? "Refreshing…" : "Refresh"}</button>
            <p role="status" className="mt-1">{model.pageHealth === "healthy" ? "Visible critical sources current" : model.pageHealth === "loading" ? "Checking sources" : "Some visible sources are delayed or unavailable"}</p><p className="mt-1">{refreshSummary}</p>
          </div>
        </header>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <SolarBriefingCard briefing={model.briefing} scales={resources.scales.data}>
            <SolarOperatingActions />
          </SolarBriefingCard>
          {wideBriefing && <div className="max-w-sm"><SolarImageCard productId="sunspot-hmi" onOpen={(productId) => setModal({ kind: "image", productId })} /><p className="mt-2 text-xs leading-5 text-slate-400">Visible sunspots on the full solar disk. Inspect solar history below for longer-term context.</p></div>}
        </div>

        <section aria-labelledby="solar-now-heading">
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Now</p>
              <h2 id="solar-now-heading" className="mt-1 font-orbitron text-xl font-bold text-white">Key readings</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WidgetShell compact
              title="Planetary Kp"
              eyebrow="3-hour observed / estimated"
              {...sourceProps(resources.kp)}
              action={<DetailButton onClick={() => setModal({ kind: "metric", metric: "kp" })} />}
            >
              <MetricValue
                value={formatNumber(current.kp?.kp)}
                note={current.kp ? `${current.kp.kind === "observed" ? "Observed" : "Estimated"} planetary value for the interval starting ${formatUtc(current.kp.time_tag)}.` : "No current Kp interval."}
                tone={current.kp && current.kp.kp >= 5 ? "rose" : current.kp && current.kp.kp >= 4 ? "amber" : "green"}
              />
            </WidgetShell>
            <WidgetShell compact
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
            <WidgetShell compact
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
            <WidgetShell compact
              title="GOES long X-ray"
              eyebrow="Solar flare activity"
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

        <section aria-label="What changed" className="border-y border-white/10 py-4">
          <h2 className="text-sm font-semibold text-white">What changed</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {model.trends.map((trend) => <div key={trend.sourceId} className="text-xs leading-5 text-slate-400"><p className="font-semibold text-slate-200">{trend.label} · {trend.summary}</p>{trend.from && trend.to && <p>{formatUtc(trend.from)} → {formatUtc(trend.to)}</p>}{trend.delayed && <p className="text-amber-200">Delayed observations</p>}</div>)}
          </div>
        </section>

        <SolarDisclosure
          id="solar-forecast"
          title="Official forecast"
          summary="NOAA predicted Kp, solar flux, planetary A, and event probabilities"
          open={forecastOpen}
          onToggle={() => toggleGroup("forecast")}
        >
          <div className="grid gap-3 xl:grid-cols-[1.4fr_.6fr]">
            <WidgetShell title="Planetary Kp timeline" eyebrow="Three-hour intervals · observed, estimated, predicted" {...sourceProps(resources.kp)} timestampLabel="Checked" observedAt={resources.kp.resource?.envelope.fetchedAt}>
              {current.predictedKp.length > 0 && <p className="mb-4 text-sm leading-6 text-slate-300">Official predicted Kp spans {formatUtc(current.predictedKp[0].time_tag)} to {formatUtc(new Date((parseUtcInstant(current.predictedKp[current.predictedKp.length - 1].time_tag) ?? 0) + 10_800_000).toISOString())}. {current.predictedKp.some((p) => p.kp >= 5) ? "Some predicted intervals reach the geomagnetic storm range; inspect their times below." : "No supplied predicted interval reaches Kp 5."} This describes the supplied forecast horizon, not conditions beyond it.</p>}
              <SolarSeriesChart
                points={(resources.kp.data ?? []).map((point) => ({ timestamp: point.time_tag, value: point.kp, kind: point.kind }))}
                label="Planetary Kp observed, estimated, and predicted three-hour intervals"
                unit="Kp"
                intervalMs={10_800_000}
                maxGapMs={10_800_000}
                thresholds={[{ value: 5, label: "Storm range" }]}
                min={0}
                max={9}
              />
            </WidgetShell>
            <WidgetShell title="One-day event probabilities" timestampLabel="Issued" eyebrow="Official NOAA forecast" {...sourceProps(resources.probabilities)} state={current.probabilityWindowEnded ? "stale" : resources.probabilities.state} staleMessage={current.probabilityWindowEnded ? "This forecast's one-day window has ended. These are the previous issue's probabilities; waiting for a newer NOAA forecast." : undefined}>
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
                  <p className="border-t border-white/[0.07] pt-3 text-xs text-slate-400">Issued {formatUtc(resources.probabilities.data.issue_time)} · one-day horizon.</p>
                </div>
              )}
            </WidgetShell>
          </div>
          <WidgetShell title="Three-day outlook" timestampLabel="Issued" eyebrow="Official NOAA forecast" {...sourceProps(resources.forecast)} className="mt-3">
            {resources.forecast.data && (
              <div className="grid gap-3 sm:grid-cols-3">
                {resources.forecast.data.forecast.map((day) => <article key={day.date} className="rounded-xl border border-white/10 bg-black/15 p-4">
                  <h3 className="text-sm font-semibold text-white">{new Date(day.date).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}</h3>
                  <p className="mt-3 text-xs text-slate-400">Predicted SFI <strong className="block font-mono text-xl text-cyan-200">{day.predicted_flux} sfu</strong></p>
                  <p className="mt-2 text-xs text-slate-400">Predicted planetary A <strong className="font-mono text-base text-amber-200">{day.predicted_planetary_a}</strong></p>
                  <p className="mt-2 text-xs text-slate-400">Valid {day.date.slice(0, 10)} UTC · full day</p>
                  <SolarOperatingActions compact at={`${day.date.slice(0, 10)}T12:00:00Z`} />
                </article>)}
                <p className="text-xs text-slate-400 sm:col-span-3">Issued {formatUtc(resources.forecast.data.issued_at)}. Planning opens this UTC day at 12:00; these global values do not predict a contact.</p>
              </div>
            )}
          </WidgetShell>
        </SolarDisclosure>

        <WidgetShell
          title="Recent official SWPC bulletins"
          eyebrow="Alerts, watches, warnings, and summaries"
          {...sourceProps(resources.alerts)}
          timestampLabel="Issued"
          hasData={resources.alerts.state === "empty" || hasData(resources.alerts)}
        >
          {resources.alerts.data?.length ? (
            <div className="divide-y divide-white/[0.07]"><p className="pb-3 text-xs text-slate-400">Recent messages may include ended events. Open the full bulletin for validity and cancellation details.</p>
              {resources.alerts.data.slice(0, allBulletins ? undefined : 3).map((alert) => (
                <button
                  type="button"
                  key={`${alert.product_id}-${alert.issued_at}`}
                  onClick={() => setModal({ kind: "alert", alert })}
                  className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left hover:text-white"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-200">{alert.title}</span>
                    <span className="mt-1 block text-xs text-slate-400">{formatUtc(alert.issued_at)} · {alert.product_id}</span>
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

        {resources.alerts.data && resources.alerts.data.length > 3 && <button type="button" onClick={() => setAllBulletins(!allBulletins)} aria-expanded={allBulletins} className="min-h-11 rounded-lg border border-white/10 px-4 text-sm text-cyan-200">{allBulletins ? "Show recent three" : `Show all ${resources.alerts.data.length} bulletins`}</button>}

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
                note={`${current.protonScale}. Energetic protons can increase absorption along polar HF paths.`}
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
          {!isMobile && <div className="mt-4 grid gap-3 md:grid-cols-2">{(["drap-global", "aurora-north"] as SolarImageProductId[]).map((productId) => <div key={productId}><p className="mb-2 text-sm text-slate-300">{productId === "drap-global" ? "Sunlit-side absorption: inspect where the model places HF effects. The global maximum is not a local tuning recommendation." : "Polar context: auroral probability is not an HF path forecast. This product covers the Northern Hemisphere."}</p><SolarImageCard productId={productId} onOpen={(selected, animation) => setModal({ kind: animation ? "animation" : "image", productId: selected })} /></div>)}</div>}
          <WidgetShell title="Recent CME analyses" eyebrow="NASA DONKI · current event set" {...sourceProps(resources.cme)} className="mt-3">
            {resources.cme.data?.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {resources.cme.data.slice(-6).reverse().map((event) => (
                  <a key={`${event.time21_5}-${event.link}`} href={event.link} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-black/20 p-3 hover:bg-white/[0.04]">
                    <p className="font-mono text-sm font-semibold text-white">{event.speed.toFixed(0)} km/s</p>
                    <p className="mt-1 text-xs text-slate-400">{formatUtc(event.time21_5)} · half-angle {event.halfAngle.toFixed(0)}°</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{event.note || "No analyst note supplied."}</p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No CME analyses were returned in the current event window.</p>
            )}
          </WidgetShell>
        </SolarDisclosure>

        <SolarDisclosure
          id="solar-details"
          title="Details and history"
          summary="Explore solar history, the solar cycle, and the wind approaching Earth"
          open={detailsOpen}
          onToggle={() => toggleGroup("details")}
        >
          <div className="grid gap-3 xl:grid-cols-2">
            <WidgetShell title="X-ray history" eyebrow="Flare activity · 0.1–0.8 nm" {...sourceProps(resources.xray)}>
              <SolarSeriesChart points={(resources.xray.data ?? []).map((p) => ({ timestamp: p.time_tag, value: p.flux }))} label="GOES X-ray flux" unit="W/m²" scale="log" min={1e-8} max={1e-3} maxGapMs={5 * 60_000} thresholds={[{ value: 1e-7, label: "B" }, { value: 1e-6, label: "C" }, { value: 1e-5, label: "M" }, { value: 1e-4, label: "X" }]} />
            </WidgetShell>
            <WidgetShell title="Observed solar flux history" eyebrow="Measured ionization proxy" {...sourceProps(resources.flux)}>
              <SolarSeriesChart points={(resources.flux.data ?? []).map((point: SolarFluxPoint) => ({ timestamp: point.time_tag, value: point.flux }))} label="Observed 10.7 centimetre solar flux history" unit="sfu" maxGapMs={36 * 3_600_000} />
            </WidgetShell>
            <WidgetShell title="IMF Bz history" eyebrow="Northward and southward magnetic orientation" {...sourceProps(resources.magnetometer)}>
              <SolarSeriesChart points={(resources.magnetometer.data ?? []).filter((point) => point.bz_gsm !== null).map((point) => ({ timestamp: point.time_tag, value: point.bz_gsm! }))} label="Interplanetary magnetic field Bz over the latest hour" unit="nT" min={0} max={0} maxGapMs={5 * 60_000} />
            </WidgetShell>
            <WidgetShell title="Solar cycle context" eyebrow="Monthly observed sunspot number" {...sourceProps(resources.sunspots)}>
              <MetricValue
                value={formatNumber(current.sunspot?.ssn, 1)}
                note={current.sunspot ? `Observed monthly SSN for ${new Date(`${current.sunspot.time_tag}-01T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", month: "long", year: "numeric" })}. Explore the monthly trend below.` : "No current monthly sunspot observation."}
                tone="amber"
              />
              <div className="mt-4"><SolarSeriesChart points={(resources.sunspots.data ?? []).map((point) => ({ timestamp: `${point.time_tag}-01T00:00:00Z`, value: point.ssn }))} label="Monthly observed sunspot number" unit="SSN" maxGapMs={45 * 86_400_000} height={220} /></div>
            </WidgetShell>
            <div className="grid gap-3 sm:grid-cols-2">
              <WidgetShell title="Solar-wind magnetic field" eyebrow="IMF at L1" {...sourceProps(resources.windMag)}>
                <MetricValue value={formatNumber(resources.windMag.data?.at(-1)?.bz_gsm)} unit="nT Bz" note="Magnetic orientation influences how solar wind couples to Earth. Compare its time with the Bz history." tone="cyan" />
              </WidgetShell>
              <WidgetShell title="Solar-wind speed" eyebrow="Plasma at L1" {...sourceProps(resources.windPlasma)}>
                <MetricValue value={formatNumber(current.plasma?.speed, 0)} unit="km/s" note="Speed describes incoming solar wind. Its effect also depends on magnetic orientation and density." tone="green" />
              </WidgetShell>
            </div>
          </div>
        </SolarDisclosure>

        <SolarDisclosure
          id="solar-imagery"
          title="Imagery"
          summary="Explore absorption, aurora, and the visible Sun"
          open={imageryOpen}
          onToggle={() => toggleGroup("imagery")}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {imageProducts.filter((id) => isMobile || ((!wideBriefing || id !== "sunspot-hmi") && (!impactsOpen || !["drap-global", "aurora-north"].includes(id)))).map((productId) => (
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

        <footer className="rounded-2xl border border-white/10 bg-black/15 px-5 py-4 text-xs leading-5 text-slate-400">
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
      kp: ["Planetary Kp", "Kp describes planetary geomagnetic activity in three-hour intervals. Kp 5 or higher reaches the storm range; high-latitude paths may be affected. Compare observed, estimated, and predicted intervals in the outlook, then inspect your path in PropSphere."],
      sfi: ["10.7 cm solar flux", "Observed 2.8 GHz radio flux is a broad proxy for solar EUV output. It helps describe global ionization, but station, target, path, band, season, and local time are still required for a path forecast."],
      bz: ["Interplanetary magnetic field Bz", "Southward Bz can couple more efficiently with Earth’s magnetic field when sustained. A brief negative sample does not establish a storm. Inspect the Bz history and official geomagnetic indicators to understand how conditions are evolving."],
      xray: ["GOES long X-ray channel", "This GOES channel measures solar X-rays at 0.1–0.8 nm. M- and X-class activity can increase absorption on the sunlit side of Earth. Inspect the X-ray history and D-RAP map, then evaluate the illumination and frequency of your own path."],
    } as const;
    return (
      <AccessibleDialog open onClose={onClose} title={content[modal.metric][0]} description="What it means for radio and what to check next" size="md">
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

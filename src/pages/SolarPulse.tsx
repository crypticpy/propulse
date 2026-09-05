import { formatUtc, hasData, sourceProps } from "@/components/solar/presentation";
import { lazy, Suspense, useMemo, useState } from "react";
import { AccessibleDialog } from "@/components/ui";
import { SolarBriefingCard } from "@/components/solar/SolarBriefingCard";
import { SolarOperatingActions } from "@/components/solar/SolarOperatingActions";
import { useSolarDisclosureState } from "@/hooks/useSolarDisclosureState";
import { SolarDisclosure } from "@/components/solar/SolarDisclosure";
import { SolarImageCard } from "@/components/solar/SolarImageCard";
import { SolarImageDetail } from "@/components/solar/SolarImageDetail";
import type { SolarMiniChartProps } from "@/components/solar/SolarMiniChart";
import type { SolarSeriesChartProps } from "@/components/solar/SolarSeriesChart";
const MiniChart = lazy(() => import("@/components/solar/SolarMiniChart").then(module => ({ default: module.SolarMiniChart })));
function SolarMiniChart(props: SolarMiniChartProps) {
  return <Suspense fallback={null}><MiniChart {...props} /></Suspense>;
}
const Chart = lazy(() => import("@/components/solar/SolarSeriesChart").then((module) => ({ default: module.SolarSeriesChart })));
function SolarSeriesChart(props: SolarSeriesChartProps) {
  return <Suspense fallback={<p role="status" className="py-8 text-sm text-slate-400">Loading chart…</p>}><Chart {...props} /></Suspense>;
}
import { WidgetShell } from "@/components/solar/WidgetShell";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useSolarModel,
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
  type SolarSourceGroup,
} from "@/lib/solar/sourcePolicies";

const SolarForecastPanel = lazy(() => import("@/components/solar/SolarForecastPanel").then(module => ({ default: module.SolarForecastPanel })));

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
        : "";

  return (
    <main className="min-h-full bg-deep-space px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-4 sm:space-y-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 pb-4 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div><h1 className="font-orbitron text-2xl font-bold text-white">Solar Pulse</h1><p className="mt-1 text-sm text-slate-400">Space weather for your next session</p></div>
          <div role="status" className="order-last col-span-2 text-xs text-slate-400 md:order-none md:col-span-1 md:px-3 md:text-right">
            <p>{model.pageHealth === "healthy" ? "Core readings up to date" : model.pageHealth === "loading" ? "Checking space-weather updates" : "Some readings are delayed · see the briefing below"}</p>
            {refreshSummary && <p className="mt-1">{refreshSummary}</p>}
          </div>
          <div className="group relative justify-self-end">
            <button type="button" aria-describedby="solar-refresh-help" onClick={() => void model.refreshVisible()} disabled={model.refreshResult.running} className="min-h-11 rounded-lg border border-white/10 px-4 text-sm text-cyan-200 hover:bg-white/5 disabled:opacity-60">{model.refreshResult.running ? "Refreshing…" : "Refresh"}</button>
            <p id="solar-refresh-help" role="tooltip" className="absolute right-0 top-full z-20 mt-2 hidden w-64 rounded-xl border border-white/15 bg-panel p-3 text-xs leading-5 text-slate-200 shadow-xl group-hover:block group-focus-within:block">Refreshes data in the open sections. Images update on their own schedule.</p>
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
              eyebrow={current.kp ? `${current.kp.kind === "estimated" ? "Estimated" : "Observed"} · 3-hour Kp` : "3-hour observed / estimated"}
              {...sourceProps(resources.kp)}
              action={<DetailButton onClick={() => setModal({ kind: "metric", metric: "kp" })} />}
            >
              <MetricValue
                value={formatNumber(current.kp?.kp)}
                note="Measures geomagnetic disturbance over three hours. Storm-range readings can signal disruption on high-latitude HF paths."
                tone={current.kp && current.kp.kp >= 5 ? "rose" : current.kp && current.kp.kp >= 4 ? "amber" : "green"}
              />
              {!isMobile && <SolarMiniChart label="Recent Kp intervals" points={(resources.kp.data ?? []).filter(p => p.kind !== "predicted").map(p => ({ timestamp: p.time_tag, value: p.kp, kind: p.kind }))} unit="Kp" min={0} max={9} intervalMs={10_800_000} maxGapMs={10_800_000} />}
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
                note="Tracks solar activity that supports ionization. Combine it with your path and time when choosing a band."
                tone="amber"
              />
              {!isMobile && <SolarMiniChart label="Recent solar flux" points={(resources.flux.data ?? []).map(p => ({ timestamp: p.time_tag, value: p.flux }))} unit="sfu" maxGapMs={129_600_000} />}
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
                note={current.mag?.bz_gsm !== null && current.mag?.bz_gsm !== undefined && current.mag.bz_gsm < 0 ? "Sustained southward Bz can drive geomagnetic disturbance. Watch the trend and check Kp." : "Northward or near-neutral Bz is less likely to drive geomagnetic disturbance."}
                tone={current.mag?.bz_gsm !== null && current.mag?.bz_gsm !== undefined && current.mag.bz_gsm <= -8 ? "rose" : "cyan"}
              />
              {!isMobile && <SolarMiniChart label="Recent Bz orientation" points={(resources.magnetometer.data ?? []).filter(p => p.bz_gsm !== null).map(p => ({ timestamp: p.time_tag, value: p.bz_gsm! }))} unit="nT" maxGapMs={300_000} />}
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
              {!isMobile && <SolarMiniChart label="Recent X-ray flux" points={(resources.xray.data ?? []).map(p => ({ timestamp: p.time_tag, value: p.flux }))} unit="W/m²" logarithmic maxGapMs={300_000} />}
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
          <Suspense fallback={<p role="status" className="py-8 text-sm text-slate-400">Loading forecast…</p>}>
            <SolarForecastPanel resources={resources} current={current} />
          </Suspense>
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

import { SolarMiniChart } from "./SolarMiniChart";
import { parseUtcInstant } from "@/lib/solar/normalization";
import type { useSolarModel } from "@/hooks/useSolarModel";
import { WidgetShell } from "./WidgetShell";
import { SolarSeriesChart } from "./SolarSeriesChart";
import { SolarOperatingActions } from "./SolarOperatingActions";
import { sourceProps, formatUtc } from "./presentation";

type Model = ReturnType<typeof useSolarModel>;
export function SolarForecastPanel({ resources, current }: Pick<Model, "resources" | "current">) {
  return <>
          <div className="grid items-start gap-3 xl:grid-cols-[3fr_2fr]">
            <WidgetShell title="Planetary Kp timeline" eyebrow="Three-hour intervals · observed, estimated, predicted" {...sourceProps(resources.kp)} timestampLabel="Checked" observedAt={resources.kp.resource?.envelope.fetchedAt}>
              {current.predictedKp.length > 0 && <p className="mb-4 text-sm leading-6 text-su-muted">Official predicted Kp spans {formatUtc(current.predictedKp[0].time_tag)} to {formatUtc(new Date((parseUtcInstant(current.predictedKp[current.predictedKp.length - 1].time_tag) ?? 0) + 10_800_000).toISOString())}. {current.predictedKp.some((p) => p.kp >= 5) ? "Some predicted intervals reach the geomagnetic storm range; inspect their times below." : "No supplied predicted interval reaches Kp 5."} This describes the supplied forecast horizon, not conditions beyond it.</p>}
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
                      <div className="flex justify-between text-xs"><span className="text-su-muted">{label}</span><span className="font-mono text-su-text">{value}%</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-su-line/20"><div className="h-full rounded-full bg-gradient-to-r from-su-info to-su-warning" style={{ width: `${value}%` }} /></div>
                    </div>
                  ))}
                  <p className="text-xs leading-5 text-su-muted">These percentages estimate events, not whether your contact will succeed. Elevated X-rays can weaken sunlit HF paths; proton storms can affect polar paths. <a href="https://www.spaceweather.gov/impacts/hf-radio-communications" target="_blank" rel="noreferrer" className="text-su-info underline">HF effects explained</a></p>
                  <p className="border-t border-su-line/20 pt-3 text-xs text-su-muted">Issued {formatUtc(resources.probabilities.data.issue_time)} · one-day horizon.</p>
                </div>
              )}
            </WidgetShell>
          </div>
          <WidgetShell title="Three-day outlook" timestampLabel="Issued" eyebrow="Official NOAA forecast" {...sourceProps(resources.forecast)}>
            {resources.forecast.data && (
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {resources.forecast.data.forecast.map((day) => <article key={day.date} className="rounded-xl border border-su-line/40 bg-su-panel/70 p-4 xl:grid xl:grid-cols-[auto_auto_minmax(0,1fr)_auto] xl:items-center xl:gap-x-6">
                  <div>
                    <h3 className="text-sm font-semibold text-su-text">{new Date(day.date).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}</h3>
                    <p className="mt-2 text-xs text-su-muted xl:mt-1">Valid {day.date.slice(0, 10)} UTC · full day</p>
                  </div>
                  <div className="mt-3 flex gap-4 xl:mt-0">
                    <p className="text-xs text-su-muted">Predicted SFI <strong className="block font-mono text-xl text-su-info">{day.predicted_flux} sfu</strong></p>
                    <p className="text-xs text-su-muted">Predicted planetary A <strong className="block font-mono text-base text-su-warning">{day.predicted_planetary_a}</strong></p>
                  </div>
                  <div className="min-w-0 xl:flex-1">
                    <SolarMiniChart
                      label="Predicted Kp through the UTC day"
                      points={current.predictedKp.map(point => ({ timestamp: point.time_tag, value: point.kp, kind: point.kind }))}
                      unit="Kp" min={0} max={9} intervalMs={10_800_000} maxGapMs={10_800_000}
                      domain={[Date.parse(`${day.date.slice(0, 10)}T00:00:00Z`), Date.parse(`${day.date.slice(0, 10)}T00:00:00Z`) + 86_400_000]}
                    />
                    {resources.kp.state === "stale" && <p className="mt-1 text-xs text-su-warning">Kp forecast update delayed.</p>}
                  </div>
                  <div className="xl:flex xl:justify-end">
                    <SolarOperatingActions compact at={`${day.date.slice(0, 10)}T12:00:00Z`} />
                  </div>
                </article>)}
                <p className="text-xs text-su-muted sm:col-span-3 xl:col-span-1">Issued {formatUtc(resources.forecast.data.issued_at)}. Planning opens this UTC day at 12:00; these global values do not predict a contact.</p>
              </div>
            )}
          </WidgetShell>
  </>;
}

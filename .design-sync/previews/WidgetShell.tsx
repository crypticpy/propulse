import { WidgetShell } from "propulse";

export function FreshMetric() {
  const observedAt = new Date(Date.now() - 4 * 60_000).toISOString();
  return (
    <div style={{ width: 360 }}>
      <WidgetShell
        title="Solar Flux Index"
        eyebrow="NOAA SWPC"
        state="fresh"
        observedAt={observedAt}
        provider="NOAA SWPC"
        sourceUrl="https://www.swpc.noaa.gov"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-4xl font-bold text-su-text">142</span>
          <span className="text-sm text-su-muted">SFI</span>
        </div>
        <p className="mt-1 text-xs text-su-muted">Up 6 from yesterday&rsquo;s reading</p>
      </WidgetShell>
    </div>
  );
}

export function StaleChart() {
  const observedAt = new Date(Date.now() - 65 * 60_000).toISOString();
  return (
    <div style={{ width: 360 }}>
      <WidgetShell
        title="Planetary Kp Index"
        eyebrow="NOAA SWPC · 3h Forecast"
        state="stale"
        observedAt={observedAt}
        provider="NOAA SWPC"
        sourceUrl="https://www.swpc.noaa.gov"
      >
        <div className="flex h-16 items-end gap-1">
          {[2, 2, 3, 3, 4, 3, 2, 2].map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-su-info/60"
              style={{ height: `${(v / 4) * 100}%` }}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-su-muted">Kp 3 · unsettled</p>
      </WidgetShell>
    </div>
  );
}

export function LoadingState() {
  return (
    <div style={{ width: 360 }}>
      <WidgetShell title="X-Ray Flux" eyebrow="GOES-18" state="loading" hasData={false}>
        <div />
      </WidgetShell>
    </div>
  );
}

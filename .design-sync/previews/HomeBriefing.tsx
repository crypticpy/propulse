import { HomeBriefing, Surface } from "propulse";

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

function buildModel(tone: "impact" | "supportive", state: "fresh" | "loading") {
  return {
    current: {
      kp: { kp: tone === "impact" ? 6.7 : 3.3, kind: "3-hour" },
      flux: { flux: tone === "impact" ? 118 : 142 },
      xray: { flux: tone === "impact" ? 3.4e-5 : 2.1e-6 },
      xrayClass: tone === "impact" ? "M3.4" : "C2.1",
    },
    resources: {
      kp: { state },
      flux: { state },
      xray: { state },
    },
    briefing: {
      title: tone === "impact" ? "Geomagnetic storm in progress — expect HF absorption on polar paths." : "Good conditions expected on 20m and 15m today.",
      tone,
      state,
      statements:
        tone === "impact"
          ? [{ id: "kp-impact", kind: "impact", text: "Kp 6.7 · minor storm — expect degraded high-latitude paths and possible auroral flutter on VHF.", sources: ["noaa-k-index"] }]
          : [{ id: "flux-background", kind: "background", text: "Solar flux 142 sfu keeps the higher HF bands open into the evening grayline.", sources: ["noaa-solar-flux"] }],
      missing: [],
      delayed: [],
      evidence: [
        { sourceId: "noaa-k-index", label: "NOAA K-index", sourceUrl: "https://services.swpc.noaa.gov/", state, observedAt: new Date(NOW - 900000).toISOString() },
        { sourceId: "noaa-solar-flux", label: "NOAA solar flux", sourceUrl: "https://services.swpc.noaa.gov/", state, observedAt: new Date(NOW - 1800000).toISOString() },
      ],
    },
  };
}

export function Supportive() {
  return (
    <Surface>
      <HomeBriefing model={buildModel("supportive", "fresh")} />
    </Surface>
  );
}

export function StormWatch() {
  return (
    <Surface>
      <HomeBriefing model={buildModel("impact", "fresh")} />
    </Surface>
  );
}

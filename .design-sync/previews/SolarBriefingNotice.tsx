import { useEffect, useRef } from "react";
import { SolarBriefingNotice, SolarOperatingActions } from "propulse";

const watchBriefing = {
  title: "Elevated geomagnetic activity may affect high-latitude paths",
  tone: "watch" as const,
  statements: [
    {
      id: "s1",
      kind: "impact" as const,
      text: "Kp reached 5 in the last interval.",
      sources: ["noaa-k-index"],
    },
    {
      id: "s2",
      kind: "background" as const,
      text: "Solar flux remains moderate at 142 sfu.",
      sources: ["noaa-solar-flux"],
    },
  ],
  state: "fresh" as const,
  missing: [],
  delayed: ["Solar flux"],
  evidence: [],
};

const impactBriefing = {
  title: "Strong geomagnetic storm in progress — expect HF disruption",
  tone: "impact" as const,
  statements: [
    {
      id: "s1",
      kind: "impact" as const,
      text: "Kp reached 8 in the last interval; a severe geomagnetic storm is in progress.",
      sources: ["noaa-k-index"],
    },
    {
      id: "s2",
      kind: "impact" as const,
      text: "X-ray flux is at M-class; sunlit HF paths may experience absorption.",
      sources: ["noaa-xray"],
    },
    {
      id: "s3",
      kind: "background" as const,
      text: "Solar flux is elevated at 205 sfu.",
      sources: ["noaa-solar-flux"],
    },
  ],
  state: "fresh" as const,
  missing: [],
  delayed: [],
  evidence: [],
};

export function WatchCollapsed() {
  return (
    <SolarBriefingNotice briefing={watchBriefing} kp={4.7}>
      <SolarOperatingActions />
    </SolarBriefingNotice>
  );
}

export function ImpactExpanded() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const btn = ref.current?.querySelector<HTMLButtonElement>(
      'button[aria-expanded="false"]',
    );
    btn?.click();
  }, []);
  return (
    <div ref={ref}>
      <SolarBriefingNotice
        briefing={impactBriefing}
        kp={8.0}
        scales={{
          observed_at: "2026-09-08T12:00:00Z",
          radio_blackout: { scale: 1, text: "minor" },
          solar_radiation: { scale: null, text: null },
          geomagnetic_storm: { scale: 4, text: "severe" },
        }}
      >
        <SolarOperatingActions />
      </SolarBriefingNotice>
    </div>
  );
}

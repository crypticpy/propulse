import { BandConditionsHeader, Surface } from "propulse";

export function Expanded() {
  return (
    <Surface>
      <BandConditionsHeader
        currentKp={3}
        currentSfi={142}
        statusDotClass="bg-signal-green"
        onToggleCollapse={() => {}}
        onClose={() => {}}
        onHelp={() => {}}
        modelSource={{
          label: "P.533",
          tone: "physics",
          detail: "Served by the built-in ITU-R P.533 propagation engine.",
        }}
      />
    </Surface>
  );
}

export function StormWarning() {
  return (
    <Surface>
      <BandConditionsHeader
        currentKp={7}
        currentSfi={98}
        statusDotClass="bg-alert-red"
        onToggleCollapse={() => {}}
        onHelp={() => {}}
        modelSource={{
          label: "Estimate",
          tone: "degraded",
          detail: "NowCast unavailable; showing the band-score estimate.",
        }}
      />
    </Surface>
  );
}

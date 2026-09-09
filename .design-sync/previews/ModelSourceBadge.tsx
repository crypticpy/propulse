import { ModelSourceBadge, Surface, Inline } from "propulse";

// ModelSourceDescriptor is a plain object shape from @/lib/map/modelSource,
// not a component export, so the literal is reconstructed here to match
// P533_SOURCE / BAND_SCORE_SOURCE / a degraded NowCast provenance state.
export function Physics() {
  return (
    <Surface>
      <Inline>
        <ModelSourceBadge
          source={{
            label: "P.533",
            tone: "physics",
            detail:
              "Served by the built-in ITU-R P.533 propagation engine running in your browser.",
          }}
        />
        <span className="text-su-text text-sm">20 m EM12 &rarr; JA1XYZ</span>
      </Inline>
    </Surface>
  );
}

export function MlAndDegraded() {
  return (
    <Surface>
      <Inline>
        <ModelSourceBadge
          source={{
            label: "NowCast",
            tone: "ml",
            detail: "Served by the personalized NowCast ML model on Railway.",
          }}
        />
        <ModelSourceBadge
          source={{
            label: "Estimate",
            tone: "degraded",
            detail:
              "NowCast is unavailable; falling back to the band-score estimate.",
          }}
        />
      </Inline>
    </Surface>
  );
}

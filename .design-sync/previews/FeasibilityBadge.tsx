import { FeasibilityBadge, Surface, Inline } from "propulse";

export function Levels() {
  return (
    <Surface>
      <Inline>
        <FeasibilityBadge level="excellent" optimalBand="20m" showBand />
        <FeasibilityBadge level="good" optimalBand="40m" showBand />
        <FeasibilityBadge level="fair" isGrayline />
        <FeasibilityBadge level="poor" size="lg" />
        <FeasibilityBadge level="unlikely" size="sm" />
      </Inline>
    </Surface>
  );
}

export function GraylinePath() {
  return (
    <Surface>
      <Inline>
        <FeasibilityBadge
          level="excellent"
          optimalBand="20m"
          showBand
          isGrayline
        />
        <span className="text-su-text text-sm">EM12 &rarr; JA1XYZ (PM95)</span>
      </Inline>
    </Surface>
  );
}

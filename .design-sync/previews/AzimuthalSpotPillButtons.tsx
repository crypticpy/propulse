import { useEffect } from "react";
import { AzimuthalSpotPillButtons, Surface } from "propulse";

/**
 * AzimuthalSpotPillButtons renders only accessible hit targets over the
 * live-DX callsign tags painted by the azimuthal canvas — the button itself
 * is transparent until hover/focus. The faint tag glyphs below stand in for
 * that canvas paint so the invisible real hit targets read as a plausible
 * composition.
 */

interface DecorativeTag {
  id: string;
  dx: string;
  freq: string;
  mode: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const TAGS: DecorativeTag[] = [
  { id: "ja1xyz", dx: "JA1XYZ", freq: "14.074", mode: "FT8", left: 30, top: 40, width: 78, height: 18 },
  { id: "dl2abc", dx: "DL2ABC", freq: "7.033", mode: "CW", left: 150, top: 90, width: 74, height: 18 },
  { id: "vk6lc", dx: "VK6LC", freq: "21.295", mode: "SSB", left: 220, top: 150, width: 74, height: 18 },
];

function placement(tag: DecorativeTag) {
  return {
    spot: {
      id: tag.id,
      spotter: "W1AW",
      dx: tag.dx,
      frequency: parseFloat(tag.freq) * 1000,
      mode: tag.mode,
      comment: "",
      time: new Date(),
      band: "20m",
      source: "PSKReporter" as const,
    },
    left: tag.left,
    top: tag.top,
    width: tag.width,
    height: tag.height,
  };
}

function AzimuthalCrop({ children }: { children: React.ReactNode }) {
  return (
    <Surface
      style={{
        position: "relative",
        width: 360,
        height: 220,
        overflow: "hidden",
        backgroundColor: "#070a12",
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.08), transparent 65%)",
      }}
    >
      {children}
    </Surface>
  );
}

function TagGlyph({ tag }: { tag: DecorativeTag }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: tag.left,
        top: tag.top,
        width: tag.width,
        height: tag.height,
        borderRadius: 999,
        background: "rgba(7,9,22,0.85)",
        border: "1px solid rgba(148,163,184,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        fontWeight: 700,
        color: "#67e8f9",
        boxSizing: "border-box",
      }}
    >
      {tag.dx}
    </div>
  );
}

export function Idle() {
  return (
    <AzimuthalCrop>
      {TAGS.map((tag) => (
        <TagGlyph key={tag.id} tag={tag} />
      ))}
      <AzimuthalSpotPillButtons
        placements={TAGS.map(placement)}
        onSpotHover={() => {}}
        onSpotHoverEnd={() => {}}
        onSpotSelect={() => {}}
      />
    </AzimuthalCrop>
  );
}

/**
 * Simulates the keyboard-focus state a11y users reach with Tab: the button
 * itself has no visible fill, so this is the only way to show its
 * focus-visible ring, which is the one visual state this component owns.
 */
export function KeyboardFocus() {
  useEffect(() => {
    const target = document.querySelector(
      '[aria-label^="JA1XYZ"]',
    ) as HTMLElement | null;
    target?.focus();
  }, []);
  return (
    <AzimuthalCrop>
      {TAGS.map((tag) => (
        <TagGlyph key={tag.id} tag={tag} />
      ))}
      <AzimuthalSpotPillButtons
        placements={TAGS.map(placement)}
        onSpotHover={() => {}}
        onSpotHoverEnd={() => {}}
        onSpotSelect={() => {}}
      />
    </AzimuthalCrop>
  );
}

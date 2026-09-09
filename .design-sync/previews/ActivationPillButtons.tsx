import { useEffect } from "react";
import { ActivationPillButtons, Surface } from "propulse";

/**
 * ActivationPillButtons renders only accessible hit targets (invisible
 * except on focus) — the visible pill glyph is painted by the map's 2D
 * canvas layer, not this component. The faint labeled rectangles below are
 * decorative context standing in for that canvas paint so the real
 * (otherwise invisible) hit targets read as a plausible composition.
 */

interface DecorativePill {
  id: string;
  callsign: string;
  program: string;
  reference: string;
  freq: string;
  color: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const PILLS: DecorativePill[] = [
  {
    id: "w1aw-pota",
    callsign: "W1AW",
    program: "POTA",
    reference: "K-1234",
    freq: "14.062",
    color: "#f59e0b",
    left: 24,
    top: 32,
    width: 128,
    height: 20,
  },
  {
    id: "ja1xyz-sota",
    callsign: "JA1XYZ",
    program: "SOTA",
    reference: "JA/YN-004",
    freq: "7.033",
    color: "#22c55e",
    left: 180,
    top: 96,
    width: 148,
    height: 20,
  },
  {
    id: "vk6lc-wwff",
    callsign: "VK6LC",
    program: "WWFF",
    reference: "VKFF-1234",
    freq: "21.074",
    color: "#3b82f6",
    left: 60,
    top: 158,
    width: 148,
    height: 20,
  },
];

function activationSpot(pill: DecorativePill) {
  return {
    spot: {
      id: pill.id,
      program: pill.program as "POTA" | "SOTA" | "WWFF",
      callsign: pill.callsign,
      reference: pill.reference,
      referenceName: `${pill.callsign} activation`,
      frequencyKHz: parseFloat(pill.freq) * 1000,
      mode: "SSB",
      comments: "",
      spotter: "SPOTTER",
      spottedAt: new Date().toISOString(),
      latitude: 0,
      longitude: 0,
    },
    left: pill.left,
    top: pill.top,
    width: pill.width,
    height: pill.height,
  };
}

function MapCrop({ children }: { children: React.ReactNode }) {
  return (
    <Surface
      style={{
        position: "relative",
        width: 380,
        height: 220,
        overflow: "hidden",
        backgroundColor: "#070a12",
        backgroundImage:
          "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {children}
    </Surface>
  );
}

function PillGlyph({ pill }: { pill: DecorativePill }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: pill.left,
        top: pill.top,
        width: pill.width,
        height: pill.height,
        borderRadius: 4,
        background: "rgba(7,9,22,0.92)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 6px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: 700,
        color: "#e5e7eb",
        borderBottom: `3px solid ${pill.color}`,
        boxSizing: "border-box",
      }}
    >
      <span>{pill.callsign}</span>
      <span style={{ color: pill.color, fontSize: 9 }}>
        {pill.program} {pill.reference}
      </span>
      <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 9 }}>
        {pill.freq}
      </span>
    </div>
  );
}

export function Idle() {
  return (
    <MapCrop>
      {PILLS.map((pill) => (
        <PillGlyph key={pill.id} pill={pill} />
      ))}
      <ActivationPillButtons
        placements={PILLS.map(activationSpot)}
        onSpotHover={() => {}}
        onSpotHoverEnd={() => {}}
        onSpotSelect={() => {}}
      />
    </MapCrop>
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
      '[aria-label^="W1AW"]',
    ) as HTMLElement | null;
    target?.focus();
  }, []);
  return (
    <MapCrop>
      {PILLS.map((pill) => (
        <PillGlyph key={pill.id} pill={pill} />
      ))}
      <ActivationPillButtons
        placements={PILLS.map(activationSpot)}
        onSpotHover={() => {}}
        onSpotHoverEnd={() => {}}
        onSpotSelect={() => {}}
      />
    </MapCrop>
  );
}

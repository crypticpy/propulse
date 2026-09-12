/** Shared color combinations. Layout and native interaction stay with callers. */
export type StationTone = "neutral" | "info" | "success" | "warning" | "danger";
/** Purple is decorative identity, never a synonym for a status. */
export type StationTreatmentTone = StationTone | "accent" | "purple";
export type StationTreatment = "subtle" | "outline" | "solid";

export const STATION_TREATMENT_STRENGTH = { rest: 0.1, active: 0.2 } as const;
export const STATION_TREATMENT_TONES = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
  "accent",
  "purple",
] as const satisfies readonly StationTreatmentTone[];

const toneClasses: Record<StationTreatmentTone, string> = {
  neutral: "su-tone-neutral",
  info: "su-tone-info",
  success: "su-tone-success",
  warning: "su-tone-warning",
  danger: "su-tone-danger",
  accent: "su-tone-accent",
  purple: "su-tone-purple",
};
const treatmentClasses: Record<StationTreatment, string> = {
  subtle: "su-treatment--subtle",
  outline: "su-treatment--outline",
  solid: "su-treatment--solid",
};

/** Static names are discoverable by build tools; no per-call opacity knobs. */
export function stationTreatmentClasses({
  tone = "neutral",
  treatment = "subtle",
  interactive = false,
}: {
  tone?: StationTreatmentTone;
  treatment?: StationTreatment;
  interactive?: boolean;
} = {}): string {
  return [
    "su-treatment",
    toneClasses[tone],
    treatmentClasses[treatment],
    interactive ? "su-treatment--interactive" : "",
  ].filter(Boolean).join(" ");
}

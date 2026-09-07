/** The retained global sample supports only these bounded history windows. */
export type SpotWindowMinutes = 15 | 30 | 60;

export function parseSpotWindow(value: string | null): SpotWindowMinutes | null {
  if (value === null) return 30;
  if (value === "15") return 15;
  if (value === "30") return 30;
  if (value === "60") return 60;
  return null;
}

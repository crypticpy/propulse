/** The retained global sample supports only these bounded history windows. */
export type SpotWindowMinutes = 15 | 30 | 60;
export type ClusterWindowMinutes = SpotWindowMinutes | 120;

export function parseSpotWindow(value: string | null): SpotWindowMinutes | null {
  if (value === null) return 30;
  if (value === "15") return 15;
  if (value === "30") return 30;
  if (value === "60") return 60;
  return null;
}

/** DX Cluster's existing list control also uses the retained two-hour sample. */
export function parseClusterWindow(value: string | null): ClusterWindowMinutes | null {
  return value === "120" ? 120 : parseSpotWindow(value);
}

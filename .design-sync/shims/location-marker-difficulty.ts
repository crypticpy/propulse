// Design-sync-only build shim for `./LocationMarker` (src/components/map/LocationMarker.tsx).
// OptimalBandsPanel and SelectedSpotCard import only the pure difficulty
// constants below; the real file is a react-three-fiber globe marker whose
// module-level reconciler crashes the whole design-sync bundle. Verbatim port
// of lines ~32-56. If the palette or labels change upstream, update here too.
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  1: "#00FF88", // Easy - Signal green
  2: "#7ACC7A", // Moderate - Light green
  3: "#FFD23F", // Challenging - Amber
  4: "#FF8C42", // Difficult - Orange
  5: "#FF4444", // Extreme - Red
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  1: "Easy",
  2: "Moderate",
  3: "Challenging",
  4: "Difficult",
  5: "Extreme",
};

export function getDifficultyColor(difficulty: DifficultyLevel): string {
  return DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS[3];
}

/** Return the persisted Y position after translating a dock group below the toolbar. */
export function safeDockGroupY(
  anchorY: number,
  panelY: number,
  minTop: number,
): number {
  return panelY + Math.max(0, minTop - anchorY);
}

export interface LabelHitBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Return the last-painted label containing a logical canvas point. */
export function findTopmostLabelIndex(
  labels: readonly { bbox: LabelHitBounds }[],
  point: { x: number; y: number },
): number {
  for (let index = labels.length - 1; index >= 0; index--) {
    const { bbox } = labels[index];
    if (
      point.x >= bbox.x &&
      point.x <= bbox.x + bbox.w &&
      point.y >= bbox.y &&
      point.y <= bbox.y + bbox.h
    ) {
      return index;
    }
  }
  return -1;
}

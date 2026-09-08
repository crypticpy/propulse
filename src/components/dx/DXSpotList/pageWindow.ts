/** Row offsets remain stable when a different page changes measured capacity. */
export function spotPageWindow(total: number, size: number, offset: number, focused: number) {
  let start = Math.min(Math.max(0, offset), Math.max(0, total - 1));
  if (focused >= 0 && focused < total) {
    if (focused < start) start = focused;
    else if (focused >= start + size) start = focused - size + 1;
  }
  return { start, end: Math.min(total, start + size) };
}

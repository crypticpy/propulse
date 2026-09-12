/**
 * SlotChipList — a labelled row of small text chips (a slot's worked bands
 * or modes) inside an award slot's detail panel.
 *
 * Byte-identical markup previously duplicated once per band list and once
 * per mode list, across all three award grids (WasMap, WazGrid, DxccGrid).
 * See issue #1095.
 */

export interface SlotChipListProps {
  label: string;
  items: string[];
}

export function SlotChipList({ label, items }: SlotChipListProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <span className="text-su-muted text-sm">{label}</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map((item) => (
          <span
            key={item}
            className="px-1.5 py-0.5 rounded bg-su-panel text-su-muted text-xs"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Customize dashboard.
 *
 * A centered dialog (no flyouts) over the live dashboard: the visible items in
 * order with a drag handle, ▲ ▼ and Hide, plus every panel not on the page yet.
 * Every action writes through immediately, so the dashboard behind the dialog
 * updates as the operator works.
 *
 * Reordering uses the neighbouring *visible* row rather than a raw index step,
 * because a guest's layout can still carry signed-in-only items they cannot see.
 */

import { useState, type DragEvent } from "react";
import { AccessibleDialog } from "@/components/ui";
import type { HomeLayoutController } from "@/hooks/useHomeLayout";
import { HOME_LAYOUT_ITEMS, homeItemTitle, isHomeItemAvailable } from "@/lib/home/layout";

const ROW = "flex flex-wrap items-center gap-2 rounded-xl border border-su-line/40 bg-su-input px-3 py-2";
const ACTION = "min-h-11 min-w-11 rounded-xl border border-su-line/40 bg-su-panel px-3 text-su-text hover:bg-su-line/20 disabled:opacity-50";

interface HomeCustomizeDialogProps {
  open: boolean;
  onClose: () => void;
  layout: HomeLayoutController;
  guest: boolean;
  isMobile: boolean;
}

export function HomeCustomizeDialog({ open, onClose, layout, guest, isMobile }: HomeCustomizeDialogProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const visible = layout.items.filter((id) => isHomeItemAvailable(id, guest));
  const available = HOME_LAYOUT_ITEMS.filter(
    (item) => !layout.items.includes(item.id) && isHomeItemAvailable(item.id, guest),
  );

  const step = (id: string, delta: number) => {
    const neighbour = visible[visible.indexOf(id) + delta];
    if (neighbour) layout.moveTo(id, layout.items.indexOf(neighbour));
  };

  const drop = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    const source = dragging ?? event.dataTransfer.getData("text/plain");
    setDragging(null);
    if (source && source !== targetId) layout.moveTo(source, layout.items.indexOf(targetId));
  };

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title="Customize dashboard"
      description={`Choose the panels on your ${isMobile ? "phone" : "desktop"} dashboard and the order they appear in. ${guest ? "Guest choices last for this visit." : "Your choices are saved in this browser."}`}
    >
      <h3 className="font-orbitron text-base text-su-text">Your layout</h3>
      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-su-muted">Every panel is hidden. Add one below to rebuild your dashboard.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Your layout">
          {visible.map((id, index) => (
            <li
              key={id}
              className={ROW}
              draggable
              aria-label={homeItemTitle(id)}
              onDragStart={(event) => {
                setDragging(id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragEnd={() => setDragging(null)}
              onDrop={(event) => drop(event, id)}
            >
              <span className="cursor-grab text-lg text-su-muted" aria-hidden="true">
                ⠿
              </span>
              <span className="min-w-0 flex-1 text-su-text">{homeItemTitle(id)}</span>
              <span className="rounded-lg border border-su-line/40 px-2 py-1 text-xs text-su-muted">
                {HOME_LAYOUT_ITEMS.find((item) => item.id === id)?.kind === "wide" ? "Full width" : "Tile"}
              </span>
              <button
                type="button"
                className={ACTION}
                aria-label={`Move ${homeItemTitle(id)} up`}
                disabled={index === 0}
                onClick={() => step(id, -1)}
              >
                <span aria-hidden="true">▲</span>
              </button>
              <button
                type="button"
                className={ACTION}
                aria-label={`Move ${homeItemTitle(id)} down`}
                disabled={index === visible.length - 1}
                onClick={() => step(id, 1)}
              >
                <span aria-hidden="true">▼</span>
              </button>
              <button
                type="button"
                className={ACTION}
                aria-label={`Hide ${homeItemTitle(id)}`}
                onClick={() => layout.remove(id)}
              >
                Hide
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 font-orbitron text-base text-su-text">Add panels</h3>
      {available.length === 0 ? (
        <p className="mt-2 text-sm text-su-muted">Every available panel is already on your dashboard.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Add panels">
          {available.map((item) => (
            <li key={item.id} className={ROW}>
              <span className="min-w-0 flex-1 text-su-text">{item.title}</span>
              <span className="rounded-lg border border-su-line/40 px-2 py-1 text-xs text-su-muted">
                {item.kind === "wide" ? "Full width" : "Tile"}
              </span>
              <button
                type="button"
                className={ACTION}
                aria-label={`Add ${item.title} to your dashboard`}
                onClick={() => layout.add(item.id)}
              >
                + Add
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-su-line/40 pt-4">
        <button type="button" className={ACTION} onClick={() => layout.reset()}>
          Reset to default
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-su-info/40 bg-su-info/10 px-4 text-su-info hover:bg-su-info/20"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </AccessibleDialog>
  );
}

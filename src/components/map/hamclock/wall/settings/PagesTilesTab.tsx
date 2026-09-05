import { useState } from "react";
import type { RegisteredWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import { useWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import { HAMCLOCK_WALL_PAGES } from "../pages";
import { WALL_TILES, type TileId } from "../tiles";
import { HamClockButton, HamClockDialog } from "../controls";

/** The generic panel host: reads/writes any tile's config at the `unknown`
 * level the registry stores it at. `RegisteredWidgetConfig` is structurally
 * identical to `WidgetConfig<unknown>` (guide §9's erasure), so this is the
 * one place a tile's config is edited without the caller knowing its
 * specific `T` — every other config surface (the tile itself) imports its
 * concrete schema/defaults/panel directly instead. */
function TileConfigDialog({
  tileId,
  title,
  config,
  open,
  onClose,
}: {
  tileId: TileId;
  title: string;
  config: RegisteredWidgetConfig;
  open: boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useWidgetConfig<unknown>(tileId, config);
  const ConfigPanel = config.ConfigPanel;
  return (
    <HamClockDialog open={open} onClose={onClose} title={title} size="config">
      <ConfigPanel value={value} onChange={setValue} />
    </HamClockDialog>
  );
}

function TileChip({ id }: { id: TileId }) {
  const tile = WALL_TILES[id];
  const [open, setOpen] = useState(false);

  return (
    <span className="hcc-page-tile">
      {tile.title}
      {tile.config && (
        <>
          <HamClockButton
            aria-label={`${tile.title} options`}
            onClick={() => setOpen(true)}
          >
            OPTIONS
          </HamClockButton>
          <TileConfigDialog
            tileId={id}
            title={tile.title.toUpperCase()}
            config={tile.config}
            open={open}
            onClose={() => setOpen(false)}
          />
        </>
      )}
    </span>
  );
}

/**
 * Read-only: which tiles the wall ships on each rail of each page today.
 * User-editable rails, per-page slot assignment and presets are B4, not this
 * batch — this tab exists so an operator can see the shipped composition and
 * reach a tile's own options, nothing more.
 */
export function PagesTilesTab() {
  return (
    <div className="hcc-pages-list">
      {HAMCLOCK_WALL_PAGES.map((page) => (
        <div className="hcc-page-row" key={page.id}>
          <p className="hcc-page-title">{page.title}</p>
          <div className="hcc-page-rail">
            <span className="hcc-page-rail-label">LEFT</span>
            {page.left.map((id, index) => (
              <TileChip id={id} key={`${page.id}-left-${index}-${id}`} />
            ))}
          </div>
          <div className="hcc-page-rail">
            <span className="hcc-page-rail-label">RIGHT</span>
            {page.right.map((id, index) => (
              <TileChip id={id} key={`${page.id}-right-${index}-${id}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

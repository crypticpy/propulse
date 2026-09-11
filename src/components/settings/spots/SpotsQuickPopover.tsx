import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listActivityRecipes } from "@/lib/views/presets";
import {
  MODE_CATEGORIES,
  SPOT_FILTER_BANDS,
  categoryState,
  isAllModesSelected,
  selectAllModes,
  summarizeFilters,
  toggleModeCategory,
} from "./modeSelection";
import { useSpotsPreferencesContext } from "./SpotsPreferencesContext";

const ANIMATE_LABEL: Record<string, string> = {
  "new-spots": "New spots",
  "selected-only": "Selected path only",
  "all-displayed": "All displayed paths",
};

const STYLE_LABEL: Record<string, string> = {
  off: "Off",
  "quick-sweep": "Quick sweep",
  "traveling-pulse": "Traveling pulse",
  "flowing-dashes": "Flowing dashes",
};

const CHIP =
  "min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";
const CHIP_ON = "border-plasma-orange bg-plasma-orange text-su-on-accent";
const CHIP_OFF = "border-su-line/40 bg-void-black text-su-muted hover:text-su-text";

/**
 * UX-01 quick surface: mode, band, clustering, animation and the active recipe,
 * with everything advanced deferred to the detailed panel. It edits the same
 * scoped working copy as the panel, because both read one provider.
 */
export function SpotsQuickPopover({
  open,
  onClose,
  triggerRef,
  onOpenAllPreferences,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
  onOpenAllPreferences: () => void;
}) {
  const { controller } = useSpotsPreferencesContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const margin = 8;
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      setPosition({
        top: Math.max(margin, Math.min(anchor.bottom + 2, window.innerHeight - box.height - margin)),
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - box.width - margin)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [open, triggerRef]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, handleKeyDown, triggerRef]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const { spots, customization } = controller;
  const modes = spots.filters.modes;
  const allModes = isAllModesSelected(modes);
  const activeRecipe = listActivityRecipes().find((recipe) => recipe.id === customization.presetId);
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Spots and paths"
      tabIndex={-1}
      className="fixed z-[250] w-80 rounded-xl border border-su-line/40 bg-su-panel/95 p-4 shadow-2xl shadow-black/60 focus:outline-none"
      style={{ top: position.top, left: position.left }}
    >
      <div className="mb-3 text-xs text-su-muted">{summarizeFilters(spots.filters)}</div>

      <div role="group" aria-label="Modes" className="mb-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-su-muted">Modes</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={allModes}
            onClick={() => controller.patchFilters({ modes: selectAllModes(modes) })}
            className={`${CHIP} ${allModes ? CHIP_ON : CHIP_OFF}`}
          >
            All
          </button>
          {MODE_CATEGORIES.map(({ key, label }) => {
            const state = categoryState(modes, key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={state === "on"}
                onClick={() =>
                  controller.patchFilters({ modes: toggleModeCategory(modes, key) })
                }
                className={`${CHIP} ${state === "off" ? CHIP_OFF : CHIP_ON}`}
              >
                {label}
                {state === "partial" ? " (some)" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div role="group" aria-label="Bands" className="mb-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-su-muted">
          Bands {spots.filters.bands.length === 0 ? "(all bands)" : ""}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SPOT_FILTER_BANDS.map((band) => {
            const on = spots.filters.bands.includes(band);
            return (
              <button
                key={band}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  controller.patchFilters({
                    bands: on
                      ? spots.filters.bands.filter((entry) => entry !== band)
                      : [...spots.filters.bands, band],
                  })
                }
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {band}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <label className="flex min-h-[40px] items-center justify-between gap-3 text-sm text-su-text">
          <span>Group nearby spots</span>
          <input
            type="checkbox"
            checked={spots.grouping.enabled}
            onChange={(event) => controller.patchGrouping({ enabled: event.target.checked })}
            className="h-5 w-5 accent-plasma-orange focus:outline-none focus:ring-2 focus:ring-plasma-orange/60"
          />
        </label>
      </div>

      <div className="mb-3 text-sm text-su-text">
        <div className="flex items-center justify-between">
          <span>Animation</span>
          <span className="text-xs text-su-muted">
            {STYLE_LABEL[spots.paths.background.style]} · {ANIMATE_LABEL[spots.paths.animate]}
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            controller.patchPaths({
              background: {
                ...spots.paths.background,
                style: spots.paths.background.style === "off" ? "quick-sweep" : "off",
              },
            })
          }
          className={`${CHIP} mt-1.5 w-full ${spots.paths.background.style === "off" ? CHIP_OFF : CHIP_ON}`}
        >
          {spots.paths.background.style === "off" ? "Turn animation on" : "Turn animation off"}
        </button>
      </div>

      <div className="mb-3 text-xs text-su-muted" data-testid="quick-active-preset">
        {activeRecipe
          ? `${activeRecipe.name}${customization.customized ? " (customized)" : ""}`
          : "No activity recipe applied"}
      </div>

      <button
        type="button"
        onClick={onOpenAllPreferences}
        className="min-h-[40px] w-full rounded-lg border border-su-line/40 bg-void-black px-3 py-2 text-sm font-medium text-su-text hover:border-plasma-orange/50 focus:outline-none focus:ring-2 focus:ring-plasma-orange/60"
      >
        All spot preferences…
      </button>
    </div>,
    document.body,
  );
}

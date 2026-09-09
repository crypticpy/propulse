import { useCallback, useRef, useState } from "react";
import type { SavedView } from "@/lib/views/contracts";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { ActivitySection } from "./sections/ActivitySection";
import { GroupingSection } from "./sections/GroupingSection";
import { PathsMotionSection } from "./sections/PathsMotionSection";
import { PresetsSection } from "./sections/PresetsSection";
import { useSpotsPreferencesContext } from "./SpotsPreferencesContext";
import { StatusStrip } from "./StatusStrip";
import { ViewLibrary } from "./ViewLibrary";

export const SPOTS_PANEL_SECTIONS = ["activity", "grouping", "paths", "presets"] as const;
export type SpotsPanelSection = (typeof SPOTS_PANEL_SECTIONS)[number];

const SECTION_LABEL: Record<SpotsPanelSection, string> = {
  activity: "Activity",
  grouping: "Grouping",
  paths: "Paths & Motion",
  presets: "Presets",
};

/**
 * UX-02 detailed preferences. The four sections and the quick popover edit one
 * scoped working copy, taken from the surrounding provider.
 */
export function SpotsPreferencesPanel({
  open,
  onClose,
  onLoadView,
  initialSection = "activity",
}: {
  open: boolean;
  onClose: () => void;
  onLoadView: (view: SavedView) => void;
  initialSection?: SpotsPanelSection;
}) {
  const { controller, library } = useSpotsPreferencesContext();
  const [section, setSection] = useState<SpotsPanelSection>(initialSection);
  const tabRefs = useRef<Partial<Record<SpotsPanelSection, HTMLButtonElement | null>>>({});

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, current: SpotsPanelSection) => {
      const order = SPOTS_PANEL_SECTIONS;
      const index = order.indexOf(current);
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = order[(index + step + order.length) % order.length];
      setSection(next);
      tabRefs.current[next]?.focus();
    },
    [],
  );

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title="Spots & paths preferences"
      description="Choose which reports appear, how they are grouped, how paths move, and which recipe this view starts from."
      size="xl"
    >
      <div className="space-y-4">
        <StatusStrip controller={controller} />

        <div role="tablist" aria-label="Preference sections" className="flex flex-wrap gap-1.5">
          {SPOTS_PANEL_SECTIONS.map((key) => (
            <button
              key={key}
              ref={(node) => {
                tabRefs.current[key] = node;
              }}
              type="button"
              role="tab"
              id={`spots-tab-${key}`}
              aria-selected={section === key}
              aria-controls={`spots-panel-${key}`}
              tabIndex={section === key ? 0 : -1}
              onClick={() => setSection(key)}
              onKeyDown={(event) => onTabKeyDown(event, key)}
              className={`min-h-[40px] rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-plasma-orange/60 ${
                section === key
                  ? "border-plasma-orange bg-plasma-orange text-su-on-accent"
                  : "border-su-line/40 bg-void-black text-su-muted hover:text-su-text"
              }`}
            >
              {SECTION_LABEL[key]}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`spots-panel-${section}`}
          aria-labelledby={`spots-tab-${section}`}
          tabIndex={0}
          className="focus:outline-none"
        >
          {section === "activity" && <ActivitySection controller={controller} />}
          {section === "grouping" && <GroupingSection controller={controller} />}
          {section === "paths" && <PathsMotionSection controller={controller} />}
          {section === "presets" && (
            <div className="space-y-6">
              <PresetsSection controller={controller} library={library} />
              <ViewLibrary controller={controller} library={library} onLoadView={onLoadView} />
            </div>
          )}
        </div>
      </div>
    </AccessibleDialog>
  );
}

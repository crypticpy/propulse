/**
 * HelpArticlePage — Article layout with breadcrumbs, sticky TOC sidebar, and content area.
 *
 * Desktop: 180px sticky TOC sidebar (left) + max-w-[800px] content (right).
 * Mobile: collapsible "On this page" bar at top + full-width content below.
 * Renders the appropriate section component based on URL param.
 */

import { useMemo, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";
import { HelpBreadcrumbs } from "@/components/help/HelpBreadcrumbs";
import { HelpArticleTOC, type TOCItem } from "@/components/help/HelpArticleTOC";
import { HELP_SECTIONS } from "@/components/help/helpData";
import { GettingStartedSection } from "@/components/help/sections/GettingStartedSection";
import { DashboardSection } from "@/components/help/sections/DashboardSection";
import { SolarPulseSection } from "@/components/help/sections/SolarPulseSection";
import { PropSphereSection } from "@/components/help/sections/PropSphereSection";
import { DXWizardSection } from "@/components/help/sections/DXWizardSection";
import { BandPlannerSection } from "@/components/help/sections/BandPlannerSection";
import { SdrConsoleSection } from "@/components/help/sections/SdrConsoleSection";
import { LogbookSection } from "@/components/help/sections/LogbookSection";
import { ContestSection } from "@/components/help/sections/ContestSection";
import { ShackSection } from "@/components/help/sections/ShackSection";
import { SettingsSection } from "@/components/help/sections/SettingsSection";
import { ProfileSection } from "@/components/help/sections/ProfileSection";

// ─── TOC definitions per section ─────────────────────────────────────────────

const SECTION_TOC: Record<string, TOCItem[]> = {
  "getting-started": [
    { id: "what-is-propulse", title: "What is Propulse?" },
    { id: "quick-start", title: "Quick Start" },
    { id: "navigation-overview", title: "Navigation Overview" },
    { id: "account-tiers", title: "Account Tiers" },
    { id: "command-palette", title: "Command Palette" },
    { id: "keyboard-shortcuts", title: "Keyboard Shortcuts" },
    { id: "utility-pages", title: "Utility Pages" },
    { id: "getting-help", title: "Getting Help" },
    { id: "faq", title: "FAQ" },
  ],
  dashboard: [
    { id: "band-conditions", title: "Band Conditions" },
    { id: "propagation-index", title: "Global Conditions Score" },
    { id: "primary-metrics", title: "Primary Metrics" },
    { id: "activity-cards", title: "Activity Cards" },
    { id: "data-sources-dashboard", title: "Data Sources" },
  ],
  "solar-pulse": [
    { id: "solar-current-products", title: "Current Observations" },
    { id: "solar-impacts", title: "Impact Products" },
    { id: "solar-official-forecast", title: "Official Forecasts" },
    { id: "solar-guidance", title: "General HF Guidance" },
    { id: "solar-cycle-imagery", title: "Cycle Context and Imagery" },
  ],
  propsphere: [
    { id: "map-views", title: "Map Views" },
    { id: "layout-modes", title: "Layout Modes" },
    { id: "observatory", title: "Observatory Mode" },
    { id: "toolbar", title: "Toolbar Reference" },
    { id: "layers", title: "Data Layers Reference" },
    { id: "layer-presets", title: "Layer Presets" },
    { id: "display-controls", title: "Display Controls" },
    { id: "interactions", title: "Interactions" },
    { id: "path-analysis", title: "Path Analysis" },
    { id: "grid-system", title: "Maidenhead Grid System" },
    { id: "data-sources-propsphere", title: "Data Sources" },
    { id: "propagation-modeling", title: "Propagation Modeling" },
  ],
  "dx-wizard": [
    { id: "target-selection", title: "Target Selection" },
    { id: "operator-settings", title: "Operator Settings" },
    { id: "recommendations", title: "How Recommendations Work" },
    { id: "mode-tips", title: "Mode-Specific Tips" },
  ],
  "band-planner": [
    { id: "heatmap", title: "Reading the Heatmap" },
    { id: "status-colors", title: "Status Colors" },
    { id: "best-windows", title: "Best Windows" },
    { id: "storm-confidence", title: "Storms & Evidence" },
    { id: "operating-recommendations", title: "Operating Recommendations" },
    { id: "favorites-filter", title: "Favorites Filter" },
    { id: "data-sources-planner", title: "Data Sources" },
  ],
  "sdr-console": [
    { id: "connecting", title: "Connecting to a Radio" },
    { id: "radio-controls", title: "Radio Controls" },
    { id: "dsp-controls", title: "DSP Controls" },
    { id: "spectrum-waterfall", title: "Spectrum & Waterfall" },
    { id: "wsjtx", title: "WSJT-X Integration" },
    { id: "cluster-overlay", title: "DX Cluster Overlay" },
    { id: "daemon-setup", title: "Bridge & Daemon Setup" },
    { id: "hardware", title: "Supported Hardware" },
    { id: "data-sources-sdr", title: "Data Sources" },
  ],
  logbook: [
    { id: "logging-qso", title: "Logging a QSO" },
    { id: "adif", title: "ADIF Import/Export" },
    { id: "guest-mode", title: "Guest Mode" },
    { id: "awards", title: "Awards Tracker" },
    { id: "external-services", title: "External Services" },
    { id: "storage", title: "Local vs Cloud Storage" },
  ],
  contest: [
    { id: "contest-start", title: "Getting Started" },
    { id: "one-line-entry", title: "One-Line Entry" },
    { id: "contest-hotkeys", title: "Keyboard Hotkeys" },
    { id: "scoring", title: "Live Scoring" },
    { id: "rate-sheet", title: "Rate Sheet" },
    { id: "off-time", title: "Off-Time Rules" },
    { id: "cat-integration", title: "CAT Integration" },
    { id: "multipliers", title: "Multiplier Panel" },
    { id: "score-sharing", title: "Score Sharing" },
  ],
  "radio-shack": [
    { id: "equipment", title: "Equipment Management" },
    { id: "signal-path", title: "Signal Path Diagram" },
    { id: "performance", title: "Performance Analysis" },
    { id: "what-if", title: "What-If Simulator" },
    { id: "equipment-database", title: "Equipment Database" },
  ],
  settings: [
    { id: "preferences", title: "Preferences" },
    { id: "appearance", title: "Appearance" },
    { id: "notifications", title: "Notifications" },
    { id: "connections", title: "Connections" },
    { id: "subscription", title: "Subscription" },
    { id: "data-account", title: "Data & Account" },
  ],
  profile: [
    { id: "profile-card", title: "Profile Card" },
    { id: "rank-system", title: "Operator Rank System" },
    { id: "badges", title: "Badges & Awards" },
    { id: "statistics", title: "Statistics" },
    { id: "qsl-cards", title: "QSL Cards" },
    { id: "public-profiles", title: "Public Profiles" },
    { id: "completeness", title: "Completeness Indicator" },
    { id: "overview-tab", title: "Overview Tab" },
    { id: "social-tab", title: "Social Tab" },
  ],
};

// ─── Section component map ───────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<string, React.FC> = {
  "getting-started": GettingStartedSection,
  dashboard: DashboardSection,
  "solar-pulse": SolarPulseSection,
  propsphere: PropSphereSection,
  "dx-wizard": DXWizardSection,
  "band-planner": BandPlannerSection,
  "sdr-console": SdrConsoleSection,
  logbook: LogbookSection,
  contest: ContestSection,
  "radio-shack": ShackSection,
  settings: SettingsSection,
  profile: ProfileSection,
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function HelpArticlePage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const isMobile = useIsMobile();
  const [allExpanded, setAllExpanded] = useState(false);

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      window.dispatchEvent(new CustomEvent("help-collapse-all"));
    } else {
      window.dispatchEvent(new CustomEvent("help-expand-all"));
    }
    setAllExpanded((prev) => !prev);
  }, [allExpanded]);

  const section = useMemo(
    () => HELP_SECTIONS.find((s) => s.id === sectionId),
    [sectionId],
  );

  if (!section) {
    return (
      <main className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">
          Section Not Found
        </h1>
        <p className="text-sm text-gray-400 mb-4">
          The help section you are looking for does not exist.
        </p>
        <Link
          to="/help"
          className="text-sm text-plasma-orange hover:underline focus-visible:ring-2 focus-visible:ring-plasma-orange/60 focus-visible:outline-none rounded"
        >
          Back to Help Center
        </Link>
      </main>
    );
  }

  const SectionComponent = SECTION_COMPONENTS[section.id];
  const tocItems = SECTION_TOC[section.id] ?? [];

  return (
    <main className="max-w-[1040px] mx-auto px-4 sm:px-6 py-6">
      {/* Skip to content link */}
      <a
        href="#help-article-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-gray-900 focus:text-plasma-orange focus:rounded-lg focus:ring-2 focus:ring-plasma-orange/60"
      >
        Skip to content
      </a>

      {/* Breadcrumbs — component renders its own <nav aria-label="Breadcrumb"> */}
      <HelpBreadcrumbs
        items={[{ label: "Help", href: "/help" }, { label: section.title }]}
      />

      {/* Section header */}
      <header className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1
              id="help-article-heading"
              className="text-2xl font-bold text-gray-100 mb-1"
            >
              {section.title}
            </h1>
            <p className="text-sm text-gray-400">{section.description}</p>
          </div>
          {tocItems.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2.5 py-1.5 rounded-lg border border-white/5 hover:border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60"
              data-print-hide
            >
              {allExpanded ? "Collapse All" : "Expand All"}
            </button>
          )}
        </div>
      </header>

      {/* Mobile TOC */}
      {isMobile && tocItems.length > 0 && <HelpArticleTOC items={tocItems} />}

      {/* Desktop: sidebar + content layout */}
      <div className={isMobile ? "" : "flex gap-8"}>
        {/* Desktop TOC sidebar */}
        {!isMobile && tocItems.length > 0 && (
          <HelpArticleTOC items={tocItems} />
        )}

        {/* Content */}
        <article
          id="help-article-content"
          className="flex-1 min-w-0 max-w-[800px]"
          aria-labelledby="help-article-heading"
        >
          {SectionComponent ? (
            <SectionComponent />
          ) : (
            <div className="text-center py-16">
              <h2 className="text-lg font-semibold text-gray-300 mb-2">
                Section Not Found
              </h2>
              <Link
                to="/help"
                className="text-sm text-plasma-orange hover:underline focus-visible:ring-2 focus-visible:ring-plasma-orange/60 focus-visible:outline-none rounded"
              >
                Back to Help Center
              </Link>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}

/**
 * SettingsPage — Application configuration hub.
 *
 * Replaces SettingsModal with a full-page routed experience.
 * Desktop: 200px sticky sidebar + scrollable content (max-width 720px).
 * Mobile: stacked sections with horizontal pill nav.
 *
 * 5 sections: Preferences, Appearance, Notifications, Connections, Data & Account
 * URL deep-linking: /settings/preferences, /settings/appearance, etc.
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PreferencesSection } from "@/components/settings/sections/PreferencesSection";
import { AppearanceSection } from "@/components/settings/sections/AppearanceSection";
import { NotificationsSection } from "@/components/settings/sections/NotificationsSection";
import { ConnectionsSection } from "@/components/settings/sections/ConnectionsSection";
import { DataAccountSection } from "@/components/settings/sections/DataAccountSection";

// ─── Section definitions ─────────────────────────────────────────────────────

interface SectionDef {
  id: string;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: "preferences", label: "Preferences", icon: "⚙️" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "connections", label: "Connections", icon: "🔌" },
  { id: "data", label: "Data & Account", icon: "💾" },
];

// ─── Component map ───────────────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<string, React.FC> = {
  preferences: PreferencesSection,
  appearance: AppearanceSection,
  notifications: NotificationsSection,
  connections: ConnectionsSection,
  data: DataAccountSection,
};

// ─── Desktop Sidebar ─────────────────────────────────────────────────────────

function SettingsSidebar({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="w-[200px] flex-shrink-0 sticky top-0 self-start pt-2">
      <div className="space-y-1">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === section.id
                ? "bg-plasma-orange/15 text-plasma-orange"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            }`}
          >
            <span className="mr-2">{section.icon}</span>
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Mobile Pill Nav ─────────────────────────────────────────────────────────

function SettingsMobileNav({
  activeSection,
  onSelect,
}: {
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = scrollRef.current?.querySelector("[data-active=true]");
    if (active) {
      active.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [activeSection]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto scrollbar-none px-4 py-3 -mx-4 mb-4"
    >
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          data-active={activeSection === section.id}
          onClick={() => onSelect(section.id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            activeSection === section.id
              ? "bg-plasma-orange text-white"
              : "bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10"
          }`}
        >
          <span className="mr-1">{section.icon}</span>
          {section.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  // Derive active section from URL hash or path
  const activeSection = useMemo(() => {
    // Support /settings/preferences, /settings/appearance, etc.
    const pathParts = location.pathname.split("/");
    const section = pathParts[2]; // /settings/<section>
    if (section && SECTIONS.some((s) => s.id === section)) {
      return section;
    }
    return SECTIONS[0].id;
  }, [location.pathname]);

  const handleSectionSelect = useCallback(
    (sectionId: string) => {
      navigate(`/settings/${sectionId}`, { replace: true });
    },
    [navigate],
  );

  // ─── Desktop layout ───────────────────────────────────────────────────

  if (!isMobile) {
    const ActiveComponent = SECTION_COMPONENTS[activeSection];
    return (
      <div className="flex gap-8 max-w-[960px] mx-auto px-6 py-6">
        <SettingsSidebar
          activeSection={activeSection}
          onSelect={handleSectionSelect}
        />
        <div className="flex-1 min-w-0 max-w-[720px]">
          <h1 className="text-2xl font-bold text-gray-100 mb-1">
            {SECTIONS.find((s) => s.id === activeSection)?.label}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {getSectionDescription(activeSection)}
          </p>
          {ActiveComponent && <ActiveComponent />}
        </div>
      </div>
    );
  }

  // ─── Mobile layout ────────────────────────────────────────────────────

  return (
    <div className="px-4 py-4">
      <h1 className="text-xl font-bold text-gray-100 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-3">Configure your experience</p>

      <SettingsMobileNav
        activeSection={activeSection}
        onSelect={handleSectionSelect}
      />

      {(() => {
        const section = SECTIONS.find((s) => s.id === activeSection);
        const Component = section ? SECTION_COMPONENTS[section.id] : null;
        if (!Component || !section) return null;
        return (
          <div className="rounded-2xl bg-panel/30 border border-white/5 p-4">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">
              {section.label}
            </h2>
            <Component />
          </div>
        );
      })()}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSectionDescription(sectionId: string): string {
  switch (sectionId) {
    case "preferences":
      return "Display, map, propagation, and band preferences";
    case "appearance":
      return "Theme and color customization";
    case "notifications":
      return "Propagation alerts, audio, and watch notifications";
    case "connections":
      return "DX Cluster and CAT rig control connections";
    case "data":
      return "Export, import, and account management";
    default:
      return "";
  }
}

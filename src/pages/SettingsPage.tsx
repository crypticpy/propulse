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

const SECTION_ICONS: Record<string, React.ReactNode> = {
  preferences: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.248a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.282c-.062-.373-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  ),
  appearance: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z"
      />
    </svg>
  ),
  notifications: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  ),
  connections: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
      />
    </svg>
  ),
  data: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  ),
};

const SECTIONS: SectionDef[] = [
  { id: "preferences", label: "Preferences", icon: "preferences" },
  { id: "appearance", label: "Appearance", icon: "appearance" },
  { id: "notifications", label: "Notifications", icon: "notifications" },
  { id: "connections", label: "Connections", icon: "connections" },
  { id: "data", label: "Data & Account", icon: "data" },
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
            <span className="mr-2 inline-flex">
              {SECTION_ICONS[section.id]}
            </span>
            {section.label}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-6 px-3 text-xs text-gray-600">v0.11.0</div>
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
          <span className="mr-1 inline-flex">{SECTION_ICONS[section.id]}</span>
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

  // Escape key navigates to home (not back, which could leave the app)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't navigate if a modal, dropdown, or other overlay is active
        if (
          document.querySelector("[role=dialog]") ||
          document.querySelector("[data-radix-popper-content-wrapper]")
        )
          return;
        navigate("/");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

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

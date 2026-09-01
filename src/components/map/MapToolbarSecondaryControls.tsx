import type { BuiltinProfileId } from "@/types/operatingProfile";
import { ClusterPopover } from "./ClusterPopover";
import { ColorsPopover } from "./ColorsPopover";
import { ProfilePopover } from "./ProfilePopover";
import { WatchPopover } from "./WatchPopover";
import { WatchStatusPill } from "./WatchStatusPill";

interface MapToolbarSecondaryControlsProps {
  activeProfile: BuiltinProfileId | null;
  activityPanelOpen: boolean;
  closeMenu: () => void;
  inMenu: boolean;
  onCyclePanelLayout: () => void;
  onEnterObservatory: () => void;
  onSelectProfile: (profileId: BuiltinProfileId | null) => void;
  onToggleActivity: () => void;
  panelLayoutActive: boolean;
  panelLayoutTitle: string;
  showPanelControl: boolean;
}

const ToolbarDivider = () => <div className="h-5 w-px bg-white/10" />;

export function MapToolbarSecondaryControls({
  activeProfile,
  activityPanelOpen,
  closeMenu,
  inMenu,
  onCyclePanelLayout,
  onEnterObservatory,
  onSelectProfile,
  onToggleActivity,
  panelLayoutActive,
  panelLayoutTitle,
  showPanelControl,
}: MapToolbarSecondaryControlsProps) {
  return (
    <>
      {!inMenu && <ToolbarDivider />}
      <ColorsPopover />
      <ProfilePopover
        activeProfile={activeProfile}
        onSelectProfile={(profileId) => {
          onSelectProfile(profileId);
          if (inMenu) closeMenu();
        }}
      />

      <button
        type="button"
        onClick={() => {
          onEnterObservatory();
          closeMenu();
        }}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        title="Observatory Mode — fullscreen auto-rotating globe, zoom only"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
        Observatory
      </button>

      {showPanelControl && (
        <button
          type="button"
          className={`hidden items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors lg:flex ${
            panelLayoutActive
              ? "bg-plasma-orange/15 text-plasma-orange hover:bg-plasma-orange/25"
              : "text-gray-300 hover:bg-white/10 hover:text-white"
          }`}
          title={panelLayoutTitle}
          onClick={() => {
            onCyclePanelLayout();
            closeMenu();
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="1" y="1" width="12" height="12" rx="1.5" />
            <line x1="4" y1="1" x2="4" y2="13" />
            <line x1="10" y1="1" x2="10" y2="13" />
          </svg>
          Panels
        </button>
      )}

      <WatchPopover />
      {!inMenu && <WatchStatusPill />}
      <ClusterPopover />

      <button
        type="button"
        onClick={() => {
          onToggleActivity();
          closeMenu();
        }}
        aria-expanded={activityPanelOpen}
        aria-controls="nearby-activity-map-drawer"
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          activityPanelOpen
            ? "bg-plasma-orange/15 text-plasma-orange hover:bg-plasma-orange/25"
            : "text-gray-300 hover:bg-white/10 hover:text-white"
        }`}
        title="Find stations heard recently by band or exact frequency"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          aria-hidden="true"
        >
          <path d="M2 10.5h10M3.5 8V5.5M7 8V2.5M10.5 8V4" />
          <circle cx="3.5" cy="4.5" r="1" />
          <circle cx="7" cy="9" r="1" />
          <circle cx="10.5" cy="3" r="1" />
        </svg>
        Activity
      </button>
    </>
  );
}

export default MapToolbarSecondaryControls;

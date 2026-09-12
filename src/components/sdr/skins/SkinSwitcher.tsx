/**
 * Compact skin switcher toggle for the SDR Console header.
 * Hidden on mobile (always Classic).
 */

import type { SdrSkinName } from "./types";

const SKIN_LABELS: Record<SdrSkinName, string> = {
  classic: "Classic",
  flexible: "Flexible",
  fate: "F8",
};

interface SkinSwitcherProps {
  activeSkin: SdrSkinName;
  onSkinChange: (skin: SdrSkinName) => void;
  isMobile: boolean;
}

export function SkinSwitcher({
  activeSkin,
  onSkinChange,
  isMobile,
}: SkinSwitcherProps) {
  if (isMobile) return null;

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-su-line/40 bg-su-line/10 p-0.5">
      {(Object.keys(SKIN_LABELS) as SdrSkinName[]).map((skin) => (
        <button
          key={skin}
          type="button"
          onClick={() => onSkinChange(skin)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            activeSkin === skin
              ? "bg-plasma-orange/15 text-su-text"
              : "text-su-muted hover:text-su-text"
          }`}
        >
          {SKIN_LABELS[skin]}
        </button>
      ))}
    </div>
  );
}

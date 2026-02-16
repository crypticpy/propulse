/**
 * Compact skin switcher toggle for the SDR Console header.
 * Hidden on mobile (always Classic).
 */

import type { SdrSkinName } from "./types";

const SKIN_LABELS: Record<SdrSkinName, string> = {
  classic: "Classic",
  flexible: "Flexible",
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
    <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.03] p-0.5">
      {(Object.keys(SKIN_LABELS) as SdrSkinName[]).map((skin) => (
        <button
          key={skin}
          type="button"
          onClick={() => onSkinChange(skin)}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
            activeSkin === skin
              ? "bg-plasma-orange/15 text-plasma-orange"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {SKIN_LABELS[skin]}
        </button>
      ))}
    </div>
  );
}

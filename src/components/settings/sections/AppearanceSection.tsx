/**
 * Appearance section for Settings page.
 * Wraps the existing AppearanceSettings component with section header.
 */

import { AppearanceSettings } from "@/components/settings/AppearanceSettings";

export function AppearanceSection() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Accent Color
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Choose a color theme for the interface
        </p>
        <AppearanceSettings />
      </div>

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Theme
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Propulse is designed for dark environments. Light mode is not
          currently supported.
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg text-sm font-medium bg-plasma-orange text-white">
            Dark
          </button>
          <button
            disabled
            className="px-4 py-2 rounded-lg text-sm font-medium bg-void-black text-gray-600 border border-white/5 cursor-not-allowed"
          >
            Light
          </button>
        </div>
      </div>
    </div>
  );
}

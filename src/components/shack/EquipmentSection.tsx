/**
 * EquipmentSection -- Unified scrollable equipment view that renders all 5
 * equipment managers in vertical sections with headers and counts.
 *
 * Shows a SetupWizard when the shack is empty, or a compact empty-state CTA
 * if the wizard has been dismissed.
 */

import { useState } from "react";
import { useShackStore } from "@/stores/shackStore";
import { RadioManager } from "@/components/settings/RadioManager";
import { AntennaManager } from "@/components/shack/AntennaManager";
import { FeedlineManager } from "@/components/shack/FeedlineManager";
import { AccessoryManager } from "@/components/shack/AccessoryManager";
import { InlineComponentManager } from "@/components/shack/InlineComponentManager";
import { SetupWizard } from "./SetupWizard";

// ---- Component --------------------------------------------------------------

export function EquipmentSection() {
  const [wizardDismissed, setWizardDismissed] = useState(false);

  const totalCount = useShackStore(
    (s) =>
      s.radios.length +
      s.antennas.length +
      s.feedlines.length +
      s.accessories.length +
      s.inlineComponents.length,
  );

  // ---- Empty state: show wizard or CTA ----
  if (totalCount === 0 && !wizardDismissed) {
    return <SetupWizard onComplete={() => setWizardDismissed(true)} />;
  }

  if (totalCount === 0 && wizardDismissed) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-plasma-orange/10 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-plasma-orange"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-200">
          No Equipment Yet
        </h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Add radios, antennas, feedlines, and accessories to build out your
          station.
        </p>
        <button
          type="button"
          onClick={() => setWizardDismissed(false)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-plasma-orange text-white text-sm font-medium hover:bg-plasma-orange/90 transition-colors min-h-[44px]"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Start Setup Wizard
        </button>
      </div>
    );
  }

  // ---- Populated: render all sections ----
  // Each manager renders its own section header (label + count + add button),
  // so EquipmentSection just spaces them vertically.
  return (
    <div className="space-y-8">
      <RadioManager />
      <AntennaManager />
      <FeedlineManager />
      <AccessoryManager />
      <InlineComponentManager />
    </div>
  );
}

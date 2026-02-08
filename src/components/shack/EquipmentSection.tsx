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

  const radioCount = useShackStore((s) => s.radios.length);
  const antennaCount = useShackStore((s) => s.antennas.length);
  const feedlineCount = useShackStore((s) => s.feedlines.length);
  const accessoryCount = useShackStore((s) => s.accessories.length);
  const inlineCount = useShackStore((s) => s.inlineComponents.length);

  const totalCount =
    radioCount + antennaCount + feedlineCount + accessoryCount + inlineCount;

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
  const sections = [
    { label: "RADIOS", count: radioCount, content: <RadioManager /> },
    { label: "ANTENNAS", count: antennaCount, content: <AntennaManager /> },
    { label: "FEEDLINES", count: feedlineCount, content: <FeedlineManager /> },
    {
      label: "ACCESSORIES",
      count: accessoryCount,
      content: <AccessoryManager />,
    },
    {
      label: "INLINE COMPONENTS",
      count: inlineCount,
      content: <InlineComponentManager />,
    },
  ];

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.label}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {section.label}
            </h2>
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
              {section.count}
            </span>
          </div>
          {section.content}
        </section>
      ))}
    </div>
  );
}

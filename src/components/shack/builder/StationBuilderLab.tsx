/**
 * StationBuilderLab -- Top-level assembly component for the visual signal
 * chain builder.
 *
 * Thin wrapper that handles empty/onboarding states and delegates the
 * multi-chain accordion view to AllChainsView.
 *
 * Empty-state logic:
 *   1. No equipment at all → equipment-first onboarding cards
 *   2. Has equipment, no chains → enhanced "create first chain" CTA
 *   3. Has chains → AllChainsView
 */

import { useState, useCallback } from "react";
import {
  useShackStore,
  useStationChains,
  useUserRadios,
  useUserAntennas,
  useUserFeedlines,
} from "@/stores/shackStore";
import { AllChainsView } from "./AllChainsView";

// ─── Color map (Tailwind can't detect dynamic template-literal classes) ──────

type OnboardingColor =
  | "plasma-orange"
  | "signal-green"
  | "caution-amber"
  | "feedline-teal";

const COLOR_CLASSES: Record<
  OnboardingColor,
  {
    border: string;
    bg: string;
    hoverBg: string;
    hoverBorder: string;
    iconBg: string;
    text: string;
  }
> = {
  "plasma-orange": {
    border: "border-plasma-orange/20",
    bg: "bg-plasma-orange/5",
    hoverBg: "hover:bg-plasma-orange/10",
    hoverBorder: "hover:border-plasma-orange/40",
    iconBg: "bg-plasma-orange/15",
    text: "text-plasma-orange",
  },
  "signal-green": {
    border: "border-signal-green/20",
    bg: "bg-signal-green/5",
    hoverBg: "hover:bg-signal-green/10",
    hoverBorder: "hover:border-signal-green/40",
    iconBg: "bg-signal-green/15",
    text: "text-signal-green",
  },
  "caution-amber": {
    border: "border-caution-amber/20",
    bg: "bg-caution-amber/5",
    hoverBg: "hover:bg-caution-amber/10",
    hoverBorder: "hover:border-caution-amber/40",
    iconBg: "bg-caution-amber/15",
    text: "text-caution-amber",
  },
  "feedline-teal": {
    border: "border-feedline-teal/20",
    bg: "bg-feedline-teal/5",
    hoverBg: "hover:bg-feedline-teal/10",
    hoverBorder: "hover:border-feedline-teal/40",
    iconBg: "bg-feedline-teal/15",
    text: "text-feedline-teal",
  },
};

// ─── OnboardingCard ──────────────────────────────────────────────────────────

function OnboardingCard({
  icon,
  title,
  description,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: OnboardingColor;
  onClick: () => void;
}) {
  const c = COLOR_CLASSES[color];

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-3 p-5 rounded-xl border ${c.border} ${c.bg} ${c.hoverBg} ${c.hoverBorder} transition-all text-center group min-h-[44px]`}
    >
      <div
        className={`w-10 h-10 rounded-full ${c.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform`}
      >
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-200">{title}</h4>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
    </button>
  );
}

// ─── SVG Icons (24x24 viewBox, inline) ──────────────────────────────────────

function RadioIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function AntennaIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.115 5.19l.319 1.913A6 6 0 008.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 002.288-4.042 1.087 1.087 0 00-.358-1.099l-1.33-1.108c-.251-.21-.582-.299-.905-.245l-1.17.195a1.125 1.125 0 01-.98-.314l-.295-.295a1.125 1.125 0 010-1.591l.13-.132a1.125 1.125 0 011.3-.21l.603.302a.809.809 0 001.086-1.086L14.25 7.5l1.256-.837a4.5 4.5 0 001.528-1.732l.146-.292M6.115 5.19A9 9 0 1017.18 4.64M6.115 5.19A8.965 8.965 0 0112 3c1.929 0 3.716.607 5.18 1.64"
      />
    </svg>
  );
}

function CableIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5"
      />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

interface StationBuilderLabProps {
  onNavigateToEquipment?: () => void;
}

export function StationBuilderLab({
  onNavigateToEquipment,
}: StationBuilderLabProps) {
  const [selectedBand, setSelectedBand] = useState<string>("20m");

  // ── Store ──────────────────────────────────────────────────────────────
  const chains = useStationChains();
  const addChain = useShackStore((s) => s.addChain);
  const setActiveChain = useShackStore((s) => s.setActiveChain);

  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();

  const hasAnyEquipment =
    radios.length > 0 || antennas.length > 0 || feedlines.length > 0;

  // ── Create new chain ──────────────────────────────────────────────────
  const handleCreateChain = useCallback(() => {
    const chainId = addChain({
      name: `Signal Path ${chains.length + 1}`,
      nodes: [],
      feedlineRuns: [],
      operatingPowerWatts: 100,
      shackAccessoryIds: [],
    });
    if (chainId) setActiveChain(chainId);
  }, [addChain, setActiveChain, chains.length]);

  // ── Navigate to equipment tab ─────────────────────────────────────────
  const navigateToTab = useCallback(
    (_tab: "radios" | "antennas" | "feedlines") => {
      if (onNavigateToEquipment) {
        onNavigateToEquipment();
      } else {
        window.dispatchEvent(
          new CustomEvent("shack:navigate", {
            detail: { view: "equipment", tab: _tab },
          }),
        );
      }
    },
    [onNavigateToEquipment],
  );

  // ── Empty state: no equipment at all ───────────────────────────────────
  if (chains.length === 0 && !hasAnyEquipment) {
    return (
      <div className="space-y-4">
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-plasma-orange/10 flex items-center justify-center">
              <RadioIcon className="w-7 h-7 text-plasma-orange" />
            </div>
            <h3 className="text-lg font-semibold text-gray-200">
              Set Up Your Station
            </h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              To build signal paths, first add your equipment. Start with a
              radio, then add your feedlines and antennas.
            </p>
          </div>

          {/* Three equipment action cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <OnboardingCard
              icon={<RadioIcon className="w-5 h-5 text-plasma-orange" />}
              title="Add Your Radio"
              description="Your transceiver is the heart of every signal path"
              color="plasma-orange"
              onClick={() => navigateToTab("radios")}
            />
            <OnboardingCard
              icon={<AntennaIcon className="w-5 h-5 text-signal-green" />}
              title="Add Your Antenna"
              description="Wire, beam, vertical — add your antenna system"
              color="signal-green"
              onClick={() => navigateToTab("antennas")}
            />
            <OnboardingCard
              icon={<CableIcon className="w-5 h-5 text-feedline-teal" />}
              title="Add Your Feedline"
              description="Coax, ladder line, or hardline connecting it all"
              color="feedline-teal"
              onClick={() => navigateToTab("feedlines")}
            />
          </div>

          <p className="text-xs text-gray-500 text-center">
            Switch to the{" "}
            <button
              type="button"
              onClick={() => navigateToTab("radios")}
              className="text-plasma-orange hover:underline"
            >
              Equipment
            </button>{" "}
            tab to add equipment
          </p>
        </div>
      </div>
    );
  }

  // ── Empty state: has equipment but no chains ───────────────────────────
  if (chains.length === 0 && hasAnyEquipment) {
    return (
      <div className="space-y-4">
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
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.03a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-200">
              Build Your First Signal Path
            </h3>
            <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
              A signal path maps the route from your radio through cables and
              accessories to the antenna. Create one to visualize your setup and
              calculate performance.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              You have {radios.length} radio{radios.length !== 1 ? "s" : ""},{" "}
              {antennas.length} antenna{antennas.length !== 1 ? "s" : ""}, and{" "}
              {feedlines.length} feedline{feedlines.length !== 1 ? "s" : ""}{" "}
              ready
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateChain}
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
            Create Signal Path
          </button>
        </div>
      </div>
    );
  }

  // ── Multi-chain accordion view ───────────────────────────────────────────
  return (
    <div className="space-y-4">
      <AllChainsView
        selectedBand={selectedBand}
        onSelectBand={setSelectedBand}
      />
    </div>
  );
}

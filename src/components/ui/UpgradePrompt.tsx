/**
 * UpgradePrompt — Inline prompt for feature-gated areas.
 *
 * Shows a subtle lock icon + "Pro" pill + feature name + "Upgrade" link.
 * Compact mode shows just lock icon + "Pro" with a tooltip.
 */

import { useNavigate } from "react-router-dom";

interface UpgradePromptProps {
  feature: string;
  compact?: boolean;
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-3.5 h-3.5"}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

export function UpgradePrompt({
  feature,
  compact = false,
}: UpgradePromptProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    navigate("/settings/subscription");
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleUpgrade}
        title={`${feature} requires Pro. Click to upgrade.`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-500 hover:text-plasma-orange transition-colors"
      >
        <LockIcon className="w-3 h-3" />
        <span className="font-medium text-plasma-orange/70">Pro</span>
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 text-xs text-gray-500">
      <LockIcon />
      <span className="inline-flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 rounded bg-plasma-orange/15 text-plasma-orange font-semibold text-[10px] uppercase tracking-wide">
          Pro
        </span>
        <span>{feature}</span>
      </span>
      <button
        type="button"
        onClick={handleUpgrade}
        className="text-plasma-orange hover:text-plasma-orange/80 font-medium transition-colors underline underline-offset-2"
      >
        Upgrade
      </button>
    </div>
  );
}

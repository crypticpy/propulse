/**
 * ContestQuickStart — Expandable quick-start guide for a contest
 *
 * Shows "What to Say", "Exchange Format", "Common Mistakes", and
 * "Operating Strategy" in collapsible sections. Uses GlossaryTooltip
 * for technical terms.
 *
 * @module components/contest/ContestQuickStart
 */

import { useState } from "react";
import { generateQuickStart } from "@/lib/contest/contestQuickStart";
import { GlossaryTooltip } from "@/components/ui/GlossaryTooltip";

interface ContestQuickStartProps {
  /** Contest ID (definitionId or calendar entry ID) */
  contestId: string;
  /** Optional contest name to display in the guide header */
  contestName?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        className="flex items-center justify-between w-full py-2.5 text-left text-sm font-medium text-white hover:text-plasma-orange transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <div className="pb-3 text-sm text-gray-300 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContestQuickStart({
  contestId,
  contestName,
  className = "",
}: ContestQuickStartProps) {
  const guide = generateQuickStart(contestId, contestName);

  return (
    <div
      className={`rounded-xl border border-white/5 bg-panel p-4 ${className}`}
    >
      <h3 className="text-sm font-semibold text-white mb-2">
        Quick-Start Guide
      </h3>

      <Section title="What to Say" defaultOpen>
        <p>{guide.whatToSay}</p>
      </Section>

      <Section title="Exchange Format">
        <p>
          {guide.exchangeFormat
            .split(/(RST|CQ zone|serial number|grid square|state|section)/gi)
            .map((part, i) => {
              const lower = part.toLowerCase();
              if (lower === "rst")
                return (
                  <GlossaryTooltip key={i} term="rst">
                    {part}
                  </GlossaryTooltip>
                );
              if (lower === "cq zone")
                return (
                  <GlossaryTooltip key={i} term="cq-zone">
                    {part}
                  </GlossaryTooltip>
                );
              if (lower === "serial number")
                return (
                  <GlossaryTooltip key={i} term="serial-number">
                    {part}
                  </GlossaryTooltip>
                );
              if (lower === "grid square")
                return (
                  <GlossaryTooltip key={i} term="grid-square">
                    {part}
                  </GlossaryTooltip>
                );
              if (lower === "section")
                return (
                  <GlossaryTooltip key={i} term="section">
                    {part}
                  </GlossaryTooltip>
                );
              return <span key={i}>{part}</span>;
            })}
        </p>
      </Section>

      <Section title="Common Mistakes">
        <ul className="space-y-1.5">
          {guide.commonMistakes.map((mistake, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-alert-red mt-0.5 flex-shrink-0">
                &#x2717;
              </span>
              <span>{mistake}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Operating Strategy">
        <p>
          {guide.operatingStrategy
            .split(/(Search & Pounce|S&P|pileup|run|running)/gi)
            .map((part, i) => {
              const lower = part.toLowerCase();
              if (lower === "search & pounce" || lower === "s&p")
                return (
                  <GlossaryTooltip key={i} term="search-and-pounce">
                    {part}
                  </GlossaryTooltip>
                );
              if (lower === "pileup")
                return (
                  <GlossaryTooltip key={i} term="pileup">
                    {part}
                  </GlossaryTooltip>
                );
              if (lower === "run" || lower === "running")
                return (
                  <GlossaryTooltip key={i} term="run">
                    {part}
                  </GlossaryTooltip>
                );
              return <span key={i}>{part}</span>;
            })}
        </p>
      </Section>

      <Section title="Time Management">
        <p>{guide.timeManagement}</p>
      </Section>

      {guide.tips.length > 0 && (
        <Section title="Pro Tips">
          <ul className="space-y-1.5">
            {guide.tips.map((tip, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-signal-green mt-0.5 flex-shrink-0">
                  &#9679;
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

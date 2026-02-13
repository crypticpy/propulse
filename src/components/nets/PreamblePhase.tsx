/**
 * PreamblePhase -- First phase of the NCS Live Dashboard workflow.
 *
 * Renders the net preamble template with variable substitution so the NCS
 * operator can read it aloud. Provides an edit button to open the preamble
 * editor and a prominent advance button to move to the check-in phase.
 *
 * If no preamble template is configured, shows an empty state with options
 * to add one or skip directly to check-ins.
 */

import { useMemo } from "react";
import type { Net, NetSession } from "@/types/net";

// ── Template Variable Substitution ────────────────────────────────────────────

const TEMPLATE_TOKENS: { token: string; key: string }[] = [
  { token: "{{net_name}}", key: "net_name" },
  { token: "{{frequency}}", key: "frequency" },
  { token: "{{ncs_callsign}}", key: "ncs_callsign" },
  { token: "{{date}}", key: "date" },
  { token: "{{mode}}", key: "mode" },
];

function substitutePreamble(
  template: string,
  net: Net,
  session: NetSession,
): string {
  const values: Record<string, string> = {
    net_name: net.name,
    frequency: net.frequency,
    ncs_callsign: session.ncsCallsign,
    date: new Date().toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    mode: net.mode,
  };

  let result = template;
  for (const { token, key } of TEMPLATE_TOKENS) {
    result = result.split(token).join(values[key] ?? token);
  }
  return result;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PreamblePhaseProps {
  net: Net;
  session: NetSession;
  onAdvance: () => void;
  onEditPreamble: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PreamblePhase({
  net,
  session,
  onAdvance,
  onEditPreamble,
}: PreamblePhaseProps) {
  const hasPreamble = !!net.preambleTemplate?.trim();

  const renderedPreamble = useMemo(() => {
    if (!hasPreamble || !net.preambleTemplate) return "";
    return substitutePreamble(net.preambleTemplate, net, session);
  }, [hasPreamble, net, session]);

  // ── Empty state: no preamble configured ─────────────────────────────────

  if (!hasPreamble) {
    return (
      <div className="max-w-2xl mx-auto animate-in fade-in">
        {/* Context hint */}
        <p className="text-sm text-gray-400 text-center mb-4">
          Add a preamble to read aloud, or skip straight to check-ins
        </p>

        <div className="bg-white/[0.03] border border-white/5 border-l-2 border-l-plasma-orange/30 rounded-2xl p-8 text-center">
          {/* Microphone icon */}
          <div className="mb-5">
            <svg
              className="w-11 h-11 mx-auto text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </div>

          <p className="text-sm text-gray-400 mb-1">
            No preamble configured for this net.
          </p>
          <p className="text-xs text-gray-500 mb-6">
            You can add one now or skip straight to check-ins
          </p>

          <div className="flex flex-col items-center gap-4">
            {/* Skip is the primary action when there's no preamble */}
            <button
              type="button"
              onClick={onAdvance}
              className="group px-8 py-3 text-base font-semibold rounded-xl bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 transition-colors focus:outline-none focus:ring-2 focus:ring-plasma-orange/50"
              aria-label="Skip preamble and begin check-ins"
            >
              <span className="inline-flex items-center gap-2">
                Skip to Check-Ins
                <svg
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </button>

            <button
              type="button"
              onClick={onEditPreamble}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Add a preamble template"
            >
              Add Preamble
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Preamble display ────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in">
      {/* Context hint */}
      <p className="text-sm text-gray-400 text-center">
        Read your preamble aloud, then begin check-ins
      </p>

      {/* Preamble card */}
      <div
        className="bg-white/[0.03] backdrop-blur-md border border-white/10 border-l-[3px] border-l-plasma-orange rounded-2xl p-8"
        style={{
          boxShadow:
            "0 0 40px rgba(255,107,53,0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-orbitron font-semibold text-plasma-orange/80 uppercase tracking-[0.2em]">
            Preamble
          </h3>
          <button
            type="button"
            onClick={onEditPreamble}
            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Edit preamble template"
          >
            Edit
          </button>
        </div>

        {/* Rendered preamble text — large and readable at arm's length */}
        <p className="text-lg sm:text-xl text-gray-100 leading-loose whitespace-pre-wrap font-light tracking-wide">
          {renderedPreamble}
        </p>
      </div>

      {/* Advance button — prominent and centered */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onAdvance}
          className="group px-8 py-3 text-base font-semibold rounded-xl bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 hover:-translate-y-0.5 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-space"
          aria-label="Finish preamble and begin check-ins"
        >
          <span className="inline-flex items-center gap-2">
            Begin Check-Ins
            <svg
              className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

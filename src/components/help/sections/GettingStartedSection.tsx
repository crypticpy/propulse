/**
 * GettingStartedSection — Getting Started content for the Help Center.
 *
 * Uses HelpAccordion, HelpCallout, HelpShortcutTable, and HelpFAQ.
 */

import { Link } from "react-router-dom";
import { HelpAccordion } from "../HelpAccordion";
import { HelpCallout } from "../HelpCallout";
import { HelpShortcutTable } from "../HelpShortcutTable";
import { HelpFAQ } from "../HelpFAQ";
import { HelpIcons } from "../helpData";

const SHORTCUTS = [
  { key: "1", action: "Switch to Globe (3D) view" },
  { key: "2", action: "Switch to Flat map view" },
  { key: "3", action: "Switch to Azimuthal projection" },
  { key: "L", action: "Toggle Lite mode" },
  { key: "T", action: "Toggle path mode" },
  { key: "B", action: "Cycle band filter" },
  { key: "R", action: "Grid research" },
  { key: "P", action: "Add pin" },
  { key: "W", action: "Toggle watch" },
  { key: "Esc", action: "Clear selection / close panel" },
  { key: "?", action: "Show keyboard shortcuts" },
];

const FAQ_ITEMS = [
  {
    question: "Do I need an account?",
    answer:
      "No. Propulse works fully without an account \u2014 all data is stored locally in your browser. Creating a free account adds cloud sync, profiles, and social features.",
  },
  {
    question: "Does it work offline?",
    answer:
      "Most features work offline after the first load. Real-time data (spots, solar) requires an internet connection, but local tools like the logbook and contest logger work without it.",
  },
  {
    question: "What data do you collect?",
    answer:
      "We collect no personal data without an account. With an account, we store your profile, logbook, and settings on Supabase servers. We never sell data or track usage beyond basic analytics.",
  },
];

const NAV_ITEMS = [
  {
    icon: HelpIcons.chartBar,
    name: "Dashboard",
    desc: "Real-time band conditions and solar metrics",
  },
  {
    icon: HelpIcons.sun,
    name: "Solar Pulse",
    desc: "Deep-dive into space weather data",
  },
  {
    icon: HelpIcons.globe,
    name: "PropSphere",
    desc: "3D globe with live DX spots and propagation paths",
  },
  {
    icon: HelpIcons.crosshair,
    name: "DX Wizard",
    desc: "Filter and alert on DX cluster spots",
  },
  {
    icon: HelpIcons.calendar,
    name: "Band Planner",
    desc: "Band-time planning and propagation forecasts",
  },
  {
    icon: HelpIcons.radio,
    name: "SDR Console",
    desc: "Software-defined radio integration",
  },
  {
    icon: HelpIcons.book,
    name: "Logbook",
    desc: "QSO logging with ADIF import/export",
  },
  {
    icon: HelpIcons.trophy,
    name: "Contest",
    desc: "Contest logging and scoring",
  },
  {
    icon: HelpIcons.wrench,
    name: "Radio Shack",
    desc: "Equipment inventory and station setup",
  },
  {
    icon: HelpIcons.gear,
    name: "Settings",
    desc: "Preferences and configuration",
  },
  {
    icon: HelpIcons.user,
    name: "Profile",
    desc: "User profile, ranks, and badges",
  },
];

export function GettingStartedSection() {
  return (
    <div className="space-y-1">
      {/* What is Propulse? — always visible */}
      <div id="what-is-propulse" className="mb-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">
          What is Propulse?
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed">
          Propulse is a real-time ham radio propagation intelligence platform.
          It combines live solar data, DX cluster spots, propagation modeling,
          and operating tools into a single dashboard &mdash; all running in
          your browser with no installation required.
        </p>
        <HelpCallout type="tip">
          Propulse works without an account. All data is stored locally in your
          browser. Create a free account to unlock cloud sync, profiles, and
          social features.
        </HelpCallout>
      </div>

      {/* Quick Start */}
      <HelpAccordion
        id="quick-start"
        title="Quick Start"
        summary="Get up and running in 3 steps"
        defaultOpen
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-200 mb-1">
              Step 1: Explore the Dashboard
            </h4>
            <p className="text-sm text-gray-400">
              The Dashboard is your home page. It shows real-time band
              conditions, solar metrics (SFI, K-index, sunspot number), and a
              quick overview of propagation across all HF bands.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-200 mb-1">
              Step 2: Check Solar Pulse
            </h4>
            <p className="text-sm text-gray-400">
              Solar Pulse gives you a deep-dive into the space weather affecting
              propagation. View solar flux trends, geomagnetic indices, aurora
              probability, and solar event timelines.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-200 mb-1">
              Step 3: Open PropSphere
            </h4>
            <p className="text-sm text-gray-400">
              PropSphere is the interactive 3D globe showing live DX cluster
              spots and propagation paths. Zoom, rotate, and click on spots to
              see details. Use the band filter to focus on specific frequencies.
            </p>
          </div>
          <HelpCallout type="note">
            All three views update automatically with real-time data. No manual
            refresh needed.
          </HelpCallout>
        </div>
      </HelpAccordion>

      {/* Navigation Overview */}
      <HelpAccordion
        id="navigation-overview"
        title="Navigation Overview"
        summary="Sidebar pages and what they do"
      >
        <div className="space-y-2">
          {NAV_ITEMS.map((item) => (
            <div key={item.name} className="flex items-center gap-3 py-1.5">
              <span className="text-gray-500 flex-shrink-0">
                {item.icon("w-4 h-4")}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-200">
                  {item.name}
                </span>
                <span className="text-xs text-gray-500 ml-2">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </HelpAccordion>

      {/* Account Tiers */}
      <HelpAccordion
        id="account-tiers"
        title="Account Tiers"
        summary="No account required, free account, and Pro"
      >
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-gray-200 mb-1">
              No Account
            </h4>
            <p className="text-sm text-gray-400">
              Everything works out of the box. All data is stored locally in
              your browser using IndexedDB.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-200 mb-1">
              Free Account
            </h4>
            <p className="text-sm text-gray-400">
              Adds Radio Shack (equipment inventory), cloud-synced logbook, user
              profile page, operator ranks, and badges.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-200 mb-1">
              Pro Account
            </h4>
            <p className="text-sm text-gray-400">
              Adds spot replay, extended solar history, per-user propagation
              modeling, custom profile images, and priority data access.
            </p>
            <HelpCallout type="pro">
              Pro features are designed for serious DXers and contesters who
              want maximum propagation intelligence.
            </HelpCallout>
          </div>
          <p className="text-xs text-gray-500">
            See the{" "}
            <Link to="/features" className="text-plasma-orange hover:underline">
              full feature comparison
            </Link>{" "}
            for details.
          </p>
        </div>
      </HelpAccordion>

      {/* Keyboard Shortcuts */}
      <HelpAccordion
        id="keyboard-shortcuts"
        title="Keyboard Shortcuts"
        summary="Master table of all keyboard shortcuts"
      >
        <HelpShortcutTable shortcuts={SHORTCUTS} />
        <HelpCallout type="tip">
          Press{" "}
          <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-white/[0.06] border border-white/10 text-[10px] font-mono font-medium text-gray-300 mx-0.5">
            ?
          </kbd>{" "}
          anywhere in the app to see the shortcuts overlay.
        </HelpCallout>
      </HelpAccordion>

      {/* Getting Help */}
      <HelpAccordion
        id="getting-help"
        title="Getting Help"
        summary="Report issues and join the community"
      >
        <div className="space-y-2 text-sm text-gray-400">
          <p>
            Found a bug or have a feature request? Report issues on the{" "}
            <span className="text-plasma-orange">GitHub repository</span>.
          </p>
          <p>
            Join the community discussion to share tips, ask questions, and
            connect with other operators.
          </p>
        </div>
      </HelpAccordion>

      {/* FAQ */}
      <div id="faq" className="mt-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">
          Frequently Asked Questions
        </h2>
        <HelpFAQ items={FAQ_ITEMS} />
      </div>
    </div>
  );
}

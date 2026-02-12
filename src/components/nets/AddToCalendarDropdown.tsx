/**
 * AddToCalendarDropdown — Popover-anchored dropdown offering four calendar
 * integration options: .ics download, Google Calendar, Apple Calendar (webcal
 * subscription), and Outlook. Designed as a small popover near the trigger
 * button, per the project UX rules (no flyout/slide-in panels).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Net } from "@/types/net";
import {
  buildGoogleCalendarUrl,
  buildOutlookUrl,
  buildWebcalUrl,
  buildIcsDownloadUrl,
} from "@/lib/utils/calendarLinks";

// ── Types ───────────────────────────────────────────────────────────────────

interface AddToCalendarDropdownProps {
  net: Net;
  /** When true, render as a small icon-only button (for list rows). */
  compact?: boolean;
}

// ── Inline SVG Icons ────────────────────────────────────────────────────────

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="14" rx="2" />
      <line x1="3" y1="8" x2="17" y2="8" />
      <line x1="7" y1="2" x2="7" y2="5" />
      <line x1="13" y1="2" x2="13" y2="5" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3v10" />
      <path d="M6 10l4 4 4-4" />
      <path d="M4 16h12" />
    </svg>
  );
}

function GoogleCalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" />
      <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" />
      <line x1="7" y1="2" x2="7" y2="5" stroke="currentColor" />
      <line x1="13" y1="2" x2="13" y2="5" stroke="currentColor" />
      <text
        x="10"
        y="15"
        textAnchor="middle"
        fontSize="6"
        fontWeight="bold"
        fill="#4285F4"
        stroke="none"
      >
        G
      </text>
    </svg>
  );
}

function AppleCalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" />
      <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" />
      <line x1="7" y1="2" x2="7" y2="5" stroke="currentColor" />
      <line x1="13" y1="2" x2="13" y2="5" stroke="currentColor" />
      <text
        x="10"
        y="15.5"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fill="#FF3B30"
        stroke="none"
      >
        31
      </text>
    </svg>
  );
}

function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" />
      <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" />
      <line x1="7" y1="2" x2="7" y2="5" stroke="currentColor" />
      <line x1="13" y1="2" x2="13" y2="5" stroke="currentColor" />
      <text
        x="10"
        y="15"
        textAnchor="middle"
        fontSize="6"
        fontWeight="bold"
        fill="#0078D4"
        stroke="none"
      >
        O
      </text>
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function AddToCalendarDropdown({
  net,
  compact = false,
}: AddToCalendarDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isRecurring = net.schedule?.pattern !== "adhoc" && !!net.schedule;

  // Pre-compute URLs (may be null for adhoc)
  const googleUrl = buildGoogleCalendarUrl(net);
  const outlookUrl = buildOutlookUrl(net);

  // ── Close on outside click ──────────────────────────────────────────────

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(e.target as Node)
    ) {
      setIsOpen(false);
    }
  }, []);

  // ── Close on Escape key ─────────────────────────────────────────────────

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, handleClickOutside, handleEscape]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleDownloadIcs = () => {
    window.open(buildIcsDownloadUrl(net.id), "_blank");
    setIsOpen(false);
  };

  const handleGoogle = () => {
    if (googleUrl) {
      window.open(googleUrl, "_blank", "noopener,noreferrer");
    }
    setIsOpen(false);
  };

  const handleApple = () => {
    window.location.href = buildWebcalUrl(net.id);
    setIsOpen(false);
  };

  const handleOutlook = () => {
    if (isRecurring) {
      // Outlook handles RRULE in .ics correctly — use the download
      window.open(buildIcsDownloadUrl(net.id), "_blank");
    } else if (outlookUrl) {
      window.open(outlookUrl, "_blank", "noopener,noreferrer");
    }
    setIsOpen(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger button */}
      {compact ? (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label="Add to calendar"
          className="p-1.5 text-gray-400 hover:text-plasma-orange rounded-lg hover:bg-white/5 transition-colors"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
        >
          <CalendarIcon className="w-4 h-4" />
          <span>Add to Calendar</span>
        </button>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 bg-void-black/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl z-50 py-1"
        >
          {/* Download .ics */}
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadIcs}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer text-left"
          >
            <DownloadIcon className="w-5 h-5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate">Download .ics</div>
              <div className="text-[11px] text-gray-500">
                Works with all calendar apps
              </div>
            </div>
          </button>

          <div className="h-px bg-white/5 my-1" />

          {/* Google Calendar */}
          <button
            type="button"
            role="menuitem"
            onClick={handleGoogle}
            disabled={!googleUrl}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-300"
          >
            <GoogleCalendarIcon className="w-5 h-5 flex-shrink-0" />
            <div className="truncate">Google Calendar</div>
          </button>

          {/* Apple Calendar (webcal subscription) */}
          <button
            type="button"
            role="menuitem"
            onClick={handleApple}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer text-left"
          >
            <AppleCalendarIcon className="w-5 h-5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate">Apple Calendar</div>
              {isRecurring && (
                <div className="text-[11px] text-gray-500">
                  Subscribe to feed
                </div>
              )}
            </div>
          </button>

          {/* Outlook */}
          <button
            type="button"
            role="menuitem"
            onClick={handleOutlook}
            disabled={!isRecurring && !outlookUrl}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-300"
          >
            <OutlookIcon className="w-5 h-5 flex-shrink-0" />
            <div className="truncate">Outlook</div>
          </button>
        </div>
      )}
    </div>
  );
}

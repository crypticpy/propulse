/**
 * WelcomeOverlay -- First-visit onboarding modal with 4 slides.
 *
 * Portal-rendered (z-[500]) centered modal that introduces new visitors
 * to Propulse. Persists dismissal to localStorage so it only appears once.
 *
 * Slides:
 *  0 - Welcome / branding
 *  1 - Main views showcase (Dashboard, Solar Pulse, PropSphere)
 *  2 - Operating tools (DX Wizard, Band Planner, LogBook, Contest, Shack, SDR)
 *  3 - Community-first + sign-up value proposition
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useKioskStore } from "@/stores/kioskStore";

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "propulse-welcome-seen";
const TOTAL_SLIDES = 4;

// ── Visibility hook ──────────────────────────────────────────────────────────

function useWelcomeVisible(): [boolean, () => void] {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore storage errors
    }
  }, []);

  return [visible, dismiss];
}

// ── SVG Icons ────────────────────────────────────────────────────────────────

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function WizardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8L19 13" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2L19 5" />
      <path d="M11 6.2L9.7 5" />
      <path d="M2 22l7-7" />
      <path d="M9 15l3.5 3.5" />
      <path d="M2 22l3.5-3.5" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function RadioIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  );
}

function ShackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Slide Components ─────────────────────────────────────────────────────────

function WelcomeSlide({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-8 sm:px-10 sm:py-10">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-plasma-orange/20 blur-2xl animate-pulse" />
        <h1 className="relative font-orbitron text-3xl sm:text-4xl font-black text-gradient-orange tracking-wider">
          PROPULSE
        </h1>
      </div>

      <p className="text-gray-300 text-sm sm:text-base max-w-sm leading-relaxed mb-2">
        The complete ham radio propagation platform
      </p>
      <p className="text-gray-500 text-xs max-w-xs leading-relaxed mb-8">
        Real-time solar data, live DX activity, propagation modeling, contest
        tools, and everything you need in one place.
      </p>

      <button
        onClick={onNext}
        className="px-8 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-plasma-orange to-amber-500 text-white hover:brightness-110 transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
      >
        See What's Inside
      </button>
    </div>
  );
}

function ViewsSlide({ onNext }: { onNext: () => void }) {
  const views = [
    {
      icon: <DashboardIcon className="w-5 h-5" />,
      title: "Dashboard Hub",
      details:
        "Live solar conditions, band-by-band propagation status, K-index trends, DX cluster pulse, and operating predictions — all at a glance.",
    },
    {
      icon: <SunIcon className="w-5 h-5" />,
      title: "Solar Pulse",
      details:
        "Deep space weather analysis with solar flux, K-index, magnetometer, aurora probability, flare forecasts, and draggable chart panels.",
    },
    {
      icon: <GlobeIcon className="w-5 h-5" />,
      title: "PropSphere Globe",
      details:
        "Interactive 3D globe with live DX spots, MUF visualization, greyline terminator, satellite tracks, aurora oval, and hazard layers.",
    },
  ];

  return (
    <div className="flex flex-col px-6 py-6 sm:px-8 sm:py-8">
      <h2 className="font-orbitron text-lg sm:text-xl font-bold text-white tracking-wide text-center mb-1">
        Your Radio Command Center
      </h2>
      <p className="text-xs text-gray-500 text-center mb-5">
        Three powerful views to monitor the ionosphere
      </p>

      <div className="space-y-3 mb-6">
        {views.map((v) => (
          <div
            key={v.title}
            className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
          >
            <div className="w-9 h-9 shrink-0 rounded-lg bg-plasma-orange/15 text-plasma-orange flex items-center justify-center mt-0.5">
              {v.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white mb-0.5">
                {v.title}
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {v.details}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="self-center px-6 py-3 rounded-xl font-semibold text-sm bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30 transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
      >
        Wait, There's More
      </button>
    </div>
  );
}

function ToolsSlide({ onNext }: { onNext: () => void }) {
  const tools = [
    {
      icon: <WizardIcon className="w-4 h-4" />,
      name: "DX Wizard",
      desc: "Grid-to-grid path analysis with SNR predictions for every band",
    },
    {
      icon: <CalendarIcon className="w-4 h-4" />,
      name: "Band Planner",
      desc: "24-hour propagation forecast with optimal operating windows",
    },
    {
      icon: <BookIcon className="w-4 h-4" />,
      name: "LogBook",
      desc: "QSO logging with ADIF import/export and awards tracking",
    },
    {
      icon: <TrophyIcon className="w-4 h-4" />,
      name: "Contest Logger",
      desc: "Real-time scoring, keyboard hotkeys, multiplier tracking, and rate sheets",
    },
    {
      icon: <ShackIcon className="w-4 h-4" />,
      name: "Radio Shack",
      desc: "Equipment inventory, signal path diagrams, and performance analysis",
    },
    {
      icon: <RadioIcon className="w-4 h-4" />,
      name: "SDR Console",
      desc: "Spectrum, waterfall, and WSJT-X integration via Radio Daemon",
      soon: true,
    },
  ];

  return (
    <div className="flex flex-col px-6 py-6 sm:px-8 sm:py-8">
      <h2 className="font-orbitron text-lg sm:text-xl font-bold text-white tracking-wide text-center mb-1">
        Powerful Operating Tools
      </h2>
      <p className="text-xs text-gray-500 text-center mb-5">
        Everything an operator needs, built in
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
        {tools.map((t) => (
          <div
            key={t.name}
            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/5"
          >
            <div className="w-7 h-7 shrink-0 rounded-md bg-plasma-orange/10 text-plasma-orange flex items-center justify-center mt-0.5">
              {t.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-semibold text-white">{t.name}</h3>
                {t.soon && (
                  <span className="text-[9px] font-medium text-teal-400 border border-teal-400/40 bg-teal-400/10 px-1.5 py-0.5 rounded-full">
                    Adapter Coming Soon
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                {t.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-500/10 border border-purple-400/20 shadow-[0_0_12px_rgba(168,85,247,0.08)] mb-6">
        <span className="text-xs font-semibold text-purple-400">Plus:</span>
        <span className="text-xs text-purple-300/80">
          Operator profiles, rank badges, gamification, public QSL cards, system
          health monitoring, and more
        </span>
      </div>

      <button
        onClick={onNext}
        className="self-center px-6 py-3 rounded-xl font-semibold text-sm bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30 transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
      >
        How Does It Work?
      </button>
    </div>
  );
}

function CommunitySlide({ onFinish }: { onFinish: () => void }) {
  const freePerks = [
    "All real-time propagation data and solar monitoring",
    "Local logbook, contest logger, and band planner",
    "PropSphere globe with all map layers and overlays",
    "DX Wizard path predictions for any grid",
    "Operator profile with badges, rank, and gamification",
  ];

  const accountPerks = [
    "Personal Radio Shack with equipment diagrams",
    "Cloud-synced logbook, settings, and watch presets",
    "Custom profile photos and gear images",
    "Historical spot replay and extended 30-day history",
    "Per-station propagation modeling and ML predictions",
  ];

  return (
    <div className="flex flex-col px-6 py-6 sm:px-8 sm:py-8">
      <div className="flex items-center justify-center gap-2 mb-1">
        <UsersIcon className="w-5 h-5 text-signal-green" />
        <h2 className="font-orbitron text-lg sm:text-xl font-bold text-white tracking-wide">
          Built for the Community
        </h2>
      </div>
      <p className="text-xs text-gray-500 text-center mb-5">
        Everything works free with no account required
      </p>

      {/* Free tier */}
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-signal-green mb-2 uppercase tracking-wider">
          Free forever
        </h3>
        <ul className="space-y-1.5">
          {freePerks.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2 text-xs text-gray-300"
            >
              <CheckIcon className="w-3.5 h-3.5 text-signal-green shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Account perks */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-plasma-orange mb-2 uppercase tracking-wider">
          Create an account to unlock
        </h3>
        <ul className="space-y-1.5">
          {accountPerks.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2 text-xs text-gray-300"
            >
              <CheckIcon className="w-3.5 h-3.5 text-plasma-orange shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-gray-600 text-center leading-relaxed mb-6">
        Cloud features and extended modeling are available for a small monthly
        subscription that helps keep the servers running.
      </p>

      <button
        onClick={onFinish}
        className="self-center px-8 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-plasma-orange to-amber-500 text-white hover:brightness-110 transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
      >
        Start Exploring
      </button>
    </div>
  );
}

// ── Progress Dots ────────────────────────────────────────────────────────────

function ProgressDots({
  current,
  total,
  onDotClick,
}: {
  current: number;
  total: number;
  onDotClick: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 pb-5">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          onClick={() => onDotClick(i)}
          aria-label={`Go to slide ${i + 1}`}
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            i === current
              ? "bg-plasma-orange w-5"
              : "bg-white/20 hover:bg-white/40"
          }`}
        />
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WelcomeOverlay() {
  const [visible, dismiss] = useWelcomeVisible();
  // Unattended kiosk/wall-display screens must never block on a welcome dialog
  const isKiosk = useKioskStore((s) => s.active);
  const isDisplayRoute = useLocation().pathname.startsWith("/display/");
  const [slide, setSlide] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const goToSlide = useCallback(
    (next: number) => {
      if (next < 0 || next >= TOTAL_SLIDES || next === slide) return;
      setTransitioning(true);
      setTimeout(() => {
        setSlide(next);
        setTransitioning(false);
      }, 150);
    },
    [slide],
  );

  const next = useCallback(() => goToSlide(slide + 1), [goToSlide, slide]);
  const prev = useCallback(() => goToSlide(slide - 1), [goToSlide, slide]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss();
      } else if (e.key === "ArrowRight") {
        if (slide < TOTAL_SLIDES - 1) next();
      } else if (e.key === "ArrowLeft") {
        if (slide > 0) prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, slide, next, prev, dismiss]);

  // Body scroll lock
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [visible]);

  if (!visible || isKiosk || isDisplayRoute) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Propulse"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          aria-label="Close welcome overlay"
        >
          <CloseIcon className="w-4 h-4" />
        </button>

        {/* Slide content with fade transition */}
        <div
          className={`transition-all duration-150 ${
            transitioning
              ? "opacity-0 translate-y-1"
              : "opacity-100 translate-y-0"
          }`}
        >
          {slide === 0 && <WelcomeSlide onNext={next} />}
          {slide === 1 && <ViewsSlide onNext={next} />}
          {slide === 2 && <ToolsSlide onNext={next} />}
          {slide === 3 && <CommunitySlide onFinish={dismiss} />}
        </div>

        {/* Progress dots */}
        <ProgressDots
          current={slide}
          total={TOTAL_SLIDES}
          onDotClick={goToSlide}
        />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

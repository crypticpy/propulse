/**
 * FeaturesPage -- Comprehensive feature showcase with 3-tier comparison.
 *
 * Accessible at /features. Shows every Propulse feature organized by category,
 * with a clear breakdown of what's available at each tier:
 *   - No Account (anonymous, local-only, browser-bound)
 *   - Free Account (sign up, cloud basics, cross-device persistence)
 *   - Pro (paid, full cloud, advanced features)
 */

import { useNavigate } from "react-router-dom";
import { useAuthUIStore } from "@/stores/authUIStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/useIsMobile";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeatureRow {
  feature: string;
  noAccount: string;
  free: string;
  pro: string;
}

interface FeatureCategory {
  title: string;
  icon: React.ReactNode;
  description: string;
  features: FeatureRow[];
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

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

function ToolsIcon({ className }: { className?: string }) {
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
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
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

function SignalIcon({ className }: { className?: string }) {
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

function DatabaseIcon({ className }: { className?: string }) {
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
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
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

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Feature Data ──────────────────────────────────────────────────────────────

const MAIN_VIEWS: string[][] = [
  [
    "Dashboard Hub",
    "Real-time solar conditions, band-by-band propagation, K-index/A-index/flux/Bz charts, DX cluster pulse, operating predictions",
  ],
  [
    "Solar Pulse",
    "Solar flux, K-index, magnetometer, aurora probability, flare forecasts, event alerts, draggable panels",
  ],
  [
    "PropSphere Globe",
    "3D interactive globe, MUF visualization, greyline, satellite tracks, aurora oval, DX spot markers, hazard layers (earthquake/fire/lightning), multiple map projections (3D, flat, azimuthal, Ham Clock)",
  ],
];

const CATEGORIES: FeatureCategory[] = [
  {
    title: "Operating Tools",
    icon: <ToolsIcon className="w-5 h-5" />,
    description: "Everything you need to get on the air and work the bands",
    features: [
      {
        feature: "DX Wizard (path predictions)",
        noAccount: "Full access, local only",
        free: "Full access, cloud-synced",
        pro: "Full access + per-station ML models",
      },
      {
        feature: "Band Planner (24h forecast)",
        noAccount: "Full access, local only",
        free: "Full access, cloud-synced",
        pro: "Full access + extended forecasts",
      },
      {
        feature: "LogBook (QSO logging)",
        noAccount: "Local storage only, ADIF import/export",
        free: "Cloud-synced logbook, persists across devices",
        pro: "Cloud sync + extended history (30 days)",
      },
      {
        feature: "Contest Logger",
        noAccount: "Full local contest operation, scoring, hotkeys",
        free: "Cloud-synced contest sessions",
        pro: "Contest watch presets + historical replay",
      },
      {
        feature: "Radio Shack",
        noAccount: "Not available",
        free: "Equipment inventory, signal path diagrams, performance analysis",
        pro: "Full shack + custom gear photos uploaded",
      },
      {
        feature: "SDR Console",
        noAccount: "Spectrum, waterfall via Radio Daemon (Adapter coming soon)",
        free: "Same",
        pro: "Same",
      },
    ],
  },
  {
    title: "Profile & Social",
    icon: <UserIcon className="w-5 h-5" />,
    description: "Your operator identity and the ham radio community",
    features: [
      {
        feature: "Operator Profile",
        noAccount: "Basic local profile",
        free: "Public profile, callsign, bio, social links",
        pro: "Custom profile images, gear photos",
      },
      {
        feature: "QSL Card",
        noAccount: "Default SVG card",
        free: "Public shareable card",
        pro: "Custom images on card",
      },
      {
        feature: "Rank & Badges",
        noAccount: "Operator rank, gamification, streak tracking",
        free: "Same + public visibility",
        pro: "Same",
      },
      {
        feature: "Following / Social",
        noAccount: "Not available",
        free: "Follow operators, activity feed",
        pro: "Same",
      },
    ],
  },
  {
    title: "Propagation & Data",
    icon: <SignalIcon className="w-5 h-5" />,
    description: "Real-time ionospheric intelligence and spot analysis",
    features: [
      {
        feature: "Real-time propagation data",
        noAccount: "All data (solar, spots, bands)",
        free: "Same",
        pro: "Same",
      },
      {
        feature: "Spot Watch presets",
        noAccount: "5 saved watches",
        free: "5 saved watches",
        pro: "20 saved watches",
      },
      {
        feature: "Arc density limit",
        noAccount: "100",
        free: "100",
        pro: "200",
      },
      {
        feature: "Spot history",
        noAccount: "7 days (local)",
        free: "7 days",
        pro: "30 days + historical replay",
      },
      {
        feature: "Per-user propagation modeling",
        noAccount: "Shared global models",
        free: "Shared global models",
        pro: "Custom ray-casting from YOUR location, ML predictions for YOUR antenna/power",
      },
      {
        feature: "Saved locations",
        noAccount: "1 (home QTH)",
        free: "1 location",
        pro: "Multiple operating locations with per-location models",
      },
    ],
  },
  {
    title: "Data & Settings",
    icon: <DatabaseIcon className="w-5 h-5" />,
    description: "Keep your data safe, synced, and portable",
    features: [
      {
        feature: "Settings persistence",
        noAccount: "Browser localStorage (lost on clear)",
        free: "Cloud-synced settings",
        pro: "Cloud-synced settings",
      },
      {
        feature: "Watch presets",
        noAccount: "Local only",
        free: "Cloud-synced",
        pro: "Cloud-synced + more presets",
      },
      {
        feature: "Data export",
        noAccount: "ADIF export, settings backup",
        free: "Same + cloud backup",
        pro: "Same",
      },
      {
        feature: "Supabase storage",
        noAccount: "None",
        free: "Basic profile data",
        pro: "Full cloud storage (logbook, photos, sessions)",
      },
    ],
  },
];

// ── Tier Badge Component ──────────────────────────────────────────────────────

function TierBadge({
  tier,
  size = "md",
}: {
  tier: "none" | "free" | "pro";
  size?: "sm" | "md" | "lg";
}) {
  const config = {
    none: {
      label: "No Account",
      bg: "bg-white/[0.06]",
      border: "border-white/10",
      text: "text-gray-400",
      dot: "bg-gray-500",
    },
    free: {
      label: "Free Account",
      bg: "bg-signal-green/[0.08]",
      border: "border-signal-green/20",
      text: "text-signal-green",
      dot: "bg-signal-green",
    },
    pro: {
      label: "Pro",
      bg: "bg-plasma-orange/[0.08]",
      border: "border-plasma-orange/20",
      text: "text-plasma-orange",
      dot: "bg-plasma-orange",
    },
  }[tier];

  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5",
    md: "text-xs px-3 py-1",
    lg: "text-sm px-4 py-1.5",
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${config.bg} ${config.border} border ${config.text} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

// ── Cell Renderer ─────────────────────────────────────────────────────────────

function CellContent({
  text,
  tier,
}: {
  text: string;
  tier: "none" | "free" | "pro";
}) {
  const isNotAvailable =
    text.toLowerCase() === "not available" || text.toLowerCase() === "none";
  const isSame = text.toLowerCase() === "same";

  if (isNotAvailable) {
    return (
      <span className="flex items-center gap-1.5 text-gray-600">
        <XIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs">Not available</span>
      </span>
    );
  }

  const colorMap = {
    none: "text-gray-400",
    free: "text-gray-300",
    pro: "text-gray-300",
  };

  const checkColor = {
    none: "text-gray-500",
    free: "text-signal-green",
    pro: "text-plasma-orange",
  };

  return (
    <span className={`flex items-start gap-1.5 ${colorMap[tier]}`}>
      <CheckIcon
        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${checkColor[tier]}`}
      />
      <span className="text-xs leading-relaxed">
        {isSame ? "Same as previous tier" : text}
      </span>
    </span>
  );
}

// ── Desktop Feature Table ─────────────────────────────────────────────────────

function DesktopFeatureTable({ category }: { category: FeatureCategory }) {
  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden">
      {/* Category Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-white/[0.02]">
        <div className="w-9 h-9 rounded-xl bg-plasma-orange/10 text-plasma-orange flex items-center justify-center">
          {category.icon}
        </div>
        <div>
          <h3 className="font-orbitron text-base font-bold text-white tracking-wide">
            {category.title}
          </h3>
          <p className="text-xs text-gray-500">{category.description}</p>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-px bg-white/[0.03]">
        <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Feature
        </div>
        <div className="px-4 py-3 flex items-center gap-2">
          <TierBadge tier="none" size="sm" />
        </div>
        <div className="px-4 py-3 flex items-center gap-2">
          <TierBadge tier="free" size="sm" />
        </div>
        <div className="px-4 py-3 flex items-center gap-2">
          <TierBadge tier="pro" size="sm" />
        </div>
      </div>

      {/* Feature Rows */}
      {category.features.map((row, i) => (
        <div
          key={row.feature}
          className={`grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-px ${
            i % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"
          } ${i < category.features.length - 1 ? "border-b border-white/[0.03]" : ""}`}
        >
          <div className="px-4 py-3 flex items-start">
            <span className="text-sm font-medium text-gray-200">
              {row.feature}
            </span>
          </div>
          <div className="px-4 py-3">
            <CellContent text={row.noAccount} tier="none" />
          </div>
          <div className="px-4 py-3">
            <CellContent text={row.free} tier="free" />
          </div>
          <div className="px-4 py-3">
            <CellContent text={row.pro} tier="pro" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mobile Feature Card ───────────────────────────────────────────────────────

function MobileFeatureCard({ category }: { category: FeatureCategory }) {
  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden">
      {/* Category Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="w-8 h-8 rounded-lg bg-plasma-orange/10 text-plasma-orange flex items-center justify-center">
          {category.icon}
        </div>
        <div>
          <h3 className="font-orbitron text-sm font-bold text-white tracking-wide">
            {category.title}
          </h3>
          <p className="text-[11px] text-gray-500">{category.description}</p>
        </div>
      </div>

      {/* Feature Items - stacked cards */}
      <div className="divide-y divide-white/[0.03]">
        {category.features.map((row) => (
          <div key={row.feature} className="px-4 py-3 space-y-2">
            <h4 className="text-sm font-medium text-gray-200">{row.feature}</h4>
            <div className="space-y-1.5 pl-1">
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-[10px] font-semibold text-gray-500 w-16 uppercase tracking-wider">
                  Local
                </span>
                <CellContent text={row.noAccount} tier="none" />
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-[10px] font-semibold text-signal-green w-16 uppercase tracking-wider">
                  Free
                </span>
                <CellContent text={row.free} tier="free" />
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-[10px] font-semibold text-plasma-orange w-16 uppercase tracking-wider">
                  Pro
                </span>
                <CellContent text={row.pro} tier="pro" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Views Section ────────────────────────────────────────────────────────

function MainViewsSection() {
  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-4 sm:px-6 border-b border-white/5 bg-white/[0.02]">
        <div className="w-9 h-9 rounded-xl bg-plasma-orange/10 text-plasma-orange flex items-center justify-center">
          <DashboardIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-orbitron text-sm sm:text-base font-bold text-white tracking-wide">
            Main Views
          </h3>
          <p className="text-xs text-gray-500">
            Available to all tiers -- no restrictions
          </p>
        </div>
        <div className="ml-auto">
          <span className="text-[10px] sm:text-xs font-semibold text-signal-green bg-signal-green/10 border border-signal-green/20 rounded-full px-2.5 py-0.5">
            100% Free
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-6 sm:grid-cols-3">
        {MAIN_VIEWS.map(([title, desc]) => (
          <div
            key={title}
            className="p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors"
          >
            <h4 className="text-sm font-semibold text-white mb-1.5">{title}</h4>
            <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hero Section ──────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <header className="text-center pt-8 pb-6 sm:pt-12 sm:pb-10 px-4">
      {/* Glow effect */}
      <div className="relative inline-block mb-4">
        <div className="absolute inset-0 rounded-full bg-plasma-orange/15 blur-3xl scale-150" />
        <h1 className="relative font-orbitron text-2xl sm:text-4xl font-black text-gradient-orange tracking-wider">
          Everything You Need for Ham Radio
        </h1>
      </div>

      <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed mb-6">
        Propulse gives you a complete ham radio propagation platform. Every core
        feature works immediately with no sign-up. Create a free account to
        unlock cloud sync, or go Pro for advanced modeling and extended history.
      </p>

      {/* Tier pills */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <TierBadge tier="none" size="lg" />
        <svg
          aria-hidden="true"
          className="w-4 h-4 text-gray-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            d="M9 18l6-6-6-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <TierBadge tier="free" size="lg" />
        <svg
          aria-hidden="true"
          className="w-4 h-4 text-gray-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            d="M9 18l6-6-6-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <TierBadge tier="pro" size="lg" />
      </div>
    </header>
  );
}

// ── Value Proposition Callouts ────────────────────────────────────────────────

function ValueCallouts() {
  return (
    <div className="grid gap-4 sm:grid-cols-3 px-4 sm:px-0">
      {/* No Account */}
      <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <TierBadge tier="none" size="sm" />
          <h3 className="text-base font-semibold text-gray-200 mt-3 mb-2">
            Just open and use
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Every main view and most tools work instantly in your browser. No
            sign-up, no email, no tracking. Your data stays in localStorage on
            your device.
          </p>
          <p className="text-[11px] text-gray-600 mt-3 italic">
            Limitation: Data is tied to this browser only. Clear your cache and
            it's gone.
          </p>
        </div>
      </div>

      {/* Free Account */}
      <div className="rounded-2xl bg-signal-green/[0.03] border border-signal-green/10 p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-signal-green/[0.03] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <TierBadge tier="free" size="sm" />
          <h3 className="text-base font-semibold text-gray-200 mt-3 mb-2">
            Your data, everywhere
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Sign up with just an email and your settings, logbook, contest
            sessions, and watch presets sync to the cloud. Access from any
            browser, any device. Your data persists even if you clear your
            cache.
          </p>
          <p className="text-[11px] text-signal-green/60 mt-3 font-medium">
            Plus: Public operator profile, shareable QSL card, follow other
            operators.
          </p>
        </div>
      </div>

      {/* Pro */}
      <div className="rounded-2xl bg-plasma-orange/[0.03] border border-plasma-orange/10 p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-plasma-orange/[0.03] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <TierBadge tier="pro" size="sm" />
          <h3 className="text-base font-semibold text-gray-200 mt-3 mb-2">
            Your station, modeled
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Pro unlocks per-station ML propagation models custom to YOUR
            location, antenna, and power. Get extended 30-day spot history,
            historical replay, multiple saved locations, custom profile images,
            and expanded limits.
          </p>
          <p className="text-[11px] text-plasma-orange/60 mt-3 font-medium">
            Helps keep the servers running and the data flowing.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Bottom CTA ────────────────────────────────────────────────────────────────

function BottomCTA() {
  const navigate = useNavigate();
  const openAuthModal = useAuthUIStore((s) => s.openAuthModal);

  return (
    <div className="text-center py-10 sm:py-14 px-4">
      <h2 className="font-orbitron text-xl sm:text-2xl font-bold text-white tracking-wide mb-3">
        Ready to Get Started?
      </h2>
      <p className="text-sm text-gray-400 max-w-lg mx-auto mb-6">
        Jump into the dashboard and start exploring real-time propagation data
        right now, or create a free account to unlock cloud sync and your public
        operator profile.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {isSupabaseConfigured && (
          <button
            onClick={() =>
              openAuthModal(
                "Sign up for free to unlock cloud sync and your public profile.",
              )
            }
            className="px-6 py-3 rounded-xl font-semibold text-sm bg-signal-green/20 text-signal-green hover:bg-signal-green/30 border border-signal-green/30 transition-all focus-visible:ring-2 focus-visible:ring-signal-green/50 focus-visible:outline-none"
          >
            Create Free Account
          </button>
        )}
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-xl font-semibold text-sm bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30 transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
        >
          Explore the App
        </button>
      </div>

      {isSupabaseConfigured && (
        <p className="text-[11px] text-gray-600 mt-4">
          Pro subscription helps keep the servers running and unlocks advanced
          features.
        </p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  const isMobile = useIsMobile();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
      {/* Hero */}
      <HeroSection />

      {/* Value Proposition Callouts */}
      <section className="mb-8 sm:mb-12" aria-label="Tier comparison">
        <ValueCallouts />
      </section>

      {/* Main Views (all tiers) */}
      <section className="mb-6 sm:mb-8" aria-label="Main views">
        <MainViewsSection />
      </section>

      {/* Category Comparison Tables */}
      <section className="space-y-6 sm:space-y-8" aria-label="Feature details">
        {CATEGORIES.map((cat) =>
          isMobile ? (
            <MobileFeatureCard key={cat.title} category={cat} />
          ) : (
            <DesktopFeatureTable key={cat.title} category={cat} />
          ),
        )}
      </section>

      {/* Bottom CTA */}
      <BottomCTA />
    </main>
  );
}

/**
 * SystemHealthPage - Real-time system health dashboard
 *
 * Displays the status of all Propulse data services grouped by category,
 * educational content about each service, an architecture data-flow diagram,
 * and bridge connection status. Reads TanStack Query cache directly to
 * derive freshness without triggering duplicate fetches.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { QUERY_KEYS } from "@/hooks/useSolarData";
import { useBridge } from "@/hooks/useBridge";
import type { ServiceStatus } from "@/hooks/useHealthMonitor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const REFRESH_INTERVAL = 30_000;

// ---------------------------------------------------------------------------
// Service & Category definitions
// ---------------------------------------------------------------------------

interface ServiceDef {
  id: string;
  name: string;
  queryKey: readonly string[] | null; // null = on-demand / no cache entry expected
  staleThreshold: number;
  idleReason?: string; // shown when service has no cache entry
}

interface CategoryDef {
  id: string;
  title: string;
  accentColor: string; // tailwind-compatible color token
  accentHex: string;
  icon: "sun" | "antenna" | "search" | "book" | "satellite";
  services: ServiceDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: "space-weather",
    title: "Space Weather",
    accentColor: "plasma-orange",
    accentHex: "#ff6b35",
    icon: "sun",
    services: [
      {
        id: "k-index",
        name: "K-Index",
        queryKey: QUERY_KEYS.kIndex,
        staleThreshold: 5 * MINUTE,
      },
      {
        id: "solar-flux",
        name: "Solar Flux",
        queryKey: QUERY_KEYS.solarFlux,
        staleThreshold: 8 * HOUR,
      },
      {
        id: "magnetometer",
        name: "Magnetometer",
        queryKey: QUERY_KEYS.magnetometer,
        staleThreshold: 5 * MINUTE,
      },
      {
        id: "flare-probs",
        name: "Flare Probabilities",
        queryKey: QUERY_KEYS.probabilities,
        staleThreshold: 12 * HOUR,
      },
      {
        id: "sunspots",
        name: "Sunspot Numbers",
        queryKey: QUERY_KEYS.sunspots,
        staleThreshold: 12 * HOUR,
      },
    ],
  },
  {
    id: "spot-networks",
    title: "Spot Networks",
    accentColor: "signal-green",
    accentHex: "#00ff88",
    icon: "antenna",
    services: [
      {
        id: "dx-cluster",
        name: "DX Cluster",
        queryKey: null,
        staleThreshold: 5 * MINUTE,
        idleReason: "Activated when spot feed connects",
      },
      {
        id: "rbn",
        name: "Reverse Beacon Network",
        queryKey: null,
        staleThreshold: 5 * MINUTE,
        idleReason: "Activated when RBN feed connects",
      },
      {
        id: "psk-reporter",
        name: "PSK Reporter",
        queryKey: null,
        staleThreshold: 5 * MINUTE,
        idleReason: "Activated when digital mode overlay loads",
      },
    ],
  },
  {
    id: "callsign-lookup",
    title: "Callsign Lookup",
    accentColor: "nebula-blue",
    accentHex: "#1a1a2e",
    icon: "search",
    services: [
      {
        id: "qrz",
        name: "QRZ.com",
        queryKey: null,
        staleThreshold: 30 * MINUTE,
        idleReason: "Activated when you look up a callsign",
      },
      {
        id: "hamqth",
        name: "HamQTH",
        queryKey: null,
        staleThreshold: 30 * MINUTE,
        idleReason: "Activated as fallback callsign resolver",
      },
      {
        id: "callook",
        name: "Callook.info",
        queryKey: null,
        staleThreshold: 30 * MINUTE,
        idleReason: "Activated for US license validation",
      },
    ],
  },
  {
    id: "logbook-sync",
    title: "Logbook Sync",
    accentColor: "cosmic-cyan",
    accentHex: "#44ddff",
    icon: "book",
    services: [
      {
        id: "lotw",
        name: "LoTW (ARRL)",
        queryKey: null,
        staleThreshold: 1 * HOUR,
        idleReason: "Activated after logging a QSO",
      },
      {
        id: "eqsl",
        name: "eQSL",
        queryKey: null,
        staleThreshold: 1 * HOUR,
        idleReason: "Activated after logging a QSO",
      },
      {
        id: "clublog",
        name: "Club Log",
        queryKey: null,
        staleThreshold: 1 * HOUR,
        idleReason: "Activated for DXCC entity lookups",
      },
    ],
  },
  {
    id: "satellite-data",
    title: "Satellite Data",
    accentColor: "aurora-purple",
    accentHex: "#aa44ff",
    icon: "satellite",
    services: [
      {
        id: "norad-tle",
        name: "NORAD TLE",
        queryKey: null,
        staleThreshold: 24 * HOUR,
        idleReason: "Activated when satellite overlay loads",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Educational content
// ---------------------------------------------------------------------------

interface ServiceInfo {
  whatIsIt: string;
  howUsed: string;
}

const SERVICE_INFO: Record<string, ServiceInfo> = {
  "k-index": {
    whatIsIt:
      "Measures geomagnetic disturbances on a 0\u20139 scale. Updated every 3 hours from 13 ground magnetometers worldwide. Higher values mean more disturbed conditions.",
    howUsed:
      "Colors propagation quality indicators across the app. K\u22655 triggers storm alerts \u2014 HF may be disrupted.",
  },
  "solar-flux": {
    whatIsIt:
      "The 10.7\u2009cm radio emission from the sun, measured in Solar Flux Units (SFU). Directly correlates with ionospheric ionization levels.",
    howUsed:
      "Drives band condition predictions. Higher SFI means better high-band propagation \u2014 15m and 10m come alive above SFI 120.",
  },
  magnetometer: {
    whatIsIt:
      "Real-time interplanetary magnetic field (IMF) Bz reading from the DSCOVR satellite at the L1 Lagrange point, 1.5 million km from Earth.",
    howUsed:
      "A sustained negative Bz (southward) means the solar wind is coupling with Earth\u2019s magnetosphere \u2014 geomagnetic storms may arrive within hours.",
  },
  "flare-probs": {
    whatIsIt:
      "NOAA\u2019s 24-hour forecast percentages for C-class, M-class, and X-class solar flares, plus proton events.",
    howUsed:
      "Displayed on the Solar Pulse dashboard. X-class flares can cause immediate HF blackouts lasting minutes to hours.",
  },
  sunspots: {
    whatIsIt:
      "Daily count of visible sunspots on the solar disk \u2014 the oldest continuously observed astronomical metric.",
    howUsed:
      "Context for the 11-year solar cycle. Higher SSN correlates with more ionization and better DX on upper HF bands.",
  },
  "dx-cluster": {
    whatIsIt:
      "A worldwide network of ham radio operators reporting callsigns, frequencies, and modes they\u2019re hearing on the air in real-time.",
    howUsed:
      "Powers live spot markers on the globe, band activity indicators, and DX alerts. One click tunes your radio via CAT control.",
  },
  rbn: {
    whatIsIt:
      "An automated network of CW and RTTY skimmer receivers that decode callsigns and report signal strengths objectively.",
    howUsed:
      "Provides unbiased propagation data \u2014 if RBN hears you across the Atlantic, the path is open. Used for propagation analysis.",
  },
  "psk-reporter": {
    whatIsIt:
      "Automated reception reports for digital modes (FT8, FT4, JS8Call, etc.) collected from thousands of receivers worldwide.",
    howUsed:
      "Powers the digital propagation map overlay. See exactly where your FT8 signal is being decoded in real-time.",
  },
  qrz: {
    whatIsIt:
      "The largest amateur radio callsign database with over 2 million records. Includes operator details, biography, photos, and QSL information.",
    howUsed:
      "Primary callsign lookup during QSOs. Auto-fills name, location, and QTH in your logbook.",
  },
  hamqth: {
    whatIsIt:
      "Free callsign lookup service with over 1 million records. Community-maintained with frequent updates.",
    howUsed:
      "Secondary callsign resolver. Used when QRZ returns no result, and for DX spot enrichment.",
  },
  callook: {
    whatIsIt:
      "Real-time FCC license database for US amateur radio callsigns. Updated within hours of FCC database changes.",
    howUsed:
      "Validates license class and privileges. Shows grant date, expiration, and trustee information for club calls.",
  },
  lotw: {
    whatIsIt:
      "The ARRL\u2019s Logbook of the World \u2014 a digital QSL confirmation system trusted for DXCC and WAS awards.",
    howUsed:
      "Automatic QSO upload after logging. Checks for incoming confirmations to track award progress.",
  },
  eqsl: {
    whatIsIt:
      "Electronic QSL card exchange system. Send and receive digital QSL cards with custom designs.",
    howUsed:
      "Syncs your QSO log for digital QSL card exchange. Check your inbox for incoming cards from worked stations.",
  },
  clublog: {
    whatIsIt:
      "DX expedition and rare entity tracking. Provides DXCC entity resolution and \u201cmost wanted\u201d rankings.",
    howUsed:
      "\u201cWorked before?\u201d checks during pile-ups. DXCC entity identification for spots on the map.",
  },
  "norad-tle": {
    whatIsIt:
      "Two-Line Element sets providing satellite orbital parameters. Updated daily from Space-Track.org.",
    howUsed:
      "Satellite pass predictions for the PropSphere map overlay. Shows when amateur radio satellites will be overhead.",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStaleThreshold(ms: number): string {
  if (ms >= HOUR) {
    const h = ms / HOUR;
    return `${h}h`;
  }
  return `${ms / MINUTE}m`;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 30_000) return "just now";
  if (diff < MINUTE) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  return `${Math.floor(diff / HOUR)}h ago`;
}

function dotColorClass(status: ServiceStatus): string {
  switch (status) {
    case "healthy":
      return "bg-signal-green shadow-[0_0_6px_theme(colors.signal-green)]";
    case "degraded":
      return "bg-caution-amber shadow-[0_0_6px_theme(colors.caution-amber)]";
    case "error":
      return "bg-alert-red shadow-[0_0_6px_theme(colors.alert-red)] animate-pulse";
    case "loading":
      return "bg-gray-500 animate-pulse";
    case "idle":
      return "bg-gray-600";
  }
}

function statusLabel(status: ServiceStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Stale";
    case "error":
      return "Error";
    case "loading":
      return "Loading";
    case "idle":
      return "Idle";
  }
}

function bridgeDotClass(state: string): string {
  switch (state) {
    case "connected":
      return "bg-signal-green shadow-[0_0_6px_theme(colors.signal-green)]";
    case "connecting":
      return "bg-plasma-orange animate-pulse";
    case "disconnected":
      return "bg-gray-500";
    case "error":
      return "bg-alert-red";
    default:
      return "bg-gray-600";
  }
}

function bridgeLabel(state: string): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting\u2026";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

// ---------------------------------------------------------------------------
// Derived service state from query cache
// ---------------------------------------------------------------------------

interface DerivedServiceState {
  status: ServiceStatus;
  lastUpdated: number | undefined;
  errorMessage?: string;
}

function deriveServiceState(
  svc: ServiceDef,
  queryClient: ReturnType<typeof useQueryClient>,
): DerivedServiceState {
  // On-demand services with no query key
  if (!svc.queryKey) {
    return { status: "idle", lastUpdated: undefined };
  }

  const queryState = queryClient.getQueryState(svc.queryKey);

  if (!queryState) {
    return { status: "idle", lastUpdated: undefined };
  }

  const { status, dataUpdatedAt, fetchStatus, error } = queryState;

  // Currently fetching with no prior data
  if (
    (status === "pending" || fetchStatus === "fetching") &&
    dataUpdatedAt === 0
  ) {
    return { status: "loading", lastUpdated: undefined };
  }

  // Error state
  if (status === "error") {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      status: "error",
      lastUpdated: dataUpdatedAt || undefined,
      errorMessage: message,
    };
  }

  // Has data -- check freshness
  if (status === "success" || dataUpdatedAt > 0) {
    const age = Date.now() - dataUpdatedAt;
    if (age <= svc.staleThreshold) {
      return { status: "healthy", lastUpdated: dataUpdatedAt };
    }
    return { status: "degraded", lastUpdated: dataUpdatedAt };
  }

  return { status: "idle", lastUpdated: undefined };
}

// ---------------------------------------------------------------------------
// Category SVG Icons (24x24)
// ---------------------------------------------------------------------------

function CategoryIcon({
  icon,
  color,
}: {
  icon: CategoryDef["icon"];
  color: string;
}) {
  const cls = "w-5 h-5 shrink-0";
  switch (icon) {
    case "sun":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="7.07" y2="7.07" />
          <line x1="16.93" y1="16.93" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="7.07" y2="16.93" />
          <line x1="16.93" y1="7.07" x2="19.07" y2="4.93" />
        </svg>
      );
    case "antenna":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20V10" />
          <path d="M8 16l4-6 4 6" />
          <path d="M6 6a8.5 8.5 0 0 1 12 0" />
          <path d="M8.5 8.5a5 5 0 0 1 7 0" />
        </svg>
      );
    case "search":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "book":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z" />
        </svg>
      );
    case "satellite":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 7L9 3 3 9l4 4" />
          <path d="M11 13l4 4 6-6-4-4" />
          <path d="M8 16l-3 3" />
          <circle cx="19" cy="5" r="1.5" fill={color} stroke="none" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Overall Status Arc Ring (SVG)
// ---------------------------------------------------------------------------

function StatusArc({
  healthy,
  degraded,
  errored,
  idle,
  loading,
  total,
}: {
  healthy: number;
  degraded: number;
  errored: number;
  idle: number;
  loading: number;
  total: number;
}) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const stroke = 8;

  // Proportional arcs
  const segments = [
    { count: healthy, color: "#00ff88" },
    { count: degraded, color: "#ffd23f" },
    { count: errored, color: "#ff4455" },
    { count: loading, color: "#6b7280" },
    { count: idle, color: "#374151" },
  ];

  let offset = 0;
  const arcs = segments
    .filter((s) => s.count > 0)
    .map((s, i) => {
      const fraction = s.count / Math.max(total, 1);
      const len = fraction * circumference;
      const gap = total > 1 ? 3 : 0; // small gap between segments
      const arc = (
        <circle
          key={i}
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={stroke}
          strokeDasharray={`${Math.max(len - gap, 0)} ${circumference - Math.max(len - gap, 0)}`}
          strokeDashoffset={-offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
          style={{
            filter:
              s.color === "#ff4455"
                ? "drop-shadow(0 0 4px rgba(255,68,85,0.5))"
                : undefined,
          }}
        />
      );
      offset += len;
      return arc;
    });

  return (
    <svg
      viewBox="0 0 128 128"
      className="w-28 h-28 md:w-32 md:h-32 -rotate-90"
      aria-hidden="true"
    >
      {/* background track */}
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={stroke}
      />
      {arcs}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Architecture Diagram (SVG)
// ---------------------------------------------------------------------------

function ArchitectureDiagram({
  overallColor,
}: {
  overallColor: "green" | "yellow" | "red";
}) {
  const lineColor =
    overallColor === "green"
      ? "#00ff88"
      : overallColor === "yellow"
        ? "#ffd23f"
        : "#ff4455";

  const groups = [
    {
      label: "Space Weather",
      sublabel: "NOAA / DSCOVR",
      y: 24,
      color: "#ff6b35",
    },
    {
      label: "Spot Networks",
      sublabel: "DX Cluster / RBN / PSK",
      y: 76,
      color: "#00ff88",
    },
    {
      label: "Callsign DBs",
      sublabel: "QRZ / HamQTH / Callook",
      y: 128,
      color: "#44ddff",
    },
    {
      label: "Logbook Sync",
      sublabel: "LoTW / eQSL / Club Log",
      y: 180,
      color: "#44ddff",
    },
    {
      label: "Satellites",
      sublabel: "NORAD / Space-Track",
      y: 232,
      color: "#aa44ff",
    },
  ];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox="0 0 680 270"
        className="w-full min-w-[500px] h-auto"
        role="img"
        aria-label="Data flow architecture diagram showing Propulse browser connecting through Vercel Edge Functions to five upstream API groups"
      >
        <defs>
          {/* Animated pulse circle */}
          <circle id="pulse-dot" r="3" fill={lineColor}>
            <animate
              attributeName="opacity"
              values="1;0.3;1"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Respect reduced motion */}
          <style>{`
            @media (prefers-reduced-motion: reduce) {
              #pulse-dot animate { dur: 0.01s; }
              .arch-pulse { animation: none !important; }
            }
          `}</style>
        </defs>

        {/* Propulse Browser box */}
        <rect
          x="10"
          y="100"
          width="140"
          height="60"
          rx="10"
          fill="rgba(255,107,53,0.08)"
          stroke="#ff6b35"
          strokeWidth="1.2"
        />
        <text
          x="80"
          y="126"
          textAnchor="middle"
          className="fill-white text-[11px] font-semibold"
          fontFamily="Orbitron, sans-serif"
        >
          Propulse
        </text>
        <text
          x="80"
          y="144"
          textAnchor="middle"
          className="fill-gray-400 text-[9px]"
        >
          (Browser)
        </text>

        {/* Vercel Edge Functions box */}
        <rect
          x="240"
          y="100"
          width="150"
          height="60"
          rx="10"
          fill="rgba(68,221,255,0.06)"
          stroke="#44ddff"
          strokeWidth="1.2"
        />
        <text
          x="315"
          y="126"
          textAnchor="middle"
          className="fill-white text-[11px] font-semibold"
          fontFamily="Orbitron, sans-serif"
        >
          Edge Functions
        </text>
        <text
          x="315"
          y="144"
          textAnchor="middle"
          className="fill-gray-400 text-[9px]"
        >
          (Vercel /api/*)
        </text>

        {/* Connection: Browser -> Edge */}
        <line
          x1="150"
          y1="130"
          x2="240"
          y2="130"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity="0.6"
        />
        <use href="#pulse-dot" x="195" y="130" className="arch-pulse">
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            path="M-45,0 L45,0"
          />
        </use>

        {/* API group boxes + connections */}
        {groups.map((g, i) => (
          <g key={i}>
            {/* Connection line */}
            <line
              x1="390"
              y1="130"
              x2="480"
              y2={g.y + 22}
              stroke={lineColor}
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.35"
            />
            {/* Upstream box */}
            <rect
              x="480"
              y={g.y}
              width="185"
              height="44"
              rx="8"
              fill="rgba(255,255,255,0.02)"
              stroke={g.color}
              strokeWidth="1"
              opacity="0.7"
            />
            <text
              x="572"
              y={g.y + 18}
              textAnchor="middle"
              className="fill-white text-[10px] font-semibold"
            >
              {g.label}
            </text>
            <text
              x="572"
              y={g.y + 33}
              textAnchor="middle"
              className="fill-gray-500 text-[8px]"
            >
              {g.sublabel}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable Service Detail
// ---------------------------------------------------------------------------

function ServiceDetail({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const info = SERVICE_INFO[serviceId];
  if (!info) return null;

  return (
    <div className="border-t border-white/5 first:border-t-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between py-2.5 px-1 text-left group hover:bg-white/[0.02] transition-colors rounded"
        aria-expanded={expanded}
      >
        <span className="text-xs text-gray-300 font-medium">{serviceName}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {expanded && (
        <div className="pb-3 px-1 space-y-2 animate-in fade-in text-xs leading-relaxed">
          <div>
            <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
              What is it?
            </span>
            <p className="text-gray-400 mt-0.5">{info.whatIsIt}</p>
          </div>
          <div>
            <span className="text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
              How Propulse uses it
            </span>
            <p className="text-gray-400 mt-0.5">{info.howUsed}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function SystemHealthPage() {
  const queryClient = useQueryClient();
  const bridge = useBridge({ enabled: false });

  // Periodic tick to re-derive statuses
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Track countdown to next refresh
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(0);
  useEffect(() => {
    setSecondsSinceRefresh(0);
    const id = setInterval(() => setSecondsSinceRefresh((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [tick]);

  // Derive all service states
  const categoryStates = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      services: cat.services.map((svc) => ({
        ...svc,
        ...deriveServiceState(svc, queryClient),
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, queryClient]);

  // Aggregate counts
  const allServices = useMemo(
    () => categoryStates.flatMap((c) => c.services),
    [categoryStates],
  );
  const counts = useMemo(() => {
    const c = { healthy: 0, degraded: 0, error: 0, loading: 0, idle: 0 };
    for (const svc of allServices) {
      c[svc.status]++;
    }
    return c;
  }, [allServices]);

  const total = allServices.length;
  const overallColor: "green" | "yellow" | "red" =
    counts.error > 0 ? "red" : counts.degraded > 0 ? "yellow" : "green";
  const overallLabel =
    overallColor === "green"
      ? "All Systems Operational"
      : overallColor === "yellow"
        ? "Partial Degradation"
        : "Service Errors Detected";
  const overallDotClass =
    overallColor === "green"
      ? "bg-signal-green shadow-[0_0_8px_theme(colors.signal-green)]"
      : overallColor === "yellow"
        ? "bg-caution-amber shadow-[0_0_8px_theme(colors.caution-amber)]"
        : "bg-alert-red shadow-[0_0_8px_theme(colors.alert-red)] animate-pulse";

  // Expand/collapse all service details
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const toggleDetails = useCallback(() => setDetailsExpanded((v) => !v), []);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-8">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="space-y-1">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-3"
          aria-label="Back to dashboard"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Dashboard
        </Link>
        <h1 className="font-orbitron text-2xl md:text-3xl font-bold text-gradient-orange">
          System Health
        </h1>
        <p className="text-sm text-gray-500">
          Real-time status of all Propulse data services and integrations
        </p>
      </div>

      {/* ── Overall Status Hero Card ────────────────────────────────── */}
      <Card className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-5">
          {/* Arc ring */}
          <div className="relative shrink-0">
            <StatusArc
              healthy={counts.healthy}
              degraded={counts.degraded}
              errored={counts.error}
              idle={counts.idle}
              loading={counts.loading}
              total={total}
            />
            {/* Center dot */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`w-3.5 h-3.5 rounded-full ${overallDotClass}`}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Summary text */}
          <div className="flex-1 text-center sm:text-left space-y-2">
            <h2 className="text-lg font-semibold text-white">{overallLabel}</h2>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-xs">
              {counts.healthy > 0 && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full bg-signal-green"
                    aria-hidden="true"
                  />
                  <span className="text-gray-300">
                    {counts.healthy} Healthy
                  </span>
                </span>
              )}
              {counts.idle > 0 && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full bg-gray-600"
                    aria-hidden="true"
                  />
                  <span className="text-gray-400">{counts.idle} Idle</span>
                </span>
              )}
              {counts.loading > 0 && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full bg-gray-500 animate-pulse"
                    aria-hidden="true"
                  />
                  <span className="text-gray-400">
                    {counts.loading} Loading
                  </span>
                </span>
              )}
              {counts.degraded > 0 && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full bg-caution-amber"
                    aria-hidden="true"
                  />
                  <span className="text-caution-amber">
                    {counts.degraded} Degraded
                  </span>
                </span>
              )}
              {counts.error > 0 && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full bg-alert-red"
                    aria-hidden="true"
                  />
                  <span className="text-alert-red">{counts.error} Error</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-600 font-mono">
              Updated {secondsSinceRefresh}s ago
              {" \u00b7 "}
              Next refresh in {Math.max(0, 30 - secondsSinceRefresh)}s
            </p>
          </div>
        </div>
      </Card>

      {/* ── Category Cards Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categoryStates.map((cat) => {
          const healthyCount = cat.services.filter(
            (s) => s.status === "healthy",
          ).length;
          const totalCount = cat.services.length;
          const allHealthy = healthyCount === totalCount;

          return (
            <Card key={cat.id} className="p-0 overflow-hidden">
              {/* Accent top border */}
              <div className="h-[2px]" style={{ background: cat.accentHex }} />

              <div className="p-3 md:p-4 space-y-3">
                {/* Category header */}
                <div className="flex items-center gap-2.5">
                  <CategoryIcon icon={cat.icon} color={cat.accentHex} />
                  <span className="text-sm font-semibold text-white flex-1">
                    {cat.title}
                  </span>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: allHealthy
                        ? "rgba(0,255,136,0.3)"
                        : "rgba(255,255,255,0.1)",
                      color: allHealthy ? "#00ff88" : "#9ca3af",
                      background: allHealthy
                        ? "rgba(0,255,136,0.06)"
                        : "transparent",
                    }}
                  >
                    {healthyCount}/{totalCount} healthy
                  </span>
                </div>

                {/* Service rows */}
                <div className="space-y-1.5">
                  {cat.services.map((svc) => (
                    <div key={svc.id} className="flex items-center gap-2 py-1">
                      {/* Status dot */}
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${dotColorClass(svc.status)}`}
                        aria-hidden="true"
                      />
                      {/* Name */}
                      <span className="text-xs text-gray-300 flex-1 min-w-0 truncate">
                        {svc.name}
                      </span>
                      {/* Freshness */}
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">
                        {svc.status === "idle"
                          ? "Idle"
                          : svc.status === "loading"
                            ? "Loading\u2026"
                            : svc.status === "error"
                              ? (svc.errorMessage ?? "Error")
                              : svc.lastUpdated
                                ? formatTimeAgo(svc.lastUpdated)
                                : "No data"}
                      </span>
                      {/* Stale threshold badge */}
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-600 hidden sm:inline"
                        title={`Data considered stale after ${formatStaleThreshold(svc.staleThreshold)}`}
                      >
                        {formatStaleThreshold(svc.staleThreshold)}
                      </span>
                      {/* Text label for status (accessibility) */}
                      <span className="sr-only">{statusLabel(svc.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Expandable Service Details ──────────────────────────────── */}
      <Card className="p-3 md:p-5">
        <button
          type="button"
          onClick={toggleDetails}
          className="w-full flex items-center justify-between"
          aria-expanded={detailsExpanded}
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-plasma-orange"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
              />
            </svg>
            <span className="text-sm font-semibold text-white">
              Service Reference Guide
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${detailsExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {detailsExpanded && (
          <div className="mt-4 space-y-0 divide-y divide-white/5">
            {CATEGORIES.flatMap((cat) =>
              cat.services.map((svc) => (
                <ServiceDetail
                  key={svc.id}
                  serviceId={svc.id}
                  serviceName={svc.name}
                />
              )),
            )}
          </div>
        )}
      </Card>

      {/* ── Architecture Diagram ────────────────────────────────────── */}
      <Card className="p-3 md:p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <svg
            className="w-4 h-4 text-cosmic-cyan"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h7"
            />
          </svg>
          Data Flow Architecture
        </h3>
        <p className="text-xs text-gray-500">
          All upstream API requests are proxied through Vercel Edge Functions to
          avoid CORS issues and cache responses.
        </p>
        <ArchitectureDiagram overallColor={overallColor} />
        <div className="flex items-center gap-4 text-[10px] text-gray-600 pt-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-1.5 rounded-sm bg-signal-green/50 inline-block" />
            Healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-1.5 rounded-sm bg-caution-amber/50 inline-block" />
            Degraded
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-1.5 rounded-sm bg-alert-red/50 inline-block" />
            Error
          </span>
        </div>
      </Card>

      {/* ── Bridge Quick Status ─────────────────────────────────────── */}
      <Card className="p-3 md:p-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${bridgeDotClass(bridge.state)}`}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-300">
              Bridge: {bridgeLabel(bridge.state)}
            </span>
            <span className="sr-only">
              {" "}
              - WebSocket connection to local radio daemon
            </span>
          </div>
          <Link
            to="/sdr/setup"
            className="text-xs text-cosmic-cyan hover:text-white transition-colors whitespace-nowrap"
          >
            Learn more about the Bridge &rarr;
          </Link>
        </div>
      </Card>

      {/* Bottom spacer for mobile scroll */}
      <div className="h-4" />
    </div>
  );
}

export default SystemHealthPage;

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { useBridge } from "@/hooks/useBridge";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type Platform = "windows" | "macos" | "linux";

const LS_PLATFORM_KEY = "propulse-bridge-setup-platform";

const WS_URL = "ws://127.0.0.1:9867";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function detectPlatform(): Platform {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const plat =
    typeof navigator !== "undefined"
      ? ((navigator as Navigator & { platform?: string }).platform ?? "")
      : "";
  const s = `${ua} ${plat}`.toLowerCase();
  if (s.includes("win")) return "windows";
  if (s.includes("mac")) return "macos";
  return "linux";
}

function platformLabel(p: Platform): string {
  switch (p) {
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CommandBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(children)
      .then(() => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [children]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative group">
      <pre className="text-xs md:text-sm bg-black/40 border border-white/10 rounded-lg p-3 pr-10 overflow-x-auto text-gray-100 font-mono">
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <svg
            className="w-3.5 h-3.5 text-signal-green"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-white/10 border border-white/10 text-gray-200 flex items-center justify-center text-sm font-semibold shrink-0">
          {n}
        </div>
        <div className="text-sm font-semibold text-gray-100">{title}</div>
      </div>
      <div className="text-sm text-gray-300 leading-relaxed pl-9">
        {children}
      </div>
    </div>
  );
}

function ConnectionDot({ state }: { state: string }) {
  const dotClass = (() => {
    switch (state) {
      case "connected":
        return "bg-signal-green shadow-[0_0_10px_theme(colors.signal-green)]";
      case "connecting":
        return "bg-plasma-orange animate-pulse";
      case "error":
        return "bg-alert-red animate-[pulse_2s_ease-in-out_infinite]";
      case "disconnected":
      default:
        return "bg-gray-500";
    }
  })();

  return (
    <span
      className={`inline-block w-3 h-3 rounded-full shrink-0 ${dotClass}`}
      aria-hidden="true"
    />
  );
}

function ConnectionBadge({
  state,
  error,
}: {
  state: string;
  error: string | null;
}) {
  const label = (() => {
    switch (state) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return error ?? "Error";
      case "disconnected":
      default:
        return "Disconnected";
    }
  })();

  const colorClass = (() => {
    switch (state) {
      case "connected":
        return "text-signal-green bg-signal-green/10 border-signal-green/30";
      case "connecting":
        return "text-plasma-orange bg-plasma-orange/10 border-plasma-orange/30";
      case "error":
        return "text-alert-red bg-alert-red/10 border-alert-red/30";
      case "disconnected":
      default:
        return "text-gray-400 bg-white/5 border-white/10";
    }
  })();

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${colorClass}`}
    >
      <ConnectionDot state={state} />
      {label}
    </span>
  );
}

function FeatureCard({
  title,
  accentColor,
  icon,
  description,
  details,
  callout,
}: {
  title: string;
  accentColor: string;
  icon: ReactNode;
  description: string;
  details: string;
  callout: string;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="h-1" style={{ background: accentColor }} />
      <div className="p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `${accentColor}15`,
              border: `1px solid ${accentColor}30`,
            }}
          >
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{description}</p>
        <p className="text-xs text-gray-500 leading-relaxed">{details}</p>
        <div
          className="text-xs leading-relaxed rounded-lg p-3"
          style={{
            background: `${accentColor}08`,
            border: `1px solid ${accentColor}18`,
            color: accentColor,
          }}
        >
          <span className="font-semibold">What this means:</span>{" "}
          <span className="text-gray-300">{callout}</span>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SVG Icons for feature cards
// ---------------------------------------------------------------------------

function RadioIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2" />
      <circle cx="8" cy="14" r="2" />
      <line x1="14" y1="11" x2="18" y2="11" />
      <line x1="14" y1="14" x2="18" y2="14" />
      <line x1="14" y1="17" x2="18" y2="17" />
    </svg>
  );
}

function AntennaIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v8" />
      <path d="M4.93 10.93l2.83-2.83" />
      <path d="M19.07 10.93l-2.83-2.83" />
      <path d="M2 18l4-8" />
      <path d="M22 18l-4-8" />
      <path d="M8 18a4 4 0 018 0" />
      <path d="M12 18v4" />
      {/* Signal waves */}
      <path d="M8.5 5.5a5 5 0 017 0" opacity={0.5} />
      <path d="M6 3a8 8 0 0112 0" opacity={0.3} />
    </svg>
  );
}

function WaveformIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12h2l2-6 3 12 3-8 2 4 2-2h6" />
      <circle cx="20" cy="12" r="1.5" fill={color} opacity={0.4} />
    </svg>
  );
}

function NetworkIcon({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <line x1="12" y1="7.5" x2="5" y2="15.5" />
      <line x1="12" y1="7.5" x2="19" y2="15.5" />
      <line
        x1="5"
        y1="18"
        x2="19"
        y2="18"
        opacity={0.4}
        strokeDasharray="2 2"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Architecture Diagram SVG
// ---------------------------------------------------------------------------

function ArchitectureDiagram({ connected }: { connected: boolean }) {
  const lineColor = connected
    ? "rgba(255,255,255,0.25)"
    : "rgba(255,255,255,0.08)";
  const lineStroke = connected ? undefined : "4 4";
  const dotColor = connected ? "#00ff88" : "transparent";

  return (
    <svg
      viewBox="0 0 710 350"
      className="w-full h-auto"
      role="img"
      aria-label="ProPulse Bridge architecture diagram showing browser connected to bridge server, which interfaces with Hamlib, DX Cluster, and WSJT-X"
    >
      <defs>
        {/* Glass box fill */}
        <linearGradient id="bridge-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <linearGradient id="bridge-glass-orange" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,107,53,0.08)" />
          <stop offset="100%" stopColor="rgba(255,107,53,0.02)" />
        </linearGradient>
        <linearGradient id="bridge-glass-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,255,136,0.06)" />
          <stop offset="100%" stopColor="rgba(0,255,136,0.02)" />
        </linearGradient>
        {/* Animated dot along path */}
        {connected && (
          <circle id="travel-dot" r="3" fill={dotColor}>
            <style>{`
              @media (prefers-reduced-motion: no-preference) {
                .bridge-travel-dot {
                  offset-distance: 0%;
                  animation: bridge-dot-travel 3s linear infinite;
                }
                @keyframes bridge-dot-travel {
                  0% { offset-distance: 0%; }
                  100% { offset-distance: 100%; }
                }
              }
            `}</style>
          </circle>
        )}
      </defs>

      {/* Propulse Browser box */}
      <rect
        x="40"
        y="60"
        width="180"
        height="80"
        rx="12"
        fill="url(#bridge-glass-orange)"
        stroke="rgba(255,107,53,0.25)"
        strokeWidth="1"
      />
      <text
        x="130"
        y="93"
        textAnchor="middle"
        className="fill-plasma-orange text-[13px] font-semibold"
        fontFamily="Orbitron, sans-serif"
      >
        Propulse
      </text>
      <text
        x="130"
        y="115"
        textAnchor="middle"
        className="fill-gray-400 text-[11px]"
      >
        (Browser)
      </text>

      {/* Bridge Server box */}
      <rect
        x="400"
        y="60"
        width="180"
        height="80"
        rx="12"
        fill="url(#bridge-glass-green)"
        stroke="rgba(0,255,136,0.25)"
        strokeWidth="1"
      />
      <text
        x="490"
        y="93"
        textAnchor="middle"
        className="fill-signal-green text-[13px] font-semibold"
        fontFamily="Orbitron, sans-serif"
      >
        Bridge Server
      </text>
      <text
        x="490"
        y="115"
        textAnchor="middle"
        className="fill-gray-400 text-[11px]"
      >
        localhost:9867
      </text>

      {/* WebSocket connection line */}
      <line
        x1="220"
        y1="100"
        x2="400"
        y2="100"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeDasharray={lineStroke}
      />
      <text
        x="310"
        y="88"
        textAnchor="middle"
        className="fill-gray-500 text-[10px] font-mono"
      >
        WebSocket
      </text>
      {/* Arrow heads */}
      <polygon points="395,96 405,100 395,104" fill={lineColor} />
      <polygon points="225,96 215,100 225,104" fill={lineColor} />
      {/* Traveling dot on main connection */}
      {connected && (
        <circle
          r="3"
          fill={dotColor}
          className="bridge-travel-dot"
          style={{ offsetPath: "path('M 220 100 L 400 100')" }}
        />
      )}

      {/* Vertical line from Bridge down */}
      <line
        x1="490"
        y1="140"
        x2="490"
        y2="180"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeDasharray={lineStroke}
      />

      {/* Three branch lines */}
      <line
        x1="490"
        y1="180"
        x2="350"
        y2="180"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="490"
        y1="180"
        x2="490"
        y2="200"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="490"
        y1="180"
        x2="630"
        y2="180"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />

      <line
        x1="350"
        y1="180"
        x2="350"
        y2="200"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="630"
        y1="180"
        x2="630"
        y2="200"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />

      {/* Hamlib box */}
      <rect
        x="290"
        y="200"
        width="120"
        height="60"
        rx="8"
        fill="url(#bridge-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="350"
        y="225"
        textAnchor="middle"
        className="fill-gray-200 text-[11px] font-semibold"
      >
        Hamlib
      </text>
      <text
        x="350"
        y="242"
        textAnchor="middle"
        className="fill-gray-500 text-[10px]"
      >
        rigctld
      </text>

      {/* DX Cluster box */}
      <rect
        x="430"
        y="200"
        width="120"
        height="60"
        rx="8"
        fill="url(#bridge-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="490"
        y="225"
        textAnchor="middle"
        className="fill-gray-200 text-[11px] font-semibold"
      >
        DX Cluster
      </text>
      <text
        x="490"
        y="242"
        textAnchor="middle"
        className="fill-gray-500 text-[10px]"
      >
        Telnet
      </text>

      {/* WSJT-X box */}
      <rect
        x="570"
        y="200"
        width="120"
        height="60"
        rx="8"
        fill="url(#bridge-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="630"
        y="225"
        textAnchor="middle"
        className="fill-gray-200 text-[11px] font-semibold"
      >
        WSJT-X
      </text>
      <text
        x="630"
        y="242"
        textAnchor="middle"
        className="fill-gray-500 text-[10px]"
      >
        UDP
      </text>

      {/* Line from Hamlib to Radio */}
      <line
        x1="350"
        y1="260"
        x2="350"
        y2="290"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <polygon points="346,285 350,295 354,285" fill={lineColor} />

      {/* Your Radio box */}
      <rect
        x="290"
        y="290"
        width="120"
        height="50"
        rx="8"
        fill="url(#bridge-glass-orange)"
        stroke="rgba(255,107,53,0.2)"
        strokeWidth="1"
      />
      <text
        x="350"
        y="312"
        textAnchor="middle"
        className="fill-plasma-orange text-[11px] font-semibold"
      >
        Your Radio
      </text>
      <text
        x="350"
        y="328"
        textAnchor="middle"
        className="fill-gray-500 text-[10px]"
      >
        Transceiver
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// FAQ Item
// ---------------------------------------------------------------------------

function FAQItem({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex items-center gap-3 cursor-pointer list-none text-sm font-medium text-gray-200 hover:text-white transition-colors py-3 px-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10">
        <svg
          className="w-4 h-4 shrink-0 text-gray-500 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {question}
      </summary>
      <div className="text-sm text-gray-400 leading-relaxed pl-7 pr-4 pb-3 pt-1">
        {children}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// GreenCheck icon
// ---------------------------------------------------------------------------

function GreenCheck() {
  return (
    <svg
      className="w-5 h-5 text-signal-green shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function BridgeInfoPage() {
  // Use bridge WITHOUT auto-connecting (enabled: false) so the page is passive
  const bridge = useBridge({ enabled: false });
  const { state, error, lastMessage, reconnectCount, connect } = bridge;

  // Platform selector for setup guide
  const [platform, setPlatform] = useState<Platform>(() => {
    try {
      const saved = localStorage.getItem(LS_PLATFORM_KEY) as Platform | null;
      if (saved === "windows" || saved === "macos" || saved === "linux")
        return saved;
    } catch {
      // ignore
    }
    return detectPlatform();
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_PLATFORM_KEY, platform);
    } catch {
      // ignore
    }
  }, [platform]);

  // Connection test
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const testStartRef = useRef<number>(0);

  const handleTestConnection = useCallback(() => {
    setTestingConnection(true);
    setTestResult(null);
    testStartRef.current = Date.now();
    connect();

    // Timeout after 5s
    const timeout = setTimeout(() => {
      setTestingConnection(false);
      setTestResult("Timeout — no response from bridge after 5 seconds.");
    }, 5000);

    return () => clearTimeout(timeout);
  }, [connect]);

  // Watch for connection success during test
  useEffect(() => {
    if (testingConnection && state === "connected") {
      const latency = Date.now() - testStartRef.current;
      setTestResult(`Connected in ${latency}ms`);
      setTestingConnection(false);
    }
    if (testingConnection && state === "error") {
      setTestResult(error ?? "Connection failed.");
      setTestingConnection(false);
    }
  }, [state, testingConnection, error]);

  // Protocol section collapse
  const [protocolExpanded, setProtocolExpanded] = useState(false);

  // Last message display
  const lastMsgDisplay = useMemo(() => {
    if (!lastMessage) return null;
    const tsMs =
      typeof lastMessage.timestamp === "number"
        ? lastMessage.timestamp
        : typeof lastMessage.ts === "string"
          ? Date.parse(lastMessage.ts)
          : NaN;
    return {
      type: lastMessage.type,
      time: Number.isFinite(tsMs)
        ? new Date(tsMs).toLocaleTimeString()
        : "Unknown",
    };
  }, [lastMessage]);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-8">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Hero Section                                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </Link>

        <div className="space-y-2">
          <h1 className="font-orbitron text-2xl md:text-3xl font-bold text-gradient-orange tracking-tight">
            ProPulse Bridge
          </h1>
          <p className="text-gray-400 text-sm md:text-base max-w-2xl">
            Connect your radio hardware to Propulse
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <ConnectionBadge state={state} error={error} />

          <div className="flex items-center gap-2">
            <code className="text-xs md:text-sm font-mono text-gray-300 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 select-all">
              {WS_URL}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(WS_URL).catch(() => {});
              }}
              className="p-1.5 rounded-md bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Copy WebSocket URL"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        </div>

        {state === "disconnected" && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-600 italic">
              Start the bridge server to connect
            </p>
            <Link
              to="/setup"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-plasma-orange/10 border border-plasma-orange/30 text-plasma-orange text-xs font-medium hover:bg-plasma-orange/20 transition-colors"
            >
              Setup Guide
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. What is the Bridge?                                           */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">
          What is the Bridge?
        </h2>
        <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <p>
            The ProPulse Bridge is a lightweight server that runs on your
            computer alongside Propulse.
          </p>
          <p>
            It acts as a secure translator between the web application and your
            radio equipment — your transceiver, logging software, and digital
            mode programs.
          </p>
          <p>
            Because it runs only on localhost, your equipment is never exposed
            to the internet.
          </p>
          <p>
            Communication happens over WebSocket — a real-time, bidirectional
            protocol that lets Propulse and your radio talk to each other with
            millisecond latency.
          </p>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Features Grid                                                 */}
      {/* ---------------------------------------------------------------- */}
      <div>
        <h2 className="text-sm font-semibold text-gray-200 mb-4 uppercase tracking-wider">
          Capabilities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeatureCard
            title="CAT Control"
            accentColor="#ff6b35"
            icon={<RadioIcon color="#ff6b35" />}
            description="Control your transceiver directly from the browser. Tune to a DX spot with one click, switch modes for digital or CW, activate PTT for transmit."
            details="Powered by Hamlib, supporting over 2,000 radio models from Icom, Yaesu, Kenwood, Elecraft, FlexRadio, and more."
            callout="Hear a rare DX station on the cluster? One click and your radio is already on frequency."
          />
          <FeatureCard
            title="DX Cluster Relay"
            accentColor="#00ff88"
            icon={<AntennaIcon color="#00ff88" />}
            description="Receive real-time DX spots from the worldwide cluster network directly in Propulse. Spots appear on the PropSphere map and band planner automatically."
            details="Connects to standard DX cluster nodes via telnet — works with any public node. No separate telnet client needed."
            callout="See who's on the air right now, where they are on the globe, and jump to their frequency instantly."
          />
          <FeatureCard
            title="WSJT-X Integration"
            accentColor="#44ddff"
            icon={<WaveformIcon color="#44ddff" />}
            description="See FT8, FT4, and JT65 decodes from WSJT-X in real-time within Propulse. Auto-log QSOs when WSJT-X reports a completed contact."
            details="Listens on WSJT-X's standard UDP multicast port — zero configuration in most setups. Track which callsigns are being decoded on the waterfall."
            callout="Your digital mode activity flows seamlessly into your Propulse logbook and map."
          />
          <FeatureCard
            title="Multi-Operator Sync"
            accentColor="#aa44ff"
            icon={<NetworkIcon color="#aa44ff" />}
            description="Coordinate multiple operators during contest operations from different computers. Frequency locking prevents two operators from transmitting on the same frequency."
            details="QSO deconfliction avoids duplicate contacts. Shared notes and session state keep everyone in sync — all in real-time."
            callout="Run a multi-op contest station with Propulse as your coordination hub."
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Live Connection Panel                                         */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Live Connection</h2>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <ConnectionDot state={state} />
            <div>
              <div className="text-sm font-medium text-gray-200">
                {state === "connected" && "Connected"}
                {state === "connecting" && "Connecting..."}
                {state === "disconnected" && "Disconnected"}
                {state === "error" && (error ?? "Error")}
              </div>
              {state === "connecting" && reconnectCount > 0 && (
                <div className="text-xs text-gray-500">
                  Attempt {reconnectCount}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testingConnection ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {testResult && (
          <div
            className={`text-xs font-mono rounded-lg px-3 py-2 border ${
              testResult.startsWith("Connected")
                ? "bg-signal-green/5 border-signal-green/20 text-signal-green"
                : "bg-alert-red/5 border-alert-red/20 text-alert-red"
            }`}
          >
            {testResult}
          </div>
        )}

        {state === "connected" && lastMsgDisplay && (
          <div className="text-xs font-mono text-gray-500 bg-black/30 border border-white/5 rounded-lg px-3 py-2">
            Last message:{" "}
            <span className="text-gray-300">{lastMsgDisplay.type}</span>
            {" at "}
            <span className="text-gray-400">{lastMsgDisplay.time}</span>
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 5. Architecture Diagram                                          */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Architecture</h2>
        <p className="text-xs text-gray-500">
          The bridge sits between your browser and hardware, routing messages
          over localhost.
          {state === "connected" &&
            " Green dots indicate an active connection."}
        </p>
        <div className="overflow-x-auto -mx-2 px-2">
          <ArchitectureDiagram connected={state === "connected"} />
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 6. Message Protocol                                              */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-3">
        <button
          type="button"
          onClick={() => setProtocolExpanded((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <h2 className="text-sm font-semibold text-white">Message Protocol</h2>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${protocolExpanded ? "rotate-180" : ""}`}
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

        <p className="text-xs text-gray-500">
          All messages use a JSON envelope format with type, id, timestamp, and
          payload fields.
        </p>

        {protocolExpanded && (
          <div className="space-y-4 pt-2">
            <div>
              <div className="text-xs font-semibold text-gray-300 mb-2">
                Envelope Structure
              </div>
              <CommandBlock>{`{
  "type": "rig.status",
  "id": "msg_001",
  "ts": "2024-01-15T12:00:01.000Z",
  "payload": {
    "connected": true,
    "frequency": 14074000,
    "mode": "USB"
  }
}`}</CommandBlock>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-300 mb-2">
                Key Message Types
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 pr-4 text-gray-400 font-medium">
                        Type
                      </th>
                      <th className="text-left py-2 pr-4 text-gray-400 font-medium">
                        Direction
                      </th>
                      <th className="text-left py-2 text-gray-400 font-medium">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    <tr className="border-b border-white/5">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        bridge.welcome
                      </td>
                      <td className="py-1.5 pr-4 text-gray-500">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">Sent on connection</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        rig.update
                      </td>
                      <td className="py-1.5 pr-4 text-gray-500">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">
                        Rig frequency/mode/status changes
                      </td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        rig.setFrequency
                      </td>
                      <td className="py-1.5 pr-4 text-gray-500">
                        Client &rarr; Server
                      </td>
                      <td className="py-1.5">Tune radio to a frequency</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        cluster.spot
                      </td>
                      <td className="py-1.5 pr-4 text-gray-500">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">New DX spot from cluster</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        wsjtx.decode
                      </td>
                      <td className="py-1.5 pr-4 text-gray-500">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">FT8/FT4 decode from WSJT-X</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        contest.session.create
                      </td>
                      <td className="py-1.5 pr-4 text-gray-500">
                        Client &rarr; Server
                      </td>
                      <td className="py-1.5">Start a contest session</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 7. Security Model                                                */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-signal-green" />
          <h2 className="text-sm font-semibold text-white">Security Model</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <GreenCheck />
            <p className="text-sm text-gray-300 leading-relaxed">
              Binds exclusively to localhost{" "}
              <span className="font-mono text-gray-100">(127.0.0.1)</span> — no
              remote connections accepted
            </p>
          </div>
          <div className="flex items-start gap-3">
            <GreenCheck />
            <p className="text-sm text-gray-300 leading-relaxed">
              CAT control commands cannot be issued from outside your computer
            </p>
          </div>
          <div className="flex items-start gap-3">
            <GreenCheck />
            <p className="text-sm text-gray-300 leading-relaxed">
              Contest data and QSO information never leave your local network
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-2">
          <div className="text-xs font-semibold text-gray-300">
            Need remote access for multi-computer setups?
          </div>
          <CommandBlock>{`ssh -L 9867:127.0.0.1:9867 user@contest-pc`}</CommandBlock>
          <div className="flex items-start gap-2 text-xs text-caution-amber/80">
            <svg
              className="w-4 h-4 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              SSH tunnels forward the bridge port securely. Only use this with
              trusted machines and authenticated SSH keys.
            </span>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 8. Setup Guide                                                   */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-5">
        <h2 className="text-sm font-semibold text-white">Setup Guide</h2>

        {/* Platform selector */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm text-gray-300">Pick your platform</div>
            <div className="text-xs text-gray-500">
              Steps shown for {platformLabel(platform)}.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(["windows", "macos", "linux"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`px-3 py-2 rounded-md text-sm border transition-colors ${
                  platform === p
                    ? "bg-cosmic-cyan/15 border-cosmic-cyan/30 text-cosmic-cyan"
                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
                }`}
              >
                {platformLabel(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <Step n={1} title="Install the Bridge">
            <div className="space-y-2">
              <div>
                Clone or download the Propulse repository, then install
                dependencies:
              </div>
              <CommandBlock>{`cd bridge\nnpm install`}</CommandBlock>
              {platform === "windows" && (
                <div className="text-xs text-gray-500">
                  Alternatively, download the pre-built binary{" "}
                  <span className="font-mono text-gray-300">
                    propulse-bridge-x86_64-pc-windows-msvc.exe
                  </span>{" "}
                  from{" "}
                  <a
                    href="https://github.com/crypticpy/propulse/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cosmic-cyan hover:underline"
                  >
                    GitHub Releases
                  </a>
                  .
                </div>
              )}
              {platform === "macos" && (
                <div className="text-xs text-gray-500">
                  Alternatively, download{" "}
                  <span className="font-mono text-gray-300">
                    propulse-bridge-macos-universal
                  </span>{" "}
                  from{" "}
                  <a
                    href="https://github.com/crypticpy/propulse/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cosmic-cyan hover:underline"
                  >
                    GitHub Releases
                  </a>
                  .
                </div>
              )}
              {platform === "linux" && (
                <div className="text-xs text-gray-500">
                  Alternatively, download{" "}
                  <span className="font-mono text-gray-300">
                    propulse-bridge-x86_64-unknown-linux-gnu
                  </span>{" "}
                  from{" "}
                  <a
                    href="https://github.com/crypticpy/propulse/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cosmic-cyan hover:underline"
                  >
                    GitHub Releases
                  </a>
                  . For Raspberry Pi, use the{" "}
                  <span className="font-mono text-gray-300">aarch64</span>{" "}
                  variant.
                </div>
              )}
            </div>
          </Step>

          <Step n={2} title="Start the Server">
            <div className="space-y-2">
              <div>Development mode (auto-reloads on changes):</div>
              <CommandBlock>{`npm run dev`}</CommandBlock>
              <div>Production mode:</div>
              <CommandBlock>{`npm run build\nnpm start`}</CommandBlock>
            </div>
          </Step>

          <Step n={3} title="Verify Connection">
            <div className="space-y-2">
              <div>
                Look for the green dot next to{" "}
                <span className="text-gray-100 font-semibold">
                  System Health
                </span>{" "}
                in the Propulse header. It should show "Bridge: Connected."
              </div>
              <div className="text-xs text-gray-500">
                You can also use the "Test Connection" button above to verify.
              </div>
            </div>
          </Step>

          <Step n={4} title="Configure CAT Control (optional)">
            <div className="space-y-2">
              <div>
                Install{" "}
                <a
                  href="https://hamlib.github.io/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cosmic-cyan hover:underline"
                >
                  Hamlib
                </a>{" "}
                and start{" "}
                <span className="font-mono text-gray-100">rigctld</span> with
                your radio's model number and serial port:
              </div>
              {platform === "windows" ? (
                <CommandBlock>{`rigctld -m 3085 -r COM3 -s 38400`}</CommandBlock>
              ) : (
                <CommandBlock>{`rigctld -m 3085 -r /dev/ttyUSB0 -s 38400`}</CommandBlock>
              )}
              {(platform === "macos" || platform === "linux") && (
                <div className="text-xs text-gray-500">
                  On {platformLabel(platform)}, you may need to add your user to
                  the <span className="font-mono text-gray-300">dialout</span>{" "}
                  group for serial port access:{" "}
                  <span className="font-mono text-gray-300">
                    sudo usermod -aG dialout $USER
                  </span>
                </div>
              )}
            </div>
          </Step>

          <Step n={5} title="Configure DX Cluster (optional)">
            <div className="space-y-2">
              <div>
                Add a cluster node address in the bridge configuration. Common
                public nodes include:
              </div>
              <CommandBlock>{`# Example bridge config\ncluster_host = "dxc.nc7j.com"\ncluster_port = 7373\ncallsign = "YOUR_CALL"`}</CommandBlock>
            </div>
          </Step>

          <Step n={6} title="Configure WSJT-X (optional)">
            <div className="space-y-2">
              <div>
                In WSJT-X, go to{" "}
                <span className="text-gray-100 font-semibold">
                  File &rarr; Settings &rarr; Reporting
                </span>{" "}
                and enable{" "}
                <span className="text-gray-100 font-semibold">
                  "Accept UDP requests"
                </span>
                .
              </div>
              <div>
                The default UDP port is{" "}
                <span className="font-mono text-gray-100">2237</span>. The
                bridge listens on this port automatically.
              </div>
            </div>
          </Step>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 9. Troubleshooting                                               */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white mb-1">
          Troubleshooting
        </h2>
        <div className="space-y-2">
          <FAQItem question="Bridge shows 'Disconnected'">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Confirm the bridge server is running (
                <span className="font-mono text-gray-300">npm run dev</span> or
                the standalone binary).
              </li>
              <li>
                Check that port{" "}
                <span className="font-mono text-gray-300">9867</span> is not
                blocked by your firewall.
              </li>
              <li>
                Ensure the WebSocket URL matches (
                <span className="font-mono text-gray-300">{WS_URL}</span>).
              </li>
            </ul>
          </FAQItem>

          <FAQItem question="Connection keeps dropping">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Some antivirus software (Windows Defender, Norton) may interfere
                with localhost WebSocket connections. Try adding an exception
                for port 9867.
              </li>
              <li>
                Check for port conflicts — another application may be using
                9867. Use{" "}
                <span className="font-mono text-gray-300">
                  {platform === "windows"
                    ? "netstat -ano | findstr 9867"
                    : "lsof -i :9867"}
                </span>{" "}
                to check.
              </li>
            </ul>
          </FAQItem>

          <FAQItem question="Can't control my radio">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Ensure Hamlib is installed and{" "}
                <span className="font-mono text-gray-300">rigctld</span> is
                running with the correct model number (
                <span className="font-mono text-gray-300">rigctld -l</span> to
                list supported models).
              </li>
              {(platform === "macos" || platform === "linux") && (
                <li>
                  Check serial port permissions. Your user may need to be in the{" "}
                  <span className="font-mono text-gray-300">dialout</span> or{" "}
                  <span className="font-mono text-gray-300">uucp</span> group.
                </li>
              )}
              <li>
                Verify the serial port and baud rate match your radio's
                settings.
              </li>
            </ul>
          </FAQItem>

          <FAQItem question="HTTPS mixed content warning">
            <p>
              Browsers normally block insecure WebSocket (
              <span className="font-mono text-gray-300">ws://</span>)
              connections from HTTPS pages. However, connections to{" "}
              <span className="font-mono text-gray-300">localhost</span> and{" "}
              <span className="font-mono text-gray-300">127.0.0.1</span> are
              exempt from this restriction in Chrome, Firefox, and Edge. If you
              still encounter issues, run Propulse locally on{" "}
              <span className="font-mono text-gray-300">http://localhost</span>{" "}
              or install the Chrome bridge extension.
            </p>
          </FAQItem>

          <FAQItem question="'Error' status in health panel">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Another application may be using port 9867. Try a different
                port:
              </li>
            </ul>
            <div className="mt-2">
              <CommandBlock>{`BRIDGE_PORT=9868 npm run dev`}</CommandBlock>
            </div>
            <p className="mt-2">
              Then update the WebSocket URL in Propulse settings to match.
            </p>
          </FAQItem>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 10. Links & Resources                                            */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">
          Links &amp; Resources
        </h2>
        <div className="divide-y divide-white/5">
          {[
            {
              label: "Hamlib Project",
              url: "https://hamlib.github.io/",
              desc: "Open-source radio control library",
            },
            {
              label: "WSJT-X",
              url: "https://wsjt.sourceforge.io/wsjtx.html",
              desc: "Weak signal digital modes (FT8, FT4, JT65)",
            },
            {
              label: "DX Cluster Nodes",
              url: "https://www.dxcluster.info/",
              desc: "Public DX cluster node directory",
            },
            {
              label: "Bridge Source Code",
              url: "https://github.com/crypticpy/propulse/tree/main/bridge",
              desc: "Propulse Bridge on GitHub",
            },
          ].map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 py-3 group"
            >
              <div>
                <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                  {link.label}
                </div>
                <div className="text-xs text-gray-500">{link.desc}</div>
              </div>
              <svg
                className="w-4 h-4 shrink-0 text-gray-600 group-hover:text-gray-400 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          ))}
        </div>
      </Card>

      {/* Bottom spacer for mobile scroll */}
      <div className="h-8" />
    </div>
  );
}

export default BridgeInfoPage;

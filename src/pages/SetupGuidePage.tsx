import type { ReactNode } from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { useBridge } from "@/hooks/useBridge";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type Platform = "windows" | "macos" | "linux";

const LS_PLATFORM_KEY = "propulse-setup-guide-platform";

const GITHUB_REPO = "https://github.com/crypticpy/propulse";
const SCRIPTS_BASE = `https://raw.githubusercontent.com/crypticpy/propulse/main/scripts`;

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

/** Code block with copy-to-clipboard button */
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

/** Numbered step heading */
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

/** Status dot */
function StatusDot({ color }: { color: "green" | "amber" | "red" | "gray" }) {
  const cls = (() => {
    switch (color) {
      case "green":
        return "bg-signal-green shadow-[0_0_10px_theme(colors.signal-green)]";
      case "amber":
        return "bg-plasma-orange animate-pulse";
      case "red":
        return "bg-alert-red animate-[pulse_2s_ease-in-out_infinite]";
      case "gray":
      default:
        return "bg-gray-500";
    }
  })();

  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls}`}
      aria-hidden="true"
    />
  );
}

/** Bridge connection dot driven by WebSocket state */
function ConnectionDot({ state }: { state: string }) {
  const color = (() => {
    switch (state) {
      case "connected":
        return "green" as const;
      case "connecting":
        return "amber" as const;
      case "error":
        return "red" as const;
      default:
        return "gray" as const;
    }
  })();
  return <StatusDot color={color} />;
}

/** FAQ / collapsible item */
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

const REQUIRED_BADGE = (
  <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-signal-green/15 border border-signal-green/30 text-signal-green uppercase tracking-wide">
    Required
  </span>
);

const OPTIONAL_BADGE = (
  <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-500 uppercase tracking-wide">
    Optional
  </span>
);

/** Collapsible manual-step card */
function ManualStep({
  n,
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  n: number;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group" open={defaultOpen || undefined}>
      <summary className="cursor-pointer list-none">
        <Card className="p-0 overflow-hidden group-open:border-white/20">
          <div className="flex items-center gap-3 p-4">
            <div className="w-8 h-8 rounded-full bg-plasma-orange/10 border border-plasma-orange/25 text-plasma-orange flex items-center justify-center text-sm font-bold shrink-0 font-orbitron">
              {n}
            </div>
            <h3 className="text-sm font-semibold text-gray-100 flex-1">
              {title}
              {badge}
            </h3>
            <svg
              className="w-4 h-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
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
          </div>
        </Card>
      </summary>
      <div className="px-4 pb-4 pt-2 -mt-3 ml-0 border-l-2 border-plasma-orange/15 ml-[1.4rem] space-y-3 text-sm text-gray-300 leading-relaxed">
        {children}
      </div>
    </details>
  );
}

/** Platform selector tabs */
function PlatformTabs({
  platform,
  setPlatform,
}: {
  platform: Platform;
  setPlatform: (p: Platform) => void;
}) {
  return (
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
  );
}

// ---------------------------------------------------------------------------
// Architecture Diagram
// ---------------------------------------------------------------------------

function SetupArchitectureDiagram({ connected }: { connected: boolean }) {
  const lineColor = connected
    ? "rgba(255,255,255,0.25)"
    : "rgba(255,255,255,0.08)";
  const lineStroke = connected ? undefined : "4 4";

  return (
    <svg
      viewBox="0 0 710 310"
      className="w-full h-auto"
      role="img"
      aria-label="ProPulse system architecture: browser connects to bridge server, which interfaces with Hamlib, DX Cluster, and WSJT-X"
    >
      <defs>
        <linearGradient id="sg-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <linearGradient id="sg-glass-orange" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,107,53,0.08)" />
          <stop offset="100%" stopColor="rgba(255,107,53,0.02)" />
        </linearGradient>
        <linearGradient id="sg-glass-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,255,136,0.06)" />
          <stop offset="100%" stopColor="rgba(0,255,136,0.02)" />
        </linearGradient>
        {connected && (
          <style>{`
            @media (prefers-reduced-motion: no-preference) {
              .sg-travel-dot {
                offset-distance: 0%;
                animation: sg-dot-travel 3s linear infinite;
              }
              @keyframes sg-dot-travel {
                0% { offset-distance: 0%; }
                100% { offset-distance: 100%; }
              }
            }
          `}</style>
        )}
      </defs>

      {/* Propulse Browser */}
      <rect
        x="30"
        y="50"
        width="180"
        height="75"
        rx="12"
        fill="url(#sg-glass-orange)"
        stroke="rgba(255,107,53,0.25)"
        strokeWidth="1"
      />
      <text
        x="120"
        y="82"
        textAnchor="middle"
        className="fill-plasma-orange text-[13px] font-semibold"
        fontFamily="Orbitron, sans-serif"
      >
        Propulse
      </text>
      <text
        x="120"
        y="103"
        textAnchor="middle"
        className="fill-gray-400 text-[11px]"
      >
        (Browser)
      </text>

      {/* Bridge Server */}
      <rect
        x="380"
        y="50"
        width="180"
        height="75"
        rx="12"
        fill="url(#sg-glass-green)"
        stroke="rgba(0,255,136,0.25)"
        strokeWidth="1"
      />
      <text
        x="470"
        y="82"
        textAnchor="middle"
        className="fill-signal-green text-[13px] font-semibold"
        fontFamily="Orbitron, sans-serif"
      >
        Bridge Server
      </text>
      <text
        x="470"
        y="103"
        textAnchor="middle"
        className="fill-gray-400 text-[11px]"
      >
        localhost:9867
      </text>

      {/* WebSocket line */}
      <line
        x1="210"
        y1="88"
        x2="380"
        y2="88"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeDasharray={lineStroke}
      />
      <text
        x="295"
        y="78"
        textAnchor="middle"
        className="fill-gray-500 text-[10px] font-mono"
      >
        WebSocket
      </text>
      <polygon points="375,84 385,88 375,92" fill={lineColor} />
      <polygon points="215,84 205,88 215,92" fill={lineColor} />
      {connected && (
        <circle
          r="3"
          fill="#00ff88"
          className="sg-travel-dot"
          style={{ offsetPath: "path('M 210 88 L 380 88')" }}
        />
      )}

      {/* Vertical trunk */}
      <line
        x1="470"
        y1="125"
        x2="470"
        y2="165"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeDasharray={lineStroke}
      />

      {/* Branches */}
      <line
        x1="470"
        y1="165"
        x2="330"
        y2="165"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="470"
        y1="165"
        x2="470"
        y2="185"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="470"
        y1="165"
        x2="610"
        y2="165"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="330"
        y1="165"
        x2="330"
        y2="185"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <line
        x1="610"
        y1="165"
        x2="610"
        y2="185"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />

      {/* Hamlib */}
      <rect
        x="270"
        y="185"
        width="120"
        height="55"
        rx="8"
        fill="url(#sg-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="330"
        y="208"
        textAnchor="middle"
        className="fill-gray-200 text-[11px] font-semibold"
      >
        Hamlib
      </text>
      <text
        x="330"
        y="226"
        textAnchor="middle"
        className="fill-gray-500 text-[10px]"
      >
        rigctld
      </text>

      {/* DX Cluster */}
      <rect
        x="410"
        y="185"
        width="120"
        height="55"
        rx="8"
        fill="url(#sg-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="470"
        y="208"
        textAnchor="middle"
        className="fill-gray-200 text-[11px] font-semibold"
      >
        DX Cluster
      </text>
      <text
        x="470"
        y="226"
        textAnchor="middle"
        className="fill-gray-500 text-[10px]"
      >
        Telnet
      </text>

      {/* WSJT-X */}
      <rect
        x="550"
        y="185"
        width="120"
        height="55"
        rx="8"
        fill="url(#sg-glass)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="610"
        y="208"
        textAnchor="middle"
        className="fill-gray-200 text-[11px] font-semibold"
      >
        WSJT-X
      </text>
      <text
        x="610"
        y="226"
        textAnchor="middle"
        className="fill-gray-500 text-[10px]"
      >
        UDP 2237
      </text>

      {/* Arrow from Hamlib to Radio */}
      <line
        x1="330"
        y1="240"
        x2="330"
        y2="265"
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray={lineStroke}
      />
      <polygon points="326,260 330,270 334,260" fill={lineColor} />

      {/* Your Radio */}
      <rect
        x="270"
        y="268"
        width="120"
        height="40"
        rx="8"
        fill="url(#sg-glass-orange)"
        stroke="rgba(255,107,53,0.2)"
        strokeWidth="1"
      />
      <text
        x="330"
        y="293"
        textAnchor="middle"
        className="fill-plasma-orange text-[11px] font-semibold"
      >
        Your Radio
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function SetupGuidePage() {
  // Bridge — passive (no auto-connect)
  const bridge = useBridge({ enabled: false });
  const { state, error, connect } = bridge;

  // Platform selector with localStorage persistence
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
  const testTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTestConnection = useCallback(() => {
    setTestingConnection(true);
    setTestResult(null);
    testStartRef.current = Date.now();
    connect();

    if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current);
    testTimeoutRef.current = setTimeout(() => {
      setTestingConnection(false);
      setTestResult(
        "No response after 10 seconds. The bridge server may not be running — try starting it with: cd bridge && npm run dev",
      );
    }, 10_000);
  }, [connect]);

  useEffect(() => {
    if (testingConnection && state === "connected") {
      const latency = Date.now() - testStartRef.current;
      setTestResult(`Connected in ${latency}ms`);
      setTestingConnection(false);
      if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current);
    }
    if (testingConnection && state === "error") {
      setTestResult(error ?? "Connection failed.");
      setTestingConnection(false);
      if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current);
    }
  }, [state, testingConnection, error]);

  useEffect(() => {
    return () => {
      if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current);
    };
  }, []);

  // Derive bridge status label
  const bridgeStatusLabel = (() => {
    switch (state) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return error ?? "Error";
      default:
        return "Not running";
    }
  })();

  const bridgeDotColor = (() => {
    switch (state) {
      case "connected":
        return "green" as const;
      case "connecting":
        return "amber" as const;
      case "error":
        return "red" as const;
      default:
        return "gray" as const;
    }
  })();

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-8">
      {/* ================================================================ */}
      {/* 1. Hero + Platform Selector                                      */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Back to home"
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
            ProPulse Setup
          </h1>
          <p className="text-gray-400 text-sm md:text-base max-w-2xl">
            Get your station connected in minutes. No programming experience
            needed — just follow the steps below.
          </p>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm text-gray-300">Select your platform</div>
            <div className="text-xs text-gray-500">
              Showing instructions for {platformLabel(platform)}.
            </div>
          </div>
          <PlatformTabs platform={platform} setPlatform={setPlatform} />
        </div>
      </div>

      {/* ================================================================ */}
      {/* 2. Quick Status Dashboard                                        */}
      {/* ================================================================ */}
      <Card className="p-4 md:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">
          Quick Status Dashboard
        </h2>
        <p className="text-xs text-gray-500">
          This shows whether each piece of the system is running. Only the
          Bridge Server can be tested from the browser — the others require the
          setup script.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Node.js */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <StatusDot color="gray" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">Node.js</div>
              <div className="text-xs text-gray-500 truncate">
                Powers the bridge server
              </div>
            </div>
          </div>

          {/* Bridge Server - LIVE */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <ConnectionDot state={state} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">
                Bridge Server
              </div>
              <div className="text-xs text-gray-500 truncate">
                {bridgeStatusLabel}
              </div>
            </div>
            {state === "connected" && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-signal-green/10 border border-signal-green/25 text-signal-green">
                LIVE
              </span>
            )}
          </div>

          {/* Hamlib */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <StatusDot color="gray" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">Hamlib</div>
              <div className="text-xs text-gray-500 truncate">
                Controls your radio via computer
              </div>
            </div>
            <span className="text-[9px] text-gray-600 uppercase tracking-wide">
              Optional
            </span>
          </div>

          {/* WSJT-X */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <StatusDot color="gray" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">WSJT-X</div>
              <div className="text-xs text-gray-500 truncate">
                Digital modes (FT8, FT4)
              </div>
            </div>
            <span className="text-[9px] text-gray-600 uppercase tracking-wide">
              Optional
            </span>
          </div>

          {/* DX Cluster */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] md:col-span-2">
            <StatusDot color="gray" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">
                DX Cluster
              </div>
              <div className="text-xs text-gray-500 truncate">
                Live spots from other operators
              </div>
            </div>
            <span className="text-[9px] text-gray-600 uppercase tracking-wide">
              Optional
            </span>
          </div>
        </div>

        {/* Test connection button */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testingConnection ? (
              <span className="flex items-center gap-2">
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Testing...
              </span>
            ) : (
              "Test Bridge Connection"
            )}
          </button>

          <StatusDot color={bridgeDotColor} />
          <span className="text-xs text-gray-500">{bridgeStatusLabel}</span>
        </div>

        {testResult && (
          <div
            className={`text-xs rounded-lg px-3 py-2 border ${
              testResult.startsWith("Connected")
                ? "bg-signal-green/5 border-signal-green/20 text-signal-green"
                : "bg-alert-red/5 border-alert-red/20"
            }`}
          >
            <span
              className={
                testResult.startsWith("Connected")
                  ? "font-mono"
                  : "text-alert-red"
              }
            >
              {testResult}
            </span>

            {/* Post-failure troubleshooter */}
            {!testResult.startsWith("Connected") && (
              <div className="mt-2 pt-2 border-t border-alert-red/10 space-y-1.5 text-gray-400">
                <p className="font-semibold text-gray-300">
                  Quick fixes to try:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Open a terminal and run{" "}
                    <span className="font-mono text-gray-300">
                      cd bridge && npm run dev
                    </span>
                  </li>
                  <li>Check that port 9867 isn't blocked by your firewall</li>
                  <li>If using a VPN, try disconnecting it temporarily</li>
                  <li>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      className="text-plasma-orange hover:underline"
                    >
                      Try again
                    </button>
                  </li>
                </ul>
                <details className="mt-2 pt-2 border-t border-white/5">
                  <summary className="text-gray-300 cursor-pointer hover:text-white text-xs">
                    How do I open a terminal?
                  </summary>
                  <ul className="list-disc pl-4 space-y-1 mt-1.5 text-gray-400">
                    <li>
                      <strong>Windows:</strong> Right-click the Start button
                      &rarr; &ldquo;Windows PowerShell&rdquo; or
                      &ldquo;Terminal&rdquo;
                    </li>
                    <li>
                      <strong>Mac:</strong> Press Cmd+Space, type
                      &ldquo;Terminal&rdquo;, press Enter
                    </li>
                    <li>
                      <strong>Linux:</strong> Right-click the desktop &rarr;
                      &ldquo;Open Terminal&rdquo; (or press Ctrl+Alt+T)
                    </li>
                  </ul>
                </details>
              </div>
            )}
          </div>
        )}

        {/* Success celebration when bridge connects */}
        {state === "connected" && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-signal-green/5 border border-signal-green/20">
            <svg
              className="w-5 h-5 text-signal-green shrink-0 mt-0.5"
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
            <div>
              <div className="text-sm font-semibold text-signal-green">
                Bridge is connected!
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Your station is online. You can now{" "}
                <Link to="/" className="text-cosmic-cyan hover:underline">
                  explore the map
                </Link>
                , or continue setting up optional features below.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ================================================================ */}
      {/* 2b. How to open a terminal                                       */}
      {/* ================================================================ */}
      <details className="group">
        <summary className="flex items-center gap-3 cursor-pointer list-none text-sm font-medium text-gray-200 hover:text-white transition-colors py-3 px-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10">
          <svg
            className="w-4 h-4 shrink-0 text-gray-500 transition-transform group-open:rotate-90"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
          How do I open a terminal?
        </summary>
        <div className="text-sm text-gray-400 leading-relaxed pl-7 pr-4 pb-3 pt-2 space-y-2">
          <p>
            A terminal (also called a command prompt) is a text window where you
            type commands. Here is how to open one on each platform:
          </p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li>
              <strong className="text-gray-200">Windows:</strong> Right-click
              the Start button and choose{" "}
              <span className="font-mono text-gray-300">
                "Windows PowerShell"
              </span>{" "}
              or <span className="font-mono text-gray-300">"Terminal"</span>.
            </li>
            <li>
              <strong className="text-gray-200">macOS:</strong> Press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-gray-300 text-xs font-mono">
                Cmd
              </kbd>
              {" + "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-gray-300 text-xs font-mono">
                Space
              </kbd>
              , type <span className="font-mono text-gray-300">"Terminal"</span>
              , press Enter.
            </li>
            <li>
              <strong className="text-gray-200">Linux:</strong> Right-click the
              desktop and choose{" "}
              <span className="font-mono text-gray-300">"Open Terminal"</span>,
              or press{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-gray-300 text-xs font-mono">
                Ctrl
              </kbd>
              {" + "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-gray-300 text-xs font-mono">
                Alt
              </kbd>
              {" + "}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-gray-300 text-xs font-mono">
                T
              </kbd>
              .
            </li>
          </ul>
        </div>
      </details>

      {/* ================================================================ */}
      {/* 3. One-Line Installer                                            */}
      {/* ================================================================ */}
      <Card variant="highlight" className="p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-plasma-orange" />
          <h2 className="text-sm font-semibold text-white">
            One-Line Installer
          </h2>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-plasma-orange/10 border border-plasma-orange/25 text-plasma-orange ml-auto">
            RECOMMENDED
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">Runs in about 2 minutes.</p>

        <p className="text-sm text-gray-300 leading-relaxed">
          Copy and paste this single command into your terminal (or PowerShell
          on Windows). It will check what you already have installed, set up
          anything that's missing, and verify everything works — all
          automatically.
        </p>

        {platform === "windows" ? (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-400">
              PowerShell (Run as Administrator)
            </div>
            <CommandBlock>{`irm ${SCRIPTS_BASE}/setup.ps1 | iex`}</CommandBlock>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-400">
              Terminal ({platformLabel(platform)})
            </div>
            <CommandBlock>{`curl -fsSL ${SCRIPTS_BASE}/setup.sh | bash`}</CommandBlock>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>Or download and review first:</span>
          {platform === "windows" ? (
            <a
              href={`${GITHUB_REPO}/blob/main/scripts/setup.ps1`}
              target="_blank"
              rel="noreferrer"
              className="text-cosmic-cyan hover:underline font-mono"
            >
              setup.ps1
            </a>
          ) : (
            <a
              href={`${GITHUB_REPO}/blob/main/scripts/setup.sh`}
              target="_blank"
              rel="noreferrer"
              className="text-cosmic-cyan hover:underline font-mono"
            >
              setup.sh
            </a>
          )}
        </div>

        {/* Security caution */}
        <div className="flex items-start gap-2 text-xs text-caution-amber/80 bg-caution-amber/5 border border-caution-amber/15 rounded-lg p-3">
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
            We recommend reviewing scripts before running them.{" "}
            <a
              href={`${GITHUB_REPO}/tree/main/scripts`}
              target="_blank"
              rel="noreferrer"
              className="text-cosmic-cyan hover:underline"
            >
              View source on GitHub
            </a>
            .
          </span>
        </div>
      </Card>

      {/* ================================================================ */}
      {/* 4. Step-by-Step Manual Guide                                     */}
      {/* ================================================================ */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
          Manual Setup Guide
        </h2>
        <p className="text-xs text-gray-500">
          Prefer to set things up yourself? Expand each step below.
        </p>
        <p className="text-xs text-gray-500">
          Estimated time: ~15 minutes total (Steps 1-2 required, ~7 min. Steps
          3-6 optional.)
        </p>

        <div className="space-y-2">
          {/* Step 1: Node.js */}
          <ManualStep
            n={1}
            title="Install Node.js (required for the bridge) — ~5 min"
            badge={REQUIRED_BADGE}
          >
            <p>
              Node.js is a free program that powers the bridge server. You need
              version 18 or newer — we recommend the latest LTS release (v22).
            </p>
            {platform === "macos" && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-400">
                  Using Homebrew
                </div>
                <CommandBlock>{`brew install node@22`}</CommandBlock>
                <div className="text-xs font-medium text-gray-400">
                  Or using nvm
                </div>
                <CommandBlock>{`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\nnvm install 22\nnvm use 22`}</CommandBlock>
              </div>
            )}
            {platform === "windows" && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-400">
                  Using winget
                </div>
                <CommandBlock>{`winget install OpenJS.NodeJS.LTS`}</CommandBlock>
                <p className="text-xs text-gray-500">
                  Or download the installer from{" "}
                  <a
                    href="https://nodejs.org"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cosmic-cyan hover:underline"
                  >
                    nodejs.org
                  </a>
                  .
                </p>
              </div>
            )}
            {platform === "linux" && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-400">
                  Using NodeSource (Debian/Ubuntu)
                </div>
                <CommandBlock>{`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\nsudo apt install nodejs`}</CommandBlock>
                <div className="text-xs font-medium text-gray-400">
                  Or using nvm
                </div>
                <CommandBlock>{`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\nnvm install 22\nnvm use 22`}</CommandBlock>
              </div>
            )}
            <div className="text-xs font-medium text-gray-400 pt-1">
              Verify installation
            </div>
            <CommandBlock>{`node -v\n# Should show v22.x.x`}</CommandBlock>
          </ManualStep>

          {/* Step 2: Bridge */}
          <ManualStep
            n={2}
            title="Install & Start the Bridge — ~2 min"
            badge={REQUIRED_BADGE}
          >
            <div className="space-y-2">
              <p>
                Clone or download the Propulse repository, then install the
                bridge dependencies.
              </p>
              <CommandBlock>{`cd bridge\nnpm install`}</CommandBlock>
              <div className="text-xs font-medium text-gray-400">
                Development mode (auto-reloads)
              </div>
              <CommandBlock>{`npm run dev`}</CommandBlock>
              <div className="text-xs font-medium text-gray-400">
                Or from the project root
              </div>
              <CommandBlock>{`npm run bridge`}</CommandBlock>
            </div>

            {/* Inline test connection */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {testingConnection ? "Testing..." : "Test Connection"}
              </button>
              <ConnectionDot state={state} />
              <span className="text-xs text-gray-500">{bridgeStatusLabel}</span>
              {state === "connected" && (
                <svg
                  className="w-4 h-4 text-signal-green"
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
              )}
            </div>
          </ManualStep>

          {/* Step 3: Hamlib */}
          <ManualStep
            n={3}
            title="Install Hamlib (Optional — lets your computer control your radio) — ~10 min"
            badge={OPTIONAL_BADGE}
          >
            <p>
              Hamlib is free software that lets Propulse read and control your
              radio — things like changing frequency, mode, and band from the
              screen. It supports over 2,000 radio models. You install Hamlib,
              then start its "rigctld" service pointing at your radio.
            </p>

            {platform === "macos" && (
              <div className="space-y-2">
                <CommandBlock>{`brew install hamlib`}</CommandBlock>
              </div>
            )}
            {platform === "windows" && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Download from{" "}
                  <a
                    href="https://hamlib.github.io/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cosmic-cyan hover:underline"
                  >
                    hamlib.github.io
                  </a>{" "}
                  and install. Hamlib binaries are included.
                </p>
              </div>
            )}
            {platform === "linux" && (
              <div className="space-y-2">
                <CommandBlock>{`sudo apt install libhamlib-utils`}</CommandBlock>
              </div>
            )}

            {/* Radio reference table */}
            <div className="text-xs font-medium text-gray-400 pt-2">
              Common radio model reference
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">
                      Radio
                    </th>
                    <th className="text-left py-2 pr-4 text-gray-400 font-medium">
                      Model #
                    </th>
                    <th className="text-left py-2 text-gray-400 font-medium">
                      Command
                    </th>
                  </tr>
                </thead>
                <tbody className="text-gray-300 font-mono">
                  <tr className="border-b border-white/5">
                    <td className="py-1.5 pr-4 font-sans">Icom IC-7300</td>
                    <td className="py-1.5 pr-4 text-plasma-orange">3085</td>
                    <td className="py-1.5 text-[11px]">
                      rigctld -m 3085 -r{" "}
                      {platform === "windows" ? "COM3" : "/dev/ttyUSB0"} -s
                      115200
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5 pr-4 font-sans">Yaesu FT-991A</td>
                    <td className="py-1.5 pr-4 text-plasma-orange">1035</td>
                    <td className="py-1.5 text-[11px]">
                      rigctld -m 1035 -r{" "}
                      {platform === "windows" ? "COM3" : "/dev/ttyUSB0"} -s
                      38400
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5 pr-4 font-sans">Kenwood TS-890S</td>
                    <td className="py-1.5 pr-4 text-plasma-orange">2044</td>
                    <td className="py-1.5 text-[11px]">
                      rigctld -m 2044 -r{" "}
                      {platform === "windows" ? "COM3" : "/dev/ttyUSB0"} -s
                      115200
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5 pr-4 font-sans">Elecraft K3</td>
                    <td className="py-1.5 pr-4 text-plasma-orange">2036</td>
                    <td className="py-1.5 text-[11px]">
                      rigctld -m 2036 -r{" "}
                      {platform === "windows" ? "COM3" : "/dev/ttyUSB0"} -s
                      38400
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 font-sans">FlexRadio 6x00</td>
                    <td className="py-1.5 pr-4 text-plasma-orange">2507</td>
                    <td className="py-1.5 text-[11px]">
                      rigctld -m 2507 -r 127.0.0.1:4992
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {platform === "windows" && (
              <p className="text-xs text-gray-500 pt-1">
                Serial ports on Windows are named{" "}
                <span className="font-mono text-gray-300">COM3</span>,{" "}
                <span className="font-mono text-gray-300">COM4</span>, etc.
                Check Device Manager for the correct port.
              </p>
            )}
            {platform === "macos" && (
              <p className="text-xs text-gray-500 pt-1">
                Serial ports on macOS look like{" "}
                <span className="font-mono text-gray-300">
                  /dev/cu.usbserial-*
                </span>
                . Run{" "}
                <span className="font-mono text-gray-300">ls /dev/cu.usb*</span>{" "}
                to find yours.
              </p>
            )}
            {platform === "linux" && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-gray-500">
                  Serial ports on Linux are typically{" "}
                  <span className="font-mono text-gray-300">/dev/ttyUSB0</span>{" "}
                  or{" "}
                  <span className="font-mono text-gray-300">/dev/ttyACM0</span>.
                </p>
                <p className="text-xs text-gray-500">
                  You may need serial port permissions:
                </p>
                <CommandBlock>{`sudo usermod -aG dialout $USER\n# Log out and back in for changes to take effect`}</CommandBlock>
              </div>
            )}
          </ManualStep>

          {/* Step 4: WSJT-X */}
          <ManualStep
            n={4}
            title="Configure WSJT-X (Optional — for FT8/FT4 digital modes) — ~2 min"
            badge={OPTIONAL_BADGE}
          >
            <p>
              If you use WSJT-X for FT8 or FT4, you can connect it to Propulse.
              Decoded callsigns will appear live, and completed QSOs are
              automatically logged. WSJT-X sends data to the bridge over your
              local network (UDP port 2237) — no internet required.
            </p>
            <div className="space-y-2">
              <Step n={1} title="Open WSJT-X Settings">
                <p>
                  Go to{" "}
                  <span className="text-gray-100 font-semibold">
                    File &rarr; Settings &rarr; Reporting
                  </span>
                </p>
              </Step>
              <Step n={2} title="Enable UDP">
                <p>
                  Check{" "}
                  <span className="text-gray-100 font-semibold">
                    "Accept UDP requests"
                  </span>
                </p>
              </Step>
              <Step n={3} title="Set the port">
                <p>
                  Ensure the UDP port is set to{" "}
                  <span className="font-mono text-gray-100">2237</span> (the
                  default). The bridge auto-listens on this port.
                </p>
              </Step>
            </div>
            <p className="text-xs text-gray-500 pt-2">
              Once configured, decoded callsigns from FT8/FT4 sessions will
              appear in Propulse automatically, and completed QSOs will be
              auto-logged.
            </p>
          </ManualStep>

          {/* Step 5: DX Cluster */}
          <ManualStep
            n={5}
            title="Configure DX Cluster (Optional — live spots from other operators) — ~2 min"
            badge={OPTIONAL_BADGE}
          >
            <p>
              A DX Cluster is like a shared bulletin board where ham operators
              post who they're hearing and on what frequency. Propulse shows
              these spots on the map in real-time. You configure this in the app
              — no extra software needed.
            </p>
            <div className="space-y-2">
              <p>
                In Propulse, go to{" "}
                <span className="text-gray-100 font-semibold">
                  Settings &rarr; Connections &rarr; DX Cluster
                </span>
                .
              </p>
              <div className="text-xs font-medium text-gray-400">
                Common cluster nodes
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 pr-4 text-gray-400 font-medium">
                        Node
                      </th>
                      <th className="text-left py-2 text-gray-400 font-medium">
                        Region
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    <tr className="border-b border-white/5">
                      <td className="py-1.5 pr-4 font-mono text-cosmic-cyan">
                        dxc.nc7j.com:7373
                      </td>
                      <td className="py-1.5">North America</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-1.5 pr-4 font-mono text-cosmic-cyan">
                        dxc.ve7cc.net:23
                      </td>
                      <td className="py-1.5">Canada</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-4 font-mono text-cosmic-cyan">
                        dxc.hb9drv.ch:8000
                      </td>
                      <td className="py-1.5">Europe</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">
                Your callsign is required for cluster login. Enter it in
                Settings.
              </p>
            </div>
          </ManualStep>

          {/* Step 6: Verify */}
          <ManualStep
            n={6}
            title="Verify Everything — ~1 min"
            badge={OPTIONAL_BADGE}
          >
            <p>
              Use the button below to test the bridge, then confirm each
              component is working.
            </p>

            {/* Inline test */}
            <div className="flex items-center gap-3 py-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {testingConnection ? "Testing..." : "Test Bridge Connection"}
              </button>
              <ConnectionDot state={state} />
              <span className="text-xs text-gray-500">{bridgeStatusLabel}</span>
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

            {/* Checklist */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-medium text-gray-400">
                Verification checklist
              </div>
              {[
                "Bridge server is running and connected",
                "Hamlib rigctld started (if using CAT control)",
                "WSJT-X UDP reporting enabled (if using FT8/FT4)",
                "DX Cluster node configured (if using live spots)",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 text-xs text-gray-300"
                >
                  <div className="w-4 h-4 rounded border border-white/15 bg-white/[0.03] shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-3 text-xs">
              <Link to="/health" className="text-cosmic-cyan hover:underline">
                System Health &rarr;
              </Link>
              <Link to="/bridge" className="text-cosmic-cyan hover:underline">
                Bridge Details &rarr;
              </Link>
            </div>
          </ManualStep>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 5. Architecture Overview                                         */}
      {/* ================================================================ */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">
          Architecture Overview
        </h2>
        <p className="text-xs text-gray-500">
          The bridge sits between your browser and radio hardware, routing all
          messages over localhost.
          {state === "connected" &&
            " Green lines and animated dots indicate an active connection."}
        </p>
        <div className="overflow-x-auto -mx-2 px-2">
          <SetupArchitectureDiagram connected={state === "connected"} />
        </div>
      </Card>

      {/* ================================================================ */}
      {/* 6. Troubleshooting FAQ                                           */}
      {/* ================================================================ */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white mb-1">
          Troubleshooting
        </h2>
        <div className="space-y-2">
          <FAQItem question="Node.js version is too old">
            <p>
              The bridge requires Node.js 18+. Check your version with{" "}
              <span className="font-mono text-gray-300">node -v</span>.
            </p>
            <p className="pt-2">To upgrade:</p>
            <ul className="list-disc pl-4 space-y-1 pt-1">
              {platform === "macos" && (
                <li>
                  <span className="font-mono text-gray-300">
                    brew upgrade node
                  </span>{" "}
                  or{" "}
                  <span className="font-mono text-gray-300">
                    nvm install 22
                  </span>
                </li>
              )}
              {platform === "windows" && (
                <li>
                  <span className="font-mono text-gray-300">
                    winget upgrade OpenJS.NodeJS.LTS
                  </span>{" "}
                  or download from{" "}
                  <a
                    href="https://nodejs.org"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cosmic-cyan hover:underline"
                  >
                    nodejs.org
                  </a>
                </li>
              )}
              {platform === "linux" && (
                <li>
                  Re-run the NodeSource setup script for the latest LTS, or use{" "}
                  <span className="font-mono text-gray-300">
                    nvm install 22
                  </span>
                </li>
              )}
            </ul>
          </FAQItem>

          <FAQItem question="Bridge won't connect">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Confirm the bridge server is running (
                <span className="font-mono text-gray-300">npm run dev</span> in
                the <span className="font-mono text-gray-300">bridge/</span>{" "}
                directory).
              </li>
              <li>
                Check that port{" "}
                <span className="font-mono text-gray-300">9867</span> is not
                blocked by your firewall.
              </li>
              <li>
                Verify the WebSocket URL is{" "}
                <span className="font-mono text-gray-300">
                  ws://127.0.0.1:9867
                </span>
                .
              </li>
            </ul>
          </FAQItem>

          <FAQItem question="Port 9867 is already in use">
            <p>Find what is using the port:</p>
            <div className="pt-2">
              {platform === "windows" ? (
                <CommandBlock>{`netstat -ano | findstr 9867`}</CommandBlock>
              ) : (
                <CommandBlock>{`lsof -i :9867`}</CommandBlock>
              )}
            </div>
            <p className="pt-2">Or run the bridge on a different port:</p>
            <div className="pt-1">
              <CommandBlock>{`BRIDGE_PORT=9868 npm run dev`}</CommandBlock>
            </div>
            <p className="pt-1 text-xs">
              Then update the WebSocket URL in Propulse settings to match.
            </p>
          </FAQItem>

          <FAQItem question="Can't control my radio">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Verify <span className="font-mono text-gray-300">rigctld</span>{" "}
                is running with the correct model number. Use{" "}
                <span className="font-mono text-gray-300">rigctld -l</span> to
                list all supported models.
              </li>
              <li>
                Check the serial port and baud rate match your radio's CAT
                settings.
              </li>
              {platform === "linux" && (
                <li>
                  Ensure your user is in the{" "}
                  <span className="font-mono text-gray-300">dialout</span>{" "}
                  group:{" "}
                  <span className="font-mono text-gray-300">
                    sudo usermod -aG dialout $USER
                  </span>{" "}
                  then log out and back in.
                </li>
              )}
              {platform === "macos" && (
                <li>
                  macOS may block serial access. Check System Settings &rarr;
                  Privacy &amp; Security for Terminal permissions.
                </li>
              )}
            </ul>
          </FAQItem>

          <FAQItem question="WSJT-X decodes not showing">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                In WSJT-X, verify{" "}
                <span className="font-mono text-gray-300">
                  File &rarr; Settings &rarr; Reporting &rarr; Accept UDP
                  requests
                </span>{" "}
                is checked.
              </li>
              <li>
                Confirm the UDP port is{" "}
                <span className="font-mono text-gray-300">2237</span>.
              </li>
              <li>
                Make sure the bridge server is running — it listens for WSJT-X
                UDP traffic automatically.
              </li>
            </ul>
          </FAQItem>

          <FAQItem question="Permission denied on serial port (Linux)">
            <p>
              Add your user to the{" "}
              <span className="font-mono text-gray-300">dialout</span> group:
            </p>
            <div className="pt-2">
              <CommandBlock>{`sudo usermod -aG dialout $USER`}</CommandBlock>
            </div>
            <p className="pt-2">
              You must log out and log back in (or reboot) for the change to
              take effect. Verify with{" "}
              <span className="font-mono text-gray-300">groups</span>.
            </p>
          </FAQItem>
        </div>
      </Card>

      {/* ================================================================ */}
      {/* 7. Links & Resources                                             */}
      {/* ================================================================ */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">
          Links &amp; Resources
        </h2>
        <div className="divide-y divide-white/5">
          {/* External links */}
          {[
            {
              label: "Setup Scripts (GitHub)",
              url: `${GITHUB_REPO}/tree/main/scripts`,
              desc: "Automated installer scripts for all platforms",
              external: true,
            },
            {
              label: "Hamlib Project",
              url: "https://hamlib.github.io/",
              desc: "Open-source radio control library (2,000+ models)",
              external: true,
            },
            {
              label: "WSJT-X",
              url: "https://wsjt.sourceforge.io/wsjtx.html",
              desc: "Weak signal digital modes (FT8, FT4, JT65)",
              external: true,
            },
            {
              label: "DX Cluster Info",
              url: "https://www.dxcluster.info/",
              desc: "Public DX cluster node directory",
              external: true,
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

          {/* Internal links */}
          {[
            {
              label: "ProPulse Bridge Info",
              to: "/bridge",
              desc: "Detailed bridge capabilities and protocol reference",
            },
            {
              label: "System Health",
              to: "/health",
              desc: "Live system diagnostics and connection monitoring",
            },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          ))}
        </div>
      </Card>

      {/* ================================================================ */}
      {/* 8. Glossary                                                       */}
      {/* ================================================================ */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Glossary</h2>
        <p className="text-xs text-gray-500">
          Quick definitions of the technical terms used on this page.
        </p>
        <div className="divide-y divide-white/5 text-sm">
          {[
            {
              term: "Node.js",
              def: "A free program that runs JavaScript on your computer. It powers the bridge server.",
            },
            {
              term: "npm",
              def: "Node Package Manager — a tool that comes with Node.js for installing software packages.",
            },
            {
              term: "Bridge Server",
              def: "A small program running on your computer that connects Propulse (in the browser) to your radio hardware.",
            },
            {
              term: "WebSocket",
              def: "A communication channel that keeps a live, two-way connection open between your browser and the bridge so data flows instantly.",
            },
            {
              term: "CAT Control",
              def: "Computer Aided Transceiver — a standard way for a computer to control a radio (change frequency, mode, etc.).",
            },
            {
              term: "Hamlib / rigctld",
              def: "Hamlib is free radio-control software. rigctld is the background service that translates commands for your specific radio model.",
            },
            {
              term: "WSJT-X",
              def: "Free software for digital weak-signal modes like FT8 and FT4. It decodes radio signals and can log contacts automatically.",
            },
            {
              term: "UDP",
              def: "User Datagram Protocol — a fast network protocol. WSJT-X uses it to send decoded data to the bridge over your local network.",
            },
            {
              term: "DX Cluster",
              def: "A worldwide network where ham radio operators share real-time reports of who they are hearing on the air.",
            },
            {
              term: "Terminal / Command Prompt",
              def: "A text-based window where you type commands. Called 'Terminal' on Mac/Linux and 'PowerShell' or 'Command Prompt' on Windows.",
            },
            {
              term: "Serial Port",
              def: "A physical or virtual connection between your computer and radio (usually via USB cable). Named COM3/COM4 on Windows, /dev/ttyUSB0 on Linux.",
            },
            {
              term: "Baud Rate",
              def: "The speed at which data travels over a serial port, measured in bits per second. Must match between your computer and radio (common values: 9600, 38400, 115200).",
            },
          ].map((item) => (
            <div key={item.term} className="py-2.5 flex flex-col">
              <dt className="text-gray-200 font-medium">{item.term}</dt>
              <dd className="text-gray-400 text-xs mt-0.5">{item.def}</dd>
            </div>
          ))}
        </div>
      </Card>

      {/* Bottom spacer for mobile scroll */}
      <div className="h-8" />
    </div>
  );
}

export default SetupGuidePage;

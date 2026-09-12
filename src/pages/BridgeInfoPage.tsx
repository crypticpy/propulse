import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { useBridge } from "@/hooks/useBridge";
import {
  ArchitectureDiagram,
  CommandBlock,
  ConnectionDot,
  FAQItem,
  Step,
  getInitialPlatform,
  persistPlatform,
  platformLabel,
  type Platform,
} from "@/components/setup";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_URL = "ws://127.0.0.1:9867";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
        return "text-su-muted bg-su-line/10 border-su-line/40";
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

/**
 * Single source of truth for each capability card's accent colour, mirroring
 * the `--su-*-rgb` variable tailwind.config.js binds the matching token to
 * (see SystemHealthPage's `ACCENT_TOKEN_COLORS`, #789). Keeps the card's top
 * rule, icon, and callout tint from drifting from the theme or from each
 * other (#787/#791/#789/#799).
 *
 * `edge` drives the decorative rule and icon stroke -- graphical objects,
 * held to WCAG's 3:1 non-text floor, not 4.5:1. For `orange` this is
 * `--su-accent-edge`, the token `stationTokens()` derives specifically to
 * hold that floor when the operator's own customisable `--su-accent` does
 * not (`src/lib/themes/stationTokens.ts`, #799): the raw accent measures as
 * low as 1.00-2.32:1 against panel/canvas for the shipped default in the
 * light theme and for adversarial custom accents in every theme. For the
 * other three roles `edge` is the same token as `base`, which already
 * clears 3:1 everywhere.
 *
 * `base` drives the low-alpha chip fill and callout tint (the 0.08/0.19/
 * 0.03/0.09 alphas) -- decorative tints, not graphical objects, so they stay
 * on the raw accent/tone rather than the edge-adjusted one.
 *
 * `text` drives the callout's actual text colour. For the three fixed
 * palette tones (`success`/`info`/`purple`) that's the same token: they're
 * already designed to clear 4.5:1 as text everywhere else they're consumed
 * (no site in this codebase gives them a separate "-text" variant). `orange`
 * is different -- it resolves to `--su-accent`, the operator's own
 * customisable brand colour (`src/lib/themes/stationTokens.ts`), which is
 * never assumed legible as text. It uses `--su-accent-text` instead, the
 * token `stationTokens()` already derives specifically for this: the
 * requested accent if it clears 4.5:1 against `panel`, else `info`. That
 * guarantee only covers `panel`; the measured table in this PR spot-checks
 * the default `#ff6b35` accent against `canvas` too and it also clears the
 * floor there in all four themes, but a future custom accent close to the
 * `panel` boundary is not guaranteed safe against `canvas` by the token
 * itself -- tracked in #811.
 */
const FEATURE_ACCENTS = {
  orange: {
    baseVar: "--su-accent-rgb",
    edgeVar: "--su-accent-edge-rgb",
    textVar: "--su-accent-text-rgb",
  },
  green: {
    baseVar: "--su-success-rgb",
    edgeVar: "--su-success-rgb",
    textVar: "--su-success-rgb",
  },
  cyan: {
    baseVar: "--su-info-rgb",
    edgeVar: "--su-info-rgb",
    textVar: "--su-info-rgb",
  },
  purple: {
    baseVar: "--su-purple-rgb",
    edgeVar: "--su-purple-rgb",
    textVar: "--su-purple-rgb",
  },
} as const;

type FeatureAccentKey = keyof typeof FEATURE_ACCENTS;

function FeatureCard({
  title,
  accent,
  icon,
  description,
  details,
  callout,
}: {
  title: string;
  accent: FeatureAccentKey;
  icon: ReactNode;
  description: string;
  details: string;
  callout: string;
}) {
  const { baseVar, edgeVar, textVar } = FEATURE_ACCENTS[accent];
  const edge = `rgb(var(${edgeVar}))`;
  const text = `rgb(var(${textVar}))`;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="h-1" style={{ background: edge }} />
      <div className="p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `rgb(var(${baseVar}) / 0.08)`,
              border: `1px solid rgb(var(${baseVar}) / 0.19)`,
            }}
          >
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-su-text">{title}</h3>
        </div>
        <p className="text-sm text-su-muted leading-relaxed">{description}</p>
        <p className="text-xs text-su-muted leading-relaxed">{details}</p>
        <div
          className="text-xs leading-relaxed rounded-lg p-3"
          style={{
            background: `rgb(var(${baseVar}) / 0.03)`,
            border: `1px solid rgb(var(${baseVar}) / 0.09)`,
            color: text,
          }}
        >
          <span className="font-semibold">What this means:</span>{" "}
          <span className="text-su-muted">{callout}</span>
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
  const [platform, setPlatform] = useState<Platform>(getInitialPlatform);

  useEffect(() => {
    persistPlatform(platform);
  }, [platform]);

  // Connection test
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const testStartRef = useRef<number>(0);
  const testTimeoutRef = useRef<number | null>(null);

  const clearTestTimeout = useCallback(() => {
    if (testTimeoutRef.current !== null) {
      window.clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
  }, []);

  const handleTestConnection = useCallback(() => {
    setTestingConnection(true);
    setTestResult(null);
    testStartRef.current = Date.now();
    clearTestTimeout();
    connect();

    // Timeout after 5s
    testTimeoutRef.current = window.setTimeout(() => {
      testTimeoutRef.current = null;
      setTestingConnection(false);
      setTestResult("Timeout — no response from bridge after 5 seconds.");
    }, 5000);
  }, [clearTestTimeout, connect]);

  useEffect(() => clearTestTimeout, [clearTestTimeout]);

  // Watch for connection success during test
  useEffect(() => {
    if (testingConnection && state === "connected") {
      clearTestTimeout();
      const latency = Date.now() - testStartRef.current;
      setTestResult(`Connected in ${latency}ms`);
      setTestingConnection(false);
    }
    if (testingConnection && state === "error") {
      clearTestTimeout();
      setTestResult(error ?? "Connection failed.");
      setTestingConnection(false);
    }
  }, [clearTestTimeout, state, testingConnection, error]);

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
          className="inline-flex items-center gap-1.5 text-sm text-su-muted hover:text-su-text transition-colors"
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
          <p className="text-su-muted text-sm md:text-base max-w-2xl">
            Connect your radio hardware to Propulse
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <ConnectionBadge state={state} error={error} />

          <div className="flex items-center gap-2">
            <code className="text-xs md:text-sm font-mono text-su-muted bg-su-input border border-su-line/40 rounded-lg px-3 py-1.5 select-all">
              {WS_URL}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(WS_URL).catch(() => {});
              }}
              className="p-1.5 rounded-md bg-su-line/10 border border-su-line/40 text-su-muted hover:text-su-text hover:bg-su-line/20 transition-colors"
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
            <p className="text-xs text-su-muted italic">
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
        <h2 className="text-sm font-semibold text-su-text">
          What is the Bridge?
        </h2>
        <div className="space-y-3 text-sm text-su-muted leading-relaxed">
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
        <h2 className="text-sm font-semibold text-su-text mb-4 uppercase tracking-wider">
          Capabilities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeatureCard
            title="CAT Control"
            accent="orange"
            icon={<RadioIcon color="rgb(var(--su-accent-edge-rgb))" />}
            description="Control your transceiver directly from the browser. Tune to a DX spot with one click, switch modes for digital or CW, activate PTT for transmit."
            details="Powered by Hamlib, supporting over 2,000 radio models from Icom, Yaesu, Kenwood, Elecraft, FlexRadio, and more."
            callout="Hear a rare DX station on the cluster? One click and your radio is already on frequency."
          />
          <FeatureCard
            title="DX Cluster Relay"
            accent="green"
            icon={<AntennaIcon color="rgb(var(--su-success-rgb))" />}
            description="Receive real-time DX spots from the worldwide cluster network directly in Propulse. Spots appear on the PropSphere map and band planner automatically."
            details="Connects to standard DX cluster nodes via telnet — works with any public node. No separate telnet client needed."
            callout="See who's on the air right now, where they are on the globe, and jump to their frequency instantly."
          />
          <FeatureCard
            title="WSJT-X Integration"
            accent="cyan"
            icon={<WaveformIcon color="rgb(var(--su-info-rgb))" />}
            description="See FT8, FT4, and JT65 decodes from WSJT-X in real-time within Propulse. Auto-log QSOs when WSJT-X reports a completed contact."
            details="Listens on WSJT-X's standard UDP multicast port — zero configuration in most setups. Track which callsigns are being decoded on the waterfall."
            callout="Your digital mode activity flows seamlessly into your Propulse logbook and map."
          />
          <FeatureCard
            title="Multi-Operator Sync"
            accent="purple"
            icon={<NetworkIcon color="rgb(var(--su-purple-rgb))" />}
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
        <h2 className="text-sm font-semibold text-su-text">Live Connection</h2>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <ConnectionDot state={state} />
            <div>
              <div className="text-sm font-medium text-su-text">
                {state === "connected" && "Connected"}
                {state === "connecting" && "Connecting..."}
                {state === "disconnected" && "Disconnected"}
                {state === "error" && (error ?? "Error")}
              </div>
              {state === "connecting" && reconnectCount > 0 && (
                <div className="text-xs text-su-muted">
                  Attempt {reconnectCount}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-su-line/10 border border-su-line/40 text-su-muted hover:text-su-text hover:bg-su-line/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="text-xs font-mono text-su-muted bg-su-input border border-su-line/20 rounded-lg px-3 py-2">
            Last message:{" "}
            <span className="text-su-muted">{lastMsgDisplay.type}</span>
            {" at "}
            <span className="text-su-muted">{lastMsgDisplay.time}</span>
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 5. Architecture Diagram                                          */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-su-text">Architecture</h2>
        <p className="text-xs text-su-muted">
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
          <h2 className="text-sm font-semibold text-su-text">
            Message Protocol
          </h2>
          <svg
            className={`w-4 h-4 text-su-muted transition-transform ${protocolExpanded ? "rotate-180" : ""}`}
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

        <p className="text-xs text-su-muted">
          All messages use a JSON envelope format with type, id, timestamp, and
          payload fields.
        </p>

        {protocolExpanded && (
          <div className="space-y-4 pt-2">
            <div>
              <div className="text-xs font-semibold text-su-muted mb-2">
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
              <div className="text-xs font-semibold text-su-muted mb-2">
                Key Message Types
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="border-b border-su-line/40">
                      <th className="text-left py-2 pr-4 text-su-muted font-medium">
                        Type
                      </th>
                      <th className="text-left py-2 pr-4 text-su-muted font-medium">
                        Direction
                      </th>
                      <th className="text-left py-2 text-su-muted font-medium">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-su-muted">
                    <tr className="border-b border-su-line/20">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        bridge.welcome
                      </td>
                      <td className="py-1.5 pr-4 text-su-muted">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">Sent on connection</td>
                    </tr>
                    <tr className="border-b border-su-line/20">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        rig.update
                      </td>
                      <td className="py-1.5 pr-4 text-su-muted">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">
                        Rig frequency/mode/status changes
                      </td>
                    </tr>
                    <tr className="border-b border-su-line/20">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        rig.setFrequency
                      </td>
                      <td className="py-1.5 pr-4 text-su-muted">
                        Client &rarr; Server
                      </td>
                      <td className="py-1.5">Tune radio to a frequency</td>
                    </tr>
                    <tr className="border-b border-su-line/20">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        cluster.spot
                      </td>
                      <td className="py-1.5 pr-4 text-su-muted">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">New DX spot from cluster</td>
                    </tr>
                    <tr className="border-b border-su-line/20">
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        wsjtx.decode
                      </td>
                      <td className="py-1.5 pr-4 text-su-muted">
                        Server &rarr; Client
                      </td>
                      <td className="py-1.5">FT8/FT4 decode from WSJT-X</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-4 font-mono text-plasma-orange">
                        contest.session.create
                      </td>
                      <td className="py-1.5 pr-4 text-su-muted">
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
          <h2 className="text-sm font-semibold text-su-text">Security Model</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <GreenCheck />
            <p className="text-sm text-su-muted leading-relaxed">
              Binds exclusively to localhost{" "}
              <span className="font-mono text-su-text">(127.0.0.1)</span> — no
              remote connections accepted
            </p>
          </div>
          <div className="flex items-start gap-3">
            <GreenCheck />
            <p className="text-sm text-su-muted leading-relaxed">
              CAT control commands cannot be issued from outside your computer
            </p>
          </div>
          <div className="flex items-start gap-3">
            <GreenCheck />
            <p className="text-sm text-su-muted leading-relaxed">
              Contest data and QSO information never leave your local network
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-su-line/20 space-y-2">
          <div className="text-xs font-semibold text-su-muted">
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
        <h2 className="text-sm font-semibold text-su-text">Setup Guide</h2>

        {/* Platform selector */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm text-su-muted">Pick your platform</div>
            <div className="text-xs text-su-muted">
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
                    : "bg-su-line/10 border-su-line/40 text-su-text hover:bg-su-line/20"
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
                <div className="text-xs text-su-muted">
                  Alternatively, download the pre-built binary{" "}
                  <span className="font-mono text-su-muted">
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
                <div className="text-xs text-su-muted">
                  Alternatively, download{" "}
                  <span className="font-mono text-su-muted">
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
                <div className="text-xs text-su-muted">
                  Alternatively, download{" "}
                  <span className="font-mono text-su-muted">
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
                  <span className="font-mono text-su-muted">aarch64</span>{" "}
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
                <span className="text-su-text font-semibold">
                  System Health
                </span>{" "}
                in the Propulse header. It should show "Bridge: Connected."
              </div>
              <div className="text-xs text-su-muted">
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
                <span className="font-mono text-su-text">rigctld</span> with
                your radio's model number and serial port:
              </div>
              {platform === "windows" ? (
                <CommandBlock>{`rigctld -m 3085 -r COM3 -s 38400`}</CommandBlock>
              ) : (
                <CommandBlock>{`rigctld -m 3085 -r /dev/ttyUSB0 -s 38400`}</CommandBlock>
              )}
              {(platform === "macos" || platform === "linux") && (
                <div className="text-xs text-su-muted">
                  On {platformLabel(platform)}, you may need to add your user to
                  the <span className="font-mono text-su-muted">dialout</span>{" "}
                  group for serial port access:{" "}
                  <span className="font-mono text-su-muted">
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
                <span className="text-su-text font-semibold">
                  File &rarr; Settings &rarr; Reporting
                </span>{" "}
                and enable{" "}
                <span className="text-su-text font-semibold">
                  "Accept UDP requests"
                </span>
                .
              </div>
              <div>
                The default UDP port is{" "}
                <span className="font-mono text-su-text">2237</span>. The bridge
                listens on this port automatically.
              </div>
            </div>
          </Step>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* 9. Troubleshooting                                               */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-4 md:p-5 space-y-3">
        <h2 className="text-sm font-semibold text-su-text mb-1">
          Troubleshooting
        </h2>
        <div className="space-y-2">
          <FAQItem question="Bridge shows 'Disconnected'">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Confirm the bridge server is running (
                <span className="font-mono text-su-muted">npm run dev</span> or
                the standalone binary).
              </li>
              <li>
                Check that port{" "}
                <span className="font-mono text-su-muted">9867</span> is not
                blocked by your firewall.
              </li>
              <li>
                Ensure the WebSocket URL matches (
                <span className="font-mono text-su-muted">{WS_URL}</span>).
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
                <span className="font-mono text-su-muted">
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
                <span className="font-mono text-su-muted">rigctld</span> is
                running with the correct model number (
                <span className="font-mono text-su-muted">rigctld -l</span> to
                list supported models).
              </li>
              {(platform === "macos" || platform === "linux") && (
                <li>
                  Check serial port permissions. Your user may need to be in the{" "}
                  <span className="font-mono text-su-muted">dialout</span> or{" "}
                  <span className="font-mono text-su-muted">uucp</span> group.
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
              <span className="font-mono text-su-muted">ws://</span>)
              connections from HTTPS pages. However, connections to{" "}
              <span className="font-mono text-su-muted">localhost</span> and{" "}
              <span className="font-mono text-su-muted">127.0.0.1</span> are
              exempt from this restriction in Chrome, Firefox, and Edge. If you
              still encounter issues, run Propulse locally on{" "}
              <span className="font-mono text-su-muted">http://localhost</span>{" "}
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
        <h2 className="text-sm font-semibold text-su-text">
          Links &amp; Resources
        </h2>
        <div className="divide-y divide-su-line/20">
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
                <div className="text-sm font-medium text-su-text/80 group-hover:text-su-text transition-colors">
                  {link.label}
                </div>
                <div className="text-xs text-su-muted">{link.desc}</div>
              </div>
              <svg
                className="w-4 h-4 shrink-0 text-su-muted group-hover:text-su-text transition-colors"
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

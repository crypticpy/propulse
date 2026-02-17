/**
 * RadioSetupWizard -- 4-step self-detecting radio setup wizard.
 *
 * Portal-rendered (z-[500]) centered modal that guides the user through
 * detecting, configuring, testing, and confirming their radio connection.
 *
 * Visibility:
 *  - Shows when `settingsStore.radioSetupCompleted === false`
 *    AND `localStorage('propulse-welcome-seen') === 'true'`
 *  - Rendered unconditionally in App.tsx (like WelcomeOverlay)
 *
 * Steps:
 *  1. DetectionStep  -- Scanning animation, bridge + radio discovery
 *  2. ConfigurationStep -- Auto-filled or manual backend / port config
 *  3. TestingStep    -- Sequential connection test with live dashboard
 *  4. SuccessStep    -- Confetti celebration, summary, navigation CTAs
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  useRadioSetup,
  type WizardStep,
  type CATBackend,
  type UseRadioSetupReturn,
} from "@/hooks/useRadioSetup";
import { useSettingsStore } from "@/stores/settingsStore";

// ── Constants ────────────────────────────────────────────────────────────────

const WELCOME_KEY = "propulse-welcome-seen";

const STEP_LABELS: { key: WizardStep; label: string }[] = [
  { key: "detecting", label: "Detect" },
  { key: "configuring", label: "Configure" },
  { key: "testing", label: "Test" },
  { key: "complete", label: "Done" },
];

const STEP_ORDER: WizardStep[] = [
  "detecting",
  "configuring",
  "testing",
  "complete",
];

const BACKENDS: {
  id: CATBackend;
  label: string;
  desc: string;
  iconId: string;
}[] = [
  {
    id: "auto",
    label: "Auto Detect",
    desc: "Best for most setups",
    iconId: "search",
  },
  {
    id: "icom-serial",
    label: "ICOM Direct",
    desc: "USB CI-V cable",
    iconId: "plug",
  },
  {
    id: "icom-network",
    label: "ICOM Network",
    desc: "RS-BA1 remote",
    iconId: "globe",
  },
  {
    id: "hamlib",
    label: "Hamlib",
    desc: "Universal rig control",
    iconId: "antenna",
  },
  {
    id: "flrig",
    label: "Flrig",
    desc: "XML-RPC legacy",
    iconId: "wrench",
  },
  {
    id: "disabled",
    label: "No Radio",
    desc: "Browse without radio",
    iconId: "eye",
  },
];

const CONFETTI_COLORS = ["#FF6B35", "#3DD68C", "#6366F1", "#F59E0B", "#06B6D4"];

// ── Inline SVG Icons ─────────────────────────────────────────────────────────

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
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
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeDasharray="56"
        strokeDashoffset="14"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RadioTowerIcon({ className }: { className?: string }) {
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
      {/* Tower */}
      <line x1="12" y1="8" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
      {/* Signal arcs left */}
      <path d="M7.5 5.5A5.5 5.5 0 0112 3" />
      <path d="M4.5 3A9 9 0 0112 0" />
      {/* Signal arcs right */}
      <path d="M16.5 5.5A5.5 5.5 0 0012 3" />
      <path d="M19.5 3A9 9 0 0012 0" />
      {/* Antenna dot */}
      <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
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
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
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
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
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
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Backend-specific inline icons */
function BackendIcon({
  iconId,
  className,
}: {
  iconId: string;
  className?: string;
}) {
  switch (iconId) {
    case "search":
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
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      );
    case "plug":
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
          <path d="M12 22v-5" />
          <path d="M9 8V1h6v7" />
          <path d="M7 8h10a2 2 0 012 2v4a5 5 0 01-10 0v-4a2 2 0 012-2z" />
        </svg>
      );
    case "globe":
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
          <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
        </svg>
      );
    case "antenna":
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
    case "wrench":
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
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "eye":
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
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format raw frequency (Hz) to a human-readable MHz string */
function formatFrequency(hz: number): string {
  const mhz = hz / 1_000_000;
  return mhz.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Get the platform-specific install instructions */
function getPlatformInfo(): {
  platform: string;
  installCmd: string;
  prereq: string;
} {
  const ua = navigator.userAgent?.toLowerCase() ?? "";
  if (ua.includes("mac")) {
    return {
      platform: "macOS",
      installCmd: "cd bridge && npm install && npm run dev",
      prereq: "brew install node",
    };
  }
  if (ua.includes("win")) {
    return {
      platform: "Windows",
      installCmd: "cd bridge && npm install && npm run dev",
      prereq: "Install Node.js from nodejs.org, then:",
    };
  }
  return {
    platform: "Linux",
    installCmd: "cd bridge && npm install && npm run dev",
    prereq: "sudo apt install nodejs npm",
  };
}

/** Determine signal bar color from dBm */
function sMeterColor(dbm: number): string {
  if (dbm >= -53) return "bg-alert-red";
  if (dbm >= -73) return "bg-caution-amber";
  return "bg-signal-green";
}

/** Convert frequency to rough S-meter reading for display */
function sMeterLabel(dbm: number | undefined): string {
  if (dbm === undefined) return "S0";
  // Rough mapping: every 6dB = 1 S-unit, S9 = -73dBm
  const s = Math.max(0, Math.min(9, Math.round((dbm + 127) / 6)));
  if (s >= 9) {
    const over = Math.max(0, Math.round((dbm + 73) / 1));
    return over > 0 ? `S9+${over}` : "S9";
  }
  return `S${s}`;
}

// ── StepProgressBar ──────────────────────────────────────────────────────────

function StepProgressBar({ current }: { current: WizardStep }) {
  const currentIdx = STEP_ORDER.indexOf(current);

  return (
    <div className="flex items-center justify-center gap-0 px-8 pt-6 pb-2">
      {STEP_LABELS.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isActive = i === currentIdx;

        return (
          <div key={s.key} className="flex items-center">
            {/* Dot + label */}
            <div className="flex flex-col items-center">
              <div className="relative">
                {isActive && (
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-plasma-orange/40 animate-ping" />
                )}
                <div
                  className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                    isCompleted
                      ? "bg-signal-green"
                      : isActive
                        ? "bg-plasma-orange"
                        : "bg-white/20"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] mt-1.5 font-medium transition-colors duration-300 ${
                  isCompleted
                    ? "text-signal-green"
                    : isActive
                      ? "text-plasma-orange"
                      : "text-white/30"
                }`}
              >
                {s.label}
              </span>
            </div>

            {/* Connecting line (not after last) */}
            {i < STEP_LABELS.length - 1 && (
              <div
                className={`w-12 sm:w-16 h-px mx-2 mb-4 transition-colors duration-300 ${
                  i < currentIdx ? "bg-signal-green" : "bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── DetectionStep ────────────────────────────────────────────────────────────

interface DetectionItem {
  id: string;
  status: "probing" | "found" | "not-found" | "warning";
  label: string;
  detail?: string;
}

function DetectionStep({ setup }: { setup: UseRadioSetupReturn }) {
  const { detection, startDetection, goToStep, skipSetup } = setup;
  const [items, setItems] = useState<DetectionItem[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const autoAdvanceRef = useRef(false);
  // Start detection on mount (delay 100ms to survive React StrictMode double-invoke)
  useEffect(() => {
    const timer = setTimeout(() => startDetection(), 100);
    return () => clearTimeout(timer);
  }, [startDetection]);

  // Build detection items with staggered reveals based on bridgeStatus
  useEffect(() => {
    const stagger = (newItems: DetectionItem[], delayMs = 300) => {
      newItems.forEach((item, i) => {
        setTimeout(() => {
          setItems((prev) => {
            // Don't add if already present
            if (prev.some((p) => p.id === item.id)) {
              return prev.map((p) => (p.id === item.id ? item : p));
            }
            return [...prev, item];
          });
        }, i * delayMs);
      });
    };

    if (detection.bridgeStatus === "probing") {
      setItems([]);
      stagger([
        {
          id: "bridge",
          status: "probing",
          label: "Searching for bridge daemon...",
        },
      ]);
    }

    if (detection.bridgeStatus === "found") {
      const nextItems: DetectionItem[] = [
        {
          id: "bridge",
          status: "found",
          label: "Bridge daemon detected",
        },
      ];

      if (detection.radios.length > 0) {
        const radio = detection.radios[0];
        nextItems.push(
          {
            id: "radio-scan",
            status: "found",
            label: `${radio.modelName} found on ${radio.port}`,
            detail: `Baud: ${radio.baudRate}`,
          },
          {
            id: "spectrum",
            status: "found",
            label: "Built-in spectrum available",
          },
          {
            id: "audio",
            status: radio.audioDevice ? "found" : "warning",
            label: radio.audioDevice
              ? `Audio: ${radio.audioDevice.deviceName}`
              : "USB audio device not detected",
            detail: radio.audioDevice
              ? `Auto-resolved (${radio.audioDevice.matchMethod})`
              : "Configure manually in Settings",
          },
        );
      } else {
        nextItems.push({
          id: "radio-scan",
          status: "warning",
          label: "No ICOM radios detected on USB",
        });
      }

      stagger(nextItems);
    }

    if (detection.bridgeStatus === "not-found") {
      stagger([
        {
          id: "bridge",
          status: "not-found",
          label: "Bridge not found",
        },
      ]);
    }
  }, [detection.bridgeStatus, detection.radios]);

  // Auto-advance when everything is detected
  useEffect(() => {
    if (
      detection.bridgeStatus === "found" &&
      detection.radios.length > 0 &&
      !autoAdvanceRef.current
    ) {
      autoAdvanceRef.current = true;
      const timer = setTimeout(() => goToStep("configuring"), 1800);
      return () => clearTimeout(timer);
    }
  }, [detection.bridgeStatus, detection.radios, goToStep]);

  const platformInfo = getPlatformInfo();

  return (
    <div className="px-6 py-6 sm:px-8 sm:py-8">
      <h2 className="font-orbitron text-lg sm:text-xl font-bold text-white tracking-wide text-center mb-1">
        Detecting Your Setup
      </h2>
      <p className="text-xs text-gray-500 text-center mb-6">
        Scanning for bridge daemon and connected radios
      </p>

      {/* Scanning animation */}
      {detection.bridgeStatus === "probing" && (
        <div className="relative flex items-center justify-center h-28 mb-6">
          {/* Concentric rings */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute rounded-full border-2 border-plasma-orange"
              style={{
                width: 64 + i * 28,
                height: 64 + i * 28,
                opacity: 0.6 - i * 0.15,
                animation: `radio-pulse 2s ease-out infinite`,
                animationDelay: `${i * 0.5}s`,
              }}
            />
          ))}
          {/* Center icon */}
          <div className="relative z-10 w-10 h-10 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center">
            <RadioTowerIcon className="w-5 h-5 text-plasma-orange" />
          </div>
        </div>
      )}

      {/* Detection items */}
      <div className="space-y-2 mb-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-center gap-3 animate-fadeSlideIn"
          >
            {/* Status icon */}
            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
              {item.status === "probing" && (
                <SpinnerIcon className="w-5 h-5 text-plasma-orange" />
              )}
              {item.status === "found" && (
                <CheckIcon className="w-5 h-5 text-signal-green" />
              )}
              {item.status === "not-found" && (
                <XIcon className="w-5 h-5 text-alert-red" />
              )}
              {item.status === "warning" && (
                <WarningIcon className="w-5 h-5 text-caution-amber" />
              )}
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${
                  item.status === "found"
                    ? "text-signal-green"
                    : item.status === "not-found"
                      ? "text-alert-red"
                      : item.status === "warning"
                        ? "text-caution-amber"
                        : "text-gray-300"
                }`}
              >
                {item.label}
              </span>
              {item.detail && (
                <span className="ml-2 text-xs text-gray-500">
                  {item.detail}
                </span>
              )}
            </div>

            {/* Badge for radio model */}
            {item.id === "radio-scan" &&
              item.status === "found" &&
              detection.selectedRadio && (
                <span className="text-[10px] font-medium text-plasma-orange bg-plasma-orange/10 border border-plasma-orange/20 rounded-full px-2 py-0.5">
                  {detection.selectedRadio.modelName}
                </span>
              )}
          </div>
        ))}
      </div>

      {/* Bridge not found — install instructions */}
      {detection.bridgeStatus === "not-found" && (
        <div className="mt-4">
          <button
            onClick={() => setShowInstall((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-nebula-blue hover:text-nebula-blue/80 transition-colors mb-2"
          >
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform ${showInstall ? "rotate-180" : ""}`}
            />
            How to install the bridge daemon
          </button>

          {showInstall && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-4 text-xs space-y-2">
              <p className="text-gray-400">
                <span className="font-semibold text-gray-300">
                  {platformInfo.platform}:
                </span>{" "}
                {platformInfo.prereq}
              </p>
              <div className="bg-black/40 rounded-lg px-3 py-2 font-mono text-gray-300 select-all">
                {platformInfo.installCmd}
              </div>
              <p className="text-gray-500 text-[11px]">
                The bridge daemon connects ProPulse to your radio via USB or
                network.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                autoAdvanceRef.current = false;
                setItems([]);
                startDetection();
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30 transition-colors"
            >
              Retry Detection
            </button>
            <button
              onClick={skipSetup}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              I'll Set This Up Later
            </button>
          </div>
        </div>
      )}

      {/* Bridge found but no radio */}
      {detection.bridgeStatus === "found" && detection.radios.length === 0 && (
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => goToStep("configuring")}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30 transition-colors"
          >
            Continue to configure manually
          </button>
          <button
            onClick={skipSetup}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ── ConfigurationStep ────────────────────────────────────────────────────────

function ConfigurationStep({ setup }: { setup: UseRadioSetupReturn }) {
  const { detection, config, setConfig, goToStep, testConnection } = setup;
  const [showManual, setShowManual] = useState(!detection.selectedRadio);

  const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30 outline-none transition-colors";

  return (
    <div className="px-6 py-6 sm:px-8 sm:py-8">
      <h2 className="font-orbitron text-lg sm:text-xl font-bold text-white tracking-wide text-center mb-1">
        Configure Connection
      </h2>
      <p className="text-xs text-gray-500 text-center mb-6">
        {detection.selectedRadio
          ? "Review your auto-detected settings"
          : "Select your radio backend and configure"}
      </p>

      {/* Auto-filled summary when a radio was detected */}
      {detection.selectedRadio && !showManual && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-signal-green/15 text-signal-green flex items-center justify-center">
              <RadioTowerIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white mb-0.5">
                {detection.selectedRadio.modelName} Detected
              </h3>
              <div className="space-y-1 text-xs text-gray-400">
                <p>
                  <span className="text-gray-500">Port:</span>{" "}
                  {detection.selectedRadio.port}
                </p>
                <p>
                  <span className="text-gray-500">Baud Rate:</span>{" "}
                  {detection.selectedRadio.baudRate}
                </p>
                <p>
                  <span className="text-gray-500">Backend:</span> ICOM Direct
                  (USB)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                testConnection();
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-plasma-orange to-amber-500 text-white hover:brightness-110 transition-all"
            >
              Looks Good!
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              Change
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Manual mode — backend selection grid */}
      {(showManual || !detection.selectedRadio) && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            {BACKENDS.map((b) => {
              const isSelected = config.catBackend === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setConfig({ catBackend: b.id })}
                  className={`p-3 rounded-xl text-left transition-colors cursor-pointer border ${
                    isSelected
                      ? "border-plasma-orange/50 bg-plasma-orange/10"
                      : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="w-6 h-6 mb-1.5 text-gray-400">
                    <BackendIcon iconId={b.iconId} className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-semibold text-white mb-0.5">
                    {b.label}
                  </h4>
                  <p className="text-[10px] text-gray-500">{b.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Backend-specific config forms */}
          <div className="space-y-3 mb-6">
            {config.catBackend === "icom-serial" && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Serial Port
                  </label>
                  {detection.radios.length > 0 ? (
                    <select
                      value={config.icomSerialPort}
                      onChange={(e) =>
                        setConfig({ icomSerialPort: e.target.value })
                      }
                      className={inputClass}
                    >
                      {detection.radios.map((r) => (
                        <option key={r.port} value={r.port}>
                          {r.port} ({r.modelName})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={config.icomSerialPort}
                      onChange={(e) =>
                        setConfig({ icomSerialPort: e.target.value })
                      }
                      placeholder="/dev/ttyUSB0"
                      className={inputClass}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Baud Rate
                  </label>
                  <div className="flex gap-2">
                    {[9600, 19200, 115200].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setConfig({ icomBaudRate: rate })}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                          config.icomBaudRate === rate
                            ? "bg-plasma-orange/15 border-plasma-orange/40 text-plasma-orange"
                            : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/[0.08]"
                        }`}
                      >
                        {rate.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {detection.selectedRadio && (
                  <p className="text-xs text-gray-500">
                    <span className="text-gray-400">Model:</span>{" "}
                    {detection.selectedRadio.modelName}
                  </p>
                )}
              </>
            )}

            {config.catBackend === "icom-network" && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Host IP
                  </label>
                  <input
                    type="text"
                    value={config.icomNetworkHost}
                    onChange={(e) =>
                      setConfig({ icomNetworkHost: e.target.value })
                    }
                    placeholder="192.168.1.100"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={config.icomNetworkUsername}
                    onChange={(e) =>
                      setConfig({ icomNetworkUsername: e.target.value })
                    }
                    placeholder="admin"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={config.icomNetworkPassword}
                    onChange={(e) =>
                      setConfig({ icomNetworkPassword: e.target.value })
                    }
                    placeholder="Password"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {config.catBackend === "hamlib" && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Host
                  </label>
                  <input
                    type="text"
                    value={config.hamlibHost}
                    onChange={(e) => setConfig({ hamlibHost: e.target.value })}
                    placeholder="localhost"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={config.hamlibPort}
                    onChange={(e) =>
                      setConfig({
                        hamlibPort: parseInt(e.target.value, 10) || 4533,
                      })
                    }
                    placeholder="4533"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    WFView CI-V Port (optional)
                  </label>
                  <input
                    type="number"
                    value={config.civPort}
                    onChange={(e) =>
                      setConfig({
                        civPort: parseInt(e.target.value, 10) || 4580,
                      })
                    }
                    placeholder="4580"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {config.catBackend === "flrig" && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Host
                  </label>
                  <input
                    type="text"
                    value={config.flrigHost}
                    onChange={(e) => setConfig({ flrigHost: e.target.value })}
                    placeholder="localhost"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={config.flrigPort}
                    onChange={(e) =>
                      setConfig({
                        flrigPort: parseInt(e.target.value, 10) || 12345,
                      })
                    }
                    placeholder="12345"
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => goToStep("detecting")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              onClick={() => {
                testConnection();
              }}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-plasma-orange to-amber-500 text-white hover:brightness-110 transition-all"
            >
              Test Connection
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── TestingStep ──────────────────────────────────────────────────────────────

interface TestPhase {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

function TestingStep({ setup }: { setup: UseRadioSetupReturn }) {
  const { testResult, retryTest, goToStep, config } = setup;
  const [phases, setPhases] = useState<TestPhase[]>([
    { id: "bridge", label: "Connecting to bridge...", status: "active" },
    { id: "backend", label: "Configuring radio backend...", status: "pending" },
    { id: "read", label: "Reading radio status...", status: "pending" },
    { id: "caps", label: "Checking capabilities...", status: "pending" },
  ]);
  const phaseIdxRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate sequential progress while actual test runs
  useEffect(() => {
    if (testResult.status !== "testing") return;

    phaseIdxRef.current = 0;
    setPhases([
      { id: "bridge", label: "Connecting to bridge...", status: "active" },
      {
        id: "backend",
        label: "Configuring radio backend...",
        status: "pending",
      },
      { id: "read", label: "Reading radio status...", status: "pending" },
      { id: "caps", label: "Checking capabilities...", status: "pending" },
    ]);

    intervalRef.current = setInterval(() => {
      phaseIdxRef.current += 1;
      const idx = phaseIdxRef.current;
      if (idx >= 3) {
        // Don't go past "Checking capabilities" until real result arrives
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      setPhases((prev) =>
        prev.map((p, i) => {
          if (i < idx) return { ...p, status: "done" };
          if (i === idx) return { ...p, status: "active" };
          return p;
        }),
      );
    }, 800);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [testResult.status]);

  // When the real result lands, finalize all phases
  useEffect(() => {
    if (testResult.status === "success") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPhases((prev) =>
        prev.map((p) => {
          if (p.id === "read" && testResult.frequency) {
            return {
              ...p,
              status: "done",
              detail: `${formatFrequency(testResult.frequency)} MHz`,
            };
          }
          if (p.id === "caps") {
            return {
              ...p,
              status: "done",
              detail: testResult.hasSpectrum
                ? "Spectrum available"
                : "No spectrum",
            };
          }
          return { ...p, status: "done" };
        }),
      );
    }
    if (testResult.status === "error") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPhases((prev) =>
        prev.map((p) =>
          p.status === "active" ? { ...p, status: "error" } : p,
        ),
      );
    }
  }, [testResult]);

  const backendLabel =
    BACKENDS.find((b) => b.id === config.catBackend)?.label ??
    config.catBackend;

  return (
    <div className="px-6 py-6 sm:px-8 sm:py-8">
      <h2 className="font-orbitron text-lg sm:text-xl font-bold text-white tracking-wide text-center mb-1">
        Testing Connection
      </h2>
      <p className="text-xs text-gray-500 text-center mb-6">
        Verifying radio communication via {backendLabel}
      </p>

      {/* Phase list */}
      <div className="space-y-2 mb-5">
        {phases.map((p) => (
          <div
            key={p.id}
            className={`bg-white/[0.03] border rounded-xl p-3 flex items-center gap-3 transition-colors ${
              p.status === "error" ? "border-alert-red/30" : "border-white/5"
            }`}
          >
            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
              {p.status === "active" && (
                <SpinnerIcon className="w-5 h-5 text-plasma-orange" />
              )}
              {p.status === "done" && (
                <CheckIcon className="w-5 h-5 text-signal-green" />
              )}
              {p.status === "error" && (
                <XIcon className="w-5 h-5 text-alert-red" />
              )}
              {p.status === "pending" && (
                <div className="w-2 h-2 rounded-full bg-white/15" />
              )}
            </div>
            <span
              className={`text-sm flex-1 ${
                p.status === "done"
                  ? "text-signal-green"
                  : p.status === "error"
                    ? "text-alert-red"
                    : p.status === "active"
                      ? "text-gray-300"
                      : "text-gray-600"
              }`}
            >
              {p.label}
            </span>
            {p.detail && (
              <span className="text-xs text-gray-400 font-mono">
                {p.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Success mini dashboard */}
      {testResult.status === "success" && (
        <div className="bg-white/[0.03] border border-signal-green/20 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckIcon className="w-4 h-4 text-signal-green" />
            <span className="text-sm font-semibold text-signal-green">
              Connected to {testResult.rigModel ?? "Radio"}
            </span>
          </div>

          <div className="bg-black/30 rounded-lg p-3 space-y-2.5">
            {/* Frequency + Mode */}
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-lg text-white tracking-wider">
                {testResult.frequency
                  ? `${formatFrequency(testResult.frequency)} MHz`
                  : "-- MHz"}
              </span>
              {testResult.mode && (
                <span className="text-xs font-medium text-plasma-orange bg-plasma-orange/10 border border-plasma-orange/20 rounded px-2 py-0.5">
                  {testResult.mode}
                </span>
              )}
            </div>

            {/* S-meter bar */}
            <div className="space-y-1">
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${sMeterColor(-68)}`}
                  style={{ width: "58%" }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>{sMeterLabel(-68)}</span>
                <span>-68 dBm</span>
              </div>
            </div>

            {/* Spectrum badge */}
            {testResult.hasSpectrum && (
              <div className="flex items-center gap-1.5">
                <CheckIcon className="w-3 h-3 text-signal-green" />
                <span className="text-xs text-gray-400">
                  Spectrum: Available
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => goToStep("complete")}
            className="mt-4 w-full flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-plasma-orange to-amber-500 text-white hover:brightness-110 transition-all"
          >
            Continue
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error state */}
      {testResult.status === "error" && (
        <div className="bg-alert-red/10 border border-alert-red/30 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <XIcon className="w-4 h-4 text-alert-red" />
            <span className="text-sm font-semibold text-alert-red">
              Connection Failed
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            {testResult.errorMessage ?? "Could not establish radio link"}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={retryTest}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => goToStep("configuring")}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              Change Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SuccessStep ──────────────────────────────────────────────────────────────

function Confetti() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: `${10 + Math.random() * 80}%`,
        delay: `${Math.random() * 1.5}s`,
        duration: `${1.5 + Math.random() * 1.5}s`,
        size: 4 + Math.random() * 4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );

  if (!visible) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute block rounded-sm"
          style={{
            left: p.left,
            top: -8,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration} ease-out ${p.delay} forwards`,
          }}
        />
      ))}
    </div>
  );
}

function SuccessStep({ setup }: { setup: UseRadioSetupReturn }) {
  const { testResult, config, detection, saveAndComplete, skipSetup } = setup;
  const navigate = useNavigate();
  const hasSavedRef = useRef(false);

  // Persist config on mount
  useEffect(() => {
    if (!hasSavedRef.current) {
      hasSavedRef.current = true;
      saveAndComplete();
    }
  }, [saveAndComplete]);

  const backendLabel =
    BACKENDS.find((b) => b.id === config.catBackend)?.label ??
    config.catBackend;
  const radioName =
    testResult.rigModel ?? detection.selectedRadio?.modelName ?? "Radio";

  return (
    <div className="relative px-6 py-8 sm:px-8 sm:py-10">
      <Confetti />

      <h2 className="font-orbitron text-lg sm:text-xl font-bold text-signal-green tracking-wide text-center mb-1 relative z-20">
        You're All Set!
      </h2>
      <p className="text-xs text-gray-500 text-center mb-6 relative z-20">
        Your radio is connected and ready to operate
      </p>

      {/* Summary card */}
      <div className="relative z-20 bg-white/[0.03] border border-white/10 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <CheckIcon className="w-5 h-5 text-signal-green" />
          <h3 className="text-sm font-semibold text-signal-green">
            Radio Connected!
          </h3>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">{radioName}</span>
            <span className="text-gray-500">{backendLabel}</span>
          </div>

          {testResult.frequency && (
            <div className="flex items-center justify-between">
              <span className="font-mono text-white">
                {formatFrequency(testResult.frequency)} MHz
              </span>
              {testResult.mode && (
                <span className="text-gray-400">{testResult.mode} mode</span>
              )}
            </div>
          )}

          {testResult.hasSpectrum && (
            <div className="flex items-center gap-1.5">
              <CheckIcon className="w-3 h-3 text-signal-green" />
              <span className="text-gray-400">Spectrum Available</span>
            </div>
          )}
        </div>
      </div>

      {/* CTAs */}
      <div className="relative z-20 flex flex-col items-center gap-3">
        <button
          onClick={() => {
            navigate("/sdr");
          }}
          className="w-full max-w-xs px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-plasma-orange to-amber-500 text-white hover:brightness-110 transition-all"
        >
          Open SDR Console
        </button>
        <button
          onClick={skipSetup}
          className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
        >
          Continue to Dashboard
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function RadioSetupWizard() {
  const radioSetupCompleted = useSettingsStore((s) => s.radioSetupCompleted);
  const [transitioning, setTransitioning] = useState(false);
  const setup = useRadioSetup();

  // Visibility: show when setup not completed AND welcome has been dismissed
  const welcomeSeen = useRef(false);
  try {
    welcomeSeen.current = localStorage.getItem(WELCOME_KEY) === "true";
  } catch {
    welcomeSeen.current = false;
  }

  const visible = !radioSetupCompleted && welcomeSeen.current;

  // Body scroll lock
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [visible]);

  // Keyboard: Escape to skip
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setup.skipSetup();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, setup]);

  // Transition wrapper for step changes
  const prevStepRef = useRef(setup.step);
  useEffect(() => {
    if (prevStepRef.current !== setup.step) {
      setTransitioning(true);
      const timer = setTimeout(() => {
        prevStepRef.current = setup.step;
        setTransitioning(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [setup.step]);

  if (!visible) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Radio Setup Wizard"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={setup.skipSetup}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={setup.skipSetup}
          className="absolute top-4 right-4 z-30 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          aria-label="Close setup wizard"
        >
          <CloseIcon className="w-4 h-4" />
        </button>

        {/* Step progress bar */}
        <StepProgressBar current={setup.step} />

        {/* Step content with fade transition */}
        <div
          className={`transition-all duration-150 ${
            transitioning
              ? "opacity-0 translate-y-1"
              : "opacity-100 translate-y-0"
          }`}
        >
          {setup.step === "detecting" && <DetectionStep setup={setup} />}
          {setup.step === "configuring" && <ConfigurationStep setup={setup} />}
          {setup.step === "testing" && <TestingStep setup={setup} />}
          {setup.step === "complete" && <SuccessStep setup={setup} />}
        </div>
      </div>

      {/* Global keyframe styles */}
      <style>{`
        @keyframes radio-pulse {
          0% {
            transform: scale(0.8);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(400px) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes fadeSlideIn {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeSlideIn {
          animation: fadeSlideIn 0.3s ease-out both;
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}

export default RadioSetupWizard;

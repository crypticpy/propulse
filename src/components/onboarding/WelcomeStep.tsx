/**
 * WelcomeStep Component
 * First step of the onboarding wizard - welcome message and optional callsign entry
 */

import { useState } from "react";

interface WelcomeStepProps {
  /** Initial callsign value */
  callsign: string;
  /** Callback when callsign changes */
  onCallsignChange: (callsign: string) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
}

/**
 * Welcome step with friendly greeting and optional callsign entry
 */
export function WelcomeStep({
  callsign,
  onCallsignChange,
  onNext,
}: WelcomeStepProps) {
  const [localCallsign, setLocalCallsign] = useState(callsign);

  const handleCallsignChange = (value: string) => {
    // Convert to uppercase and remove invalid characters
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9/]/g, "");
    setLocalCallsign(sanitized);
    onCallsignChange(sanitized);
  };

  return (
    <div className="space-y-8 text-center">
      {/* Welcome header */}
      <div className="space-y-4">
        <div className="text-6xl mb-4">
          <span
            role="img"
            aria-label="radio"
            className="inline-block animate-pulse"
          >
            {/* Radio tower icon */}
            <svg
              className="w-16 h-16 mx-auto text-plasma-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
              />
            </svg>
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white font-[Orbitron]">
          Welcome to Propulse
        </h1>
        <p className="text-lg text-gray-300 max-w-md mx-auto">
          Your mission control for ham radio propagation. Track solar activity,
          visualize signal paths, and optimize your contacts.
        </p>
      </div>

      {/* Features highlight */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
        <FeatureCard
          icon={<SunIcon className="w-6 h-6 text-caution-amber" />}
          title="Solar Pulse"
          description="Real-time space weather and propagation forecasts"
        />
        <FeatureCard
          icon={<GlobeIcon className="w-6 h-6 text-cosmic-cyan" />}
          title="PropSphere"
          description="3D visualization of HF propagation paths"
        />
        <FeatureCard
          icon={<BookIcon className="w-6 h-6 text-signal-green" />}
          title="LogBook"
          description="Track contacts with ADIF import/export"
        />
      </div>

      {/* Callsign entry */}
      <div className="space-y-3 max-w-sm mx-auto">
        <label
          htmlFor="callsign"
          className="block text-sm font-medium text-gray-400"
        >
          Your Callsign (optional)
        </label>
        <input
          type="text"
          id="callsign"
          value={localCallsign}
          onChange={(e) => handleCallsignChange(e.target.value)}
          placeholder="e.g., W1AW"
          maxLength={10}
          className="w-full px-4 py-3 bg-deep-space border border-white/10 rounded-lg
                     text-white text-center font-mono text-xl uppercase
                     placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50
                     transition-colors"
        />
        <p className="text-xs text-gray-500">
          We'll use this to personalize your experience
        </p>
      </div>

      {/* Next button */}
      <button
        onClick={onNext}
        className="px-8 py-3 bg-plasma-orange text-white font-semibold rounded-lg
                   hover:bg-plasma-orange/90 transition-colors
                   shadow-[0_0_20px_rgba(255,107,53,0.3)]"
      >
        Let's Get Started
      </button>
    </div>
  );
}

/**
 * Feature highlight card
 */
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

// Icon components
function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
      />
    </svg>
  );
}

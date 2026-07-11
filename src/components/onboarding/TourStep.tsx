/**
 * TourStep Component
 * Final step of the onboarding wizard - quick feature tour
 */

import { useState } from "react";

interface TourStepProps {
  /** Callback to complete onboarding */
  onComplete: () => void;
  /** Callback to go back */
  onBack: () => void;
}

interface TourFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  highlights: string[];
}

const tourFeatures: TourFeature[] = [
  {
    id: "solar",
    title: "Solar Pulse",
    description: "Monitor real-time space weather and propagation conditions",
    icon: <SunIcon className="w-10 h-10" />,
    color: "text-caution-amber",
    bgColor: "bg-caution-amber/10",
    highlights: [
      "Live solar flux, K-index, and A-index",
      "Band condition indicators",
      "Geomagnetic storm alerts",
      "Solar flare notifications",
    ],
  },
  {
    id: "propsphere",
    title: "PropSphere",
    description: "Visualize HF propagation paths on an interactive 3D globe",
    icon: <GlobeIcon className="w-10 h-10" />,
    color: "text-cosmic-cyan",
    bgColor: "bg-cosmic-cyan/10",
    highlights: [
      "Real-time RBN/PSKReporter spots",
      "Great circle propagation paths",
      "Day/night terminator",
      "MUF and skip zone overlays",
    ],
  },
  {
    id: "logbook",
    title: "LogBook",
    description: "Track your contacts and monitor DXCC progress",
    icon: <BookIcon className="w-10 h-10" />,
    color: "text-signal-green",
    bgColor: "bg-signal-green/10",
    highlights: [
      "Easy QSO logging",
      "ADIF import/export",
      "DXCC tracking & awards",
      "Statistics and charts",
    ],
  },
  {
    id: "learn",
    title: "Learn",
    description: "Expand your knowledge of propagation and ham radio",
    icon: <AcademicIcon className="w-10 h-10" />,
    color: "text-aurora-purple",
    bgColor: "bg-aurora-purple/10",
    highlights: [
      "Propagation fundamentals",
      "Solar indices explained",
      "Band characteristics",
      "DXing tips and techniques",
    ],
  },
];

/**
 * Quick tour of key features
 */
export function TourStep({ onComplete, onBack }: TourStepProps) {
  const [activeFeature, setActiveFeature] = useState(0);
  const feature = tourFeatures[activeFeature];

  const handlePrevFeature = () => {
    setActiveFeature((prev) => (prev > 0 ? prev - 1 : tourFeatures.length - 1));
  };

  const handleNextFeature = () => {
    setActiveFeature((prev) => (prev < tourFeatures.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 bg-plasma-orange/20 rounded-full mb-2">
          <SparklesIcon className="w-8 h-8 text-plasma-orange" />
        </div>
        <h2 className="text-2xl font-bold text-white font-[Orbitron]">
          Quick Feature Tour
        </h2>
        <p className="text-gray-400 max-w-md mx-auto">
          Here's what you can do with Propulse. Explore these features to get
          the most out of your ham radio experience.
        </p>
      </div>

      {/* Feature carousel */}
      <div className="max-w-lg mx-auto">
        {/* Feature card */}
        <div
          className={`p-6 rounded-2xl border transition-all duration-300 ${feature.bgColor} border-white/10`}
        >
          {/* Feature header */}
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl ${feature.bgColor}`}>
              <div className={feature.color}>{feature.icon}</div>
            </div>
            <div>
              <h3 className={`text-xl font-bold ${feature.color}`}>
                {feature.title}
              </h3>
              <p className="text-sm text-gray-400">{feature.description}</p>
            </div>
          </div>

          {/* Feature highlights */}
          <ul className="space-y-2 mb-4">
            {feature.highlights.map((highlight, index) => (
              <li
                key={index}
                className="flex items-center gap-2 text-sm text-gray-300"
              >
                <CheckIcon
                  className={`w-4 h-4 ${feature.color} flex-shrink-0`}
                />
                {highlight}
              </li>
            ))}
          </ul>

          {/* Feature navigation dots */}
          <div className="flex justify-center gap-2 pt-2">
            {tourFeatures.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveFeature(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === activeFeature
                    ? `${feature.color.replace("text-", "bg-")} w-6`
                    : "bg-gray-600 hover:bg-gray-500"
                }`}
                aria-label={`Go to feature ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Carousel controls */}
        <div className="flex justify-between items-center mt-4 px-2">
          <button
            onClick={handlePrevFeature}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            aria-label="Previous feature"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <span className="text-sm text-gray-500">
            {activeFeature + 1} of {tourFeatures.length}
          </span>
          <button
            onClick={handleNextFeature}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            aria-label="Next feature"
          >
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Ready to explore */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
          <RocketIcon className="w-5 h-5 text-plasma-orange" />
          <span className="text-sm text-gray-300">
            You're all set! Let's explore the airwaves.
          </span>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between max-w-md mx-auto">
        <button
          onClick={onBack}
          className="px-6 py-2.5 text-gray-400 hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={onComplete}
          className="px-8 py-3 bg-plasma-orange text-white font-semibold rounded-lg
                     hover:bg-plasma-orange/90 transition-all
                     shadow-[0_0_20px_rgba(255,107,53,0.4)]
                     flex items-center gap-2"
        >
          <SparklesIcon className="w-5 h-5" />
          Get Started
        </button>
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

function AcademicIcon({ className }: { className?: string }) {
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
        d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
      />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
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
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
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
        strokeWidth={2}
        d="M15.75 19.5L8.25 12l7.5-7.5"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
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
        strokeWidth={2}
        d="M8.25 4.5l7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
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
        d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
      />
    </svg>
  );
}

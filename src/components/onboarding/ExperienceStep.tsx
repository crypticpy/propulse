/**
 * ExperienceStep Component
 * Third step of the onboarding wizard - experience level selection
 */

import type { ExperienceLevel, UIMode } from "@/types/user";

interface ExperienceStepProps {
  /** Current experience level */
  experienceLevel: ExperienceLevel;
  /** Callback when experience level changes */
  onExperienceLevelChange: (level: ExperienceLevel, uiMode: UIMode) => void;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back */
  onBack: () => void;
}

interface ExperienceOption {
  level: ExperienceLevel;
  uiMode: UIMode;
  title: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const experienceOptions: ExperienceOption[] = [
  {
    level: "beginner",
    uiMode: "beginner",
    title: "Beginner",
    description: "I'm new to ham radio or DXing",
    features: [
      "Simplified interface with tooltips",
      "Plain-language explanations",
      "Guided tutorials and help",
      "Essential features only",
    ],
    icon: <SeedlingIcon className="w-8 h-8" />,
    color: "text-signal-green",
    bgColor: "bg-signal-green/10",
    borderColor: "border-signal-green/30 hover:border-signal-green/50",
  },
  {
    level: "intermediate",
    uiMode: "normal",
    title: "Intermediate",
    description: "I understand propagation basics",
    features: [
      "Standard interface layout",
      "Technical data with context",
      "All common features enabled",
      "Balanced detail level",
    ],
    icon: <RadioIcon className="w-8 h-8" />,
    color: "text-cosmic-cyan",
    bgColor: "bg-cosmic-cyan/10",
    borderColor: "border-cosmic-cyan/30 hover:border-cosmic-cyan/50",
  },
  {
    level: "expert",
    uiMode: "expert",
    title: "Expert",
    description: "I want all the technical details",
    features: [
      "Full technical interface",
      "Raw data and indices",
      "Advanced analysis tools",
      "No simplifications",
    ],
    icon: <ChartIcon className="w-8 h-8" />,
    color: "text-plasma-orange",
    bgColor: "bg-plasma-orange/10",
    borderColor: "border-plasma-orange/30 hover:border-plasma-orange/50",
  },
];

/**
 * Experience level selection step
 */
export function ExperienceStep({
  experienceLevel,
  onExperienceLevelChange,
  onNext,
  onBack,
}: ExperienceStepProps) {
  const handleSelect = (option: ExperienceOption) => {
    onExperienceLevelChange(option.level, option.uiMode);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 bg-aurora-purple/20 rounded-full mb-2">
          <UserIcon className="w-8 h-8 text-aurora-purple" />
        </div>
        <h2 className="text-2xl font-bold text-white font-[Orbitron]">
          Your Experience Level
        </h2>
        <p className="text-gray-400 max-w-md mx-auto">
          This helps us customize the interface to show the right level of
          detail. You can change this anytime in settings.
        </p>
      </div>

      {/* Experience options */}
      <div className="grid gap-4 max-w-2xl mx-auto">
        {experienceOptions.map((option) => {
          const isSelected = experienceLevel === option.level;
          return (
            <button
              key={option.level}
              onClick={() => handleSelect(option)}
              className={`
                relative p-4 rounded-xl border-2 text-left transition-all
                ${
                  isSelected
                    ? `${option.bgColor} ${option.borderColor.split(" ")[0].replace("/30", "/60")}`
                    : `bg-white/[0.02] ${option.borderColor}`
                }
              `}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div
                  className={`absolute top-4 right-4 w-6 h-6 rounded-full ${option.bgColor} flex items-center justify-center`}
                >
                  <CheckIcon className={`w-4 h-4 ${option.color}`} />
                </div>
              )}

              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`p-2 rounded-lg ${option.bgColor}`}>
                  <div className={option.color}>{option.icon}</div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-lg font-semibold ${isSelected ? option.color : "text-white"}`}
                  >
                    {option.title}
                  </h3>
                  <p className="text-sm text-gray-400 mb-3">
                    {option.description}
                  </p>

                  {/* Features list */}
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {option.features.map((feature, index) => (
                      <li
                        key={index}
                        className="text-xs text-gray-500 flex items-center gap-1.5"
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${isSelected ? option.color.replace("text-", "bg-") : "bg-gray-600"}`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Info note */}
      <div className="max-w-md mx-auto p-3 bg-white/5 rounded-lg border border-white/10 text-center">
        <p className="text-xs text-gray-500">
          <InfoIcon className="w-4 h-4 inline-block mr-1 -mt-0.5 text-gray-400" />
          You can change your experience level anytime from the Settings page
        </p>
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
          onClick={onNext}
          className="px-8 py-2.5 bg-plasma-orange text-white font-semibold rounded-lg
                     hover:bg-plasma-orange/90 transition-colors
                     shadow-[0_0_15px_rgba(255,107,53,0.3)]"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// Icon components
function SeedlingIcon({ className }: { className?: string }) {
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
        d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"
      />
    </svg>
  );
}

function RadioIcon({ className }: { className?: string }) {
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
        d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
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
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
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
        d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
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

function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}

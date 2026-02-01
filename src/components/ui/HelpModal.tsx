/**
 * HelpModal Component
 *
 * Reusable help/info modal for explaining features to users.
 * Supports markdown-like formatting for content.
 */

import { DetailModal } from "./DetailModal";

interface HelpSection {
  title: string;
  content: string;
}

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sections: HelpSection[];
}

export function HelpModal({
  isOpen,
  onClose,
  title,
  sections,
}: HelpModalProps) {
  return (
    <DetailModal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-6">
        {sections.map((section, idx) => (
          <div key={idx}>
            <h3 className="text-sm font-semibold text-plasma-orange mb-2">
              {section.title}
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
              {section.content}
            </p>
          </div>
        ))}
      </div>
    </DetailModal>
  );
}

/**
 * Help button with icon for triggering help modals
 */
interface HelpButtonProps {
  onClick: () => void;
  className?: string;
  size?: "sm" | "md";
}

export function HelpButton({
  onClick,
  className = "",
  size = "sm",
}: HelpButtonProps) {
  const sizeClasses = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const buttonClasses = size === "sm" ? "p-0.5" : "p-1";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${buttonClasses} rounded-full bg-white/5 hover:bg-white/10 border border-white/10
                  text-gray-400 hover:text-white transition-colors ${className}`}
      title="Help"
    >
      <svg
        className={sizeClasses}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  );
}

// Pre-defined help content for common views
export const HELP_CONTENT = {
  globe: {
    title: "3D Globe View",
    sections: [
      {
        title: "What it shows",
        content:
          "An interactive 3D globe showing the Earth with day/night regions (terminator), aurora activity, MUF contours, and live DX spot paths.",
      },
      {
        title: "How to use",
        content:
          "• Click and drag to rotate the globe\n• Scroll to zoom in/out\n• Click any location to set it as your target\n• Use the layer toggles to show/hide overlays",
      },
      {
        title: "What the overlays mean",
        content:
          "• Greyline: The dawn/dusk transition zone - excellent for propagation\n• Aurora: Northern lights activity affecting HF signals\n• MUF: Maximum Usable Frequency contours\n• Spots: Live DX spots from PSKReporter and RBN",
      },
    ],
  },
  flat: {
    title: "2D Flat Map View",
    sections: [
      {
        title: "What it shows",
        content:
          "A traditional 2D map projection showing the entire world at once. Great for getting a global overview of propagation conditions.",
      },
      {
        title: "How to use",
        content:
          "• Click and drag to pan the map\n• Scroll to zoom in/out\n• Click any location to set it as your target\n• The orange arc shows your great circle path to the target",
      },
      {
        title: "Path display",
        content:
          "The dashed line from your QTH to the target follows the great circle path - the shortest route radio waves travel. This is the direction to point your antenna.",
      },
    ],
  },
  azimuthal: {
    title: "Azimuthal Equidistant View",
    sections: [
      {
        title: "What it shows",
        content:
          "A centered azimuthal equidistant projection with your QTH at the center. Every direction from the center is true bearing, and distance rings show km from your location.",
      },
      {
        title: "Why it matters for ham radio",
        content:
          "In this projection, GREAT CIRCLE PATHS ARE STRAIGHT LINES. The line from center to any point shows exactly where to point your antenna - no complex calculations needed.",
      },
      {
        title: "How to read it",
        content:
          "• Distance rings: 5,000 km, 10,000 km, 15,000 km, 20,000 km\n• Cardinal directions labeled around the edge\n• Any straight line from center = true beam heading\n• Colored dots show live spots with their paths",
      },
    ],
  },
  bandConditions: {
    title: "Band Conditions Panel",
    sections: [
      {
        title: "What it shows",
        content:
          "Real-time propagation estimates for each amateur HF band based on current solar conditions (SFI, K-index) and the path to your selected target.",
      },
      {
        title: "Understanding the data",
        content:
          "• S-Meter: Estimated signal strength (S1-S9+30dB)\n• SNR: Signal-to-noise ratio in dB\n• Status: excellent/good/fair/poor/closed\n• Best For: Recommended operating modes",
      },
      {
        title: "What affects conditions",
        content:
          "• Solar Flux Index (SFI): Higher = better HF propagation\n• K-Index: Lower = more stable conditions\n• Time of day: Different bands peak at different times\n• Path geometry: Day/night path affects skip zones",
      },
    ],
  },
  pathAnalysis: {
    title: "Path Analysis Panel",
    sections: [
      {
        title: "Short Path vs Long Path",
        content:
          "Radio waves can travel two ways around Earth. Short path is the shorter distance (usually better), long path goes the other way (sometimes better at night or for difficult paths).",
      },
      {
        title: "Understanding the metrics",
        content:
          "• Distance: Great circle distance to target\n• Bearing: Direction to point your antenna\n• Return: Their bearing to point at you\n• Hops: Estimated F-layer reflections needed",
      },
      {
        title: "Frequency limits",
        content:
          "• MUF: Maximum Usable Frequency - above this, signals pass through ionosphere\n• FOT: Optimum Working Frequency (85% of MUF) - most reliable\n• LUF: Lowest Usable Frequency - below this, signals are absorbed\n• HPF: Highest Probable Frequency",
      },
    ],
  },
  forecast: {
    title: "24-Hour Propagation Forecast",
    sections: [
      {
        title: "What it shows",
        content:
          "A heatmap showing predicted propagation quality for each band over the next 24 hours. Green = excellent, yellow/orange = fair, red = poor, gray = closed.",
      },
      {
        title: "How to use it",
        content:
          "• Look for green bands at times you plan to operate\n• The 'Best' indicator shows the optimal band and time\n• Vertical line marks the current UTC hour\n• Click to expand for detailed view",
      },
      {
        title: "Factors considered",
        content:
          "• Current solar flux index (SFI)\n• Geomagnetic activity (K-index)\n• Sun position along the path\n• Estimated absorption and skip distance",
      },
    ],
  },
  recommendations: {
    title: "Operating Recommendations",
    sections: [
      {
        title: "What it shows",
        content:
          "AI-powered recommendations for the best band and mode to use for your current target based on conditions, time of day, and path geometry.",
      },
      {
        title: "Mode selection",
        content:
          "• FT8/FT4: Best for weak signals, works -20dB below noise\n• CW: Reliable for weak signals, works with aurora\n• SSB: For voice contacts when conditions allow\n• RTTY/Digital: Good compromise for data modes",
      },
      {
        title: "Score interpretation",
        content:
          "• 80-100: Excellent - strong signals expected\n• 60-79: Good - reliable communication likely\n• 40-59: Fair - may work with patience\n• 20-39: Poor - marginal conditions\n• <20: Closed - unlikely to succeed",
      },
    ],
  },
};

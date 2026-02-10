/**
 * HelpModal Component
 *
 * Reusable help/info modal for explaining features to users.
 * Content strings support bullet points (lines starting with "• ").
 * Bullet labels before a colon are highlighted automatically.
 */

import type { ReactNode } from "react";
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

/** Parse a bullet line like "Label: description" into highlighted label + rest */
function renderBulletText(text: string): ReactNode {
  const colonIdx = text.indexOf(": ");
  if (colonIdx > 0 && colonIdx < 40) {
    const label = text.slice(0, colonIdx);
    const rest = text.slice(colonIdx + 2);
    return (
      <>
        <span className="text-white font-medium">{label}:</span> {rest}
      </>
    );
  }
  return text;
}

/** Split content into paragraphs and bullet lists */
function renderContent(content: string): ReactNode {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let currentBullets: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push(
        <p
          key={`p-${blocks.length}`}
          className="text-sm text-gray-300 leading-relaxed"
        >
          {paragraphLines.join(" ")}
        </p>,
      );
      paragraphLines = [];
    }
  };

  const flushBullets = () => {
    if (currentBullets.length > 0) {
      blocks.push(
        <ul
          key={`ul-${blocks.length}`}
          className="space-y-1.5 text-sm text-gray-300"
        >
          {currentBullets.map((b, i) => (
            <li key={i} className="flex gap-2 leading-relaxed">
              <span className="text-plasma-orange/60 mt-0.5 shrink-0">
                {"\u2022"}
              </span>
              <span>{renderBulletText(b)}</span>
            </li>
          ))}
        </ul>,
      );
      currentBullets = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
      flushParagraph();
      currentBullets.push(trimmed.replace(/^[•-]\s*/, ""));
    } else if (trimmed === "") {
      flushParagraph();
      flushBullets();
    } else {
      flushBullets();
      paragraphLines.push(trimmed);
    }
  }
  flushParagraph();
  flushBullets();

  return <>{blocks}</>;
}

export function HelpModal({
  isOpen,
  onClose,
  title,
  sections,
}: HelpModalProps) {
  return (
    <DetailModal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-5">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className="rounded-lg bg-white/[0.02] border border-white/5 px-4 py-3"
          >
            <h3 className="text-sm font-semibold text-plasma-orange mb-2">
              {section.title}
            </h3>
            <div className="space-y-2">{renderContent(section.content)}</div>
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
  solarCycle: {
    title: "Solar Cycle",
    sections: [
      {
        title: "What is a solar cycle?",
        content:
          "The Sun follows an approximately 11-year activity cycle driven by its magnetic field reversal. We are currently in Solar Cycle 25, which began in December 2019. During solar maximum, sunspot numbers and solar flux are high, creating excellent HF propagation conditions.",
      },
      {
        title: "Understanding the numbers",
        content:
          "• Cycle Position: How far through the current cycle we are (0-100%)\n• Short-term Trend: Whether conditions are improving, stable, or declining based on recent data\n• vs SC24 Peak: How current activity compares to the peak of the previous cycle (Solar Cycle 24)",
      },
      {
        title: "Why it matters for ham radio",
        content:
          "Near solar maximum, higher bands (10m, 12m, 15m) open more frequently and support longer-distance contacts. Near solar minimum, only lower bands (40m, 80m, 160m) are reliable for DX. Understanding where we are in the cycle helps you plan which bands and antennas to invest in.",
      },
    ],
  },
  noaaScales: {
    title: "NOAA Space Weather Scales",
    sections: [
      {
        title: "What are NOAA Scales?",
        content:
          "NOAA categorizes space weather events into three scales that directly impact radio communications. These are updated in real-time based on satellite measurements.",
      },
      {
        title: "R-Scale (Radio Blackouts)",
        content:
          "Caused by solar X-ray flares. Affects the sunlit side of Earth.\n• R1 (Minor): Brief HF fadeouts on sunlit side\n• R2 (Moderate): Limited HF blackout, degraded low-frequency signals\n• R3 (Strong): Wide-area HF blackout for ~1 hour\n• R4 (Severe): HF blackout on most of sunlit side for 1-2 hours\n• R5 (Extreme): Complete HF blackout on entire sunlit side for hours",
      },
      {
        title: "S-Scale (Solar Radiation Storms)",
        content:
          "Caused by energetic proton events. Primarily affects polar regions.\n• S1-S2: Minor biological and satellite effects, slight HF degradation at poles\n• S3-S4: Significant polar cap absorption, HF degraded or blacked out at high latitudes\n• S5: Complete polar HF blackout for days, satellite damage possible",
      },
      {
        title: "G-Scale (Geomagnetic Storms)",
        content:
          "Caused by solar wind disturbances (CMEs, high-speed streams).\n• G1 (Minor): Weak power grid fluctuations, minor HF impact at high latitudes\n• G2 (Moderate): HF propagation can fade at higher latitudes, aurora visible to 55°\n• G3 (Strong): Intermittent HF propagation problems, aurora visible to 50°\n• G4 (Severe): HF propagation sporadic, aurora visible to 45°\n• G5 (Extreme): Complete HF blackout possible for 1-2 days",
      },
    ],
  },
  xrayFlare: {
    title: "GOES X-ray Flare Monitor",
    sections: [
      {
        title: "What are solar flares?",
        content:
          "Solar flares are sudden bursts of energy from the Sun, releasing X-rays that travel at the speed of light and reach Earth in ~8 minutes. They are detected by GOES satellites in geosynchronous orbit.",
      },
      {
        title: "Flare classifications",
        content:
          "Flares are classified by peak X-ray flux (watts/m²). Each letter is 10x the previous:\n• A-class: <10⁻⁷ — Background, no effect\n• B-class: 10⁻⁷ to 10⁻⁶ — Minimal, no radio impact\n• C-class: 10⁻⁶ to 10⁻⁵ — Small, minor HF fadeouts possible\n• M-class: 10⁻⁵ to 10⁻⁴ — Moderate, brief HF radio blackouts (R1-R2)\n• X-class: >10⁻⁴ — Major, significant to complete HF blackouts (R3-R5)",
      },
      {
        title: "Impact on HF propagation",
        content:
          "X-rays from flares increase D-layer ionization on the sunlit side of Earth, causing radio waves to be absorbed rather than reflected. Lower frequencies (160m-40m) are affected first and most severely. Effects begin within minutes and typically last 30 minutes to several hours depending on flare intensity.",
      },
    ],
  },
  solarWind: {
    title: "Solar Wind Monitor",
    sections: [
      {
        title: "What is solar wind?",
        content:
          "Solar wind is a continuous stream of charged particles (plasma) flowing from the Sun at 300-800+ km/s. It carries the Sun's magnetic field (the Interplanetary Magnetic Field, or IMF) and directly interacts with Earth's magnetosphere.",
      },
      {
        title: "Understanding the metrics",
        content:
          "• Speed (km/s): Normal 300-400, elevated 500-700, extreme 800+. Higher speeds compress Earth's magnetosphere and can trigger storms.\n• Density (/cc): Proton density per cubic centimeter. Spikes often precede geomagnetic activity.\n• Bt (nT): Total IMF strength. Higher values mean more energy available to couple into Earth's magnetosphere.\n• Bz (nT): Vertical IMF component — the most critical metric. Negative Bz allows solar wind energy to enter Earth's magnetosphere, triggering geomagnetic storms.",
      },
      {
        title: "Why Bz matters most",
        content:
          "When Bz turns negative (southward), it connects with Earth's northward-pointing magnetic field, opening the magnetosphere to solar wind energy. Sustained negative Bz (-10 nT or more) for several hours can trigger G2+ geomagnetic storms, degrading HF propagation but potentially enhancing VHF aurora propagation.",
      },
    ],
  },
  liveMaps: {
    title: "Live Space Weather Maps",
    sections: [
      {
        title: "D-RAP Global HF Absorption",
        content:
          "The D-Region Absorption Prediction (D-RAP) map shows global HF radio absorption caused by solar X-ray and proton events. Red/orange zones indicate areas where HF signals will be heavily absorbed. Use this to see if your target path crosses an absorption zone — if so, try higher frequencies or wait for conditions to improve.",
      },
      {
        title: "D-RAP Frequency Maps (10 MHz / 20 MHz)",
        content:
          "These maps show the Highest Affected Frequency (HAF) at specific frequencies. The 10 MHz map shows absorption affecting 30m and below. The 20 MHz map shows absorption affecting 15m and below. If your operating frequency is below the HAF in your area, expect significant signal degradation.",
      },
      {
        title: "Aurora Forecast (N. Hemisphere)",
        content:
          "Shows the predicted aurora oval — the ring of aurora activity around the geomagnetic pole. Stations under or near the aurora oval will experience HF signal degradation (aurora absorption), but may have enhanced VHF propagation via aurora scatter on 2m and 6m. The brighter the aurora, the more intense the ionospheric disturbance.",
      },
      {
        title: "Solar Synoptic Map",
        content:
          "Shows the Sun's surface features including sunspot groups, coronal holes, and active regions. Coronal holes (dark areas) are sources of high-speed solar wind streams. Active regions near the solar meridian (center) are most likely to produce Earth-directed flares and CMEs. Use this to anticipate conditions 2-4 days out.",
      },
    ],
  },
};
